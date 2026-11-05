# Legal drafts

> **None of these documents are ready to publish.** They are working drafts intended to be reviewed by a qualified Hong Kong solicitor before they go on a public URL.

## What's in here

| File | Draft revision | Consent string (unchanged) | Notes |
|---|---|---|---|
| [`privacy-policy.md`](./privacy-policy.md) | **0.3** (2026-11-05, CPD rewrite) | `pp-0.2-draft` | PPS + short collection notice, structured on the PCPD PICS/PPS guidance (2013). Data inventory rebuilt from the live schema. |
| [`terms-and-conditions.md`](./terms-and-conditions.md) | **0.2** (2026-11-05, CPD rewrite) | `tos-0.1-draft` | Practitioner/Organiser/Attendee split, permanent Credit Records, accrediting body decides credit. |
| [`legal-notice.md`](./legal-notice.md) | 0.1 | — | Pre-pivot; not revised. Overlaps the Terms (disclaimer, liability, IP); consider folding it in. |

Real platforms used as **structural references only** (no sentence copied): Eventbrite legal hub (document split), Luma terms and privacy, Accredible privacy (audience split), Hong Kong Academy of Medicine privacy (language precedence, CME transferees), PCPD guidance notes. Sources and dates are in each file's frontmatter.

**Consent strings were deliberately not bumped.** `lib/accountCompleteness.ts` requires the exact string in `lib/legalVersions.ts`, so a bump re-prompts every account (381 locally). Bump both, and reword `app/account/complete/CompleteClient.tsx`, only when the reviewed pages are published.

## Current framing

The CPD platform (pivot 2026-07-03, Q48 direction 2026-11-05). Eventar is the data user for Practitioner accounts, licences and Credit Records; Organisers are the data users for their event registration lists, with Eventar as processor. The Accrediting Body's role (separate data user or not) is a solicitor question.

## What still blocks publication

### Requires a Hong Kong solicitor
- Legal entity name, BR number, registered address (all three docs)
- Effective date (all three)
- A separate **Data Processing Agreement** (referenced by Terms §1.3 and §5.3; not drafted here)
- PDPO §33 cross-border position confirmation (Privacy §7)
- Data roles, especially whether the Accrediting Body is a separate data user (Privacy §2)
- Whether existing tos-0.1-draft / pp-0.2-draft acceptances stand or need re-consent
- Fee terms (Terms §5.4) — currently a placeholder
- Liability cap (Terms §12.2), indemnity scope (§13), disputes forum (§15)

### Requires implementation work first
- **Erasure overclaims until fixed:** `pseudonymise_user` replaces only `users.full_name`; it leaves first/last/preferred name, phone, avatar, sign-in email, registration name/email and licence numbers. Extend the function, or narrow Privacy §10 (marked PUBLICATION BLOCKER).
- **Audit payloads hold plaintext email** (`registration_claimed`, `registration_contact_updated`) that cannot be updated: hash them as `email_change` does, or narrow Privacy §10.
- **Avatars are in a public bucket** (`avatars`, `public = true`); Privacy §6 now says so. Make the bucket private or keep that sentence.
- **No purge job** enforces any retention period in Privacy §8 (incl. IP-keyed `rate_limits`).
- `participation_evidence` keeps service_role DELETE; Privacy §8 gives it a period, not "permanent". Revoke DELETE if it should be permanent.
- Organiser venue search sends text + IP to OpenStreetMap Nominatim from the browser (Privacy §6); proxy it server-side if that transfer is unwanted.
- No self-serve account closing or rights-request form exists; Terms §10.2 and Privacy §10 route both to an email address.
- The pre-credit accreditation review (Terms §5.2) is not built (Q48 breaker 2).
- Speaker-discovery listing: confirm who can see it before publication (Privacy §3).

### Requires confirmation before publication
- Database region (Seoul today, Singapore planned) and hosting provider/region (Stage 8) — Privacy §7
- PCPD contact details — verified against pcpd.org.hk on 2026-05-22; re-verify at publication time
- Retention defaults in Privacy §8 — currently working defaults; the data owner should sign these off

## Cross-references in code

These docs are not yet served by the app. When they are published (`/legal/terms`, `/legal/privacy`, `/legal/notice` or similar), update the app footer + the email templates to link to them.
