import { describe, it, expect } from 'vitest';
import { humanizeCameraError } from './cameraError';

/**
 * Construct a DOMException-shaped Error. jsdom doesn't always expose the
 * DOMException constructor consistently across versions, and our mapper only
 * reads .name + .message, so a duck-typed object is the smallest fixture
 * that exercises the discriminator without coupling to jsdom internals.
 */
function exceptionWith(name: string, message = 'msg'): Error {
  const e = new Error(message);
  e.name = name;
  return e;
}

describe('humanizeCameraError', () => {
  it('explains permission denial with a fix path', () => {
    const out = humanizeCameraError(exceptionWith('NotAllowedError', 'Permission denied'));
    expect(out).toMatch(/permission was denied/i);
    expect(out).toMatch(/browser settings/i);
    expect(out).toMatch(/Enter code/);
  });

  it('explains missing camera', () => {
    expect(humanizeCameraError(exceptionWith('NotFoundError'))).toMatch(/No camera was found/i);
  });

  it('treats OverconstrainedError the same as NotFoundError', () => {
    expect(humanizeCameraError(exceptionWith('OverconstrainedError'))).toMatch(/No camera was found/i);
  });

  it('explains camera-busy', () => {
    expect(humanizeCameraError(exceptionWith('NotReadableError'))).toMatch(/in use by another app/i);
  });

  it('explains insecure-origin SecurityError', () => {
    const out = humanizeCameraError(exceptionWith('SecurityError'));
    expect(out).toMatch(/HTTPS/);
  });

  it('falls back to raw message for unknown DOMException names', () => {
    const out = humanizeCameraError(exceptionWith('SomethingNovel', 'odd detail'));
    expect(out).toMatch(/odd detail/);
  });

  it('handles non-Error inputs without throwing', () => {
    expect(humanizeCameraError('weird string')).toMatch(/Camera unavailable/);
    expect(humanizeCameraError(null)).toMatch(/Camera unavailable/);
    expect(humanizeCameraError(undefined)).toMatch(/Camera unavailable/);
  });

  it('always offers the "Enter code" fallback path', () => {
    const samples = [
      humanizeCameraError(exceptionWith('NotAllowedError')),
      humanizeCameraError(exceptionWith('NotFoundError')),
      humanizeCameraError(exceptionWith('NotReadableError')),
      humanizeCameraError(exceptionWith('SecurityError')),
      humanizeCameraError(exceptionWith('Unknown')),
      humanizeCameraError('not even an error'),
    ];
    for (const s of samples) expect(s).toMatch(/Enter code/);
  });
});
