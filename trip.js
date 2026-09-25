// Verbindungsauskunft — nutzt Hilfsfunktionen aus index.html (api, parsePoint, msDate, fmt, mclass, micon, esc)
var tripFrom = null, tripTo = null, tripArrival = false, tripRoutes = [], tripMaps = {};

// Gauß-Krüger Zone 4 (VVO liefert Koordinaten so) → WGS84
if (window.proj4) {
  proj4.defs('EPSG:31468', '+proj=tmerc +lat_0=0 +lon_0=12 +k=1 +x_0=4500000 +y_0=0 +ellps=bessel +towgs84=598.1,73.7,418.2,0.202,0.045,-2.455,6.7 +units=m +no_defs');
}

function toLatLng(lat, lng) {
  lat = parseFloat(lat); lng = parseFloat(lng);
  if (!lat || !lng) return null;
  if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return [lat, lng];
  if (!window.proj4) return null;
  var p = proj4('EPSG:31468', 'WGS84', [lng, lat]); // [Rechtswert, Hochwert]
  return [p[1], p[0]];
}

/* ── Ansicht wechseln ── */
function switchView(v) {
  document.getElementById('view-deps').style.display = v === 'deps' ? '' : 'none';
  document.getElementById('view-trip').style.display = v === 'trip' ? '' : 'none';
  document.querySelectorAll('.tab').forEach(function(t) {
    t.classList.toggle('on', t.dataset.view === v);
  });
  if (v === 'trip' && !tripFrom) document.getElementById('from-inp').focus();
}

/* ── Datum & Uhrzeit ── */
function pad(n) { return (n < 10 ? '0' : '') + n; }
function toLocalInput(d) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}
function markChip(key) {
  document.querySelectorAll('#time-chips .chip').forEach(function(c) {
    c.classList.toggle('on', c.dataset.chip === key);
  });
}
// Chips rechnen immer ab der aktuellen Uhrzeit; "Morgen" = morgen zur gleichen Uhrzeit
function setChip(key) {
  var d = new Date();
  if (key === '15') d.setMinutes(d.getMinutes() + 15);
  else if (key === '30') d.setMinutes(d.getMinutes() + 30);
  else if (key === '60') d.setMinutes(d.getMinutes() + 60);
  else if (key === 'tomorrow') d.setDate(d.getDate() + 1);
  document.getElementById('trip-time').value = toLocalInput(d);
  markChip(key);
  maybeLoadTrips();
}
function setNow() { setChip('now'); }
function setTimeMode(arr) {
  tripArrival = arr;
  document.getElementById('mode-dep').classList.toggle('on', !arr);
  document.getElementById('mode-arr').classList.toggle('on', arr);
  maybeLoadTrips();
}
function getTripTime() {
  var v = document.getElementById('trip-time').value;
  var d = v ? new Date(v) : new Date();
  return isNaN(d) ? new Date() : d;
}
document.getElementById('trip-time').value = toLocalInput(new Date());
document.getElementById('trip-time').addEventListener('change', function() { markChip(null); maybeLoadTrips(); });

/* ── Suchfelder ── */
function setupTripField(inputId, sugId, onPick) {
  var input = document.getElementById(inputId);
  var sugEl = document.getElementById(sugId);
  var deb = null;
  input.addEventListener('input', function() {
    var q = input.value.trim();
    onPick(null);
    if (!q) { sugEl.innerHTML = ''; return; }
    clearTimeout(deb);
    deb = setTimeout(function() {
      api('findstop', { query: q }).then(function(data) {
        if (!data.Points || !data.Points.length) { sugEl.innerHTML = ''; return; }
        var stops = data.Points.map(parsePoint).filter(function(p) { return p.id; });
        var d = document.createElement('div');
        d.className = 'suggestions';
        d.innerHTML = stops.map(function(s) {
          return '<div class="sug-item" data-id="' + esc(s.id) + '" data-name="' + esc(s.name) + '">'
            + '<span style="font-weight:600">' + esc(s.name) + '</span>'
            + (s.city ? '<span class="sug-city">' + esc(s.city) + '</span>' : '')
            + '</div>';
        }).join('');
        d.querySelectorAll('.sug-item').forEach(function(el) {
          el.onclick = function() {
            input.value = el.dataset.name;
            sugEl.innerHTML = '';
            onPick({ id: el.dataset.id, name: el.dataset.name });
          };
        });
        sugEl.innerHTML = '';
        sugEl.appendChild(d);
      }).catch(function() { sugEl.innerHTML = ''; });
    }, 280);
  });
}

setupTripField('from-inp', 'from-sug', function(s) { tripFrom = s; if (s) maybeLoadTrips(); });
setupTripField('to-inp', 'to-sug', function(s) { tripTo = s; if (s) maybeLoadTrips(); });

