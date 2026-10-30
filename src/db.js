const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const REPORTS_FILE = path.join(DATA_DIR, 'reports.json');
const SEED_FILE = path.join(DATA_DIR, 'seed.json');

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// Which timeline steps each seed status has already passed through
const FLOW = {
  submitted: ['submitted'],
  under_review: ['submitted', 'under_review'],
  assigned: ['submitted', 'under_review', 'assigned'],
  in_progress: ['submitted', 'under_review', 'assigned', 'in_progress'],
  resolved: ['submitted', 'under_review', 'assigned', 'in_progress', 'resolved'],
  rejected: ['submitted', 'under_review', 'rejected']
};

const NOTES = {
  submitted: 'Report received',
  under_review: 'Moved to review',
  assigned: 'Assigned to a team',
  in_progress: 'Work started',
  resolved: 'Marked as resolved',
  rejected: 'Closed without action'
};

// Reads a JSON file. Returns fallback if the file is missing or empty.
function readJson(file, fallback) {
  try {
    const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').trim();
    if (!text) return fallback;
    return JSON.parse(text);
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

function getAll() {
  return readJson(REPORTS_FILE, []);
}

function saveAll(reports) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(REPORTS_FILE, JSON.stringify(reports, null, 2));
}

function getById(id) {
  return getAll().find(function (r) { return r.id === id; }) || null;
}

// Next ID in the form CF-0041
function nextId(reports) {
  let max = 0;
  reports.forEach(function (r) {
    const n = parseInt(String(r.id).replace('CF-', ''), 10);
    if (!isNaN(n) && n > max) max = n;
  });
  return 'CF-' + String(max + 1).padStart(4, '0');
}

// Adds one report and saves. The report must already have its id.
function addReport(report) {
  const reports = getAll();
  reports.push(report);
  saveAll(reports);
  return report;
}

function buildTimeline(seedItem, createdMs, nowMs) {
  const steps = FLOW[seedItem.status] || ['submitted'];
  return steps.map(function (status, i) {
    const at = Math.min(createdMs + i * 3 * HOUR, nowMs);
    let note = NOTES[status];
    if (status === 'assigned' && seedItem.assignedTo) {
      note = 'Assigned to ' + seedItem.assignedTo;
    }
    return { at: new Date(at).toISOString(), status: status, note: note };
  });
}

// Turns seed.json (raw input) into full reports. ai stays null until P2.
function buildFromSeed() {
  const seed = readJson(SEED_FILE, []);
  const now = Date.now();
  return seed.map(function (s) {
    const createdMs = now - s.daysAgo * DAY - HOUR;
    return {
      id: s.id,
      createdAt: new Date(createdMs).toISOString(),
      description: s.description,
      imagePath: null,
      categoryUser: s.categoryUser,
      location: s.location,
      ai: null,
      status: s.status,
      assignedTo: s.assignedTo,
      timeline: buildTimeline(s, createdMs, now),
      linkedReports: []
    };
  });
}

// Replaces everything in reports.json with the seed data. Returns the count.
function resetToSeed() {
  const reports = buildFromSeed();
  saveAll(reports);
  return reports.length;
}

// If reports.json is empty, load the seed
function ensureSeeded() {
  if (getAll().length === 0) {
    return resetToSeed();
  }
  return getAll().length;
}

module.exports = {
  getAll,
  getById,
  saveAll,
  addReport,
  nextId,
  resetToSeed,
  ensureSeeded
};