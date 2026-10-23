/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DraftSavedBanner } from './DraftSavedBanner';
import { markDraftSaved, setDraftDirty } from '@/lib/draftDirty';

afterEach(() => { cleanup(); setDraftDirty('e1', true); setDraftDirty('e1', false); vi.restoreAllMocks(); });

// UX-01 pick c1: a status banner above the form, which has to survive the redirect from Save draft and stay
// until the next edit. Driven by results, never by a timer.
describe('DraftSavedBanner', () => {
  it('says nothing on a plain visit', () => {
    render(<DraftSavedBanner eventId="e1" savedOnLoad={false} canPublish />);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('after a redirect from Save draft, confirms the save and names the next step', () => {
    render(<DraftSavedBanner eventId="e1" savedOnLoad canPublish />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Draft saved.');
    expect(status).toHaveTextContent('Review and publish when you are ready.');
  });

  it('for a role that cannot publish, says what to do instead of offering Review and publish', () => {
    render(<DraftSavedBanner eventId="e1" savedOnLoad canPublish={false} />);
    expect(screen.getByRole('status')).toHaveTextContent('Draft saved. Publishing needs an organiser admin.');
    expect(screen.queryByRole('button', { name: 'Review and publish' })).toBeNull();
  });

  it('turns into an unsaved-changes notice as soon as the form changes, and back after the next save', () => {
    render(<DraftSavedBanner eventId="e1" savedOnLoad canPublish />);
    act(() => setDraftDirty('e1', true));
    expect(screen.getByRole('status')).toHaveTextContent('You have changes that are not saved.');
    expect(screen.getByRole('status')).not.toHaveTextContent('Draft saved.');
    act(() => markDraftSaved('e1'));
    expect(screen.getByRole('status')).toHaveTextContent('Draft saved.');
  });

  it('confirms a later Save changes too, with no redirect involved', () => {
    render(<DraftSavedBanner eventId="e1" savedOnLoad={false} canPublish />);
    act(() => markDraftSaved('e1'));
    expect(screen.getByRole('status')).toHaveTextContent('Draft saved.');
  });

  it('Review and publish takes the organiser to the Publish button', () => {
    document.body.insertAdjacentHTML('beforeend', '<div id="publish-card"><button id="go">Publish event</button></div>');
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    render(<DraftSavedBanner eventId="e1" savedOnLoad canPublish />);
    fireEvent.click(screen.getByRole('button', { name: 'Review and publish' }));
    expect(document.activeElement?.id).toBe('go');
    expect(scroll).toHaveBeenCalled();
    document.getElementById('publish-card')?.remove();
  });

  it('drops the saved flag from the address so a reload does not repeat the confirmation', () => {
    const replace = vi.spyOn(window.history, 'replaceState');
    render(<DraftSavedBanner eventId="e1" savedOnLoad canPublish />);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace.mock.calls[0][0]).toBeNull(); // null state, so Next syncs its own copy of the URL
    expect(String(replace.mock.calls[0][2])).not.toContain('saved=1');
  });
});