function swapTrip() {
  var a = tripFrom, b = tripTo;
  tripFrom = b; tripTo = a;
  document.getElementById('from-inp').value = tripFrom ? tripFrom.name : '';
  document.getElementById('to-inp').value = tripTo ? tripTo.name : '';
  maybeLoadTrips();
}

function setTripStatus(h) {
  document.getElementById('trip-list').innerHTML = '<div class="status">' + h + '</div>';
}

/* ── Laden ── */
function maybeLoadTrips() {
  if (!tripFrom || !tripTo) return;
  setTripStatus('<div class="icon">🧭</div>Suche Verbindungen…');
  api('trip', {
    origin: tripFrom.id,
    destination: tripTo.id,
    time: getTripTime().toISOString(),
    isarrivaltime: tripArrival
  }).then(function(data) {
    if (!data.Routes || !data.Routes.length) {
      setTripStatus('<div class="icon">🤷</div>Keine Verbindung gefunden');
      return;
    }
    tripRoutes = data.Routes;
    tripMaps = {};
    renderTrips();
  }).catch(function(e) {
    setTripStatus('<div class="icon">⚠️</div>Fehler: ' + e.message);
  });
}

/* ── Helfer ── */
function isFootpath(pr) {
  var t = pr.Mot && pr.Mot.Type ? pr.Mot.Type.toLowerCase() : '';
  return t.indexOf('foot') >= 0 || t.indexOf('walk') >= 0 || !pr.RegularStops || !pr.RegularStops.length;
}
function depOf(s) { return s ? (msDate(s.DepartureRealTime) || msDate(s.DepartureTime) || msDate(s.ArrivalRealTime) || msDate(s.ArrivalTime)) : null; }
function arrOf(s) { return s ? (msDate(s.ArrivalRealTime) || msDate(s.ArrivalTime) || msDate(s.DepartureRealTime) || msDate(s.DepartureTime)) : null; }
function delayOf(s, kind) {
  if (!s) return 0;
  var plan = msDate(s[kind + 'Time']), real = msDate(s[kind + 'RealTime']);
  return (plan && real) ? Math.round((real - plan) / 60000) : 0;
}
function delayTag(min) { return min > 0 ? ' <span class="tlate">+' + min + '</span>' : ''; }
function stop(e) { e.stopPropagation(); }

/* ── Rendern ── */
function renderTrips() {
  document.getElementById('trip-list').innerHTML = tripRoutes.map(function(route, idx) {
    var parts = route.PartialRoutes || [];
    var rides = parts.filter(function(p) { return !isFootpath(p); });

    var firstStops = rides.length ? rides[0].RegularStops : null;
    var lastStops = rides.length ? rides[rides.length - 1].RegularStops : null;
    var dep = firstStops ? depOf(firstStops[0]) : null;
    var arr = lastStops ? arrOf(lastStops[lastStops.length - 1]) : null;

    var minsUntil = dep ? Math.round((dep - new Date()) / 60000) : null;
    var untilTxt = '';
    if (minsUntil !== null && minsUntil <= 120) untilTxt = minsUntil <= 0 ? 'jetzt' : 'in ' + minsUntil + ' min';
    else if (dep && dep.toDateString() !== new Date().toDateString()) untilTxt = dep.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });

    var chain = rides.map(function(p) {
      var m = p.Mot || {};
      return '<span class="badge ' + mclass(m.Type) + '">' + micon(m.Type) + ' ' + esc(m.Name || '?') + '</span>';
    }).join('<span class="chain-arrow">›</span>');

    var changes = typeof route.Interchanges === 'number' ? route.Interchanges : Math.max(rides.length - 1, 0);
    var changeTxt = changes === 0 ? 'direkt' : changes + (changes === 1 ? ' Umstieg' : ' Umstiege');

    var details = parts.map(function(p, pi) {
      if (isFootpath(p)) {
        var dur = p.Duration ? ' · ' + p.Duration + ' min' : '';
        return '<div class="leg leg-walk">🚶 Fußweg' + dur + '</div>';
      }
      var m = p.Mot || {};
      var s = p.RegularStops;
      var a = s[0], b = s[s.length - 1];
      var mids = s.slice(1, -1);
      var pfA = a.Platform && a.Platform.Name ? ' · Steig ' + esc(a.Platform.Name) : '';
      var pfB = b.Platform && b.Platform.Name ? ' · Steig ' + esc(b.Platform.Name) : '';

      var midHtml = '';
      if (mids.length) {
        midHtml = '<button class="mid-toggle" onclick="stop(event);this.parentNode.classList.toggle(\'mids-open\')">'
          + '<span class="mid-arrow">›</span> ' + mids.length + (mids.length === 1 ? ' Zwischenhalt' : ' Zwischenhalte') + '</button>'
          + '<div class="mids">' + mids.map(function(ms) {
              return '<div class="leg-stop mid"><span class="leg-time">' + fmt(depOf(ms)) + '</span>' + esc(ms.Name || '')
                + delayTag(delayOf(ms, 'Departure')) + '</div>';
            }).join('') + '</div>';
      }

      return '<div class="leg">'
        + '<div class="leg-head"><span class="badge ' + mclass(m.Type) + '">' + micon(m.Type) + ' ' + esc(m.Name || '?') + '</span>'
        + '<span class="leg-dir">' + esc(m.Direction || '') + '</span></div>'
        + '<div class="leg-stop"><span class="leg-time">' + fmt(depOf(a)) + '</span>' + esc(a.Name || '')
        + delayTag(delayOf(a, 'Departure')) + '<span class="leg-meta">' + pfA + '</span></div>'
        + midHtml
        + '<div class="leg-stop"><span class="leg-time">' + fmt(arrOf(b)) + '</span>' + esc(b.Name || '')
        + delayTag(delayOf(b, 'Arrival')) + '<span class="leg-meta">' + pfB + '</span></div>'
        + '</div>';
    }).join('');

    return '<div class="trip-card" id="trip-' + idx + '">'
      + '<div class="trip-summary" onclick="toggleTrip(' + idx + ')">'
      + '<div class="trip-top">'
      + '<div class="trip-times">' + fmt(dep) + ' – ' + fmt(arr) + '</div>'
      + '<div class="trip-until">' + untilTxt + '</div>'
      + '</div>'
      + '<div class="trip-meta">' + (route.Duration ? route.Duration + ' min · ' : '') + changeTxt + '</div>'
      + '<div class="trip-chain">' + chain + '</div>'
      + '</div>'
      + '<div class="trip-details">' + details
      + '<button class="map-toggle" onclick="toggleMap(' + idx + ')">🗺 Karte anzeigen</button>'
      + '<div class="trip-map" id="map-' + idx + '"></div>'
      + '</div>'
      + '</div>';
  }).join('');
}

