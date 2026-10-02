/** @vitest-environment jsdom */
import { vi } from 'vitest';

// Both attendee doors short-circuit an ALREADY signed-in visitor with a client
// router.replace(next ?? '/account/record'). That is a direct open-redirect
// sink: Next's router resolves the string against the page URL and does a hard
// navigation when the origin differs, so a `next` of /\evil.example.com sent a
// signed-in visitor off-site with no click. The unit test for the guard
// (lib/authDoor.test.ts) proves the rule; this proves the pages use it.
const { replace, getSession, nextParam } = vi.hoisted(() => ({
  replace: vi.fn(),
  getSession: vi.fn(),
  nextParam: { value: '' },
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('next=' + encodeURIComponent(nextParam.value)),
  useRouter: () => ({ replace, push: vi.fn() }),
}));
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => ({ auth: { getSession } }) }));
// Both pages import the same server action module.
vi.mock('./sign-in/actions', () => ({ sendAttendeeMagicLink: vi.fn() }));

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import SignInPage from './sign-in/page';
import SignUpPage from './sign-up/page';

const EVENT = '37e37c81-b10a-4077-8f7d-5b5d247b1adc';
const HOSTILE = ['/\\evil.example.com', '/\t/evil.example.com', '/\\/evil.example.com', '//evil.example.com'];

beforeEach(() => {
  replace.mockReset();
  getSession.mockResolvedValue({ data: { session: { user: { email: 'practitioner@example.com' } } }, error: null });
});
afterEach(cleanup);

describe.each([
  ['/account/sign-in', SignInPage],
  ['/account/sign-up', SignUpPage],
])('%s, visitor already signed in', (_path, Page) => {
  it.each(HOSTILE)('a hostile next (%j) goes to the record, never off-site', async (hostile) => {
    nextParam.value = hostile;
    render(<Page />);
    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
    expect(replace).toHaveBeenCalledWith('/account/record');
  });

  it('a safe next is still honoured (the walk-in round trip back to the event page)', async () => {
    nextParam.value = `/events/${EVENT}`;
    render(<Page />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith(`/events/${EVENT}`));
  });
});
