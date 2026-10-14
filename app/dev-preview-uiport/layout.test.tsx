import { afterEach, describe, expect, it, vi } from 'vitest';
import DevPreviewLayout from './layout';

describe('dev-preview-uiport layout gate', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('is not found in production builds', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => DevPreviewLayout({ children: 'sandbox' })).toThrow(
      expect.objectContaining({ digest: 'NEXT_HTTP_ERROR_FALLBACK;404' }),
    );
  });

  it('renders the sandbox in development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(DevPreviewLayout({ children: 'sandbox' })).toBe('sandbox');
  });
});
