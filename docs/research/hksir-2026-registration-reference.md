# HKSIR Annual Scientific Meeting 2026 — registration form reference

**Date:** 2026-08-16
**Source:** mobile screenshots of a public Google Form ("HKSIR Annual Scientific Meeting 2026: Interventional Oncology — Pushing the Boundaries", `docs.google.com/forms/...`), organised by the Hong Kong Society of Interventional Radiology (HKSIR). Third-party content, captured structurally for question-type and field-pattern reference — not to reproduce HKSIR's own branding or promotional copy.
**Status:** Reference document only. Input material for Eventar's organiser question library, not a build spec.

---

## Event metadata shown on the form (context, not a question)

- Venue: The Ballroom, 7/F, Cordis Hotel, Mong Kok
- Date: 15 November 2026 (Sunday), 07:45–17:00
- CME/CPD accreditation: Hong Kong College of Radiologists — pending at time of capture
- Light breakfast and buffet lunch included
- Complimentary for HKSIR, HKCR, HKCRRT, HKRA and APSCVIR members
- Physical face-to-face meeting, limited spots, early registration encouraged
- A separate call-for-submissions block (case competition, different form, different deadline) is interleaved into the registration form as an informational aside rather than split into its own page

## Full field list, in form order

1. **Email** — short text, required (pre-filled from the respondent's signed-in Google account)
2. *(informational block: venue/date/time/accreditation/meal — not a question)*
3. *(informational block: "Program Highlights" — topic list + distinguished faculty photos/names/affiliations — not a question)*
4. *(informational block: complimentary-membership eligibility + early-registration nudge + case-competition cross-promotion — not a question)*
5. **Would you join us for lunch?** — radio, required. Options: Yes / No
6. **Your Salutation** — radio, required. Options: Dr. / Prof. / Mr. / Ms. / **Other:** (free-text escape hatch)
7. **Your Last Name** — short text, required
8. **Your First Name** — short text, required
9. **Your current position** — radio, required. Options: Fellow/CSR / Higher Trainee / Basic Trainee / Radiographer / Nurse / **Other:** (free-text escape hatch)
10. **Your current workplace** — radio, required. Options: 11 named Hong Kong public hospitals (Hong Kong Children's, Kwong Wah, North District, Pamela Youde Nethersole Eastern, Prince of Wales, Princess Margaret, Queen Elizabeth, Queen Mary, Tseung Kwan O, Tuen Mun, United Christian) / **Other:** (free-text escape hatch)
11. **Please indicate your society membership(s)** — checkbox (multi-select), required. Options: HKSIR / HKCR / HKCRRT / HKRA / APSCVIR / **None** — with a nudge sub-label under the "None" option encouraging HKSIR or APSCVIR membership before registering
12. **Your contact number** — short text, required
13. **Your MCHK number (if CME/CPD points needed)** — short text, **optional** — the only optional question on the form, and the only one with a conditional-relevance hint in its label rather than a separate branching question

Footer: standard Google Forms boilerplate (response-copy notice, Submit / Clear form, reCAPTCHA, "does this form look suspicious?" report link) — infrastructure, not organiser-authored content.

## Question-type patterns worth reusing in Eventar's organiser question library

- **Radio + free-text escape hatch.** Three of the six substantive questions (salutation, position, workplace) use a fixed option list with a trailing "Other: ____" option rather than either a rigid enum or a free-for-all text field. This is the dominant pattern on the form, not an edge case — the organiser question library should treat "closed list + escape hatch" as a first-class field type, not something bolted onto a plain select.
- **Multi-select with a non-neutral "none" option.** The society-membership checkbox's "None" isn't a bare null option — it carries a persuasive sub-label (encouraging membership). Worth supporting label/helper text *per option*, not just per question, if Eventar's form builder is to reproduce this.
- **Informational interstitials between questions, not just a leading intro block.** The form threads three separate non-question content blocks (event logistics, program highlights, eligibility/promo) between the email field and the first real question, and again between questions. A flat "all questions, then all info" model wouldn't capture this — organisers clearly want to intersperse read-only content mid-flow.
- **A genuinely optional field with a conditional-relevance hint in the label itself** (MCHK number — "if CME/CPD points needed") rather than a show/hide conditional-logic branch. Cheaper to build, and worth having as a supported pattern alongside true conditional branching rather than assuming every "sometimes relevant" field needs branching logic.
- **Domain-specific fields a HK medical CPD organiser actually asks for:** professional position (trainee grade / role, not job title in the abstract), current workplace (specifically HK public hospitals, HA-affiliated), society membership(s) (multi-body, since accreditation/complimentary-access eligibility depends on it), and a regulator licence number (MCHK) tied explicitly to CPD-point issuance. These map directly onto Eventar's own body/licence/points model (see `CONTEXT.md` glossary and `docs/adr/0001-model-the-regulators-taxonomy-not-a-simplification.md`) rather than being generic contact-form fields.

## Explicit non-goals of this note

This is not a request to clone HKSIR's form, copy its branding, or reproduce its promotional copy. It's captured because the *question types and field patterns* are a useful, real-world data point for shaping Eventar's own organiser-side registration form builder (S-Organiser), whenever that work is scoped.
