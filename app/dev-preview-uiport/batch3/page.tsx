'use client';

import type { ReactNode } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Dialog } from '@/components/ui/Dialog';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { cn } from '@/lib/utils';

const noop = () => {};

function Frame({ label, real, note, tall, children }: { label: string; real: boolean; note?: string; tall?: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-xs">
      <div className="flex items-center gap-sm font-label-md text-label-md text-on-surface">
        <span>{label}</span>
        <span className="rounded-full border border-outline-variant px-sm text-on-surface-variant">{real ? 'REAL' : 'COPY'}</span>
        {note && <span className="font-body-md text-body-md text-on-surface-variant">{note}</span>}
      </div>
      <div className={`relative ${tall ? 'h-[560px]' : 'h-[400px]'} overflow-hidden rounded-[12px] border border-outline-variant bg-surface [transform:translateZ(0)]`}>
        {children}
      </div>
    </div>
  );
}

function Row({ n, name, cols = 2, children }: { n: number; name: string; cols?: 2 | 3; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-md">
      <h2 className="font-title-lg text-title-lg text-on-surface">{`Row ${n} · ${name}`}</h2>
      <div className={cn('grid gap-md', cols === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2')}>{children}</div>
    </section>
  );
}

function Backdrop() {
  return (
    <div className="absolute inset-0 flex flex-col gap-sm p-md" aria-hidden>
      <div className="h-8 w-1/3 rounded-lg bg-surface-container" />
      <div className="h-16 rounded-lg bg-surface-container" />
      <div className="h-16 rounded-lg bg-surface-container" />
      <div className="h-16 rounded-lg bg-surface-container" />
    </div>
  );
}

const TOAST_BASE =
  'pointer-events-auto flex items-center gap-sm w-full rounded-[12px] bg-[#0A0A0A] text-white shadow-lg px-md py-sm text-[calc(13px*var(--text-scale))] font-medium';

function Pill({ icon, tone, children }: { icon: string; tone: string; children: ReactNode }) {
  return (
    <div className={TOAST_BASE}>
      <span aria-hidden className={`material-symbols-outlined text-[calc(18px*var(--text-scale))] shrink-0 ${tone}`}>{icon}</span>
      <span className="flex-1 min-w-0">{children}</span>
      <span className="shrink-0 text-white/50">
        <span className="material-symbols-outlined text-[calc(16px*var(--text-scale))]" aria-hidden>close</span>
      </span>
    </div>
  );
}

function ToastDock({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('absolute bottom-md left-1/2 -translate-x-1/2 flex w-full max-w-[480px] flex-col gap-xs px-md', className)}>
      {children}
    </div>
  );
}

function Roster() {
  return (
    <div className="absolute inset-0 flex flex-col gap-sm p-md" aria-hidden>
      <div className="font-title-lg text-title-lg text-on-surface">Check-in</div>
      <div className="h-10 rounded-lg bg-surface-container" />
      <div className="h-10 rounded-lg bg-surface-container" />
      <div className="h-10 rounded-lg bg-surface-container" />
    </div>
  );
}

const LogIn = () => <span className="underline font-semibold">Log in</span>;

const INPUT = 'min-h-11 w-full rounded-lg border border-outline bg-surface-container-lowest px-md font-body-md text-body-md text-on-surface';
const LABEL = 'flex flex-col gap-xs font-label-md text-label-md text-on-surface';
const BTN = 'min-h-11 px-md font-label-md text-label-md';

function EditForm({ after, locked }: { after: boolean; locked?: boolean }) {
  const save = <Button type="submit" className={BTN}>Save changes</Button>;
  const cancel = <Button type="button" variant="outline" className={BTN}>Cancel</Button>;
  return (
    <form onSubmit={(e) => e.preventDefault()} className="flex flex-col gap-sm">
      <label className={LABEL}>Full name<input className={INPUT} defaultValue="Dana Lee" /></label>
      <label className={LABEL}>Email<input className={cn(INPUT, locked && 'opacity-60')} defaultValue="dana@example.org" disabled={locked} /></label>
      {!after && (
        <p className="font-body-md text-body-md text-on-surface-variant">
          Their check-in code stays the same, so a pass already emailed to them keeps working.
        </p>
      )}
      {after && locked && (
        <p className="font-body-md text-body-md text-on-surface-variant">Email can&apos;t change after check-in.</p>
      )}
      {after ? (
        <div className="mt-md flex justify-end gap-sm">{cancel}{save}</div>
      ) : (
        <div className="flex flex-wrap gap-sm">{save}{cancel}</div>
      )}
    </form>
  );
}

function EditDialog({ id, after, locked }: { id: string; after: boolean; locked?: boolean }) {
  return (
    <>
      <Backdrop />
      <Dialog
        open
        onOpenChange={noop}
        labelledById={id}
        title="Edit registration"
        description={after ? undefined : 'Correct a mistyped name or email. Each change is recorded with who made it and which fields changed.'}
      >
        <EditForm after={after} locked={locked} />
      </Dialog>
    </>
  );
}

function DiscardDialog({ id, footer }: { id: string; footer: ReactNode }) {
  return (
    <>
      <Backdrop />
      <Dialog
        open
        onOpenChange={noop}
        labelledById={id}
        title="Discard your changes?"
        description="You have changes that are not saved. Leaving now loses them."
        footer={footer}
      />
    </>
  );
}

function ErrorPage({ after }: { after: boolean }) {
  const retry = (
    <Button className="min-h-11 gap-xs font-label-md text-label-md text-on-primary! py-sm px-lg">
      <span className="material-symbols-outlined" aria-hidden>refresh</span>Try again
    </Button>
  );
  const home = (
    <span className="inline-flex min-h-11 items-center gap-xs border border-outline-variant text-on-surface font-label-md text-label-md rounded-full py-sm px-lg">Home</span>
  );
  return (
    <Centre label="SOMETHING BROKE" title="This page hit an unexpected error.">
      {after ? <>{home}{retry}</> : <>{retry}{home}</>}
    </Centre>
  );
}

function NotFound({ after }: { after: boolean }) {
  const h = after ? 'min-h-11' : '';
  const go = (
    <button type="button" className={cn(buttonVariants({ variant: 'default' }), 'gap-xs px-lg', h)}>
      Upcoming events<span className="material-symbols-outlined" aria-hidden>arrow_forward</span>
    </button>
  );
  const home = <button type="button" className={cn(buttonVariants({ variant: 'outline' }), 'px-lg', h)}>Home</button>;
  return (
    <Centre label="404" title="This page doesn't exist.">
      {after ? <>{home}{go}</> : <>{go}{home}</>}
    </Centre>
  );
}

function Centre({ label, title, children }: { label: string; title: string; children: ReactNode }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-md p-md text-center">
      <span className="font-label-md text-label-md text-on-surface-variant">{label}</span>
      <h3 className="font-title-lg text-title-lg text-on-surface">{title}</h3>
      <div className="flex flex-wrap items-center justify-center gap-sm">{children}</div>
    </div>
  );
}

