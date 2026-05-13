export const onRequestGet: PagesFunction = async (context) => {
  const { params } = context;
  const filename = decodeURIComponent(params.filename as string);
  console.log(`[Music Preview] Requested file: ${filename}`);

  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return new Response('Invalid filename', { status: 400 });
  }

  if (!/^[\w\s().'-]+\.mp3$/i.test(filename)) {
    return new Response('Invalid filename', { status: 400 });
  }

  const musicUrl = `https://incompetech.com/music/royalty-free/mp3-royaltyfree/${encodeURIComponent(filename)}`;
  console.log(`[Music Preview] Fetching from: ${musicUrl}`);

  try {
    const response = await fetch(musicUrl, {
      headers: {
        'User-Agent': 'Origami-AI-Music-Preview/1.0',
      },
    });

    if (!response.ok) {
      return new Response('Failed to fetch music', { status: response.status });
    }

    const newResponse = new Response(response.body, response);
    newResponse.headers.set('Content-Type', 'audio/mpeg');
    newResponse.headers.set('Cache-Control', 'public, max-age=86400');
    newResponse.headers.set('Accept-Ranges', 'bytes');
    newResponse.headers.delete('X-Powered-By');

    return newResponse;
  } catch (error) {
    console.error(`Music proxy error for ${filename}:`, error);
    return new Response('Failed to proxy music', { status: 500 });
  }
};
