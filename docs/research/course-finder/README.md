# Course Finder — sourced data (research stage, not integrated)

**Status:** research/design track. No Supabase tables, no app routes, no frontend. Flat files only, until a build decision is made.

Full strategic writeup, source landscape, lifecycle/flow map, registry cross-check, and open questions: vault `20 — Roadmap/Course Finder — Discovery Layer (2026-07-26).md`.

## What's in this folder

| File | Source | Rows | Trust tier |
|---|---|---|---|
| `hkie-sample.csv` | HKIE CPD Calendar (live web page, one filter slice) | 10 | `body_confirmed` — sourced directly from the body's own published calendar |
| `ahp-council-ot-2023-24-sample.csv` | AHP Council, OT Board's "Accredited CPD Programmes" table, 2023/24 academic year | 14 (1 marked `excluded` — cancelled in-source) | `body_confirmed` |

## CSV schema

```
source, programme_code, title, organiser, date_raw, points_or_category_raw, trust_tier, source_url, notes
```

- `date_raw` / `points_or_category_raw` are kept as scraped text, not normalized — every source formats these differently (HKIE: time ranges like "9:30am–6:30pm"; AHP Council: "12 CPD credit points"). Normalization is a real design decision (units, date parsing, multi-day handling) not made yet.
- `trust_tier` values used so far: `body_confirmed` (came straight from the body's own official list) and `excluded` (in-source but not a real listing, e.g. cancelled). The full tier model (including `unverified` / `organiser_attested` for sources that aren't the body's own list) is in the vault note.

## Known gaps in this sample (not yet solved)

- HKIE pagination is AJAX-driven (`ucfrontajaxaction=getfiltersdata`) — only page 1 (~10 rows) pulled so far. ~4 more pages exist.
- HKIE's per-row category (GPM/H&S/OTM) wasn't captured in this pass — the filter exists but wasn't cross-referenced per listing.
- AHP Council's **PT** table (same CMS, not yet fetched) and later academic-year OT tables (2024/25, 2025/26) are untouched.
- Medical (the actual GTM beachhead) has no equivalent source identified yet — see the vault note's "honest gap" section.
- Two entries in the OT sample have Chinese-language titles in the original source, summarised/translated here rather than transcribed verbatim — flagged per-row in `notes`.

## Grounded against the real registry

Cross-checked against `supabase/migrations/20260709240000_seed_accrediting_bodies.sql` before any of this was written:
- `PT_BOARD` is already seeded and matches the PT manual exactly.
- `OT_BOARD` is **not** seeded — these rows describe a body Eventar's registry doesn't know about yet.
- `HKAM` is seeded only as an inert parent shell — none of its 15 Colleges (the actual medical accrediting bodies) exist as rows.

Neither gap was fixed here — flagged only, per "keep apart from infrastructure."
