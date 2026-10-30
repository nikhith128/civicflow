
// Duplicate detection: same category + close by + shared key words.
// Returns the best matching existing report (or null) with a plain-language reason.

const MAX_DISTANCE_M = 150;      // never link reports further apart than this
const CLOSE_DISTANCE_M = 60;     // within this distance, fewer shared words are enough
const MIN_SHARED = 3;            // shared key words needed (150 m)
const MIN_SHARED_CLOSE = 2;      // shared key words needed (60 m)
const MAX_AGE_DAYS = 30;

const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'of', 'on', 'in', 'at', 'to',
  'for', 'and', 'or', 'but', 'it', 'its', 'this', 'that', 'with', 'near', 'has', 'have', 'had',
  'not', 'no', 'from', 'by', 'as', 'into', 'onto', 'every', 'there', 'very', 'right', 'been',
   'road', 'street', 'lane', 'rd', 'st',
  'one', 'two', 'three', 'four', 'five'
]);

const SYNONYMS = {
  hole: 'pothole', crater: 'pothole',
  dustbin: 'bin',
  lamp: 'light', streetlight: 'light',
  entrance: 'gate',
  flooded: 'water', flooding: 'water', flood: 'water',
  waterlogged: 'water', waterlogging: 'water'
};

function stem(word) {
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) {
    return word.slice(0, -1);
  }
  return word;
}

// Text -> list of unique key words
function tokenize(text) {
  const words = String(text || '').toLowerCase().split(/[^a-z]+/);
  const seen = new Set();
  words.forEach(function (w) {
    if (w.length < 3 || STOPWORDS.has(w)) return;
    let s = stem(w);
    if (SYNONYMS[s]) s = SYNONYMS[s];
    if (!STOPWORDS.has(s)) seen.add(s);
  });
  return Array.from(seen);
}

// Distance in metres between two lat/lng points
function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = function (d) { return d * Math.PI / 180; };
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function categoryOf(report) {
  return (report.ai && report.ai.category) || report.categoryUser;
}

// candidate: { category, description, lat, lng }
// existing: array of full reports
function findDuplicate(candidate, existing, nowMs) {
  const now = nowMs || Date.now();
  const candWords = tokenize(candidate.description);
  const category = candidate.category;
  const checkCategory = category && category !== 'not_sure';
  let best = null;

  existing.forEach(function (r) {
    if (r.status === 'resolved' || r.status === 'rejected') return;
    const ageDays = (now - new Date(r.createdAt).getTime()) / 86400000;
    if (ageDays > MAX_AGE_DAYS) return;
    if (checkCategory && categoryOf(r) !== category) return;

    const dist = haversineM(candidate.lat, candidate.lng, r.location.lat, r.location.lng);
    if (dist > MAX_DISTANCE_M) return;

    const rWords = tokenize(r.description);
    const shared = candWords.filter(function (w) { return rWords.indexOf(w) !== -1; });
    const needed = dist <= CLOSE_DISTANCE_M ? MIN_SHARED_CLOSE : MIN_SHARED;
    if (shared.length < needed) return;

    const better = !best ||
      shared.length > best.shared.length ||
      (shared.length === best.shared.length && dist < best.distanceM);
    if (better) {
      best = {
        report: r,
        distanceM: Math.round(dist),
        shared: shared,
        reason: Math.round(dist) + ' m away, shared words: ' + shared.join(', ')
      };
    }
  });

  return best;
}

module.exports = { findDuplicate, tokenize, haversineM };