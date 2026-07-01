import QRCode from 'qrcode';

/**
 * Build the personal check-in URL an attendee's QR resolves to. Distinct from
 * the event's public URL (lib/qr.ts): this carries the registration_code so
 * scanning it lands the attendee on /checkin/confirm?code=… (their pass).
 *
 * `new URL()` normalises trailing slashes on `origin` and throws on garbage.
 */
export function buildCheckinUrl(code: string, origin: string): string {
  return new URL(
    `/checkin/confirm?code=${encodeURIComponent(code)}`,
    origin,
  ).toString();
}

/**
 * Build a 512x512 PNG QR encoding the attendee's personal check-in URL, for
 * inline (cid:) delivery in the Email #2 reminder. Returns base64 bytes + a
 * code-derived filename. Pure glue: no auth, no DB — the caller (a staff
 * Server Action) owns those.
 */
export async function buildCheckinQrPng(
  code: string,
  origin: string,
): Promise<{ pngBase64: string; filename: string }> {
  const url = buildCheckinUrl(code, origin);

  // Mirror lib/qr.ts settings: errorCorrectionLevel 'M' (~15% tolerance for
  // phone-camera scans under poor lighting), margin 2 maximises QR area.
  const buf = await QRCode.toBuffer(url, {
    errorCorrectionLevel: 'M',
    width: 512,
    margin: 2,
  });

  return {
    pngBase64: buf.toString('base64'),
    filename: `checkin-${code}.png`,
  };
}
