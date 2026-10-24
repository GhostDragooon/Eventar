/** @vitest-environment jsdom */
import { vi } from 'vitest';

// An already-signed-in visitor who reaches either attendee door is sent on with
// a client router.replace(next ?? '/account/record'). nextRedirect.test.tsx
// (app/account) proves the off-site values; this proves the other audience's
// pages are refused too (spec 001 FR-005: nothing from the other audience).
const { replace, getSession, getUser, signOut, nextParam } = vi.hoisted(() => ({
  replace: vi.fn(),
  getSession: vi.fn(),
  getUser: vi.fn(),
  signOut: vi.fn(),
  nextParam: { value: '' },
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams({ next: nextParam.value }),
  useRouter: () => ({ replace, push: vi.fn() }),
}));
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => ({ auth: { getSession, getUser, signOut } }) }));
vi.mock('./actions', () => ({ sendAttendeeMagicLink: vi.fn() }));

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import SignInPage from './page';
import SignUpPage from '../sign-up/page';

beforeEach(() => {
  replace.mockReset();
  getSession.mockResolvedValue({ data: { session: { user: { email: 'practitioner@example.com' } } }, error: null });
  getUser.mockResolvedValue({ data: { user: { email: 'practitioner@example.com' } }, error: null });
});
afterEach(cleanup);

describe.each([
  ['/account/sign-in', SignInPage],
  ['/account/sign-up', SignUpPage],
])('%s, visitor already signed in', (_path, Page) => {
  it.each(['/dashboard', '/dashboard?tab=programme', '/login', '/settings', '/account/../dashboard'])(
    'the other audience\'s destination (%j) goes to the record',
    async (next) => {
      nextParam.value = next;
      render(<Page />);
      await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
      expect(replace).toHaveBeenCalledWith('/account/record');
    },
  );

  it('an attendee destination is still honoured', async () => {
    nextParam.value = '/account/claim';
    render(<Page />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/account/claim'));
  });
});
