// Verbindungsauskunft — nutzt Hilfsfunktionen aus index.html (api, parsePoint, msDate, fmt, mclass, micon, esc)
var tripFrom = null, tripTo = null;

function switchView(v) {
  document.getElementById('view-deps').style.display = v === 'deps' ? '' : 'none';
  document.getElementById('view-trip').style.display = v === 'trip' ? '' : 'none';
  document.querySelectorAll('.tab').forEach(function(t) {
    t.classList.toggle('on', t.dataset.view === v);
  });
  if (v === 'trip' && !tripFrom) document.getElementById('from-inp').focus();
}

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

function maybeLoadTrips() {
  if (!tripFrom || !tripTo) return;
  setTripStatus('<div class="icon">🧭</div>Suche Verbindungen…');
  api('trip', { origin: tripFrom.id, destination: tripTo.id, time: new Date().toISOString() })
    .then(function(data) {
      if (!data.Routes || !data.Routes.length) {
        setTripStatus('<div class="icon">🤷</div>Keine Verbindung gefunden');
        return;
      }
      renderTrips(data.Routes);
    })
    .catch(function(e) {
      setTripStatus('<div class="icon">⚠️</div>Fehler: ' + e.message);
    });
}

function isFootpath(pr) {
  var t = pr.Mot && pr.Mot.Type ? pr.Mot.Type.toLowerCase() : '';
  return t.indexOf('foot') >= 0 || t.indexOf('walk') >= 0 || !pr.RegularStops || !pr.RegularStops.length;
}

function stopTime(stop, key) {
  if (!stop) return null;
  return msDate(stop[key]) || msDate(stop.DepartureTime) || msDate(stop.ArrivalTime);
}

function renderTrips(routes) {
  document.getElementById('trip-list').innerHTML = routes.map(function(route, idx) {
    var parts = route.PartialRoutes || [];
    var rides = parts.filter(function(p) { return !isFootpath(p); });

    var firstStops = rides.length ? rides[0].RegularStops : null;
    var lastStops = rides.length ? rides[rides.length - 1].RegularStops : null;
    var dep = firstStops ? stopTime(firstStops[0], 'DepartureTime') : null;
    var arr = lastStops ? stopTime(lastStops[lastStops.length - 1], 'ArrivalTime') : null;

    var minsUntil = dep ? Math.round((dep - new Date()) / 60000) : null;
    var untilTxt = minsUntil === null ? '' : (minsUntil <= 0 ? 'jetzt' : 'in ' + minsUntil + ' min');

    var chain = rides.map(function(p) {
      var m = p.Mot || {};
      return '<span class="badge ' + mclass(m.Type) + '">' + micon(m.Type) + ' ' + esc(m.Name || '?') + '</span>';
    }).join('<span class="chain-arrow">›</span>');

    var changes = typeof route.Interchanges === 'number' ? route.Interchanges : Math.max(rides.length - 1, 0);
    var changeTxt = changes === 0 ? 'direkt' : changes + (changes === 1 ? ' Umstieg' : ' Umstiege');

    var details = parts.map(function(p) {
      if (isFootpath(p)) {
        var dur = p.Duration ? ' · ' + p.Duration + ' min' : '';
        return '<div class="leg leg-walk">🚶 Fußweg' + dur + '</div>';
      }
      var m = p.Mot || {};
      var s = p.RegularStops;
      var a = s[0], b = s[s.length - 1];
      var pfA = a.Platform && a.Platform.Name ? ' · Steig ' + esc(a.Platform.Name) : '';
      return '<div class="leg">'
        + '<div class="leg-head"><span class="badge ' + mclass(m.Type) + '">' + micon(m.Type) + ' ' + esc(m.Name || '?') + '</span>'
        + '<span class="leg-dir">' + esc(m.Direction || '') + '</span></div>'
        + '<div class="leg-stop"><span class="leg-time">' + fmt(stopTime(a, 'DepartureTime')) + '</span>' + esc(a.Name || '') + '<span class="leg-meta">' + pfA + '</span></div>'
        + '<div class="leg-stop"><span class="leg-time">' + fmt(stopTime(b, 'ArrivalTime')) + '</span>' + esc(b.Name || '') + '</div>'
        + '</div>';
    }).join('');

    return '<div class="trip-card" onclick="this.classList.toggle(\'open\')">'
      + '<div class="trip-top">'
      + '<div class="trip-times">' + fmt(dep) + ' – ' + fmt(arr) + '</div>'
      + '<div class="trip-until">' + untilTxt + '</div>'
      + '</div>'
      + '<div class="trip-meta">' + (route.Duration ? route.Duration + ' min · ' : '') + changeTxt + '</div>'
      + '<div class="trip-chain">' + chain + '</div>'
      + '<div class="trip-details">' + details + '</div>'
      + '</div>';
  }).join('');
}
