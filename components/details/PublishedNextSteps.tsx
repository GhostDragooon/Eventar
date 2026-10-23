'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

// UX-01 pick a1: where Publish lands (`/events/<id>/details?published=1`). Says in words that the event is
// public, then three next steps. The banner takes focus so a screen reader announces the result.
export function PublishedNextSteps({ eventId, origin, checkinOpens }: { eventId: string; /** canonical site origin, the same one the QR code carries */ origin: string; checkinOpens: string }) {
  const bannerRef = useRef<HTMLDivElement>(null);
  const url = `${origin}/events/${eventId}`;
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    bannerRef.current?.focus();
    // `?published=1` only means "you just got here from Publish": drop it so a reload or a bookmark does not
    // repeat the banner and take focus again. The card stays until the next navigation. `null` state so Next
    // syncs its router URL too (see DraftSavedBanner).
    window.history.replaceState(null, '', window.location.pathname);
  }, []);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopy('copied');
    } catch {
      setCopy('failed');
    }
  }

  return (
    <section aria-labelledby="published-next-heading" className="mb-lg space-y-md">
      <div
        ref={bannerRef}
        tabIndex={-1}
        role="status"
        className="flex items-start gap-sm rounded-lg border border-success-container bg-success-container px-md py-sm font-body-md text-body-md text-on-success-container outline-none"
      >
        <span className="material-symbols-outlined mt-[2px] text-[calc(18px*var(--text-scale))]" aria-hidden data-fill="1">check_circle</span>
        <span className="flex-1">Published. Your registration page is live.</span>
      </div>
      <div className="rounded-[20px] border border-outline-variant bg-surface-container-lowest p-md">
        <h2 id="published-next-heading" className="font-title-lg text-title-lg leading-tight text-on-surface">What to do next</h2>
        <ul className="mt-sm">
          <li className="flex min-h-11 flex-wrap items-center gap-sm py-sm">
            <span className="material-symbols-outlined text-[calc(18px*var(--text-scale))] text-on-surface-variant" aria-hidden>share</span>
            <span className="min-w-0 flex-1">
              <span className="block font-body-md text-body-md text-on-surface">Share the link</span>
              <span className="block break-all font-body-md text-body-md text-on-surface-variant">{url}</span>
            </span>
            <span role="status" className="font-body-md text-body-md text-on-success-container empty:hidden">{copy === 'copied' ? 'Link copied' : ''}</span>
            <Button type="button" variant="outline" className="min-h-11 px-md" onClick={copyLink}>
              Copy link
            </Button>
          </li>
          {copy === 'failed' && (
            <li role="alert" className="py-sm font-body-md text-body-md text-error">Could not copy the link. Select it above and copy it.</li>
          )}
          <li className="flex min-h-11 items-center gap-sm py-sm">
            <span className="material-symbols-outlined text-[calc(18px*var(--text-scale))] text-on-surface-variant" aria-hidden>groups</span>
            <span className="font-body-md text-body-md text-on-surface">Registrations show in the Registered count as people sign up.</span>
          </li>
          <li className="flex min-h-11 items-center gap-sm py-sm">
            <span className="material-symbols-outlined text-[calc(18px*var(--text-scale))] text-on-surface-variant" aria-hidden>qr_code_scanner</span>
            <span className="font-body-md text-body-md text-on-surface">{checkinOpens}</span>
          </li>
        </ul>
      </div>
    </section>
  );
}
