import QRCode from 'qrcode';
import { slugifyTitle } from '@/lib/slugify';

/**
 * Build a 512x512 PNG QR code for an event's public URL.
 *
 * Pure-ish glue: takes an event {id, title} and the request origin, returns
 * base64 bytes + a filename. No auth, no DB — auth lives in the caller.
 *
 * Used by:
 *   - app/events/[id]/edit/actions.ts::getEventQrPng (staff, downloadable)
 *   - app/(public)/events/[id]/page.tsx              (public, inline render)
 *   - app/(public)/events/[id]/poster/page.tsx       (public, inline render)
 */
export async function buildEventQrPng(
  event: { id: string; title: string },
  origin: string,
): Promise<{ pngBase64: string; filename: string }> {
  const publicUrl = `${origin}/events/${event.id}`;

  // qrcode defaults: errorCorrectionLevel 'M' = ~15% tolerance (good for
  // print under bad lighting). margin 2 (default is 4) maximises QR area.
  const buf = await QRCode.toBuffer(publicUrl, {
    errorCorrectionLevel: 'M',
    width: 512,
    margin: 2,
  });

  const slug = slugifyTitle(event.title);
  return {
    pngBase64: buf.toString('base64'),
    filename: `event-${slug || event.id}.png`,
  };
}
