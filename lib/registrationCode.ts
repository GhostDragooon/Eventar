import { randomInt } from 'node:crypto';

// 31-char alphabet: digits 2-9 + uppercase letters minus 0 O 1 I L.
// Picked for visual unambiguity on hand-written / printed backup codes
// AND so the SQL backfill in 20260523010000_init_checkin_columns.sql can
// mirror the alphabet via its plpgsql array literal.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

// 31^6 = 887M codes — resists brute-force search at any realistic request
// rate (paired with rate-limiting per the Phase-8 deploy gates). Earlier
// generations used 4 chars (31^4 = 923K), which combined with Math.random
// PRNG predictability made codes effectively guessable. See PROJECT_STATE.md.
const CODE_LENGTH = 6;

// Historic `WK-` (workshop) prefix removed from NEWLY generated codes 2026-08-27
// — DEFERRED 51 (Task 10.7 prerequisite). Every export sent to a College
// carried a workshop branding on the registration code; leaks the tool's
// pre-pivot origin. Existing rows keep their prefix by design (no migration),
// so the validator still accepts the prefixed form for the lifetime of those
// rows. The optional `WK-` in the regex is the compatibility bracket, not a
// new-code shape. Drops on its own when the last legacy row's event ends.
const CODE_RE = /^(?:WK-)?(?:[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}|[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6})$/;

/**
 * Generate a fresh registration code. Uses `crypto.randomInt` (CSPRNG)
 * rather than `Math.random` — codes are bearer tokens (anyone who guesses
 * one can call selfCheckIn / submitSurvey as that registrant), so
 * predictability = full impersonation. CSPRNG closes the prediction
 * attack vector.
 */
export function generateRegistrationCode(): string {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += ALPHABET[randomInt(0, ALPHABET.length)];
  }
  return out;
}

export function isValidRegistrationCode(code: string): boolean {
  return CODE_RE.test(code);
}
