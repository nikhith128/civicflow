// Deterministic priority scoring. The LLM (or fallback) only RATES the factors;
// this file does the arithmetic, so the score is explainable and repeatable.

const SAFETY_TEXT = [
  null,
  'Minor safety concern',
  'Moderate safety risk',
  'Serious safety risk (danger of injury)'
];
const PEOPLE_TEXT = [
  null,
  'A few people affected',
  'Many people affected',
  'A large number of people affected'
];
const WORSENS_TEXT = [
  null,
  'May get worse over time',
  'Likely to get worse soon',
  'Will get worse quickly if not fixed'
];

function clamp03(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(3, n));
}

function levelFor(score) {
  if (score >= 80) return 'Critical';
  if (score >= 55) return 'High';
  if (score >= 30) return 'Medium';
  return 'Low';
}

// factors: { safetyRisk, peopleAffected, vulnerableNearby, worsensWithTime }
// linkedCount: how many duplicate/linked reports exist
// ageDays: how many days the report has been open
function computePriority(factors, linkedCount, ageDays) {
  const f = factors || {};
  const safety = clamp03(f.safetyRisk);
  const people = clamp03(f.peopleAffected);
  const worsens = clamp03(f.worsensWithTime);
  const vulnerable = f.vulnerableNearby === true;
  const linked = Math.max(0, Math.floor(Number(linkedCount) || 0));
  const age = Math.max(0, Math.floor(Number(ageDays) || 0));

  const parts = [];
  function add(points, text) {
    if (points > 0) parts.push({ points: points, text: text });
  }

  add(safety * 10, SAFETY_TEXT[safety]);
  add(people * 6, PEOPLE_TEXT[people]);
  add(vulnerable ? 15 : 0, 'Near a school, hospital or other vulnerable place');
  add(worsens * 4, WORSENS_TEXT[worsens]);

  const repeatPoints = Math.min(linked * 5, 15);
  add(repeatPoints, linked + ' similar report' + (linked === 1 ? '' : 's') + ' nearby');

  const agePoints = Math.min(age, 10);
  add(agePoints, 'Open for ' + age + ' day' + (age === 1 ? '' : 's'));

  let score = parts.reduce(function (sum, p) { return sum + p.points; }, 0);
  score = Math.min(score, 100);

  const reasons = parts.map(function (p) {
    return p.text + ' (+' + p.points + ')';
  });
  if (reasons.length === 0) {
    reasons.push('No major risk factors found');
  }

  return { score: score, level: levelFor(score), reasons: reasons };
}

module.exports = { computePriority, levelFor };