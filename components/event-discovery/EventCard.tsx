'use client';

import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Status pill tone. Green is reserved for live/verified per the vault
 *  Frontend Design Standard §2 — never primary blue for a state. */
export type EventCardStatus = { label: string; tone: 'success' | 'neutral' };

export type EventCardRecord = {
  id: string;
  title: string;
  summary?: string;
  format?: string;
  dateLabel: string;
  venueLabel: string;
  imageUrl?: string;
  /** Calendar block (day + short month). Rendered instead of a hero image. */
  dateBlock?: { day: string; month: string };
  status?: EventCardStatus;
  organizers?: string[];
};

type Props = {
  event: EventCardRecord;
  saved?: boolean;
  onSaveChange?: (eventId: string, saved: boolean) => void;
  /** Navigates. Takes precedence over onOpen when both are supplied. */
  href?: string;
  onOpen?: (eventId: string) => void;
};

export function EventCard({ event, saved = false, onSaveChange, href, onOpen }: Props) {
  const media = event.dateBlock ? (
    <div
      className="flex w-[64px] shrink-0 flex-col items-center justify-center rounded-[12px] border border-outline-variant bg-surface-container-low py-sm"
      aria-hidden
    >
      <span className="text-[calc(22px*var(--text-scale))] font-extrabold leading-none tabular-nums text-on-surface">
        {event.dateBlock.day}
      </span>
      <span className="mt-[2px] text-[calc(11px*var(--text-scale))] font-semibold uppercase tracking-wider text-on-surface-variant">
        {event.dateBlock.month}
      </span>
    </div>
  ) : null;

  return (
    <article
      className={
        event.dateBlock
          ? 'flex items-stretch gap-md rounded-[16px] border border-outline-variant bg-surface-container-lowest p-md'
          : 'flex flex-col overflow-hidden rounded-[20px] border border-outline-variant bg-surface-container-lowest'
      }
    >
      {media}

      {!event.dateBlock && (
        <div className="aspect-[16/9] bg-surface-container" aria-hidden>
          {event.imageUrl && <img src={event.imageUrl} alt="" className="h-full w-full object-cover" />}
        </div>
      )}

      <div className={event.dateBlock ? 'flex min-w-0 flex-1 flex-col gap-xs' : 'flex flex-1 flex-col gap-sm p-lg'}>
        {event.format && (
          <p className="font-label-md text-label-md uppercase tracking-wider text-primary-ink">{event.format}</p>
        )}

        <h3
          className={
            event.dateBlock
              ? 'font-title-lg text-title-lg font-semibold text-on-surface'
              : 'font-headline-sm text-headline-sm text-on-surface'
          }
        >
          {event.title}
        </h3>

        {event.summary && (
          <p className="font-body-md text-body-md text-on-surface-variant line-clamp-2">{event.summary}</p>
        )}

        <div className="flex flex-wrap items-center gap-md font-body-sm text-body-sm text-on-surface-variant">
          <span className="flex items-center gap-xs">
            <span className="material-symbols-outlined text-[16px]" aria-hidden>
              calendar_month
            </span>
            {event.dateLabel}
          </span>
          {event.venueLabel && (
            <span className="flex items-center gap-xs">
              <span className="material-symbols-outlined text-[16px]" aria-hidden>
                location_on
              </span>
              {event.venueLabel}
            </span>
          )}
        </div>

        {event.organizers && event.organizers.length > 0 && (
          <p className="truncate font-body-sm text-body-sm text-on-surface-variant">
            By {event.organizers.join(' · ')}
          </p>
        )}

        <div className="mt-auto flex items-center justify-between gap-sm pt-sm">
          <div className="flex items-center gap-sm">
            {href ? (
              // A navigating action is a link, not a button — routing it through
              // <Button render={<Link/>}> makes base-ui stamp role="button" on the
              // anchor, which announces a navigation as a button to assistive tech.
              // buttonVariants gives identical styling with correct semantics.
              <Link
                href={href}
                className={cn(buttonVariants({ variant: 'outline' }), 'min-h-11 font-label-md text-label-md')}
              >
                View details
              </Link>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpen?.(event.id)}
                className="min-h-11 font-label-md text-label-md"
              >
                View details
              </Button>
            )}
            {event.status && (
              <span
                className={`inline-flex items-center gap-xs rounded-full px-sm py-[3px] text-[calc(11px*var(--text-scale))] font-semibold uppercase tracking-wide ${
                  event.status.tone === 'success'
                    ? 'bg-success-container text-on-success-container'
                    : 'bg-surface-container-high text-on-surface-variant'
                }`}
              >
                {event.status.tone === 'success' && (
                  <span className="h-[6px] w-[6px] rounded-full bg-[color:var(--success)]" aria-hidden />
                )}
                {event.status.label}
              </span>
            )}
          </div>

          {onSaveChange && (
            <Button
              type="button"
              variant="ghost"
              aria-pressed={saved}
              onClick={() => onSaveChange(event.id, !saved)}
              className="min-h-11 font-label-md text-label-md text-primary-ink hover:bg-primary-container hover:text-primary-ink"
            >
              <span
                className="material-symbols-outlined align-middle text-[18px]"
                data-fill={saved ? '1' : undefined}
                aria-hidden
              >
                bookmark
              </span>
              {saved ? 'Saved' : 'Save'}
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}
