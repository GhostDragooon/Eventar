import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/lifecycle/StatusPill';
import { cn } from '@/lib/utils';
import type { Lifecycle } from '@/lib/lifecycle/eventLifecycle';

// Specimen building blocks for the UX-01 round. Presentational only, sample data, shipped tokens only.

const TITLE = 'Heart Failure in Primary Care: 2026 Update';

export function Icon({ name, className, fill }: { name: string; className?: string; fill?: boolean }) {
  return (
    <span
      className={cn('material-symbols-outlined text-[calc(18px*var(--text-scale))]', className)}
      aria-hidden
      data-fill={fill ? '1' : undefined}
    >
      {name}
    </span>
  );
}

export function Section({ id, title, intro, children }: { id: string; title: string; intro: string; children: ReactNode }) {
  return (
    <section id={id} className="flex scroll-mt-lg flex-col gap-lg">
      <div className="space-y-xs">
        <h2 className="font-headline-md text-headline-md text-on-surface">{title}</h2>
        <p className="max-w-[72ch] font-body-md text-body-md text-on-surface-variant">{intro}</p>
      </div>
      {children}
    </section>
  );
}

export function Option({
  id,
  name,
  summary,
  argued,
  cost,
  dialog,
  single,
  recommended,
  extra,
  children,
}: {
  id: string;
  name: string;
  summary: string;
  argued: string;
  cost: string;
  /** middle frame is a dialog: give it the widest column */
  dialog?: boolean;
  /** one frame only: no column grid */
  single?: boolean;
  /** one-line reason; marks this option as the recommended one and lists it first */
  recommended?: string;
  /** live (non-inert) content under the cost line */
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <article aria-labelledby={`opt-${id}`} className={cn('space-y-md rounded-[20px] border border-outline-variant bg-surface-container-lowest p-md md:p-lg', recommended && 'order-first')}>
      <div className="flex items-start gap-md">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary-container font-title-lg text-title-lg text-on-primary-container">{id}</span>
        <div className="min-w-0 space-y-xs">
          <h3 id={`opt-${id}`} className="font-title-lg text-title-lg text-on-surface">
            {name}
            {recommended && <span className="ml-sm inline-flex h-8 items-center rounded-full bg-success-container px-sm align-middle font-label-md text-label-md text-on-success-container">Recommended</span>}
          </h3>
          {recommended && <p className="max-w-[72ch] font-body-md text-body-md text-on-surface">{recommended}</p>}
          <p className="max-w-[72ch] font-body-md text-body-md text-on-surface">{summary}</p>
          <p className="max-w-[72ch] font-body-md text-body-md text-on-surface-variant"><strong className="font-semibold text-on-surface">Argued for by:</strong> {argued}</p>
          <p className="max-w-[72ch] font-body-md text-body-md text-on-surface-variant"><strong className="font-semibold text-on-surface">Costs:</strong> {cost}</p>
          {extra && <div className="pt-xs">{extra}</div>}
        </div>
      </div>
      <div className={cn('grid gap-md', !single && 'md:grid-cols-2', !single && (dialog ? 'xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.5fr)_minmax(0,1fr)]' : 'xl:grid-cols-3'))}>{children}</div>
    </article>
  );
}

export function Frame({ label, children, tall, wide }: { label: string; children: ReactNode; tall?: boolean; wide?: boolean }) {
  return (
    <figure className={cn('min-w-0 space-y-xs', wide && 'md:col-span-full')}>
      <figcaption className="font-label-md text-label-md text-on-surface-variant">{label}</figcaption>
      {/* inert: the mock controls take no focus and do nothing */}
      <div
        inert
        className={cn(
          'overflow-hidden rounded-[14px] border border-outline-variant',
          tall ? 'grid place-items-center bg-on-surface/60 p-md py-lg' : 'bg-background',
        )}
      >
        {children}
      </div>
    </figure>
  );
}

