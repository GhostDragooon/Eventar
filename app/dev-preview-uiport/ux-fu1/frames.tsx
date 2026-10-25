import type { ReactNode } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { StatusPill } from '@/components/lifecycle/StatusPill';
import { cn } from '@/lib/utils';
import { Frame, Icon } from '../ux-01/parts';

// UX-FU1 specimen fragments. Real here: Button, buttonVariants, StatusPill and the tokens. Drawn here: pieces
// that are private to their pages (the edit page's ActionCard and header, the accreditation card, the Manage
// row), copied class for class so they can sit three up.

export const TITLE = 'Heart Failure in Primary Care: 2026 Update';
const PRIMARY = 'min-h-11 w-full font-label-md text-label-md text-on-primary!';

/** Copy of the edit page's private ActionCard (app/events/[id]/edit/page.tsx). */
export function ActionCard({ icon = 'publish', title, body, children }: { icon?: string; title: string; body: string; children?: ReactNode }) {
  return (
    <div className="rounded-[20px] border border-outline-variant bg-surface-container-lowest p-md shadow-sm">
      <div className="mb-sm flex items-start gap-sm">
        <Icon name={icon} className="mt-[2px] text-primary-ink" />
        <div className="min-w-0 flex-1">
          <h3 className="font-title-lg text-[calc(16px*var(--text-scale))] leading-tight text-on-surface">{title}</h3>
          <p className="mt-xs font-body-md text-[calc(12px*var(--text-scale))] text-on-surface-variant">{body}</p>
        </div>
      </div>
      <div className="mt-sm space-y-sm">{children}</div>
    </div>
  );
}

export function Warn({ children }: { children: ReactNode }) {
  return (
    <p className="font-body-md text-body-md text-on-surface">{children}</p>
  );
}

export function UnsavedLine({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-xs font-body-md text-body-md text-on-surface">
      <Icon name="warning" className="mt-[2px]" />
      <span className="min-w-0 flex-1">{children}</span>
    </p>
  );
}

export function PublishButton({ label = 'Publish event', off }: { label?: string; off?: boolean }) {
  return (
    <Button type="button" aria-disabled={off || undefined} className={cn(PRIMARY, off && 'opacity-50')}>
      {label}
    </Button>
  );
}

export function Banner({ tone = 'success', children }: { tone?: 'success' | 'plain'; children: ReactNode }) {
  return tone === 'success' ? (
    <p className="flex items-start gap-sm rounded-lg border border-success-container bg-success-container px-md py-sm font-body-md text-body-md text-on-success-container">
      <Icon name="check_circle" className="mt-[2px]" fill />
      <span className="min-w-0 flex-1">{children}</span>
    </p>
  ) : (
    <p className="rounded-lg border border-outline-variant px-md py-sm font-body-md text-body-md text-on-surface-variant">{children}</p>
  );
}

export function Block({ label, h = 'h-16' }: { label: string; h?: string }) {
  return (
    <div className={cn('grid place-items-center rounded-lg bg-surface-container-high px-md font-label-md text-label-md text-on-surface-variant', h)}>{label}</div>
  );
}

/** Title block of the edit page: breadcrumb gap, title, status pill, then whatever the option puts below it. */
export function EditTop({ children, beside, locked }: { children?: ReactNode; beside?: ReactNode; locked?: boolean }) {
  return (
    <div className="space-y-sm p-md">
      <div className="flex flex-wrap items-center gap-sm">
        <StatusPill lifecycle={locked ? 'registering' : 'drafted'} />
        {beside}
      </div>
      <h1 className="text-[calc(22px*var(--text-scale))] font-extrabold leading-tight tracking-[-0.025em] text-on-surface">{TITLE}</h1>
      {children}
    </div>
  );
}

export function Narrow({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-[343px] p-md">{children}</div>;
}

export function Today({ title = 'Today', note, children }: { title?: string; note?: string; children: ReactNode }) {
  return (
    <article className="space-y-md rounded-[20px] border border-dashed border-outline bg-surface-container-lowest p-md md:p-lg">
      <div className="space-y-xs">
        <h3 className="font-title-lg text-title-lg text-on-surface">{title}</h3>
        {note && <p className="max-w-[72ch] font-body-md text-body-md text-on-surface-variant">{note}</p>}
      </div>
      <div className="grid gap-md md:grid-cols-2 xl:grid-cols-3">{children}</div>
    </article>
  );
}

/** Copy of the edit page's accreditation card: the lock notes and the fields, in the three presentations. */
export function AccrCard({
  pill = 'Not accredited',
  notes,
  fields,
}: {
  pill?: string;
  notes?: ReactNode;
  fields: 'disabled' | 'enabled' | 'text' | 'none';
}) {
  return (
    <div className="space-y-sm rounded-[20px] border border-outline-variant bg-surface-container-lowest p-md">
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <h3 className="font-title-lg text-[calc(16px*var(--text-scale))] text-on-surface">CPD accreditation</h3>
        <span className="rounded-full bg-surface-container-high px-md py-xs font-label-md text-label-md font-semibold text-on-surface-variant">{pill}</span>
      </div>
      {notes}
      {(fields === 'disabled' || fields === 'enabled') && (
        <div className="space-y-sm">
          <div>
            <p className="font-label-md text-label-md font-semibold text-on-surface-variant">Accrediting body</p>
            <div className={cn('mt-xs flex min-h-11 items-center justify-between rounded-lg border border-outline bg-surface-container-lowest px-md font-body-md text-body-md text-on-surface', fields === 'disabled' && 'opacity-50')}>
              None selected <Icon name="expand_more" />
            </div>
          </div>
          <div>
            <p className="font-label-md text-label-md font-semibold text-on-surface-variant">CPD hours</p>
            <div className={cn('mt-xs flex min-h-11 items-center rounded-lg border border-outline bg-surface-container-lowest px-md font-body-md text-body-md text-on-surface', fields === 'disabled' && 'opacity-50')}>0</div>
          </div>
          <Button type="button" aria-disabled={fields === 'disabled' || undefined} className={cn('min-h-11 px-md font-label-md text-label-md', fields === 'disabled' && 'opacity-50')}>Save accreditation</Button>
        </div>
      )}
      {fields === 'text' && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-md gap-y-xs font-body-md text-body-md">
          <dt className="text-on-surface-variant">Accrediting body</dt>
          <dd className="text-on-surface">None</dd>
          <dt className="text-on-surface-variant">CPD hours</dt>
          <dd className="text-on-surface">None</dd>
        </dl>
      )}
    </div>
  );
}

