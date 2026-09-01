export async function onRequestPost(context: any) {
  try {
    const { request, env } = context;
    const body = await request.json();
    const token = body.token;
    
    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing token' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const secretKey = env.TURNSTILE_SECRET_KEY;
    if (!secretKey) {
      // If no secret key is configured, we bypass (useful for local dev without a key)
      return new Response(JSON.stringify({ success: true, warning: 'No secret key configured' }), { headers: { 'Content-Type': 'application/json' } });
    }

    const formData = new FormData();
    formData.append('secret', secretKey);
    formData.append('response', token);
    
    // Optional: get visitor IP
    const ip = request.headers.get('CF-Connecting-IP');
    if (ip) formData.append('remoteip', ip);

    const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      body: formData,
      method: 'POST',
    });

    const outcome: any = await result.json();
    if (outcome.success) {
      return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
    } else {
      return new Response(JSON.stringify({ success: false, error: 'Turnstile verification failed', details: outcome['error-codes'] }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    }
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
