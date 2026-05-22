# Legal drafts

> **None of these documents are ready to publish.** They are working drafts intended to be reviewed by a qualified Hong Kong solicitor before they go on a public URL.

## What's in here

| File | Version | Notes |
|---|---|---|
| [`privacy-policy.md`](./privacy-policy.md) | **v0.2** (non-solicitor cleanup 2026-05-22) | Scoped to PDPO (Cap. 486). Substantive cleanup done — see frontmatter `v0.2_changes` for the changelog. |
| [`terms-and-conditions.md`](./terms-and-conditions.md) | v0.1 | Multi-tenant SaaS framing, ~9 entity/cap/jurisdiction placeholders unfilled. |
| [`legal-notice.md`](./legal-notice.md) | v0.1 | Operator identity, contact, IP statement. ~5 entity placeholders unfilled. |

## Current framing

All three drafts assume the **multi-tenant SaaS model** described in the vault's `30 — Reference/Commercialisation Proposal.md`: Eventar is a software platform, third-party **Organisers** are the data controllers, and **Attendees** register for events the Organisers run.

This may or may not be where the product actually goes. Per the project decision on 2026-05-22, the MVP-vs-commercialisation fork is **deferred until after Phase 6**. If the project ends up purely internal (no third-party Organisers), large parts of the T&Cs become inappropriate and should be rewritten before publication.

## What still blocks publication

### Requires a Hong Kong solicitor
- Legal entity name, BR number, registered address (all three docs)
- Effective date (all three)
- Liability cap amount and 12-month-fees fallback (T&C §11.2(c))
- Jurisdiction / arbitration choice (T&C §15)
- A separate **Data Processing Agreement** (referenced by T&C §5.3 but not drafted here)
- PDPO §33 cross-border position confirmation
- Fee terms (T&C §5.6) — currently a placeholder

### Requires implementation work first
- The Privacy Policy intentionally does **not** claim audit logging (the codebase doesn't ship it yet). If the product later adds an audit log, update Privacy §10.

### Requires confirmation before publication
- Supabase project region (check Supabase Dashboard → Settings → General) — Privacy §8
- Vercel deployment region (once Phase 8 lands) — Privacy §8
- PCPD contact details — verified against pcpd.org.hk on 2026-05-22; re-verify at publication time
- Retention defaults in Privacy §9 — currently working defaults set in v0.2; the data owner should sign these off

## Cross-references in code

These docs are not yet served by the app. When they are published (`/legal/terms`, `/legal/privacy`, `/legal/notice` or similar), update the app footer + the Phase 7 email templates to link to them.