export function Page({ children, narrow, bar }: { children: ReactNode; narrow?: boolean; bar?: boolean }) {
  return (
    <div className={cn('relative p-md', bar && 'pb-[150px]')}>
      <div className={cn(narrow && 'mx-auto max-w-sm')}>{children}</div>
    </div>
  );
}

export function DialogPanel({
  title,
  description,
  children,
  footer,
  wide,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer: ReactNode;
  wide?: boolean;
}) {
  // Same classes as components/ui/Dialog.tsx, drawn inline instead of fixed over the viewport.
  return (
    <div
      className={cn(
        'relative w-full rounded-[20px] border border-outline-variant bg-surface-container-lowest p-lg shadow-xl',
        wide ? 'max-w-2xl' : 'max-w-md',
      )}
    >
      <span className="absolute right-md top-md grid size-11 place-items-center rounded-full text-on-surface-variant">
        <Icon name="close" />
      </span>
      <div className="pr-11">
        <h2 className="font-headline-sm text-headline-sm text-on-surface">{title}</h2>
        {description && <p className="mt-xs font-body-md text-body-md text-on-surface-variant">{description}</p>}
      </div>
      <div className="mt-lg">{children}</div>
      <div className="mt-lg flex flex-wrap justify-end gap-sm">{footer}</div>
    </div>
  );
}

export function Facts({ compact }: { compact?: boolean }) {
  const items: [string, string][] = [
    ['public', 'Your registration page goes live. Anyone with the link can register.'],
    ['how_to_reg', 'Registration opens now.'],
    ['qr_code_scanner', 'Check-in opens at 08:00 on 14 Nov, 60 minutes before the start.'],
    ['lock', 'Details cannot be edited after publishing yet, so check them first.'],
  ];
  return (
    <ul className={cn('font-body-md text-body-md text-on-surface', compact ? 'space-y-xs' : 'space-y-sm')}>
      {items.map(([icon, text]) => (
        <li key={icon} className="flex items-start gap-sm">
          <Icon name={icon} className="mt-[2px] text-on-surface-variant" />
          <span className="min-w-0 flex-1">{text}</span>
        </li>
      ))}
    </ul>
  );
}