const ITEMS = ['Roundtable', 'Masterclass', 'Poster session', 'Panel discussion', 'Workshop'];

function MoreMenu({ after }: { after: boolean }) {
  const panel = after
    ? 'absolute right-0 z-30 mt-xs w-56 max-h-72 overflow-y-auto bg-surface-container-lowest border border-outline-variant rounded-[12px] p-xs shadow-lg'
    : 'absolute right-0 z-10 mt-xs w-56 max-h-72 overflow-y-auto bg-surface-container-lowest border border-outline-variant rounded-lg p-xs shadow-lg';
  const rowBase = after
    ? 'w-full text-left px-sm py-sm rounded-lg font-body-md text-body-md text-on-surface'
    : 'w-full text-left px-sm py-xs rounded font-body-md text-body-md text-on-surface';
  return (
    <div className="flex h-full flex-col p-md">
      <div className="relative w-fit self-end">
        <Button variant="outline" size="sm">+ More</Button>
        <div className={panel}>
          {ITEMS.map((item, i) => (
            <div
              key={item}
              className={cn(
                rowBase,
                i === 1 && (after ? 'bg-surface-container' : 'bg-surface-container-high'),
                after && i === 0 && 'ring-2 ring-inset ring-primary',
              )}
            >
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SelectDemo({ shadow }: { shadow: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-start gap-xs bg-surface-container p-md">
      <div className="border border-border rounded-lg px-md py-sm font-body-md text-body-md text-on-surface">Choose a body</div>
      <div className={cn('rounded-lg bg-popover text-popover-foreground ring-1 ring-foreground/10 w-56 p-xs', shadow)}>
        {['HKCP', 'MCHK', 'HKAM'].map((o) => (
          <div key={o} className="px-sm py-sm rounded-md font-body-md text-body-md">{o}</div>
        ))}
      </div>
    </div>
  );
}

export default function Batch3Page() {
  return (
    <main className="mx-auto flex max-w-[1200px] flex-col gap-lg p-md">
      <header className="flex flex-col gap-xs">
        <h1 className="font-title-lg text-title-lg text-on-surface">Batch 3 render specimen</h1>
        <p className="font-body-md text-body-md text-on-surface-variant">
          Dev-only. Frames marked REAL render the product component; frames marked COPY reuse the exact class strings of the product or the proposed ones.
        </p>
      </header>

      <Row n={1} name="ConfirmDialog">
        <Frame label="BEFORE" real>
          <Backdrop />
          <ConfirmDialog open title="Delete 3 events?" body="This cannot be undone." confirmLabel="Delete 3 events" tone="danger" onConfirm={noop} onCancel={noop} />
        </Frame>
        <Frame label="AFTER" real={false}>
          <Backdrop />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-md" role="dialog" aria-modal="true">
            <div aria-hidden className="absolute inset-0 bg-on-surface/60" />
            <div className="relative w-full max-w-[420px] rounded-[20px] bg-surface-container-lowest border border-outline-variant shadow-xl p-lg">
              <h2 className="text-[calc(18px*var(--text-scale))] font-bold tracking-[-0.01em] text-on-surface mb-xs">Delete 3 events?</h2>
              <p className="font-body-md text-body-md text-on-surface-variant mb-lg">This cannot be undone.</p>
              <div className="flex justify-end gap-sm">
                <Button variant="outline" className="min-h-11 px-lg">Cancel</Button>
                <Button className="min-h-11 px-lg bg-error text-on-error hover:bg-error/90">Delete 3 events</Button>
              </div>
            </div>
          </div>
        </Frame>
      </Row>

      <Row n={2} name="Discard dialog">
        <Frame label="BEFORE" real>
          <DiscardDialog
            id="b3-discard-before"
            footer={<>
              <Button type="button" variant="outline" className="min-h-11 px-md">Discard changes</Button>
              <Button type="button" className="min-h-11 px-md">Keep editing</Button>
            </>}
          />
        </Frame>
        <Frame label="AFTER" real>
          <DiscardDialog
            id="b3-discard-after"
            footer={<>
              <Button type="button" variant="outline" className="min-h-11 px-md">Keep editing</Button>
              <Button type="button" className="min-h-11 px-md bg-error text-on-error hover:bg-error/90">Discard changes</Button>
            </>}
          />
        </Frame>
      </Row>

      <Row n={3} name="Edit registration dialog">
        <Frame label="BEFORE" real tall><EditDialog id="b3-edit-before" after={false} /></Frame>
        <Frame label="AFTER" real tall><EditDialog id="b3-edit-after" after /></Frame>
        <Frame label="AFTER · email locked" real tall note="shown only when the email cannot change"><EditDialog id="b3-edit-locked" after locked /></Frame>
      </Row>

      <Row n={4} name="Error and not-found buttons">
        <Frame label="BEFORE · error page" real={false}><ErrorPage after={false} /></Frame>
        <Frame label="AFTER · error page" real={false}><ErrorPage after /></Frame>
        <Frame label="BEFORE · 404 page" real={false}><NotFound after={false} /></Frame>
        <Frame label="AFTER · 404 page" real={false}><NotFound after /></Frame>
      </Row>

      <Row n={5} name="+ More menu">
        <Frame label="BEFORE" real={false}><MoreMenu after={false} /></Frame>
        <Frame label="AFTER" real={false}><MoreMenu after /></Frame>
      </Row>

      <Row n={6} name="Roster toast">
        <Frame label="BEFORE" real={false} note="signed-out sentence is sample copy">
          <Roster />
          <ToastDock>
            <div className="rounded-lg px-md py-sm font-body-md text-body-md shadow-lg bg-primary text-on-primary">
              Registered &amp; checked in Dana Lee · 3 CME points.
            </div>
            <div className="rounded-lg px-md py-sm font-body-md text-body-md shadow-lg bg-error text-on-error">
              You&apos;re signed out. <LogIn />
            </div>
          </ToastDock>
        </Frame>
        <Frame label="AFTER" real={false} note="the link toast stays until dismissed; sample copy">
          <Roster />
          <ToastDock>
            <Pill icon="check_circle" tone="text-[#4ADE80]">Registered &amp; checked in Dana Lee · 3 CME points.</Pill>
            <Pill icon="error" tone="text-[#F87171]">You&apos;re signed out. <LogIn /></Pill>
          </ToastDock>
        </Frame>
      </Row>

      <Row n={7} name="Pricing toast">
        <Frame label="BEFORE" real={false}>
          <Backdrop />
          <div className="absolute bottom-md left-1/2 -translate-x-1/2 w-[calc(100%-32px)] max-w-[480px] rounded-xl bg-inverse-surface px-lg py-md text-on-inverse-surface text-body-md shadow-lg">
            Professional — coming soon! We&apos;ll notify you when this plan is available.
          </div>
        </Frame>
        <Frame label="AFTER" real={false}>
          <Backdrop />
          <ToastDock>
            <Pill icon="info" tone="text-white/60">Professional — coming soon! We&apos;ll notify you when this plan is available.</Pill>
          </ToastDock>
        </Frame>
      </Row>

      <Row n={8} name="Select popover shadow">
        <Frame label="BEFORE · shadow-md" real={false}><SelectDemo shadow="shadow-md" /></Frame>
        <Frame label="AFTER · shadow-lg" real={false}><SelectDemo shadow="shadow-lg" /></Frame>
      </Row>
    </main>
  );
}
