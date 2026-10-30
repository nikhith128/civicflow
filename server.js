require('dotenv').config();

const express = require('express');
const path = require('path');
const db = require('./src/db');

const app = express();
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

const port = process.env.PORT || 3000;
console.log('Reports loaded:', db.ensureSeeded());
app.listen(port, () => {
  console.log(`CivicFlow server listening on port ${port}`);
});
