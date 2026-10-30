# DRD: CivicFlow Design and Data Requirements

Companion to `PRD.md`. This file defines **how** it is built. The sections marked 🔒 are **frozen contracts**: once a phase uses them, do not rename or reshape them. Only add new fields.

---

## 1. Tech Stack

| Layer | Choice |
|---|---|
| Runtime | Node.js (LTS) |
| Server | Express |
| Storage | `data/reports.json` (single file, read and write via a small `db.js`) |
| Frontend | Plain HTML + CSS + vanilla JS (no build step) |
| Map | Leaflet + OpenStreetMap tiles |
| AI | Gemini API (key in `.env`), with rule-based fallback |
| Hosting | Render (Web Service) |

## 2. Folder Structure 🔒

```
civicflow/
├── PRD.md
├── DRD.md
├── README.md
├── LIMITATIONS.md
├── package.json
├── .env                  (never commit)
├── .env.example
├── .gitignore
├── server.js             (Express app + routes)
├── src/
│   ├── db.js             (load/save reports.json)
│   ├── ai.js             (Gemini calls + fallback)
│   ├── priority.js       (deterministic scoring)
│   ├── duplicates.js     (distance + text similarity)
│   ├── hotspots.js       (clustering)
│   └── brief.js          (action brief)
├── data/
│   ├── reports.json
│   └── seed.json         (40 synthetic reports)
└── public/
    ├── index.html        (citizen: submit)
    ├── track.html        (citizen: track by ID)
    ├── admin.html        (officer dashboard)
    ├── css/style.css
    └── js/ (report.js, track.js, admin.js, common.js)
```

## 3. Data Model 🔒

### Report

```json
{
  "id": "CF-0001",
  "createdAt": "2026-10-30T10:15:00.000Z",
  "description": "Deep pothole near school gate, bikes skidding",
  "imagePath": "uploads/CF-0001.jpg",
  "categoryUser": "road_damage",
  "location": { "lat": 12.9141, "lng": 74.8560, "address": "Optional text" },

  "ai": {
    "mode": "llm",
    "category": "road_damage",
    "summary": "Deep pothole near a school gate causing skids.",
    "factors": {
      "safetyRisk": 3,
      "peopleAffected": 3,
      "vulnerableNearby": true,
      "worsensWithTime": 2
    },
    "duplicateOf": null,
    "duplicateReason": null,
    "priorityScore": 78,
    "priorityLevel": "High",
    "reasons": [
      "Safety risk is high (+30)",
      "Near a school (+15)",
      "2 similar reports nearby (+10)"
    ]
  },

  "status": "submitted",
  "assignedTo": null,
  "timeline": [
    { "at": "2026-10-30T10:15:00.000Z", "status": "submitted", "note": "Report received" }
  ],
  "linkedReports": []
}
```

- `ai.mode` is `"llm"` or `"fallback"`.
- `ai.factors` values `0-3` except `vulnerableNearby` (boolean).
- Report IDs: `CF-` + 4-digit counter.

### Categories 🔒

`road_damage`, `waterlogging`, `garbage`, `streetlight`, `drainage`, `public_service`, `other`

### Status flow 🔒

```
submitted → under_review → assigned → in_progress → resolved
                  ↘ duplicate    ↘ rejected
```

### Mocked teams (label as MOCKED in UI)

`Roads Dept`, `Drainage Dept`, `Sanitation Dept`, `Electrical Dept`, `General Services`