export const Note = ({ children }: { children: ReactNode }) => (
  <p className="rounded-lg bg-surface-container-low px-md py-sm font-body-md text-body-md text-on-surface-variant">{children}</p>
);

/** Details page header of a published event: pill, locked facts, Edit. */
export function PublishedHeader({ children, lockLabels }: { children?: ReactNode; lockLabels?: boolean }) {
  const fact = (text: string, label: string) => (
    <p className="flex flex-wrap items-center gap-xs font-body-md text-body-md text-on-surface-variant">
      <span>{text}</span>
      <Icon name="lock" className="text-[calc(16px*var(--text-scale))]" />
      {lockLabels && <span className="font-label-md text-label-md">{label}</span>}
    </p>
  );
  return (
    <div className="space-y-sm p-md">
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <div className="flex flex-wrap items-center gap-sm">
          <h1 className="text-[calc(22px*var(--text-scale))] font-extrabold leading-tight tracking-[-0.025em] text-on-surface">{TITLE}</h1>
          <StatusPill lifecycle="registering" />
        </div>
        <Button type="button" className="min-h-11 px-md font-label-md text-label-md text-on-primary!">Edit</Button>
      </div>
      {fact('Sat 14 Nov 2026, 09:00 to 13:00', 'Locked')}
      {fact('Hong Kong Academy of Medicine', 'Locked')}
      {children}
    </div>
  );
}

/** The Manage row's action column, with the product's own button classes. `inert` frame: nothing is clickable. */
export function ActionCol({ width, mode, fit }: { width: number; mode: 'pair' | 'stack' | 'more'; fit?: boolean }) {
  const link = (icon: string, label: string, extra?: string, probe?: boolean) => (
    <span
      data-probe={probe ? '' : undefined}
      className={cn(buttonVariants({ variant: 'outline' }), 'gap-xs px-sm py-sm font-label-md text-label-md', extra ?? 'w-full')}
    >
      <Icon name={icon} className="text-[calc(16px*var(--text-scale))]" />
      {label}
    </span>
  );
  return (
    <div className="p-md">
      {/* The product's row clips (overflow-hidden, rounded) just past the column's own padding, so a label that sticks out is cut off, as in the shipped row. */}
      <div className="w-fit max-w-full overflow-hidden rounded-[16px] border border-outline-variant bg-surface-container-lowest p-md">
      <div data-col="" className="flex flex-col gap-xs" style={{ width }}>
        {link('info', 'Details')}
        {mode === 'pair' && (
          <div className="flex gap-xs">
            {link('edit', 'Edit', fit ? 'flex-1 min-w-fit' : 'flex-1')}
            {link('how_to_reg', 'Check-in', fit ? 'flex-1 min-w-fit' : 'flex-1', true)}
          </div>
        )}
        {mode === 'stack' && (
          <>
            {link('edit', 'Edit')}
            {link('how_to_reg', 'Check-in', undefined, true)}
          </>
        )}
        {mode === 'more' && link('how_to_reg', 'Check-in', undefined, true)}
        {mode !== 'more' && link('bar_chart', 'Analytics')}
        {mode === 'more' ? (
          link('more_horiz', 'More')
        ) : (
          <span className={cn(buttonVariants({ variant: 'destructive' }), 'w-full gap-xs px-sm py-sm font-label-md text-label-md')}>
            <Icon name="delete" className="text-[calc(16px*var(--text-scale))]" />Delete
          </span>
        )}
      </div>
      </div>
    </div>
  );
}

export function NextCard({ rows, extra }: { rows: [string, ReactNode, ReactNode?][]; extra?: ReactNode }) {
  return (
    <div className="space-y-sm p-md">
      <Banner>Published. Your registration page is live.</Banner>
      {extra}
      <div className="rounded-[20px] border border-outline-variant bg-surface-container-lowest p-md">
        <h3 className="font-title-lg text-title-lg leading-tight text-on-surface">What to do next</h3>
        <ul className="mt-sm">
          {rows.map(([icon, text, action], i) => (
            <li key={i} className="flex min-h-11 flex-wrap items-center gap-sm py-sm">
              <Icon name={icon} className="text-on-surface-variant" />
              <span className="min-w-[10rem] flex-1 font-body-md text-body-md text-on-surface">{text}</span>
              {action}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export const Quiet = ({ children }: { children: ReactNode }) => (
  <span className="inline-flex min-h-11 items-center font-label-md text-label-md text-primary-ink underline underline-offset-4">{children}</span>
);

export { Frame, Icon };

/** The options of one surface. The recommended one is ordered first inside this box, below the section heading and the Today block. */
export const Options = ({ children }: { children: ReactNode }) => <div className="flex flex-col gap-lg">{children}</div>;
