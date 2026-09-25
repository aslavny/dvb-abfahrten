export async function onRequestPost(context) {
  const body = await context.request.json();

  const res = await fetch('https://webapi.vvo-online.de/tr/trips', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json;charset=UTF-8',
      'User-Agent': 'Mozilla/5.0',
    },
    body: JSON.stringify({
      origin: body.origin,
      destination: body.destination,
      time: body.time || new Date().toISOString(),
      isarrivaltime: !!body.isarrivaltime,
      shorttermchanges: true,
      standardSettings: {
        mot: ['Tram', 'CityBus', 'IntercityBus', 'SuburbanRailway', 'Train', 'Cableway', 'Ferry', 'HailedSharedTaxi'],
        maxChanges: 'Unlimited',
        walkingSpeed: 'Normal',
        footpathToStop: 5,
        includeAlternativeStops: true,
      },
      format: 'json',
    }),
  });

  const text = await res.text();

  if (!text.trim().startsWith('{')) {
    return new Response(JSON.stringify({
      error: 'bad_upstream',
      status: res.status,
      preview: text.substring(0, 300),
    }), { status: 502, headers: { 'Content-Type': 'application/json' } });
  }

  return new Response(text, { headers: { 'Content-Type': 'application/json' } });
}
