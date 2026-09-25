export async function onRequestPost(context) {
  const body = await context.request.json();

  const res = await fetch('https://webapi.vvo-online.de/dm', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json;charset=UTF-8',
      'User-Agent': 'Mozilla/5.0',
    },
    body: JSON.stringify({
      stopid: body.stopid,
      time: body.time || new Date().toISOString(),
      isarrival: false,
      limit: body.limit || 40,
      shorttermchanges: true,
      format: 'json',
    }),
  });

  const text = await res.text();

  if (!text.trim().startsWith('{')) {
    return new Response(JSON.stringify({ 
      error: 'bad_upstream', 
      status: res.status,
      preview: text.substring(0, 200)
    }), { 
      status: 502,
      headers: { 'Content-Type': 'application/json' } 
    });
  }

  return new Response(text, {
    headers: { 'Content-Type': 'application/json' },
  });
}