## 4. API Contract 🔒

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/health` | `{ "ok": true }` |
| POST | `/api/reports` | Create a report, runs the AI pipeline, returns the full report |
| GET | `/api/reports` | List all (query: `category`, `status`) |
| GET | `/api/reports/:id` | One report (also used by the tracking page) |
| PATCH | `/api/reports/:id/status` | Body `{ "status": "...", "note": "..." }` (admin PIN header) |
| POST | `/api/reports/:id/assign` | Body `{ "team": "..." }` (admin PIN header) |
| GET | `/api/hotspots` | List of clusters |
| GET | `/api/brief` | Action brief text for the top items |
| POST | `/api/seed` | Reload seed data (admin PIN header) |

Rules:
- All responses are JSON. Errors: `{ "error": "message" }` with a proper status code.
- Admin routes need header `x-admin-pin` matching `ADMIN_PIN` in `.env` (**mocked auth**, labelled in the README).

## 5. AI Pipeline Spec

Order on `POST /api/reports`:

1. **Validate** input (description or image required, location required).
2. **Understand (LLM):** one Gemini call returns strict JSON: `category`, `summary`, `factors`. If it fails or returns invalid JSON → **fallback** (keyword matching for category, first sentence as summary, factors from keywords such as "school", "accident", "live wire", "flood").
3. **Duplicate check (`duplicates.js`):**
   - Candidates: same category, created within the last 30 days, not resolved.
   - Distance ≤ 150 m (haversine) AND text similarity (word-overlap Jaccard) ≥ 0.25.
   - If a match is found, set `duplicateOf`, `duplicateReason` (for example "120 m away, 4 shared key words"), and add to `linkedReports` on both.
4. **Priority (`priority.js`), deterministic:**

| Factor | Points |
|---|---|
| Safety risk (0-3) | × 10 → max 30 |
| People affected (0-3) | × 6 → max 18 |
| Vulnerable place nearby (school, hospital) | +15 |
| Worsens with time (0-3) | × 4 → max 12 |
| Repeat reports (linked count) | +5 each, max 15 |
| Age of open report | +1 per day, max 10 |

   Score capped at 100. Levels: 0-29 Low, 30-54 Medium, 55-79 High, 80+ Critical.
   `reasons[]` is built from the factors that contributed, in plain language, with points.
5. **Save** the report, add the first timeline entry.

> Honest note for the demo: the LLM only extracts factors. The score is plain arithmetic, so it is explainable and repeatable.

### Hotspots (`hotspots.js`)
- Group open reports where each is within 250 m of at least one other in the group.
- A group with 3+ reports becomes a hotspot: `{ center, radiusM, count, categories: {…}, topPriority }`.

### Action Brief (`brief.js`)
- Input: top 5 open reports by score + hotspots.
- LLM returns 3 bullets: *what to fix first, why, and where*. Fallback: a template string built from the data.

## 6. UI Requirements

### `index.html` (citizen submit), mobile-first
- Single column. Order: description → photo → category → map (with "Use my location") → Submit.
- After submit: show the Report ID, AI summary, category, priority level + reasons, and the tracking link.

### `track.html`
- Input for the Report ID (or `?id=` in the URL).
- Shows the status badge, assigned team, timeline, and the AI summary.

### `admin.html` (desktop-first, usable on a tablet)
- PIN prompt (mocked).
- Left: map (priority-colored markers, hotspot circles). Right: ranked list with filters.
- Click an item: detail panel with AI reasoning, linked duplicates, assign dropdown, status buttons.
- Top button: **Action Brief**.
- Visible badges: `AI: llm` or `AI: fallback`, `Teams: MOCKED`.

### Colors (priority)
Low = green, Medium = yellow, High = orange, Critical = red.

## 7. Synthetic Data Spec (`seed.json`)

- 40 reports in one city area (use coordinates around one neighborhood).
- Must include:
  - 3 duplicate pairs or triples (same issue, different wording, near each other)
  - 1 hotspot: 4-5 reports on one street (drain blockage + waterlogging + road damage)
  - 4 urgent safety issues (open manhole, live wire, tree fall, flooded underpass)
  - Mixed statuses (some assigned, a few resolved)
  - No real personal data
- Mark in the README that all data is synthetic.

## 8. Environment

`.env.example`:
```
PORT=3000
GEMINI_API_KEY=your_key_here
ADMIN_PIN=1234
```

## 9. "Do Not Break" Rules

1. **One phase at a time.** Finish the checkpoint in `PRD.md` section 9 before starting the next.
2. **Commit after every working step**, with a message like `p2: add duplicate check`.
3. **Tag at the end of each phase** (`git tag p2`). If something breaks, `git checkout p2` returns to the last good state.
4. **Frozen contracts (🔒):** never rename existing fields, routes, categories, or statuses. Only add.
5. **Change one file at a time**, then run it and test before touching the next.
6. **Fallback always works:** test the app with `GEMINI_API_KEY` empty at the end of P2, P3, and P5.
7. **Never commit `.env`.**
8. **If stuck for more than 15 minutes**, use the fallback or cut the feature (see the cut order in the PRD), and write it in the Limitations note.

## 10. Test Checklist (run at the end of each phase)

- [ ] Server starts with no errors
- [ ] `/api/health` OK
- [ ] Submit a report: text only
- [ ] Submit a report: text + image
- [ ] Obvious duplicate is linked
- [ ] Unrelated report is not linked
- [ ] Urgent report scores High or Critical, with reasons
- [ ] Works with an empty API key (fallback)
- [ ] Status change shows on the tracking page
- [ ] Looks fine at 375 px width