function toggleTrip(idx) {
  document.getElementById('trip-' + idx).classList.toggle('open');
}

/* ── Karte (eingeklappt, wird erst beim Öffnen gebaut) ── */
var lineColors = { tram: '#2563eb', bus: '#16a34a', sbahn: '#d97706', ferry: '#0284c7' };

function toggleMap(idx) {
  var card = document.getElementById('trip-' + idx);
  var btn = card.querySelector('.map-toggle');
  var open = card.classList.toggle('map-open');
  btn.textContent = open ? '🗺 Karte ausblenden' : '🗺 Karte anzeigen';
  if (!open) return;
  if (tripMaps[idx]) { setTimeout(function() { tripMaps[idx].invalidateSize(); }, 50); return; }
  if (!window.L) { document.getElementById('map-' + idx).innerHTML = '<div class="status">Karte konnte nicht geladen werden</div>'; return; }
  setTimeout(function() { buildMap(idx); }, 30);
}

function buildMap(idx) {
  var el = document.getElementById('map-' + idx);
  var map = L.map(el, { zoomControl: true, attributionControl: true });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
  }).addTo(map);

  var all = [], lastPoint = null;
  (tripRoutes[idx].PartialRoutes || []).forEach(function(p) {
    if (isFootpath(p)) return;
    var pts = p.RegularStops.map(function(s) { return toLatLng(s.Latitude, s.Longitude); }).filter(Boolean);
    if (!pts.length) return;
    if (lastPoint) L.polyline([lastPoint, pts[0]], { color: '#9ca3af', weight: 3, dashArray: '4 6' }).addTo(map);
    var color = lineColors[mclass(p.Mot && p.Mot.Type)] || '#2563eb';
    L.polyline(pts, { color: color, weight: 5, opacity: .85 }).addTo(map);
    pts.forEach(function(pt, i) {
      var edge = i === 0 || i === pts.length - 1;
      L.circleMarker(pt, { radius: edge ? 6 : 3, color: color, weight: 2, fillColor: '#fff', fillOpacity: 1 })
        .bindTooltip(esc(p.RegularStops[i] ? p.RegularStops[i].Name : ''))
        .addTo(map);
    });
    all = all.concat(pts);
    lastPoint = pts[pts.length - 1];
  });

  if (all.length) map.fitBounds(all, { padding: [24, 24] });
  else { map.setView([51.05, 13.74], 12); el.insertAdjacentHTML('beforeend', '<div class="map-note">Keine Koordinaten verfügbar</div>'); }
  tripMaps[idx] = map;
}
