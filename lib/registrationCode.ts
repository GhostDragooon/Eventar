// 31-char alphabet: digits 2-9 + uppercase letters minus 0 O 1 I L.
// Picked for visual unambiguity on hand-written / printed backup codes
// AND so the SQL backfill in 20260523010000_init_checkin_columns.sql can
// mirror the alphabet via its plpgsql array literal.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_RE  = /^WK-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/;

export function generateRegistrationCode(): string {
  let out = 'WK-';
  for (let i = 0; i < 4; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

export function isValidRegistrationCode(code: string): boolean {
  return CODE_RE.test(code);
}
