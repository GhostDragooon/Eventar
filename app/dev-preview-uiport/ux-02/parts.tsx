import type { ComponentProps, ReactNode } from 'react';
import { BrandMark } from '@/components/shell/BrandMark';
import { cn } from '@/lib/utils';
import { Frame, Icon } from '../ux-01/parts';

// Specimen building blocks for the UX-02 round (the practitioner portal shell). Presentational only, sample data, shipped
// tokens only. Rails, bars and sheets are drawn copies: AccountShell does not exist yet. BrandMark is the real component.

export { Icon };
export { Frame };
export { Option, Section } from '../ux-01/parts';

export const ME = { name: 'Uma Practitioner', email: 'uma@sample.test', initials: 'UP' };
const TITLE = 'Heart Failure in Primary Care: 2026 Update';

export type Shape = 'lg' | 'pill' | 'bar';
export type Heading = 'caps' | 'sentence' | 'none';
export type Claim = 'always' | 'when-any' | 'action';
export type Foot = 'row' | 'menu' | 'icon' | 'plain' | 'none';

const ROW_TEXT = 'text-[calc(14px*var(--text-scale))] font-medium';

export function Row({
  icon,
  label,
  current,
  badge,
  shape = 'lg',
  tone,
}: {
  icon: string;
  label: string;
  current?: boolean;
  badge?: number;
  shape?: Shape;
  tone?: 'quiet';
}) {
  return (
    <span
      aria-current={current ? 'page' : undefined}
      className={cn(
        'relative flex min-h-11 w-full items-center gap-sm px-md',
        ROW_TEXT,
        shape === 'pill' ? 'rounded-full' : 'rounded-lg',
        current
          ? shape === 'bar'
            ? 'font-semibold text-primary-ink'
            : 'bg-primary-container font-semibold text-on-primary-container'
          : tone === 'quiet'
            ? 'text-on-surface-variant'
            : 'text-on-surface',
      )}
    >
      {shape === 'bar' && current && <span aria-hidden className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-primary-ink" />}
      <Icon name={icon} className="text-[calc(20px*var(--text-scale))]" />
      <span className="flex-1 whitespace-nowrap">{label}</span>
      {badge ? (
        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-surface-container-high px-[6px] text-[calc(11px*var(--text-scale))] font-semibold text-on-surface">
          {badge}
        </span>
      ) : null}
    </span>
  );
}

export function GroupHeading({ kind }: { kind: Heading }) {
  if (kind === 'none') return <div aria-hidden className="mx-md mt-sm border-t border-outline-variant" />;
  if (kind === 'caps')
    return <p className="px-md pb-xs pt-md text-[calc(10px*var(--text-scale))] font-semibold uppercase tracking-[.08em] text-on-surface-variant">Account</p>;
  return <p className="px-md pb-xs pt-md text-[calc(12px*var(--text-scale))] font-semibold text-on-surface-variant">Account</p>;
}

export function Identity({ end, chevron }: { end?: ReactNode; chevron?: boolean }) {
  return (
    <div className="mt-auto flex items-center gap-sm border-t border-outline-variant px-sm pt-md">
      <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-primary-container text-[calc(12px*var(--text-scale))] font-semibold text-on-primary-container">
        {ME.initials}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[calc(13px*var(--text-scale))] font-semibold leading-tight text-on-surface">{ME.name}</p>
        <p className="truncate text-[calc(12px*var(--text-scale))] leading-tight text-on-surface-variant">{ME.email}</p>
      </div>
      {chevron && <Icon name="expand_more" className="text-on-surface-variant" />}
      {end}
    </div>
  );
}

export function MenuPanel({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-[14px] border border-outline-variant bg-surface-container-lowest p-xs shadow-xl', className)}>
      <Row icon="settings" label="Account settings" />
      <Row icon="logout" label="Sign out" />
    </div>
  );
}

export function Rail({
  current = 'My record',
  claim = 'always',
  unlinked = 2,
  heading = 'caps',
  shape = 'lg',
  foot = 'row',
  menuOpen,
  className,
}: {
  current?: string;
  claim?: Claim;
  unlinked?: number;
  heading?: Heading;
  shape?: Shape;
  foot?: Foot;
  menuOpen?: boolean;
  className?: string;
}) {
  const is = (l: string) => current === l;
  const showClaim = claim === 'always' || (claim === 'when-any' && unlinked > 0);
  const inMenu = foot === 'menu';
  return (
    <aside
      aria-label="Your Eventar portal"
      className={cn('relative flex w-[232px] shrink-0 flex-col gap-xs border-r border-outline-variant bg-sidebar p-md', className)}
    >
      <div className="pb-sm">
        <BrandMark compact href="/account/record" />
      </div>
      <Row shape={shape} icon="receipt_long" label="My record" current={is('My record')} />
      <Row shape={shape} icon="badge" label="Profile and licences" current={is('Profile and licences')} />
      {showClaim && <Row shape={shape} icon="link" label="Claim past events" current={is('Claim past events')} badge={unlinked || undefined} />}
      <Row shape={shape} icon="event" label="Find events" current={is('Find events')} />
      {!inMenu && (
        <>
          <GroupHeading kind={heading} />
          <Row shape={shape} icon="settings" label="Account settings" current={is('Account settings')} />
          {foot === 'row' && <Row shape={shape} icon="logout" label="Sign out" tone="quiet" />}
        </>
      )}
      {foot !== 'none' && (
        <>
          {inMenu && menuOpen && <MenuPanel className="mt-auto" />}
          <Identity
            chevron={inMenu}
            end={
              foot === 'icon' ? (
                <span className="grid size-11 shrink-0 place-items-center rounded-full border border-outline-variant text-on-surface-variant" role="img" aria-label="Sign out">
                  <Icon name="logout" />
                </span>
              ) : undefined
            }
          />
        </>
      )}
    </aside>
  );
}

export function RecordBody({ claimCard }: { claimCard?: boolean }) {
  return (
    <div className="min-w-0 flex-1 space-y-md p-md md:p-lg">
      <h1 className="font-headline-sm text-headline-sm text-on-surface">My record</h1>
      <div className="rounded-[20px] border border-outline-variant bg-surface-container-lowest p-md">
        <p className="font-headline-sm text-headline-sm tabular-nums text-on-surface">9.0</p>
        <p className="font-body-md text-body-md text-on-surface">points released through Eventar</p>
        <p className="mt-xs font-body-md text-body-md text-on-surface-variant">From 2 events you attended.</p>
      </div>
      {claimCard && (
        <div className="rounded-[20px] border border-outline-variant bg-surface-container-lowest p-md">
          <p className="font-title-lg text-title-lg text-on-surface">Claim 2 past events</p>
          <p className="font-body-md text-body-md text-on-surface-variant">Registered under uma@sample.test.</p>
          <p className="mt-sm inline-flex min-h-11 items-center rounded-full bg-primary px-md font-label-md text-label-md text-on-primary">Claim past events</p>
        </div>
      )}
      <ul className="rounded-[20px] border border-outline-variant bg-surface-container-lowest py-xs">
        {['Advances in Interventional Radiology', 'MRI Safety and Governance Workshop'].map((t) => (
          <li key={t} className="px-md py-sm font-body-md text-body-md text-on-surface">
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function EventsBody({ title = 'Upcoming events' }: { title?: string }) {
  return (
    <div className="min-w-0 flex-1 space-y-md p-md md:p-lg">
      <h1 className="font-headline-sm text-headline-sm text-on-surface">{title}</h1>
      <div className="rounded-[20px] border border-outline-variant bg-surface-container-lowest p-md">
        <p className="font-title-lg text-title-lg leading-tight text-on-surface">{TITLE}</p>
        <p className="mt-xs font-body-md text-body-md text-on-surface-variant">Sat 14 Nov 2026, 09:00 to 13:00</p>
        <p className="font-body-md text-body-md text-on-surface-variant">Hong Kong Academy of Medicine</p>
        <p className="mt-md grid min-h-11 place-items-center rounded-full bg-primary font-label-md text-label-md text-on-primary">Register</p>
      </div>
    </div>
  );
}

export function WizardBody() {
  const steps = ['Privacy and terms', 'Identity', 'Professional profile', 'Licence'];
  return (
    <div className="mx-auto w-full max-w-xl min-w-0 space-y-md p-md md:p-lg">
      <h1 className="font-headline-sm text-headline-sm text-on-surface">A few things before you start</h1>
      <ol className="flex flex-wrap gap-sm">
        {steps.map((s, i) => (
          <li
            key={s}
            aria-current={i === 1 ? 'step' : undefined}
            className={cn('inline-flex min-h-8 items-center rounded-full px-sm font-label-md text-label-md', i === 1 ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface-variant')}
          >
            {i + 1}. {s}
          </li>
        ))}
      </ol>
      <div className="space-y-sm rounded-[20px] border border-outline-variant bg-surface-container-lowest p-md">
        <p className="font-title-lg text-title-lg text-on-surface">Identity</p>
        <p className="flex min-h-11 items-center rounded-lg border border-outline px-md font-body-md text-body-md text-on-surface-variant">Full name</p>
        <p className="inline-flex min-h-11 items-center rounded-full bg-primary px-md font-label-md text-label-md text-on-primary">Continue</p>
      </div>
    </div>
  );
}

const pillCta = 'inline-flex min-h-11 items-center rounded-full bg-primary px-md text-[calc(12.5px*var(--text-scale))] font-semibold text-on-primary';

export function PillNav({ right, links = true }: { right: ReactNode; links?: boolean }) {
  return (
    <nav aria-label="Primary" className="glass-nav mx-md mt-[10px] flex items-center justify-between gap-md rounded-full py-sm pl-md pr-sm">
      <BrandMark href="/" />
      {links && (
        <span className="hidden gap-xs text-[calc(13px*var(--text-scale))] font-medium text-on-surface-variant sm:flex">
          <span className="px-sm">Home</span>
          <span className="px-sm">Upcoming events</span>
        </span>
      )}
      {right}
    </nav>
  );
}

export const AccountPill = () => (
  <span className={cn(pillCta, 'gap-xs')}>
    Account <Icon name="expand_more" />
  </span>
);

export function Ground({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('app-atmo flex min-h-[420px] flex-col text-on-surface', className)}>{children}</div>;
}

/** 375 px column: the phone width the spec checks. No device chrome is drawn. */
export function Phone({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('relative mx-auto flex min-h-[560px] w-full max-w-[375px] flex-col overflow-hidden bg-background', className)}>{children}</div>;
}

export function PhoneTop({ end = 'account' }: { end?: 'account' | 'menu' | 'signout' | 'avatar' | 'none' }) {
  const btn = 'inline-flex min-h-11 items-center gap-xs rounded-full border border-outline-variant px-md text-[calc(13px*var(--text-scale))] font-medium text-on-surface';
  return (
    <header className="flex min-h-14 items-center justify-between border-b border-outline-variant bg-surface px-md">
      <BrandMark href="/account/record" />
      {end === 'account' && <span className={btn}><Icon name="account_circle" />Account</span>}
      {end === 'menu' && <span className={btn}><Icon name="menu" />Menu</span>}
      {end === 'signout' && <span className={btn}><Icon name="logout" />Sign out</span>}
      {end === 'avatar' && (
        <span aria-hidden className="grid size-11 place-items-center rounded-full bg-primary-container text-[calc(12px*var(--text-scale))] font-semibold text-on-primary-container">{ME.initials}</span>
      )}
    </header>
  );
}

export function TabBar({
  tabs,
  current,
  px = 10,
}: {
  tabs: [string, string, number?][];
  current: string;
  px?: number;
}) {
  return (
    <nav aria-label="Portal" className="mt-auto grid border-t border-outline-variant bg-surface px-xs pb-xs pt-xs" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
      {tabs.map(([icon, label, badge]) => (
        <span
          key={label}
          data-tab
          aria-current={label === current ? 'page' : undefined}
          className={cn('relative flex min-h-12 flex-col items-center justify-center gap-[2px] font-semibold', label === current ? 'text-primary-ink' : 'text-on-surface-variant')}
          style={{ fontSize: `calc(${px}px * var(--text-scale))` }}
        >
          <span className="relative">
            <Icon name={icon} className="text-[calc(22px*var(--text-scale))]" />
            {badge ? (
              <span className="absolute -right-2 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-[4px] text-[calc(10px*var(--text-scale))] text-on-primary">{badge}</span>
            ) : null}
          </span>
          <span className="max-w-full">{label}</span>
        </span>
      ))}
    </nav>
  );
}

export const Scrim = () => <div aria-hidden className="absolute inset-0 bg-on-surface/60" />;

export function Sheet({ children }: { children: ReactNode }) {
  return <div className="absolute inset-x-0 bottom-0 rounded-t-[20px] border-t border-outline-variant bg-surface p-md shadow-xl">{children}</div>;
}

export function Pick({ children }: { children: ReactNode }) {
  return <span className="inline-flex h-8 items-center rounded-full bg-success-container px-sm font-label-md text-label-md text-on-success-container">{children}</span>;
}

export const Note = ({ children }: { children: ReactNode }) => <p className="max-w-[72ch] font-body-md text-body-md text-on-surface-variant">{children}</p>;

/** Frame cut to the 375 px the spec checks, so the frame edge is the screen edge. */
export function PhoneFrame(props: ComponentProps<typeof Frame>) {
  return (
    <div className="w-full max-w-[375px]">
      <Frame {...props} />
    </div>
  );
}