export function NextSteps({ card }: { card?: boolean }) {
  const rows: [string, string, string | null][] = [
    ['share', 'Share the link', 'Copy link'],
    ['groups', 'Watch registrations come in', 'Open registrations'],
    ['qr_code_scanner', 'Check-in opens Sat 14 Nov, 08:00', null],
  ];
  return (
    <div className="space-y-md">
      <div
        role="status"
        className="flex items-start gap-sm rounded-lg border border-success-container bg-success-container px-md py-sm font-body-md text-body-md text-on-success-container"
      >
        <Icon name="check_circle" className="mt-[2px]" fill />
        <span className="flex-1">Published. Your registration page is live.</span>
      </div>
      <div className={cn('rounded-[20px] border border-outline-variant bg-surface-container-lowest p-md', card && 'shadow-sm')}>
        <h3 className="font-title-lg text-title-lg leading-tight text-on-surface">What to do next</h3>
        <ul className="mt-sm divide-y divide-outline-variant">
          {rows.map(([icon, text, action]) => (
            <li key={text} className="flex min-h-11 flex-wrap items-center gap-sm py-sm">
              <Icon name={icon} className="text-on-surface-variant" />
              <span className="min-w-0 flex-1 font-body-md text-body-md text-on-surface">{text}</span>
              {action && <span className="inline-flex min-h-11 items-center font-label-md text-label-md text-primary-ink underline underline-offset-4">{action}</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function EventHeader({
  lifecycle,
  compact,
  back,
  title,
  action,
  actionQuiet,
}: {
  lifecycle: Lifecycle;
  compact?: boolean;
  back?: string;
  title?: string;
  action?: string;
  actionQuiet?: boolean;
}) {
  return (
    <header className="mb-md space-y-xs">
      {back && (
        <p className="inline-flex min-h-11 items-center gap-xs font-label-md text-label-md text-primary-ink">
          <Icon name="arrow_back" /> {back}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <div className="flex min-w-0 flex-wrap items-center gap-sm">
          <h1 className={cn('min-w-0 font-extrabold tracking-[-0.025em] text-on-surface', compact ? 'text-[calc(22px*var(--text-scale))] leading-tight' : 'text-[calc(26px*var(--text-scale))] leading-[1.1]')}>
            {title ?? TITLE}
          </h1>
          <StatusPill lifecycle={lifecycle} />
        </div>
        {action && (
          <Button variant={actionQuiet ? 'outline' : 'default'} className={cn('min-h-11 px-md', !actionQuiet && 'font-label-md text-label-md text-on-primary!')}>
            {action}
          </Button>
        )}
      </div>
      {!compact && (
        <p className="font-body-md text-body-md text-on-surface-variant">Sat 14 Nov 2026, 09:00 to 13:00 · Hong Kong Academy of Medicine</p>
      )}
    </header>
  );
}

const tool = 'inline-flex min-h-11 items-center gap-xs rounded-lg border px-md font-label-md text-label-md';

export function Toolbar({ lifecycle }: { lifecycle: Lifecycle }) {
  const live = lifecycle === 'live';
  const outline = `${tool} border-outline-variant text-on-surface`;
  return (
    <div className="flex flex-wrap gap-xs">
      <span className={outline}><Icon name="edit" className="text-[calc(16px*var(--text-scale))]" />Edit</span>
      <span className={outline}><Icon name="groups" className="text-[calc(16px*var(--text-scale))]" />Registrations</span>
      <span className={live ? `${tool} border-transparent bg-primary text-on-primary` : outline}>
        <Icon name="qr_code_scanner" className="text-[calc(16px*var(--text-scale))]" />Check-in
      </span>
      <span className={outline}><Icon name="open_in_new" className="text-[calc(16px*var(--text-scale))]" />Public</span>
      <span className={`${tool} border-outline-variant text-on-surface-variant opacity-50`}><Icon name="insights" className="text-[calc(16px*var(--text-scale))]" />Analytics</span>
    </div>
  );
}

export function Tabs({ current }: { current: string }) {
  const tabs = ['Overview', 'Registrations', 'Check-in', 'Edit', 'Analytics'];
  return (
    <nav aria-label="Event places" className="-mx-md mb-md overflow-x-auto border-b border-outline-variant px-md">
      <ul className="flex min-w-max gap-sm">
        {tabs.map((t) => (
          <li key={t}>
            <span
              aria-current={t === current ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-11 items-center border-b-2 px-xs font-label-md text-label-md',
                t === current ? 'border-primary-ink font-semibold text-primary-ink' : 'border-transparent text-on-surface-variant',
              )}
            >
              {t}
            </span>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function SegSwitch({ current }: { current: 'Registrations' | 'Check-in' }) {
  return (
    <div role="group" aria-label="Event places" className="mb-md inline-flex rounded-full bg-surface-container-high p-xs">
      {(['Registrations', 'Check-in'] as const).map((t) => (
        <span
          key={t}
          aria-current={t === current ? 'page' : undefined}
          className={cn(
            'inline-flex min-h-11 items-center rounded-full px-md font-label-md text-label-md',
            t === current ? 'bg-surface-container-lowest font-semibold text-on-surface shadow-sm' : 'text-on-surface-variant',
          )}
        >
          {t}
        </span>
      ))}
    </div>
  );
}

const field = 'flex min-h-11 items-center gap-xs rounded-lg border border-outline bg-surface-container-lowest px-md font-body-md text-body-md text-on-surface-variant';

export function RegistrationsBody({ heading }: { heading?: boolean }) {
  const rows: [string, string, string, string][] = [
    ['Alex Wong', 'alex@example.invalid', 'Attendee', 'Registered'],
    ['Priya Nair', 'priya@example.invalid', 'Presenter', 'Registered'],
    ['Sam Ho', 'sam@example.invalid', 'Attendee', 'Attended'],
  ];
  return (
    <div className="space-y-sm">
      {heading && <h2 className="font-title-lg text-title-lg text-on-surface">Registrations</h2>}
      <div className={field}><Icon name="search" /> Search name or email</div>
      <ul className="rounded-lg border border-outline-variant bg-surface-container-lowest py-xs">
        {rows.map(([n, e, r, s]) => (
          <li key={n} className="flex flex-wrap items-center gap-sm px-md py-sm">
            <div className="min-w-0 flex-1">
              <p className="font-body-md text-body-md font-semibold text-on-surface">{n}</p>
              <p className="truncate font-body-md text-body-md text-on-surface-variant">{e}</p>
            </div>
            <span className="rounded-full bg-surface-container-high px-sm font-label-md text-label-md text-on-surface-variant">{r}</span>
            <span className="rounded-full bg-surface-container-high px-sm font-label-md text-label-md text-on-surface-variant">{s}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CheckinBody({ heading }: { heading?: boolean }) {
  return (
    <div className="space-y-sm">
      {heading && <h2 className="font-title-lg text-title-lg text-on-surface">Check-in</h2>}
      <p className="font-body-md text-body-md text-on-surface"><strong className="font-semibold">3 of 120</strong> have arrived. Check-in is open until 13:00.</p>
      <div className="flex min-h-11 items-center justify-center gap-xs rounded-full bg-primary font-label-md text-label-md text-on-primary"><Icon name="qr_code_scanner" /> Scan a pass</div>
      <div className={field}>Enter a code</div>
      <div className="flex min-h-11 items-center justify-center gap-xs rounded-full border border-outline-variant font-label-md text-label-md text-on-surface"><Icon name="person_add" /> Add a walk-in</div>
    </div>
  );
}

export function CreateFooter({ mode }: { mode: 'both' | 'draft-only' | 'save-and-review' }) {
  const primary = 'min-h-11 px-md font-label-md text-label-md text-on-primary!';
  return (
    <Page>
      <div className="flex flex-wrap gap-sm">
        {mode === 'both' && (
          <>
            <Button variant="outline" className="min-h-11 px-md">Save draft</Button>
            <Button className={primary}>Publish event</Button>
          </>
        )}
        {mode === 'draft-only' && <Button className={primary}>Save draft</Button>}
        {mode === 'save-and-review' && (
          <>
            <Button variant="outline" className="min-h-11 px-md">Save draft</Button>
            <Button className={primary}>Save and review</Button>
          </>
        )}
      </div>
      <p className="mt-sm font-body-md text-body-md text-on-surface-variant">
        {mode === 'both' && 'Publish event makes the registration page live. Details cannot be edited after publishing yet, so check them first.'}
        {mode === 'draft-only' && 'Save your draft first. You can review and publish it from the next page.'}
        {mode === 'save-and-review' && 'Save and review saves your draft, then shows what publishing will do. Nothing goes live until you confirm.'}
      </p>
    </Page>
  );
}

export const FORM_STUB = (
  <div className="space-y-sm rounded-[20px] border border-outline-variant bg-surface-container-lowest p-md">
    <p className="font-label-md text-label-md text-on-surface">Event title</p>
    <div className={field}>{TITLE}</div>
    <p className="font-label-md text-label-md text-on-surface">Starts</p>
    <div className={field}>Sat 14 Nov 2026, 09:00</div>
  </div>
);

export function PublicCardPreview() {
  return (
    <div className="rounded-[14px] border border-outline-variant bg-surface-container p-md">
      <p className="mb-sm font-label-md text-label-md text-on-surface-variant">How people will see it</p>
      <div className="rounded-[14px] border border-outline-variant bg-surface-container-lowest p-md">
        <p className="font-title-lg text-title-lg leading-tight text-on-surface">{TITLE}</p>
        <p className="mt-xs font-body-md text-body-md text-on-surface-variant">Sat 14 Nov 2026, 09:00 to 13:00</p>
        <p className="font-body-md text-body-md text-on-surface-variant">Hong Kong Academy of Medicine</p>
        <div className="mt-md grid min-h-11 place-items-center rounded-full bg-primary font-label-md text-label-md text-on-primary">Register</div>
      </div>
    </div>
  );
}
