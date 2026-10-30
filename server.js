require('dotenv').config();

const express = require('express');
const path = require('path');
const db = require('./src/db');

const app = express();

const CATEGORIES = ['road_damage', 'waterlogging', 'garbage', 'streetlight', 'drainage', 'public_service', 'other'];

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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

app.post('/api/reports', (req, res) => {
  const body = req.body || {};
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
  if (typeof body.lat !== 'number' || typeof body.lng !== 'number' ||
      body.lat < -90 || body.lat > 90 || body.lng < -180 || body.lng > 180) {
    return res.status(400).json({ error: 'A valid location is required' });
  }

  const now = new Date().toISOString();
  const report = {
    id: db.nextId(db.getAll()),
    createdAt: now,
    description: description,
    imagePath: null,
    categoryUser: categoryUser,
    location: { lat: body.lat, lng: body.lng, address: address },
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
