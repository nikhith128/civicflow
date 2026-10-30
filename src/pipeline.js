// Glue between the pieces: AI analysis -> duplicate check -> priority score.

const db = require('./db');
const ai = require('./ai');
const { findDuplicate } = require('./duplicates');
const { computePriority } = require('./priority');

const DAY = 24 * 60 * 60 * 1000;

function ageDaysOf(report, nowMs) {
  return Math.max(0, Math.floor((nowMs - new Date(report.createdAt).getTime()) / DAY));
}

function makeAi(analysis) {
  return {
    mode: analysis.mode,
    category: analysis.category,
    summary: analysis.summary,
    factors: analysis.factors,
    duplicateOf: null,
    duplicateReason: null,
    priorityScore: 0,
    priorityLevel: 'Low',
    reasons: []
  };
}

// Link two reports to each other (both directions)
function link(a, b) {
  a.linkedReports = a.linkedReports || [];
  b.linkedReports = b.linkedReports || [];
  if (a.linkedReports.indexOf(b.id) === -1) a.linkedReports.push(b.id);
  if (b.linkedReports.indexOf(a.id) === -1) b.linkedReports.push(a.id);
}

function setPriority(report, nowMs) {
  const linked = (report.linkedReports || []).length;
  const p = computePriority(report.ai.factors, linked, ageDaysOf(report, nowMs));
  report.ai.priorityScore = p.score;
  report.ai.priorityLevel = p.level;
  report.ai.reasons = p.reasons;
}

// For ONE new report (already built, with an ID) plus its AI analysis:
// finds a duplicate, scores it, saves it. Runs in one synchronous block.
function saveAnalyzed(report, analysis) {
  const now = Date.now();
  const all = db.getAll();

  report.ai = makeAi(analysis);
  report.linkedReports = [];

  const match = findDuplicate({
    category: analysis.category,
    description: report.description,
    lat: report.location.lat,
    lng: report.location.lng
  }, all, now);

  if (match) {
    const original = match.report;
    report.ai.duplicateOf = original.id;
    report.ai.duplicateReason = match.reason;
    link(report, original);
    if (original.ai) setPriority(original, now); // repeat reports raise the original's priority
  }

  setPriority(report, now);
  all.push(report);
  db.saveAll(all);
  return report;
}

// Analyses every report that has no AI result yet, in ONE Gemini call.
async function processPending() {
  const all = db.getAll();
  const pending = all.filter(function (r) { return !r.ai; });
  if (pending.length === 0) return 0;

  const analyses = await ai.analyzeMany(pending.map(function (r) {
    return { description: r.description, categoryUser: r.categoryUser };
  }));

  const now = Date.now();
  const items = pending.map(function (r, i) {
    return { report: r, analysis: analyses[i] };
  });
  // oldest first, so a duplicate always links to the earlier report
  items.sort(function (x, y) {
    return new Date(x.report.createdAt) - new Date(y.report.createdAt);
  });

  const earlier = all.filter(function (r) { return r.ai; });
  items.forEach(function (item) {
    const r = item.report;
    r.ai = makeAi(item.analysis);
    r.linkedReports = r.linkedReports || [];
    const match = findDuplicate({
      category: r.ai.category,
      description: r.description,
      lat: r.location.lat,
      lng: r.location.lng
    }, earlier, now);
    if (match) {
      r.ai.duplicateOf = match.report.id;
      r.ai.duplicateReason = match.reason;
      link(r, match.report);
    }
    earlier.push(r);
  });

  all.forEach(function (r) {
    if (r.ai) setPriority(r, now);
  });
  db.saveAll(all);
  return pending.length;
}

// Wipes everything, reloads the seed and analyses it again
async function resetAndProcess() {
  db.resetToSeed();
  return processPending();
}

module.exports = { saveAnalyzed, processPending, resetAndProcess };