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

// Accepts BOTH the legacy 4-char format (rows backfilled by the Phase-4
// init_checkin_columns migration + any registrations created before the
// CSPRNG/length swap) AND the new 6-char format. Once all 4-char
// registrations belong to ended events the {4}| branch can be dropped.
const CODE_RE = /^WK-(?:[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}|[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6})$/;

/**
 * Generate a fresh registration code. Uses `crypto.randomInt` (CSPRNG)
 * rather than `Math.random` — codes are bearer tokens (anyone who guesses
 * one can call selfCheckIn / submitSurvey as that registrant), so
 * predictability = full impersonation. CSPRNG closes the prediction
 * attack vector.
 */
export function generateRegistrationCode(): string {
  let out = 'WK-';
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += ALPHABET[randomInt(0, ALPHABET.length)];
  }
  return out;
}

export function isValidRegistrationCode(code: string): boolean {
  return CODE_RE.test(code);
}
