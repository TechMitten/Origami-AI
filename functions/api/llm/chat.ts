interface Env {
  LLM_API_KEY?: string;
  VITE_LLM_API_KEY?: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const { request, env } = context;

    const body: any = await request.json();
    const { baseUrl, model, messages, temperature, maxTokens, apiKey } = body || {};
    // A client may pass its own key when the browser couldn't reach the provider
    // directly (CORS-blocked endpoints like api.z.ai). It is used only for this
    // upstream request and never stored or logged; the server env key is the fallback.
    const clientKey = typeof apiKey === 'string' ? apiKey.trim() : '';
    const effectiveKey = clientKey || env.LLM_API_KEY || env.VITE_LLM_API_KEY;

    if (!effectiveKey) {
      return new Response(JSON.stringify({ error: 'No API key available: pass apiKey in the request body or configure LLM_API_KEY on the server' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let endpoint = baseUrl || 'https://generativelanguage.googleapis.com/v1beta/openai/';
    if (!endpoint.endsWith('/chat/completions')) {
      endpoint = endpoint.replace(/\/+$/, '');
      endpoint = `${endpoint}/chat/completions`;
    }

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${effectiveKey}`,
      },
      body: JSON.stringify({ model, messages, temperature, ...(maxTokens ? { max_tokens: maxTokens } : {}) }),
    });

    const text = await resp.text();
    return new Response(text, {
      status: resp.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[LLM Proxy] /api/llm/chat error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
