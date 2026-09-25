export async function onRequestPost(context) {
  const body = await context.request.json();
  
  const params = new URLSearchParams({
    query: body.query,
    stopsOnly: 'true',
    limit: '8',
    format: 'json',
  });

  const res = await fetch('https://webapi.vvo-online.de/tr/pointfinder?' + params.toString(), {
    method: 'GET',
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });

  const text = await res.text();

  if (!text.trim().startsWith('{')) {
    return new Response(JSON.stringify({ 
      error: 'bad_upstream', 
      status: res.status,
      preview: text.substring(0, 300)
    }), { status: 502, headers: { 'Content-Type': 'application/json' } });
  }

  return new Response(text, {
    headers: { 'Content-Type': 'application/json' },
  });
}
