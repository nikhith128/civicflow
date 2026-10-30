const $ = function (id) { return document.getElementById(id); };
let pin = '';
let reports = [];
let hotspots = [];
let teams = [];
let flow = {};
let selectedId = null;
let map, markerLayer, spotLayer;
const markers = {};

try { pin = sessionStorage.getItem('cf_pin') || ''; } catch (e) { /* storage blocked */ }

// ---------- login ----------
async function tryLogin(p) {
  await CF.api('/api/admin/check', { pin: p });
  pin = p;
  try { sessionStorage.setItem('cf_pin', p); } catch (e) { /* ignore */ }
  $('login').hidden = true;
  $('app').hidden = false;
  await init();
}

$('login-form').addEventListener('submit', async function (e) {
  e.preventDefault();
  try {
    await tryLogin($('pin').value.trim());
  } catch (err) {
    $('login-error').textContent = err.status === 401 ? 'Wrong PIN.' : 'Could not reach the server.';
    $('login-error').hidden = false;
  }
});

$('logout-btn').addEventListener('click', function () {
  try { sessionStorage.removeItem('cf_pin'); } catch (e) { /* ignore */ }
  location.reload();
});

if (pin) tryLogin(pin).catch(function () { pin = ''; });

// ---------- data ----------
async function init() {
  const t = await CF.api('/api/teams');
  teams = t.teams;
  flow = t.statusFlow;

  Object.keys(CF.LABELS).filter(function (k) { return k !== 'not_sure'; }).forEach(function (k) {
    $('f-category').insertAdjacentHTML('beforeend', '<option value="' + k + '">' + CF.esc(CF.LABELS[k]) + '</option>');
  });
  Object.keys(CF.STATUS).forEach(function (k) {
    $('f-status').insertAdjacentHTML('beforeend', '<option value="' + k + '">' + CF.esc(CF.STATUS[k]) + '</option>');
  });
  $('f-category').addEventListener('change', render);
  $('f-status').addEventListener('change', render);

  map = L.map('admin-map').setView([12.9120, 74.8565], 15);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
  spotLayer = L.layerGroup().addTo(map);
  markerLayer = L.layerGroup().addTo(map);
  await refresh();
  if (reports.length) {
    const b = L.latLngBounds(reports.map(function (r) { return [r.location.lat, r.location.lng]; }));
    map.fitBounds(b.pad(0.15));
  }
}

async function refresh() {
  [reports, hotspots] = await Promise.all([CF.api('/api/reports'), CF.api('/api/hotspots')]);
  const modes = {};
  reports.forEach(function (r) { const m = r.ai ? r.ai.mode : 'none'; modes[m] = (modes[m] || 0) + 1; });
  $('ai-badge').textContent = 'AI: ' + Object.keys(modes).map(function (m) { return m + ' ' + modes[m]; }).join(', ');
  render();
  if (selectedId) showDetail(selectedId);
}

function filtered() {
  const c = $('f-category').value;
  const s = $('f-status').value;
  return reports.filter(function (r) {
    return (!c || CF.categoryOf(r) === c) && (!s || r.status === s);
  }).sort(function (a, b) {
    return ((b.ai && b.ai.priorityScore) || 0) - ((a.ai && a.ai.priorityScore) || 0);
  });
}

// ---------- list + map ----------
function render() {
  const list = filtered();
  $('count').textContent = list.length + ' of ' + reports.length + ' reports, highest priority first';
  $('list').innerHTML = list.map(function (r) {
    const color = r.ai ? CF.COLORS[r.ai.priorityLevel] : '#9aa5b1';
    return '<li data-id="' + CF.esc(r.id) + '" class="' + (r.id === selectedId ? 'sel' : '') + '" style="border-left-color:' + color + '">' +
      '<div class="top"><strong>' + CF.esc(r.id) + '</strong>' + CF.levelBadge(r.ai) + CF.statusBadge(r.status) + '</div>' +
      '<p class="sum">' + CF.esc(r.ai ? r.ai.summary : r.description) + '</p>' +
      '<span class="hint">' + CF.esc(CF.LABELS[CF.categoryOf(r)] || '') + (r.location.address ? ' · ' + CF.esc(r.location.address) : '') + '</span></li>';
  }).join('');
  Array.prototype.forEach.call($('list').children, function (li) {
    li.addEventListener('click', function () { select(li.getAttribute('data-id'), true); });
  });

  markerLayer.clearLayers();
  Object.keys(markers).forEach(function (k) { delete markers[k]; });
  list.forEach(function (r) {
    const closed = r.status === 'resolved' || r.status === 'rejected' || r.status === 'duplicate';
    const m = L.circleMarker([r.location.lat, r.location.lng], {
      radius: 6 + Math.round(((r.ai && r.ai.priorityScore) || 0) / 15),
      color: '#fff', weight: 2,
      fillColor: r.ai ? CF.COLORS[r.ai.priorityLevel] : '#9aa5b1',
      fillOpacity: closed ? 0.35 : 0.9
    }).addTo(markerLayer);
    m.bindTooltip(r.id + ' · ' + (r.ai ? r.ai.priorityLevel : ''));
    m.on('click', function () { select(r.id, false); });
    markers[r.id] = m;
  });

  spotLayer.clearLayers();
  hotspots.forEach(function (h) {
    const mix = Object.keys(h.categories).map(function (c) { return h.categories[c] + ' ' + (CF.LABELS[c] || c); }).join(', ');
    L.circle([h.center.lat, h.center.lng], { radius: h.radiusM, color: '#7c3aed', weight: 2, dashArray: '6 4', fillColor: '#7c3aed', fillOpacity: 0.08 })
      .addTo(spotLayer)
      .bindTooltip('Hotspot: ' + h.count + ' open reports (' + mix + ')');
  });
}

