require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('./src/db');
const ai = require('./src/ai');
const pipeline = require('./src/pipeline');
const { findHotspots } = require('./src/hotspots');
const { buildBrief } = require('./src/brief');

const app = express();

const CATEGORIES = ['road_damage', 'waterlogging', 'garbage', 'streetlight', 'drainage', 'public_service', 'other'];

const TEAMS = ['Roads Dept', 'Drainage Dept', 'Sanitation Dept', 'Electrical Dept', 'General Services'];

// Allowed next statuses (frozen status flow from DRD)
const NEXT = {
  submitted: ['under_review', 'duplicate', 'rejected'],
  under_review: ['assigned', 'duplicate', 'rejected'],
  assigned: ['in_progress', 'rejected'],
  in_progress: ['resolved'],
  resolved: [],
  duplicate: [],
  rejected: []
};

const UPLOAD_DIR = path.join(__dirname, 'uploads');
const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    if (IMAGE_TYPES[file.mimetype]) return cb(null, true);
    cb(new Error('Only JPG, PNG or WebP images are allowed'));
  }
});

function handleUpload(req, res, next) {
  upload.single('image')(req, res, function (err) {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Image is too large (max 5 MB)' : err.message;
      return res.status(400).json({ error: msg });
    }
    next();
  });
}

// Mocked admin check: a shared PIN from .env (clearly not real security)
function requireAdmin(req, res, next) {
  const pin = process.env.ADMIN_PIN;
  if (!pin || req.get('x-admin-pin') !== pin) {
    return res.status(401).json({ error: 'Admin PIN required' });
  }
  next();
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.get('/api/reports', (req, res) => {
  let reports = db.getAll();
  const { category, status } = req.query;
  if (category) {
    reports = reports.filter(r => ((r.ai && r.ai.category) || r.categoryUser) === category);
  }
  if (status) {
    reports = reports.filter(r => r.status === status);
  }
  reports.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(reports);
});

app.get('/api/reports/:id', (req, res) => {
  const report = db.getById(req.params.id);
  if (!report) {
    return res.status(404).json({ error: 'Report not found' });
  }
  res.json(report);
});

app.post('/api/reports', handleUpload, async (req, res) => {
  const body = req.body || {};
  const lat = parseFloat(body.lat);
  const lng = parseFloat(body.lng);
  const description = String(body.description || '').trim();
  const categoryUser = body.category || 'not_sure';
  const address = String(body.address || '').trim();

  if (description.length < 5) {
    return res.status(400).json({ error: 'Please describe the problem (at least 5 characters)' });
  }
  if (description.length > 1000) {
    return res.status(400).json({ error: 'Description is too long (max 1000 characters)' });
  }
  if (categoryUser !== 'not_sure' && !CATEGORIES.includes(categoryUser)) {
    return res.status(400).json({ error: 'Unknown category' });
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng) ||
      lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return res.status(400).json({ error: 'A valid location is required' });
  }

  // AI first (can take a few seconds). The ID is chosen afterwards so two quick submissions never collide.
  const analysis = await ai.analyzeReport({ description: description, categoryUser: categoryUser });

  const id = db.nextId(db.getAll());
  let imagePath = null;
  if (req.file) {
    const fileName = id + '.' + IMAGE_TYPES[req.file.mimetype];
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    fs.writeFileSync(path.join(UPLOAD_DIR, fileName), req.file.buffer);
    imagePath = 'uploads/' + fileName;
  }

  const now = new Date().toISOString();
  const report = {
    id: id,
    createdAt: now,
    description: description,
    imagePath: imagePath,
    categoryUser: categoryUser,
    location: { lat: lat, lng: lng, address: address },
    ai: null,
    status: 'submitted',
    assignedTo: null,
    timeline: [{ at: now, status: 'submitted', note: 'Report received' }],
    linkedReports: []
  };

  pipeline.saveAnalyzed(report, analysis);
  res.status(201).json(report);
});

app.get('/api/teams', (req, res) => {
  res.json({ mocked: true, teams: TEAMS, statusFlow: NEXT });
});

// Lets the dashboard check the PIN before showing anything
app.get('/api/admin/check', requireAdmin, (req, res) => {
  res.json({ ok: true });
});

app.get('/api/hotspots', (req, res) => {
  res.json(findHotspots(db.getAll()));
});

app.get('/api/brief', async (req, res) => {
  try {
    res.json(await buildBrief(db.getAll()));
  } catch (err) {
    res.status(500).json({ error: 'Could not build the brief' });
  }
});

// Mutations run synchronously (read, change, save) so two requests cannot overwrite each other.
app.patch('/api/reports/:id/status', requireAdmin, (req, res) => {
  const all = db.getAll();
  const report = all.find(r => r.id === req.params.id);
  if (!report) return res.status(404).json({ error: 'Report not found' });
  const status = String((req.body || {}).status || '');
  const note = String((req.body || {}).note || '').trim().slice(0, 300);
  if (!Object.prototype.hasOwnProperty.call(NEXT, status)) {
    return res.status(400).json({ error: 'Unknown status' });
  }
  if (NEXT[report.status].indexOf(status) === -1) {
    return res.status(400).json({ error: 'Cannot move from ' + report.status + ' to ' + status });
  }
  if (status === 'assigned' && !report.assignedTo) {
    return res.status(400).json({ error: 'Assign a team first' });
  }
  report.status = status;
  report.timeline.push({ at: new Date().toISOString(), status: status, note: note || 'Status changed to ' + status });
  db.saveAll(all);
  res.json(report);
});

// Assigning moves the report to "assigned" (via under_review if it is still new)
app.post('/api/reports/:id/assign', requireAdmin, (req, res) => {
  const all = db.getAll();
  const report = all.find(r => r.id === req.params.id);
  if (!report) return res.status(404).json({ error: 'Report not found' });
  const team = String((req.body || {}).team || '');
  if (TEAMS.indexOf(team) === -1) return res.status(400).json({ error: 'Unknown team' });
  if (['resolved', 'rejected', 'duplicate'].indexOf(report.status) !== -1) {
    return res.status(400).json({ error: 'This report is closed' });
  }
  const now = new Date().toISOString();
  report.assignedTo = team;
  if (report.status === 'submitted') {
    report.status = 'under_review';
    report.timeline.push({ at: now, status: 'under_review', note: 'Moved to review' });
  }
  if (report.status === 'under_review') {
    report.status = 'assigned';
    report.timeline.push({ at: now, status: 'assigned', note: 'Assigned to ' + team + ' (mocked team)' });
  } else {
    report.timeline.push({ at: now, status: report.status, note: 'Reassigned to ' + team + ' (mocked team)' });
  }
  db.saveAll(all);
  res.json(report);
});

// WARNING: wipes ALL reports and reloads the 40 seed reports
app.post('/api/seed', requireAdmin, async (req, res) => {
  const analysed = await pipeline.resetAndProcess();
  res.json({ ok: true, reports: db.getAll().length, analysed: analysed });
});

const port = process.env.PORT || 3000;
console.log('Reports loaded:', db.ensureSeeded());
pipeline.processPending()
  .then((n) => { if (n > 0) console.log('AI analysed ' + n + ' reports'); })
  .catch((err) => console.warn('Startup AI step failed:', err.message))
  .finally(() => {
    app.listen(port, () => {
      console.log(`CivicFlow server listening on port ${port}`);
    });
  });