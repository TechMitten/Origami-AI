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
    const { baseUrl, model, messages, temperature } = body || {};

    let endpoint = baseUrl || 'https://generativelanguage.googleapis.com/v1beta/openai/';
    if (!endpoint.endsWith('/chat/completions')) {
      endpoint = endpoint.replace(/\/+$/, '');
      endpoint = `${endpoint}/chat/completions`;
    }

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, temperature }),
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