function select(id, pan) {
  selectedId = id;
  render();
  showDetail(id);
  const r = reports.find(function (x) { return x.id === id; });
  if (pan && r) map.panTo([r.location.lat, r.location.lng]);
}

// ---------- detail panel ----------
function showDetail(id) {
  const r = reports.find(function (x) { return x.id === id; });
  if (!r) { $('detail').hidden = true; return; }
  const ai = r.ai;
  const next = flow[r.status] || [];
  const closed = next.length === 0;
  const f = ai && ai.factors;

  $('detail').innerHTML =
    '<button class="close" id="d-close">Close</button>' +
    '<h2>' + CF.esc(r.id) + ' ' + CF.statusBadge(r.status) + '</h2>' +
    '<p>' + CF.esc(r.description) + '</p>' +
    (r.imagePath ? '<img class="photo" src="/' + CF.esc(r.imagePath) + '" alt="Citizen photo">' : '') +
    '<p class="hint">' + CF.esc(CF.LABELS[CF.categoryOf(r)] || '') + (r.location.address ? ' · ' + CF.esc(r.location.address) : '') +
    ' · ' + CF.esc(CF.fmtDate(r.createdAt)) + '</p>' +
    (ai ? '<h3>AI reasoning <span class="badge ai">AI: ' + CF.esc(ai.mode) + '</span></h3>' +
      '<p><em>' + CF.esc(ai.summary) + '</em></p>' +
      '<p>Priority ' + CF.levelBadge(ai) + '</p>' + CF.reasonsList(ai) +
      (f ? '<p class="hint">AI-rated factors: safety ' + f.safetyRisk + '/3, people ' + f.peopleAffected + '/3, vulnerable place ' +
        (f.vulnerableNearby ? 'yes' : 'no') + ', worsens ' + f.worsensWithTime + '/3. The score itself is plain arithmetic.</p>' : '') +
      (ai.duplicateOf ? '<p><strong>Possible duplicate of ' + CF.esc(ai.duplicateOf) + '</strong><br><span class="hint">' + CF.esc(ai.duplicateReason) + '</span></p>' : '') : '') +
    ((r.linkedReports || []).length ? '<p><strong>Linked reports:</strong> ' + r.linkedReports.map(function (l) {
      return '<a href="#" data-link="' + CF.esc(l) + '">' + CF.esc(l) + '</a>'; }).join(', ') + '</p>' : '') +
    '<h3>Assign <span class="badge">MOCKED teams</span></h3>' +
    '<div class="row"><select id="d-team"><option value="">Choose team…</option>' +
    teams.map(function (t) { return '<option' + (t === r.assignedTo ? ' selected' : '') + '>' + CF.esc(t) + '</option>'; }).join('') +
    '</select><button id="d-assign"' + (closed ? ' disabled' : '') + '>Assign</button></div>' +
    '<h3>Move status</h3><div class="row">' +
    (next.filter(function (s) { return s !== 'assigned'; }).map(function (s) {
      return '<button data-status="' + s + '">' + CF.esc(CF.STATUS[s]) + '</button>'; }).join('') || '<span class="hint">No further steps (closed).</span>') +
    '</div><p id="d-msg" class="error" hidden></p>' +
    '<h3>Timeline</h3>' + CF.timeline(r.timeline) +
    '<p class="hint"><a href="/track.html?id=' + CF.esc(r.id) + '" target="_blank" rel="noopener">Open citizen tracking page</a></p>';
  $('detail').hidden = false;

  $('d-close').onclick = function () { selectedId = null; $('detail').hidden = true; render(); };
  Array.prototype.forEach.call($('detail').querySelectorAll('[data-link]'), function (a) {
    a.onclick = function (e) { e.preventDefault(); select(a.getAttribute('data-link'), true); };
  });
  $('d-assign').onclick = async function () {
    const team = $('d-team').value;
    if (!team) return fail('Choose a team first.');
    await act(function () { return CF.api('/api/reports/' + encodeURIComponent(id) + '/assign', { method: 'POST', pin: pin, body: { team: team } }); });
  };
  Array.prototype.forEach.call($('detail').querySelectorAll('[data-status]'), function (b) {
    b.onclick = async function () {
      const s = b.getAttribute('data-status');
      await act(function () { return CF.api('/api/reports/' + encodeURIComponent(id) + '/status', { method: 'PATCH', pin: pin, body: { status: s } }); });
    };
  });
}

function fail(msg) { $('d-msg').textContent = msg; $('d-msg').hidden = false; }

async function act(fn) {
  try {
    await fn();
    await refresh();
  } catch (err) {
    if (err.status === 401) { fail('PIN rejected. Log in again.'); } else { fail(err.message); }
  }
}

// ---------- action brief ----------
$('brief-btn').addEventListener('click', async function () {
  const box = $('brief');
  box.hidden = false;
  box.innerHTML = '<div class="card"><p>Building the brief…</p></div>';
  try {
    const b = await CF.api('/api/brief');
    box.innerHTML = '<div class="card"><h2>Action Brief <span class="badge ai">AI: ' + CF.esc(b.mode) + '</span></h2>' +
      '<p class="hint">Top things to fix today and why, from the current open reports.</p><ul>' +
      b.bullets.map(function (x) { return '<li>' + CF.esc(x) + '</li>'; }).join('') +
      '</ul><button id="brief-close">Close</button></div>';
    $('brief-close').onclick = function () { box.hidden = true; };
  } catch (err) {
    box.innerHTML = '<div class="card"><p class="error">Could not build the brief.</p><button id="brief-close">Close</button></div>';
    $('brief-close').onclick = function () { box.hidden = true; };
  }
});
$('brief').addEventListener('click', function (e) { if (e.target === $('brief')) $('brief').hidden = true; });
