import { base64ToUint8Array } from '../../utils';

interface Env {
  LLM_API_KEY?: string;
  VITE_LLM_API_KEY?: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const { request, env } = context;
    const apiKey = env.LLM_API_KEY || env.VITE_LLM_API_KEY;

    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Server not configured with LLM_API_KEY' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body: any = await request.json();
    const {
      baseUrl,
      model,
      systemPrompt,
      userPrompt,
      mediaBase64,
      mediaMimeType,
      mediaFileName,
    } = body || {};

    const normalizedModel = (model || '').replace(/^models\//, '').trim();

    // If no media was provided, just proxy to chat completions
    if (!mediaBase64) {
      let chatEndpoint = baseUrl || 'https://generativelanguage.googleapis.com/v1beta/openai/';
      if (!chatEndpoint.endsWith('/chat/completions')) {
        chatEndpoint = chatEndpoint.replace(/\/+$/, '');
        chatEndpoint = `${chatEndpoint}/chat/completions`;
      }

      const resp = await fetch(chatEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: normalizedModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.2
        }),
      });
      const text = await resp.text();
      return new Response(text, { status: resp.status, headers: { 'Content-Type': 'application/json' } });
    }

    // Upload flow for Gemini media analysis
    const startResp = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(Math.floor((mediaBase64.length * 3) / 4)),
        'X-Goog-Upload-Header-Content-Type': mediaMimeType || 'application/octet-stream',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file: { display_name: mediaFileName || 'upload' } }),
    });

    if (!startResp.ok) {
      const errText = await startResp.text().catch(() => '');
      throw new Error(errText || `Failed to start Gemini upload: ${startResp.statusText}`);
    }

    const uploadUrl = startResp.headers.get('x-goog-upload-url');
    if (!uploadUrl) throw new Error('Gemini upload URL not returned');

    // Convert base64 to Uint8Array
    const bytes = base64ToUint8Array(mediaBase64);

    const finalizeResp = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Command': 'upload, finalize',
        'X-Goog-Upload-Offset': '0',
        'Content-Type': mediaMimeType || 'application/octet-stream',
      },
      body: bytes,
    });

    if (!finalizeResp.ok) {
      const errText = await finalizeResp.text().catch(() => '');
      throw new Error(errText || `Failed to upload Gemini file: ${finalizeResp.statusText}`);
    }

    const finalizeData: any = await finalizeResp.json();
    const uploaded = (finalizeData.file ?? finalizeData) as any;
    if (!uploaded?.name || !uploaded?.uri) throw new Error('Gemini upload did not return file metadata');

    const cleanName = uploaded.name.startsWith('files/') ? uploaded.name : uploaded.name.replace(/^\/+/, '');
    const fileEndpoint = `https://generativelanguage.googleapis.com/v1beta/${cleanName}?key=${encodeURIComponent(apiKey)}`;

    let activeResource: any = null;
    for (let attempt = 0; attempt < 45; attempt++) {
      const s = await fetch(fileEndpoint);
      if (!s.ok) throw new Error(`Failed to check Gemini file state: ${s.statusText}`);
      const d: any = await s.json();
      const resource = (d.file ?? d) as any;
      const state = (resource.state || '').toUpperCase();
      if (state === 'ACTIVE') { activeResource = resource; break; }
      if (state === 'FAILED') throw new Error('Gemini failed to process uploaded media');
      await new Promise(r => setTimeout(r, 2000));
    }

    if (!activeResource) throw new Error('Gemini media processing timed out');

    const generateEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(normalizedModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const genResp = await fetch(generateEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [
          {
            role: 'user',
            parts: [
              { text: userPrompt },
              { file_data: { mime_type: mediaMimeType || 'application/octet-stream', file_uri: activeResource.uri } }
            ]
          }
        ],
        generationConfig: { temperature: 0.2, responseMimeType: 'application/json' }
      })
    });

    if (!genResp.ok) {
      const errText = await genResp.text().catch(() => '');
      throw new Error(errText || `Gemini generate failed: ${genResp.statusText}`);
    }

    const genData: any = await genResp.json();
    const text = genData.candidates?.[0]?.content?.parts?.find((p: any) => typeof p?.text === 'string')?.text || '';
    if (!text) throw new Error('Gemini returned no text output');

    // Best-effort cleanup
    try {
      await fetch(`https://generativelanguage.googleapis.com/v1beta/${cleanName}?key=${encodeURIComponent(apiKey)}`, { method: 'DELETE' });
    } catch { /* ignore */ }

    return new Response(text, { status: 200 });
  } catch (err) {
    console.error('[LLM Proxy] /api/llm/analyze-video error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
