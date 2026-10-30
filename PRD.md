# PRD: CivicFlow (From Complaints to Action)

PromptWars x ASTRA | Solo | 8 hours | Working prototype + 5-min demo

> **How to use this file:** Read this and `DRD.md` at the start of every phase. Do not change scope here mid-build. If something must change, write it in the "Change Log" at the bottom first.

---

## 1. Problem

Citizen complaints (waterlogging, potholes, overflowing bins, broken streetlights) arrive scattered. The same issue is reported many times, urgent hazards sit beside routine requests, and citizens never see what happened.

## 2. Product Goal

An AI-powered platform that turns scattered citizen reports into **prioritized, explainable, trackable action**.

One-line pitch: *"Report in under a minute. AI tells the officer what to fix first, and why. The citizen watches it get fixed."*

## 3. Users

| User | Need |
|---|---|
| Citizen | Report fast on a phone, see status of their report |
| Officer (decision-maker) | See what is urgent, where problems cluster, assign and close work |

## 4. Scope

### In scope (MVP)
- Report submission (text and/or image, category, location)
- AI pipeline: categorize, summarize, duplicate check, priority + reasoning
- Dashboard: map, ranked list, hotspots, action brief
- Workflow: review, assign, track status
- Citizen tracking page (by report ID)
- 40 synthetic reports

### Out of scope (say so honestly in the demo)
- Real user login (admin uses a mocked PIN)
- Real SMS/email notifications (mocked)
- Real government integration
- Multi-language support, native app

## 5. Functional Requirements

### Stage 1: Capture
- **FR-1.1** Form fields: description (text), optional image, category (dropdown, including "Not sure"), location.
- **FR-1.2** Location by map pin (Leaflet click), "Use my location" button, or typed address/coordinates.
- **FR-1.3** Works on a phone-sized screen. Submission takes under 1 minute.
- **FR-1.4** On submit, the citizen gets a **Report ID** and a link to the tracking page.

### Stage 2: Understand (AI)
- **FR-2.1** Auto-categorize (if "Not sure" or if the AI disagrees, show the AI suggestion).
- **FR-2.2** One-sentence summary of the report.
- **FR-2.3** Duplicate check: link to an existing report if same issue (shown with a similarity reason).
- **FR-2.4** Priority score (0-100) with level (Low/Medium/High/Critical) and a **plain-language explanation listing each factor**.
- **FR-2.5** If the AI fails or the key is missing, a rule-based fallback runs, and the report is marked `aiMode: "fallback"`.

### Stage 3: Reveal
- **FR-3.1** Map with colored markers by priority.
- **FR-3.2** Hotspot detection: groups of 3+ reports within about 250 m shown as highlighted circles, with the mix of categories.
- **FR-3.3** Ranked list sorted by priority, filterable by category and status.
- **FR-3.4** Action Brief: a short AI-generated summary of "top 3 things to fix today and why".

### Stage 4: Act
- **FR-4.1** Officer can open a report, see the AI reasoning, and assign it to a team (dropdown of mocked teams).
- **FR-4.2** Status workflow: `submitted → under_review → assigned → in_progress → resolved` (also `duplicate`, `rejected`).
- **FR-4.3** Every status change is logged with a timestamp in a timeline.
- **FR-4.4** Citizen tracking page shows the current status and the timeline.

## 6. The AI Capabilities (what we claim, nothing more)

1. **Explainable prioritization** (main feature)
2. **Duplicate detection** (distance + text similarity + LLM confirmation)
3. **Hotspot/cluster detection** (distance-based grouping)
4. **Action brief** (LLM summary of top items)

Honest framing: the LLM extracts and rates factors, and deterministic code computes the final score. That makes it explainable and repeatable.

## 7. Demo Script (5 minutes)

1. **(0:00)** Show the problem in one sentence.
2. **(0:30)** On a phone view, submit a new report: text + image + category + map pin.
3. **(1:30)** Show the AI result: category, summary, duplicate check, priority score with the factor breakdown.
4. **(2:30)** Open the dashboard: map, hotspot circle, ranked list. Click "Action Brief".
5. **(3:30)** Assign the report, move it to in_progress.
6. **(4:15)** Open the citizen tracking page and show the status update.
7. **(4:45)** State limitations (what is mocked, where the AI can be wrong).

## 8. Success Criteria

- Full journey in section 7 works without errors, twice in a row.
- At least 1 duplicate pair, 1 hotspot, and 3 urgent safety reports are visible in the seed data.
- README and Limitations note are complete.
- Nothing is claimed that is not real. Mocked parts are labelled in the UI.

## 9. Build Phases (each ends with a checkpoint)

| Phase | Goal | Checkpoint (must pass before moving on) | Git tag |
|---|---|---|---|
| P0 | Setup + docs + seed data | `npm start` runs, `/api/health` returns OK, 40 seed reports load | `p0` |
| P1 | Capture + storage | Submit a report from the form, see it in `GET /api/reports` | `p1` |
| P2 | AI pipeline | New report returns category, summary, duplicate, score + reasons. Fallback works with key removed | `p2` |
| P3 | Dashboard + hotspots + brief | Map shows markers, hotspot circle, ranked list, brief | `p3` |
| P4 | Workflow + citizen tracking | Assign, change status, and see it on the tracking page | `p4` |
| P5 | Polish + deploy | Hosted link works on a phone | `p5` |
| P6 | Docs + rehearsal | README, Limitations note, demo run twice | `p6` |

**Rule:** Never start the next phase until the current checkpoint passes and is committed and tagged.

## 10. Risks and Fallbacks

| Risk | Fallback |
|---|---|
| Gemini API fails or rate limits | Rule-based pipeline (keywords + distance + weights), flagged as `fallback` |
| Image upload problems | Image is optional, so text-only still works |
| Deploy fails | Demo from local laptop, keep the hosted link as a bonus |
| Running out of time | Cut order: image AI → action brief → polish. Never cut duplicate detection, priority explanation, or tracking |

## 11. Change Log

| Time | Change | Reason |
|---|---|---|
| P3/P4 | Added `GET /api/teams`, `GET /api/admin/check`; `assign` also moves a new report to `assigned` | Dashboard needs the team list and a PIN check; additive only, no frozen contract changed |
| P3 | Added `admin.css`, `rawGemini` export in `ai.js` | Dashboard styling; brief reuses the same Gemini caller |
