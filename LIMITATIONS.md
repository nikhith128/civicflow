# Limitations (honest list)

## Mocked
- **Officer login** is a shared PIN sent in a header. Anyone with the PIN is an admin. Not real security.
- **Teams** are fixed labels. Assigning does not notify anyone.
- **Notifications** (SMS/email) do not exist.
- **No integration** with any real government system.

## Where the AI can be wrong
- The LLM rates factors from text only. It can misread sarcasm, vague text or a wrong language. Reports are not translated (English only).
- **Photos are stored but not analysed.** Image AI was cut first, per the PRD cut order.
- Duplicate detection is distance (150 m) plus shared key words. It can miss duplicates described with different words, or link two different problems that use similar words.
- Hotspots are distance-based grouping (250 m, 3+ open reports). They show proximity, not cause.
- **Fallback mode is cruder.** It is keyword based and under-rates some urgent items. In the seed data an open manhole scores Medium (42) and a fallen tree blocking a road scores Medium (48) in fallback mode. With the scoring formula as frozen, Critical (80+) needs several factors at once, including a vulnerable place nearby or repeat reports. Review the weights before real use.
- The Action Brief uses only the top 5 open reports and hotspots. It is a summary, not a decision.

## Technical
- Storage is one JSON file, read and written synchronously. Fine for one server and a demo, not for concurrent load.
- Uploaded images live on local disk. On free hosting they disappear on redeploy.
- No rate limiting, no CSRF protection, no spam or abuse filtering on report submission.
- The report description is sent to Google Gemini when a key is set. Do not use real personal data.
- Map tiles and Leaflet load from public CDNs, so the pages need internet access.
