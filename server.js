require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('./src/db');

const app = express();

const CATEGORIES = ['road_damage', 'waterlogging', 'garbage', 'streetlight', 'drainage', 'public_service', 'other'];

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

app.post('/api/reports', handleUpload, (req, res) => {
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

  db.addReport(report);
  res.status(201).json(report);
});

const port = process.env.PORT || 3000;
console.log('Reports loaded:', db.ensureSeeded());
app.listen(port, () => {
  console.log(`CivicFlow server listening on port ${port}`);
});
