/**
 * Map a camera/media-device error from html5-qrcode (which surfaces native
 * DOMExceptions) into user-facing copy with concrete next-step guidance.
 *
 * The exception names below are the standard ones from the Permissions /
 * Media Capture and Streams specs:
 *   - NotAllowedError      → user denied (or policy denies) camera access
 *   - NotFoundError        → no camera device on this system
 *   - NotReadableError     → camera in use by another app
 *   - OverconstrainedError → no camera matches the requested constraints
 *   - SecurityError        → page not served over a trusted origin (e.g. http)
 *
 * Anything else falls back to the raw message — keeps us honest about
 * unknown errors instead of swallowing them with "something went wrong."
 */
export function humanizeCameraError(e: unknown): string {
  const suffix = ' You can use the "Enter code" button instead.';

  if (!(e instanceof Error)) {
    return `Camera unavailable.${suffix}`;
  }

  // DOMException sets .name; standard Error doesn't. html5-qrcode rethrows
  // the DOMException so .name is the canonical discriminator.
  switch (e.name) {
    case 'NotAllowedError':
      return `Camera permission was denied. Enable it in your browser settings, then reload.${suffix}`;
    case 'NotFoundError':
    case 'OverconstrainedError':
      return `No camera was found on this device.${suffix}`;
    case 'NotReadableError':
      return `The camera is in use by another app. Close other camera apps and try again.${suffix}`;
    case 'SecurityError':
      return `The browser blocked camera access — this usually means the page isn't served over HTTPS.${suffix}`;
    default:
      return `Camera unavailable: ${e.message}.${suffix}`;
  }
}
