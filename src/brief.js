// Action brief: "top things to fix today and why".
// Gemini writes the bullets from real data; a template is the fallback.

const ai = require('./ai');
const { findHotspots, isOpen } = require('./hotspots');

function topOpen(reports, n) {
  return reports.filter(isOpen)
    .filter(function (r) { return r.ai; })
    .sort(function (a, b) { return b.ai.priorityScore - a.ai.priorityScore; })
    .slice(0, n);
}

function label(c) { return String(c).replace(/_/g, ' '); }

function templateBrief(top, hotspots) {
  const bullets = top.slice(0, 3).map(function (r) {
    const where = r.location.address || (r.location.lat.toFixed(4) + ', ' + r.location.lng.toFixed(4));
    const why = (r.ai.reasons || []).slice(0, 2).join('; ');
    return r.id + ' (' + r.ai.priorityLevel + ', ' + r.ai.priorityScore + '): ' +
      r.ai.summary + ' at ' + where + '. Why: ' + why + '.';
  });
  if (hotspots.length) {
    const h = hotspots[0];
    const mix = Object.keys(h.categories).map(function (c) { return h.categories[c] + ' ' + label(c); }).join(', ');
    bullets.push('Hotspot at ' + h.label + ': ' + h.count + ' open reports (' + mix + ') in one area.');
  }
  return bullets;
}

async function callGeminiBrief(top, hotspots) {
  const key = (process.env.GEMINI_API_KEY || '').trim();
  if (key.length < 30 || key.startsWith('PASTE') || key === 'your_key_here') throw new Error('no key');
  const data = top.map(function (r) {
    return { id: r.id, score: r.ai.priorityScore, level: r.ai.priorityLevel, summary: r.ai.summary,
      where: r.location.address, reasons: r.ai.reasons, status: r.status };
  });
  const spots = hotspots.slice(0, 2).map(function (h) {
    return { where: h.label, count: h.count, categories: h.categories };
  });
  const prompt = [
    'You brief a city control-room officer. Using ONLY the data below, write exactly 3 bullets:',
    'what to fix first, why, and where. One or two sentences each. Mention report IDs. Do not invent facts.',
    'Reply with ONLY a JSON array of 3 strings.',
    'Top open reports: ' + JSON.stringify(data),
    'Hotspots: ' + JSON.stringify(spots)
  ].join('\n');
  const text = await ai.rawGemini(prompt, key);
  const arr = JSON.parse(String(text).replace(/```json|```/g, '').trim());
  if (!Array.isArray(arr) || arr.length === 0) throw new Error('bad brief');
  return arr.slice(0, 3).map(String);
}

let cache = { sig: '', at: 0, value: null };

async function buildBrief(reports) {
  const top = topOpen(reports, 5);
  const hotspots = findHotspots(reports);
  const sig = top.map(function (r) { return r.id + r.ai.priorityScore + r.status; }).join('|');
  if (cache.value && cache.sig === sig && Date.now() - cache.at < 5 * 60 * 1000) return cache.value;

  let mode = 'llm';
  let bullets;
  try {
    bullets = await callGeminiBrief(top, hotspots);
  } catch (err) {
    mode = 'fallback';
    bullets = templateBrief(top, hotspots);
  }
  const value = { mode: mode, generatedAt: new Date().toISOString(), bullets: bullets, topIds: top.slice(0, 3).map(function (r) { return r.id; }) };
  cache = { sig: sig, at: Date.now(), value: value };
  return value;
}

module.exports = { buildBrief };
