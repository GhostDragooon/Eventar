/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, configure, fireEvent, render, screen } from '@testing-library/react';

const { usePathname } = vi.hoisted(() => ({ usePathname: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname }));

import GlobalError from './error';

configure({ asyncUtilTimeout: 3000 });

afterEach(cleanup);

const EVENT = '11111111-2222-4333-8444-555555555555';

function mount(path: string, digest?: string) {
  usePathname.mockReturnValue(path);
  const unstable_retry = vi.fn();
  const error = Object.assign(new Error('boom'), digest ? { digest } : {});
  const view = render(<GlobalError error={error} unstable_retry={unstable_retry} />);
  return { unstable_retry, ...view };
}

beforeEach(() => {
  usePathname.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

// Core-UX finding D (2026-10-01): an organiser whose page threw landed on the
// attendee crash page, told to "tell the organiser", with Home pointing at the
// marketing site. Behind the organiser gate the boundary speaks to them directly.
describe('app error boundary, organiser workspace paths', () => {
  it.each(['/dashboard', '/events/new', `/events/${EVENT}/edit`, `/events/${EVENT}/checkin`, '/settings', '/participants', '/analytics', '/checkin'])('%s: the way out is Programme, which lists drafts, never the marketing site', (path) => {
    mount(path);
    expect(screen.getByRole('link', { name: 'Back to Programme' })).toHaveAttribute('href', '/dashboard');
    expect(screen.queryByRole('link', { name: 'Home' })).toBeNull();
  });

  it('does not tell an organiser to tell the organiser, and warns about a half-finished save', () => {
    const { container } = mount(`/events/${EVENT}/edit`, 'd1g3st');
    expect(container.textContent).not.toMatch(/tell the organiser/i);
    expect(container.textContent).toMatch(/if you were saving or publishing, check your events before you repeat it/i);
    // The exit is Programme: since CX-04 it lists drafts, so a half-saved draft can be found
    // there (DashboardWorkstation.test.tsx pins that). The body names no page.
    expect(screen.getByRole('link', { name: 'Back to Programme' })).toHaveAttribute('href', '/dashboard');
  });

  it('gives the reference as something to quote when asking for help, and nothing odd when there is none', () => {
    const withDigest = mount('/dashboard', 'd1g3st');
    expect(withDigest.container.textContent).toMatch(/Reference d1g3st: quote it if you ask for help/);
    withDigest.unmount();
    const without = mount('/dashboard');
    expect(without.container.textContent).not.toMatch(/reference|undefined/i);
  });

  it('is a main landmark', () => {
    mount('/dashboard');
    expect(screen.getByRole('main')).toBeInTheDocument();
  });
});

// /login and /invite/<token> are organiser-DOOR paths. A signed-out organiser or a
// not-yet-staff invitee has no Programme to go back to, and /dashboard would only
// bounce them to /login and lose the invite token.
describe('app error boundary, organiser door paths', () => {
  it.each(['/login', '/login?next=/dashboard', '/invite/abc123'])('%s keeps the public wording and the Home link', (path) => {
    const { container } = mount(path, 'd1g3st');
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('link', { name: 'Back to Programme' })).toBeNull();
    expect(container.textContent).not.toMatch(/check your events/i);
  });
});

describe('app error boundary, public paths', () => {
  it.each(['/', `/events/${EVENT}`, '/account/record', '/pricing'])('%s: Home and the attendee wording', (path) => {
    const { container } = mount(path, 'd1g3st');
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('link', { name: 'Back to Programme' })).toBeNull();
    expect(container.textContent).toContain('Your data is safe. Try again. If it keeps happening, tell the organiser and quote error d1g3st.');
  });

  it('a null pathname falls back to the public wording', () => {
    usePathname.mockReturnValue(null);
    render(<GlobalError error={Object.assign(new Error('boom'), {})} unstable_retry={vi.fn()} />);
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
  });

  // D14: no em-dashes in new or changed copy. The public line used to carry one and
  // was re-wrapped with this change, so it counts as changed.
  it.each(['/dashboard', '/', '/login'])('%s: uses no em-dash in its copy', (path) => {
    const { container } = mount(path, 'd1g3st');
    expect(container.textContent).not.toContain('—');
  });
});

