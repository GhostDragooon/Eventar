// Zod schemas + types for the authenticated-user account/profile Server Actions.
// Kept out of actions.ts because Next 16's 'use server' files may export ONLY
// async functions.
//
// Plan authority: docs/plans/2026-08-29-account-professional-profile-plan.md
// §4.1 (users columns), §4.2 (professional_profiles), §7.1/§7.2 (edit surface).

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Account fields (public.users)
// ---------------------------------------------------------------------------

// Length caps mirror the pattern used elsewhere in the repo for user-supplied
// text — generous enough for real names + workplaces, short enough to keep
// logs and rendered surfaces bounded. Explicit .nullable() on every field so a
// caller can clear a value it previously set.

export const accountUpdateSchema = z
  .object({
    first_name: z.string().max(120).nullable().optional(),
    last_name: z.string().max(120).nullable().optional(),
    salutation: z.string().max(40).nullable().optional(),
    preferred_name: z.string().max(120).nullable().optional(),
    phone: z.string().max(40).nullable().optional(),
    phone_country_code: z.string().max(8).nullable().optional(),
    country_code: z
      .string()
      .regex(/^[A-Z]{2}$/, 'country_code must be ISO 3166-1 alpha-2 (uppercase)')
      .nullable()
      .optional(),
    display_language: z
      .enum(['en', 'zh-Hant', 'zh-Hans'])
      .optional(),
  })
  // Plan §1.8: full_name stays canonical and NOT NULL. We refresh it in the
  // action when both first + last are present in the incoming payload; caller
  // never sets it directly.
  .strict();

export type AccountUpdateInput = z.infer<typeof accountUpdateSchema>;

// ---------------------------------------------------------------------------
// Professional profile fields (public.professional_profiles)
// ---------------------------------------------------------------------------

const longText = z.string().max(4000);

// Trim then reject whitespace-only. Zod's .trim() runs before validation,
// so .min(1) after it is the "non-whitespace" gate the F3 evaluator needs.
// Nulls stay legal (a caller can clear a previously-set field); the
// non-nullable path only fires on genuine non-empty strings. Mirrors the
// CHECK constraints in 20260829150000. D4 dev-lens re-review IMPORTANT 2.
const nonBlankString = (max: number) =>
  z.string().trim().min(1, 'must not be blank').max(max);

export const professionalProfileUpdateSchema = z
  .object({
    workplace_text: nonBlankString(500).nullable().optional(),
    workplace_organisation_id: z.string().uuid().nullable().optional(),
    position_code: nonBlankString(120).nullable().optional(),
    position_other: nonBlankString(500).nullable().optional(),
    profession_code: nonBlankString(120).nullable().optional(),
    specialty_code: nonBlankString(120).nullable().optional(),
    specialty_other: nonBlankString(500).nullable().optional(),
    department_text: nonBlankString(500).nullable().optional(),
    biography: longText.nullable().optional(),
    expertise_codes: z.array(z.string().trim().min(1).max(120)).max(64).nullable().optional(),
    presentation_languages: z.array(z.string().trim().min(1).max(16)).max(16).nullable().optional(),
    // Plan §7.2: opt-in is storage only in this slice; no discovery product.
    // Timestamp is maintained by the DB trigger, not by the client.
    speaker_discovery_opt_in: z.boolean().optional(),
  })
  .strict();

export type ProfessionalProfileUpdateInput = z.infer<typeof professionalProfileUpdateSchema>;

// ---------------------------------------------------------------------------
// Read shape (returned by getMyAccountAndProfile)
// ---------------------------------------------------------------------------

export type AccountView = {
  id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  salutation: string | null;
  preferred_name: string | null;
  phone: string | null;
  phone_country_code: string | null;
  country_code: string | null;
  display_language: string;
  locale: string;
  timezone: string;
};

export type ProfessionalProfileView = {
  workplace_text: string | null;
  workplace_organisation_id: string | null;
  position_code: string | null;
  position_other: string | null;
  profession_code: string | null;
  specialty_code: string | null;
  specialty_other: string | null;
  department_text: string | null;
  biography: string | null;
  expertise_codes: string[] | null;
  presentation_languages: string[] | null;
  speaker_discovery_opt_in: boolean;
  speaker_discovery_opt_in_at: string | null;
};

export type AccountAndProfile = {
  account: AccountView;
  profile: ProfessionalProfileView | null;
};

// ---------------------------------------------------------------------------
// Standard action result shape (matches lib/withSecurity's ActionResult)
// ---------------------------------------------------------------------------

export type AccountActionError =
  | 'not_authorized'
  | 'email_unverified'
  | 'rate_limited'
  | 'invalid_input'
  | 'not_found'
  | 'db_error';

export type AccountActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: AccountActionError; issues?: z.ZodIssue[]; retryAfterMs?: number };
