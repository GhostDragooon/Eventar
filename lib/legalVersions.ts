// Canonical consent version identifiers written to public.consent_records.version.
// Coupled to docs/legal/* frontmatter `version:` fields (P5.4) — update BOTH together.
//   terms_of_service  -> docs/legal/terms-and-conditions.md  version "0.1 (draft)"
//   privacy_policy    -> docs/legal/privacy-policy.md         version "0.2 (draft ...)"
// Publishing the reviewed documents MUST bump both strings AND reword the consent step in
// app/account/complete/CompleteClient.tsx, which today says the full terms and privacy policy "are not published yet" (reworded 2026-11-21 so it no longer asks for acceptance of unreadable documents).
export const CONSENT_TYPES = ['terms_of_service', 'privacy_policy'] as const;
export type ConsentType = (typeof CONSENT_TYPES)[number];

export const LEGAL_VERSIONS: Record<ConsentType, string> = {
  terms_of_service: 'tos-0.1-draft',
  privacy_policy: 'pp-0.2-draft',
};