describe('app error boundary, recovery', () => {
  // reset() re-rendered the cached server payload, so a failed server render came
  // straight back and the button looked dead; unstable_retry refreshes first.
  it.each(['/dashboard', '/'])('Try again on %s calls unstable_retry', (path) => {
    const { unstable_retry } = mount(path);
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(unstable_retry).toHaveBeenCalledTimes(1);
  });

  // A retry that fails again re-renders the same page, so without a word the button
  // looks dead (user-lens 2026-10-02 and again on the live boundary 2026-10-09). The
  // REAL boundary unmounts the fallback and mounts a fresh one when the retry throws
  // again, so these tests remount instead of rerendering: component state cannot carry
  // this. Distinct digests per test keep the module-level memory from leaking between
  // tests.
  describe('after a failed retry', () => {
    function failTwice(path: string, digest: string, second?: { path?: string; digest?: string }) {
      usePathname.mockReturnValue(path);
      const first = render(<GlobalError error={Object.assign(new Error('boom'), { digest })} unstable_retry={vi.fn()} />);
      expect(screen.queryByRole('alert')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: /try again/i }));
      first.unmount(); // what the real boundary does when the retried render throws again
      usePathname.mockReturnValue(second?.path ?? path);
      render(<GlobalError error={Object.assign(new Error('boom'), { digest: second?.digest ?? digest })} unstable_retry={vi.fn()} />);
    }

    it('says so, announced and focused, when the same failure comes back', () => {
      failTwice('/dashboard', 'retry-same');
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent(/still not working/i);
      // The fresh fallback would otherwise leave focus on <body>.
      expect(document.activeElement).toBe(alert);
    });

    it('says so on the public wording too', () => {
      failTwice('/', 'retry-public');
      expect(screen.getByRole('alert')).toHaveTextContent(/still not working/i);
    });

    it('stays quiet for a different failure or a different page', () => {
      failTwice('/dashboard', 'retry-a', { digest: 'retry-b' });
      expect(screen.queryByRole('alert')).toBeNull();
      cleanup();
      failTwice('/dashboard', 'retry-c', { path: '/settings' });
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('forgets the retry after a minute, so an unrelated later error does not inherit "still"', () => {
      vi.useFakeTimers();
      try {
        usePathname.mockReturnValue('/dashboard');
        const first = render(<GlobalError error={Object.assign(new Error('boom'), { digest: 'retry-old' })} unstable_retry={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: /try again/i }));
        first.unmount();
        vi.advanceTimersByTime(60_001);
        render(<GlobalError error={Object.assign(new Error('boom'), { digest: 'retry-old' })} unstable_retry={vi.fn()} />);
        expect(screen.queryByRole('alert')).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // tailwind-merge reads `text-label-md` as a colour and, without the `!`, drops
  // the Button's own `text-on-primary`; both must survive, at a 44px target.
  it('keeps the on-primary text colour next to the type-scale class, at 44px', () => {
    mount('/dashboard');
    const classes = screen.getByRole('button', { name: /try again/i }).className;
    expect(classes).toMatch(/(^|\s)text-on-primary!(\s|$)/);
    expect(classes).toMatch(/(^|\s)text-label-md(\s|$)/);
    expect(classes).toMatch(/(^|\s)min-h-11(\s|$)/);
    expect(screen.getByRole('link', { name: 'Back to Programme' }).className).toMatch(/(^|\s)min-h-11(\s|$)/);
  });

  it('leaves a breadcrumb in the console with the digest, never the message, when there is one', () => {
    mount('/dashboard', 'd1g3st');
    expect(console.error).toHaveBeenCalledWith('[app error boundary]', 'd1g3st');
  });
});
