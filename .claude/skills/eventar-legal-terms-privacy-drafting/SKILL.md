---
name: eventar-legal-terms-privacy-drafting
description: Use when drafting Eventar T&Cs, privacy policy or consent.
category: documentation
---

# Eventar legal pages: draft from the live schema, bind consent to published text

- Rebuild the data inventory from the schema and code before touching a draft. Sign-in is an emailed magic link (`signInWithOtp` + `/auth/callback`) with no password or MFA path, despite CLAUDE.md hard rule 1's wording. An audit log exists (`audit_events`), and personal data goes well beyond name+email. Inventory: `references/data-inventory.md`.
- Enumerate personal-data tables from the live DB (`information_schema.columns` where the column is `user_id` or `subject_user_id`), not from memory. The first pass missed `additional_appointments`, `professional_profiles`, `society_memberships` and `participation_evidence`.
- Every capability a draft promises (account closing, rights request, erasure scope, check-in window, QR invalidation) must be grep-verified in `app/` and `lib/` before it is written. Anything unbuilt becomes a bracketed placeholder plus a publication blocker. A Terms draft once promised practitioner self-serve account closing that no UI provides.
- Consent is recorded against a version string. `lib/legalVersions.ts` and the `version:` frontmatter in `docs/legal/*` change together, and the consent step in `app/account/complete/CompleteClient.tsx` is reworded in the same change. Earlier acceptances stay on the old version, so a new version means re-acceptance.
- Consent copy must name text a reader can open. Until a solicitor-reviewed page exists, flag the consent to Ivan (381 accounts already hold `tos-0.1-draft` acceptances). Gating or rewording it is his call, not a draft edit.
- Ivan chose rewording over publishing on 2026-11-21. The consent sentence now says the full terms and privacy policy are not published yet and will be shown before launch. The reword left `tos-0.1-draft` and `pp-0.2-draft` unbumped, which conflicts with the version rule above: earlier acceptances were given against the old sentence. Put the bump-or-not call to Ivan before the next consent change. A bump changes `lib/legalVersions.ts`, the `version:` frontmatter and the consent copy together.
- Ledger and audit rows are permanent. Describe erasure as pseudonymisation (`pseudonymise_user` replaces the name with `ERASED-…` and sets `deleted_at`), not row deletion. Read the function body before describing it.
- Real platforms' terms are structural references only. Never copy their sentences.
- Solicitor-only fields (entity name, BR number, address, liability cap, jurisdiction, DPA, PDPO s33 position) stay as bracketed placeholders. Never invent a value for them.
- List sub-processors from `package.json` and the live config, not from memory.
- When revising a draft or its README, grep `docs/legal/` for stale phase and vault references and replace them with Stage numbers from `docs/plans/STAGES.md`. Phase 6/7/8 vocabulary is retired.
