// Shared helpers for all pages. Citizen text is untrusted, so always escape before using innerHTML.
const CF = (function () {
  const LABELS = {
    road_damage: 'Road damage', waterlogging: 'Waterlogging', garbage: 'Garbage', streetlight: 'Streetlight',
    drainage: 'Drainage', public_service: 'Public service', other: 'Other', not_sure: 'Not sure'
  };
  const STATUS = {
    submitted: 'Submitted', under_review: 'Under review', assigned: 'Assigned', in_progress: 'In progress',
    resolved: 'Resolved', duplicate: 'Duplicate', rejected: 'Rejected'
  };
  const COLORS = { Low: '#16a34a', Medium: '#eab308', High: '#f97316', Critical: '#dc2626' };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtDate(iso) {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
  function levelBadge(ai) {
    if (!ai) return '';
    return '<span class="pill" style="background:' + COLORS[ai.priorityLevel] + '">' +
      esc(ai.priorityLevel) + ' · ' + esc(ai.priorityScore) + '</span>';
  }
  function statusBadge(status) {
    return '<span class="status s-' + esc(status) + '">' + esc(STATUS[status] || status) + '</span>';
  }
  function reasonsList(ai) {
    if (!ai || !ai.reasons) return '';
    return '<ul class="reasons">' + ai.reasons.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul>';
  }
  function timeline(list) {
    return '<ol class="timeline">' + list.map(function (t) {
      return '<li><strong>' + esc(STATUS[t.status] || t.status) + '</strong> <span class="hint">' + esc(fmtDate(t.at)) +
        '</span><br>' + esc(t.note) + '</li>';
    }).join('') + '</ol>';
  }
  function categoryOf(r) { return (r.ai && r.ai.category) || r.categoryUser; }

  async function api(path, opts) {
    opts = opts || {};
    const headers = Object.assign({}, opts.headers || {});
    if (opts.body && !(opts.body instanceof FormData)) headers['Content-Type'] = 'application/json';
    if (opts.pin) headers['x-admin-pin'] = opts.pin;
    const res = await fetch(path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body && !(opts.body instanceof FormData) ? JSON.stringify(opts.body) : opts.body
    });
    let data = null;
    try { data = await res.json(); } catch (e) { /* not json */ }
    if (!res.ok) {
      const err = new Error((data && data.error) || 'Request failed');
      err.status = res.status;
      throw err;
    }
    return data;
  }

  return { LABELS, STATUS, COLORS, esc, fmtDate, levelBadge, statusBadge, reasonsList, timeline, categoryOf, api };
})();

// Site menu: one place to move between the three pages
document.addEventListener('DOMContentLoaded', function () {
  const bar = document.querySelector('.topbar');
  if (!bar) return;
  const here = location.pathname;
  const items = [['/', 'Report'], ['/track.html', 'Track'], ['/admin.html', 'Officer']];
  const nav = document.createElement('nav');
  nav.className = 'sitenav';
  nav.innerHTML = items.map(function (it) {
    const active = (it[0] === '/' ? (here === '/' || here === '/index.html') : here === it[0]);
    return '<a href="' + it[0] + '"' + (active ? ' class="active" aria-current="page"' : '') + '>' + it[1] + '</a>';
  }).join('');
  bar.appendChild(nav);
});
