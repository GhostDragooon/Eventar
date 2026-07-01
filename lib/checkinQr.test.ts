import { describe, expect, it } from 'vitest';
import { buildCheckinUrl, buildCheckinQrPng } from './checkinQr';

describe('buildCheckinUrl', () => {
  it('builds the personal check-in confirm URL for a registration code', () => {
    expect(buildCheckinUrl('WK-9X7P', 'https://eventar.example.com')).toBe(
      'https://eventar.example.com/checkin/confirm?code=WK-9X7P',
    );
  });

  it('normalises a trailing slash on the origin', () => {
    expect(buildCheckinUrl('WK-9X7P', 'https://eventar.example.com/')).toBe(
      'https://eventar.example.com/checkin/confirm?code=WK-9X7P',
    );
  });

  it('URL-encodes the code', () => {
    expect(buildCheckinUrl('A B', 'https://x.test')).toBe(
      'https://x.test/checkin/confirm?code=A%20B',
    );
  });
});

describe('buildCheckinQrPng', () => {
  it('returns base64 PNG bytes and a code-derived filename', async () => {
    const { pngBase64, filename } = await buildCheckinQrPng('WK-9X7P', 'https://x.test');
    expect(filename).toBe('checkin-WK-9X7P.png');
    // PNG magic number is 0x89 0x50 0x4E 0x47 → base64 prefix "iVBORw0KG"
    expect(pngBase64.startsWith('iVBORw0KG')).toBe(true);
  });
});
