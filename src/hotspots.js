// Hotspot detection: open reports that sit within 250 m of each other form a cluster.
// A cluster of 3+ reports is a hotspot.

const { haversineM } = require('./duplicates');

const LINK_DISTANCE_M = 250;
const MIN_REPORTS = 3;

function categoryOf(r) {
  return (r.ai && r.ai.category) || r.categoryUser || 'other';
}

function isOpen(r) {
  return r.status !== 'resolved' && r.status !== 'rejected' && r.status !== 'duplicate';
}

function findHotspots(reports) {
  const open = reports.filter(isOpen);
  const parent = open.map(function (_, i) { return i; });
  function find(i) {
    while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
    return i;
  }

  // single-linkage: a report joins a group if it is within 250 m of ANY member
  for (let i = 0; i < open.length; i++) {
    for (let j = i + 1; j < open.length; j++) {
      const d = haversineM(open[i].location.lat, open[i].location.lng, open[j].location.lat, open[j].location.lng);
      if (d <= LINK_DISTANCE_M) parent[find(i)] = find(j);
    }
  }

  const groups = {};
  open.forEach(function (r, i) {
    const root = find(i);
    (groups[root] = groups[root] || []).push(r);
  });

  const spots = [];
  Object.keys(groups).forEach(function (k) {
    const g = groups[k];
    if (g.length < MIN_REPORTS) return;
    const lat = g.reduce(function (s, r) { return s + r.location.lat; }, 0) / g.length;
    const lng = g.reduce(function (s, r) { return s + r.location.lng; }, 0) / g.length;
    let radius = 0;
    g.forEach(function (r) {
      radius = Math.max(radius, haversineM(lat, lng, r.location.lat, r.location.lng));
    });
    const categories = {};
    g.forEach(function (r) {
      const c = categoryOf(r);
      categories[c] = (categories[c] || 0) + 1;
    });
    spots.push({
      center: { lat: lat, lng: lng },
      radiusM: Math.max(60, Math.round(radius + 30)), // small margin so edge markers sit inside the circle
      count: g.length,
      categories: categories,
      topPriority: Math.max.apply(null, g.map(function (r) { return (r.ai && r.ai.priorityScore) || 0; })),
      reportIds: g.map(function (r) { return r.id; }),
      label: (g[0].location.address || '').split(',')[0] || 'Cluster'
    });
  });

  spots.sort(function (a, b) { return b.count - a.count || b.topPriority - a.topPriority; });
  return spots;
}

module.exports = { findHotspots, isOpen };
