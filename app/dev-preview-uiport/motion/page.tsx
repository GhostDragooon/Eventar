'use client';

// SPECIMEN (dev-only). Not the live app. "Before" frames use the real product
// primitives where one exists (Button, Dialog); "After" frames are labelled COPY
// because they carry the proposed motion in specimen-local CSS. Nothing here is
// wired into a product screen. Delete with batch3/ at close.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { animate, motion, useMotionValue, type PanInfo } from 'motion/react';
import { Tooltip } from '@base-ui/react/tooltip';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/Dialog';
import { applyTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';

const EASE_OVERLAY = 'cubic-bezier(0.32, 0.72, 0, 1)';
const EASE_SLIDE = 'cubic-bezier(0.77, 0, 0.175, 1)';

const CSS = `
@keyframes spec-overlay-in { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: scale(1); } }
@keyframes spec-toast-in { from { opacity: 0; transform: translateY(100%); } to { opacity: 1; transform: translateY(0); } }
@keyframes spec-toast-out { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(100%); } }
@keyframes spec-fade-up { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
.spec-overlay-after { animation: spec-overlay-in 250ms ${EASE_OVERLAY}; }
.spec-press-before { transition: all 150ms; }
.spec-press-before:active { transform: translateY(1px); }
.spec-press-after { transition: scale 150ms ease-out; }
.spec-press-after:active { scale: 0.97; }
.spec-toast-in { animation: spec-toast-in 250ms ${EASE_OVERLAY} both; }
.spec-toast-out { animation: spec-toast-out 200ms ease-in both; }
.spec-fade-up { animation: spec-fade-up 200ms ease-out both; }
.spec-details-after { interpolate-size: allow-keywords; }
.spec-details-after::details-content { block-size: 0; overflow: clip; transition: block-size 250ms ${EASE_OVERLAY}, content-visibility 250ms allow-discrete; }
.spec-details-after[open]::details-content { block-size: auto; }
.theme-switching, .theme-switching * { transition: none !important; }
@media (prefers-reduced-motion: reduce) {
  .spec-overlay-after, .spec-toast-in, .spec-toast-out, .spec-fade-up { animation: none; }
  .spec-press-after:active { scale: 1; }
  .spec-details-after::details-content { transition: none; }
  .spec-slide, .spec-underline-after, .spec-bar-after { transition: none !important; }
}
`;

function Frame({ label, tag, note, tall, children }: { label: string; tag: 'REAL' | 'COPY'; note?: string; tall?: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-xs">
      <div className="flex flex-wrap items-center gap-sm font-label-md text-label-md text-on-surface">
        <span>{label}</span>
        <span className="rounded-full border border-outline-variant px-sm text-on-surface-variant">{tag}</span>
        {note && <span className="font-body-md text-body-md text-on-surface-variant">{note}</span>}
      </div>
      <div className={cn('relative overflow-hidden rounded-[12px] border border-outline-variant bg-surface [transform:translateZ(0)]', tall ? 'h-[420px]' : 'h-[280px]')}>
        {children}
      </div>
    </div>
  );
}

function Row({ n, name, pattern, children }: { n: number; name: string; pattern: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-md">
      <div>
        <h2 className="font-title-lg text-title-lg text-on-surface">{`${n} · ${name}`}</h2>
        <p className="font-body-md text-body-md text-on-surface-variant">{pattern}</p>
      </div>
      <div className="grid gap-md md:grid-cols-2">{children}</div>
    </section>
  );
}

function Replay({ onClick, label = 'Replay' }: { onClick: () => void; label?: string }) {
  return (
    <Button variant="outline" size="sm" onClick={onClick} className="absolute right-sm top-sm z-10 min-h-9">
      {label}
    </Button>
  );
}

const Backdrop = () => (
  <div className="absolute inset-0 flex flex-col gap-sm p-md" aria-hidden>
    <div className="h-8 w-1/3 rounded-lg bg-surface-container" />
    <div className="h-14 rounded-lg bg-surface-container" />
    <div className="h-14 rounded-lg bg-surface-container" />
  </div>
);

/* 1 — overlay enter */
function OverlayRow() {
  const [run, setRun] = useState(0);
  const [dlg, setDlg] = useState(false);
  return (
    <Row n={1} name="Overlay enter" pattern="Pattern 1: scale from 0.97, opacity, 250ms cubic-bezier(0.32, 0.72, 0, 1). Applies to Dialog, ConfirmDialog and the 7 menus.">
      <Frame label="Before: Dialog (translateY 8 + scale 0.98, 180ms)" tag="REAL" note="Dialog is position:fixed, so it opens over the page, not inside the frame.">
        <Backdrop />
        <div className="absolute inset-0 grid place-items-center">
          <Button onClick={() => setDlg(true)}>Open real Dialog</Button>
        </div>
        <Dialog open={dlg} onOpenChange={setDlg} title="Edit registration" footer={<Button onClick={() => setDlg(false)}>Close</Button>}>
          <p className="font-body-md text-body-md">Real Dialog, current animation.</p>
        </Dialog>
      </Frame>
      <Frame label="After: panel + menu (scale 0.97 → 1, 250ms)" tag="COPY">
        <Replay onClick={() => setRun((r) => r + 1)} />
        <Backdrop />
        <div key={run} className="absolute inset-0 grid place-items-center">
          <div className="absolute inset-0 bg-on-surface/60" />
          <div className="spec-overlay-after relative w-72 rounded-[20px] border border-outline-variant bg-surface-container-lowest p-lg shadow-xl">
            <div className="font-headline-sm text-headline-sm text-on-surface">Edit registration</div>
            <p className="mt-xs font-body-md text-body-md text-on-surface-variant">Specimen of the proposed enter.</p>
          </div>
        </div>
        <div key={`m${run}`} className="spec-overlay-after absolute bottom-md left-md w-48 origin-bottom-left rounded-[12px] border border-outline-variant bg-surface-container-lowest p-xs shadow-lg">
          {['History', 'Profile', 'Sign out'].map((t) => (
            <div key={t} className="rounded-lg px-sm py-sm font-body-md text-body-md text-on-surface">{t}</div>
          ))}
        </div>
      </Frame>
    </Row>
  );
}

/* 2 — press */
function PressRow() {
  return (
    <Row n={2} name="Press feedback" pattern="Pattern 2: scale 0.97 on :active, transition on scale only (150ms ease-out). Replaces translate-y-px + transition-all.">
      <Frame label="Before: real Button + translateY(1px)" tag="REAL" note="Hold the mouse down on each button.">
        <div className="absolute inset-0 flex flex-wrap items-center justify-center gap-md p-md">
          <Button className="spec-press-before">Register</Button>
          <Button variant="outline" className="spec-press-before">Cancel</Button>
        </div>
      </Frame>
      <Frame label="After: scale(0.97), scale-only transition" tag="COPY" note="Same Button classes + specimen press class.">
        <div className="absolute inset-0 flex flex-wrap items-center justify-center gap-md p-md">
          <Button className="spec-press-after">Register</Button>
          <Button variant="outline" className="spec-press-after">Cancel</Button>
        </div>
      </Frame>
    </Row>
  );
}

/* 3 — shake */
const SHAKE_OLD = [0, -10, 10, -6, 6, -3, 0];
const SHAKE_NEW = [0, -7, 7, -4, 4, 0];

function ShakeRow() {
  const oldRef = useRef<HTMLParagraphElement>(null);
  const newRef = useRef<HTMLParagraphElement>(null);
  const [shown, setShown] = useState(false);
  function fire(ref: { current: HTMLElement | null }, xs: number[], ms: number) {
    setShown(true);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      el.animate({ transform: xs.map((x) => `translateX(${x}px)`) }, { duration: ms, easing: 'ease-out' });
    });
  }
  const cls = 'rounded-lg border border-error bg-error-container px-md py-sm font-body-md text-body-md text-error';
  return (
    <Row n={3} name="Shake on error (revised)" pattern="Pattern 3, dialled back. Banner only. Was ±10px over 360ms (3 cycles, 8.3 Hz); revised is ±7px over 300ms (2 cycles, 6.7 Hz, 20% lower). Click Register several times in each frame.">
      <Frame label="Was: ±10px, 360ms (too violent)" tag="COPY">
        <div className="absolute inset-0 flex flex-col justify-center gap-md p-md">
          {shown && <p ref={oldRef} role="alert" className={cls}>Enter a valid email address.</p>}
          <Button onClick={() => fire(oldRef, SHAKE_OLD, 360)}>Register</Button>
        </div>
      </Frame>
      <Frame label="Revised: ±7px, 300ms, 2 cycles" tag="COPY" note="Proposed.">
        <div className="absolute inset-0 flex flex-col justify-center gap-md p-md">
          {shown && <p ref={newRef} role="alert" className={cls}>Enter a valid email address.</p>}
          <Button onClick={() => fire(newRef, SHAKE_NEW, 300)}>Register</Button>
        </div>
      </Frame>
    </Row>
  );
}

function Panel({ i }: { i: number }) {
  return (
    <div className="absolute inset-0 flex flex-col justify-center gap-sm p-md">
      <div className="font-title-lg text-title-lg text-on-surface">{`Step ${i + 1} of 3`}</div>
      <div className="h-10 rounded-lg bg-surface-container" />
      <div className="h-10 rounded-lg bg-surface-container" />
    </div>
  );
}

/* 4 — directional slides */
function StepsRow() {
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const go = (d: number) => {
    setDir(d);
    setStep((s) => Math.min(2, Math.max(0, s + d)));
  };
  return (
    <Row n={4} name="Directional slides" pattern="Pattern 4: next slides in from the right, back from the left, 350ms cubic-bezier(0.77, 0, 0.175, 1). Only CompleteClient is a real wizard.">
      <Frame label="Before: fade + translateY 8px, no direction" tag="REAL" note="Same classes as CompleteClient StepPanel.">
        <div className="absolute inset-0">
          <div key={step} className="spec-fade-up absolute inset-0"><Panel i={step} /></div>
          <div className="absolute bottom-md right-md flex gap-sm">
            <Button variant="outline" onClick={() => go(-1)} disabled={step === 0}>Back</Button>
            <Button onClick={() => go(1)} disabled={step === 2}>Next</Button>
          </div>
        </div>
      </Frame>
      <Frame label={`After: slides ${dir > 0 ? 'in from right' : 'in from left'}`} tag="COPY">
        <div className="absolute inset-0 overflow-clip">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="spec-slide absolute inset-0"
              style={{
                transform: `translateX(${(i - step) * 100}%)`,
                transition: `transform 350ms ${EASE_SLIDE}`,
              }}
              aria-hidden={i !== step}
            >
              <Panel i={i} />
            </div>
          ))}
          <div className="absolute bottom-md right-md z-10 flex gap-sm">
            <Button variant="outline" onClick={() => go(-1)} disabled={step === 0}>Back</Button>
            <Button onClick={() => go(1)} disabled={step === 2}>Next</Button>
          </div>
        </div>
      </Frame>
    </Row>
  );
}

/* 5 — height auto */
function HeightRow() {
  const body = <p className="px-md pb-md font-body-md text-body-md text-on-surface-variant">Answer text. This block animates from height 0 to auto and back.</p>;
  const sum = 'cursor-pointer list-none px-md py-md font-body-md text-body-md font-semibold text-on-surface';
  return (
    <Row n={5} name="Smooth height: auto" pattern="Pattern 5: interpolate-size + ::details-content block-size, 250ms. Fixes native <details> and the undefined accordion keyframes.">
      <Frame label="Before: native details, instant" tag="REAL">
        <div className="absolute inset-0 p-md">
          <details className="rounded-[12px] border border-outline-variant bg-surface-container-lowest"><summary className={sum}>How do I link past registrations?</summary>{body}</details>
        </div>
      </Frame>
      <Frame label="After: height 0 → auto" tag="COPY">
        <div className="absolute inset-0 p-md">
          <details className="spec-details-after rounded-[12px] border border-outline-variant bg-surface-container-lowest"><summary className={sum}>How do I link past registrations?</summary>{body}</details>
        </div>
      </Frame>
    </Row>
  );
}

/* 6 — toast + tab underline + bar */
function TransformRow() {
  const [toastRun, setToastRun] = useState(0);
  const [phase, setPhase] = useState<'in' | 'out' | 'gone'>('gone');
  const [tab, setTab] = useState(0);
  const [pct, setPct] = useState(30);
  const tabs = ['Upcoming', 'Past', 'Saved'];
  const widths = [96, 56, 64];
  const lefts = [0, 96 + 8, 96 + 8 + 56 + 8];
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  function replayToast() {
    timers.current.forEach(clearTimeout);
    setToastRun((r) => r + 1);
    setPhase('in');
    timers.current = [setTimeout(() => setPhase('out'), 2000), setTimeout(() => setPhase('gone'), 2200)];
  }
  useEffect(() => {
    const t = timers;
    return () => t.current.forEach(clearTimeout);
  }, []);
  const toastBody = (
    <div className="pointer-events-auto flex w-full items-center gap-sm rounded-[12px] bg-[#0A0A0A] px-md py-sm font-medium text-white shadow-lg text-[calc(13px*var(--text-scale))]">
      <span className="material-symbols-outlined text-[#4ADE80]" aria-hidden>check_circle</span>
      <span className="flex-1">Registration saved</span>
    </div>
  );
  return (
    <Row n={6} name="Transform, not layout" pattern="Pattern 6: toast enter/exit by translateY; tab underline by translateX + scaleX; progress fill by scaleX.">
      <Frame label="Before: toast pops in and out, tab by left/width, bar by width" tag="COPY">
        <Replay onClick={replayToast} label="Replay toast" />
        <div className="absolute inset-x-md top-md flex flex-col gap-md">
          <div className="relative h-9">
            {tabs.map((t, i) => (
              <button key={t} type="button" onClick={() => setTab(i)} className="absolute top-0 h-9 font-body-md text-body-md" style={{ left: lefts[i], width: widths[i] }}>{t}</button>
            ))}
            <span className="absolute bottom-0 h-0.5 bg-primary" style={{ left: lefts[tab], width: widths[tab], transition: 'left 250ms, width 250ms' }} />
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-container"><div className="h-full bg-primary" style={{ width: `${pct}%`, transition: 'width 400ms' }} /></div>
          <Button variant="outline" onClick={() => setPct((p) => (p >= 90 ? 10 : p + 30))}>Advance bar</Button>
        </div>
        {phase !== 'gone' && <div className="absolute inset-x-md bottom-md">{toastBody}</div>}
      </Frame>
      <Frame label="After: translate in/out, underline transform, bar scaleX" tag="COPY">
        <Replay onClick={replayToast} label="Replay toast" />
        <div className="absolute inset-x-md top-md flex flex-col gap-md">
          <div className="relative h-9">
            {tabs.map((t, i) => (
              <button key={t} type="button" onClick={() => setTab(i)} className="absolute top-0 h-9 font-body-md text-body-md" style={{ left: lefts[i], width: widths[i] }}>{t}</button>
            ))}
            <span
              className="spec-underline-after absolute bottom-0 left-0 h-0.5 w-px origin-left bg-primary"
              style={{ transform: `translateX(${lefts[tab]}px) scaleX(${widths[tab]})`, transition: `transform 250ms ${EASE_OVERLAY}` }}
            />
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-container">
            <div className="spec-bar-after h-full origin-left bg-primary" style={{ transform: `scaleX(${pct / 100})`, transition: `transform 400ms ${EASE_OVERLAY}` }} />
          </div>
          <Button variant="outline" onClick={() => setPct((p) => (p >= 90 ? 10 : p + 30))}>Advance bar</Button>
        </div>
        {phase !== 'gone' && (
          <div key={toastRun} className={cn('absolute inset-x-md bottom-md', phase === 'out' ? 'spec-toast-out' : 'spec-toast-in')}>{toastBody}</div>
        )}
      </Frame>
    </Row>
  );
}

/* 7 — theme */
function ThemeRow() {
  const [log, setLog] = useState('');
  const sw = 'size-16 rounded-lg border border-outline-variant bg-surface-container transition-colors duration-500';
  function toggle(guarded: boolean) {
    const root = document.documentElement;
    const next = root.classList.contains('dark') ? 'light' : 'dark';
    if (guarded) root.classList.add('theme-switching');
    applyTheme(next);
    const running = document.getAnimations().filter((a) => a instanceof CSSTransition).length;
    setLog(`${guarded ? 'After' : 'Before'}: ${running} colour transitions running right after the switch`);
    if (guarded) {
      void root.offsetHeight;
      requestAnimationFrame(() => root.classList.remove('theme-switching'));
    }
  }
  return (
    <Row n={7} name="Instant theme switch" pattern="Pattern 7: a .theme-switching class disables transitions for one frame while the theme class swaps. Toggles the whole page theme (not persisted).">
      <Frame label="Before: applyTheme as it is today" tag="REAL">
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-md">
          <div className="flex gap-sm">{[0, 1, 2, 3].map((i) => <div key={i} className={sw} />)}</div>
          <Button onClick={() => toggle(false)}>Toggle theme</Button>
        </div>
      </Frame>
      <Frame label="After: .theme-switching for one frame" tag="COPY" note={log || 'Toggle, then read the count.'}>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-md">
          <div className="flex gap-sm">{[0, 1, 2, 3].map((i) => <div key={i} className={sw} />)}</div>
          <Button onClick={() => toggle(true)}>Toggle theme</Button>
        </div>
      </Frame>
    </Row>
  );
}

/* 8 — tooltip */
function TipRow() {
  const icons = ['edit', 'content_copy', 'delete', 'download'];
  const names = ['Edit event', 'Duplicate event', 'Delete event', 'Export list'];
  const btn = 'grid size-11 place-items-center rounded-full text-on-surface hover:bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary';
  return (
    <Row n={8} name="Tooltip skip delay" pattern="Pattern 8: delay 600ms to open; once one is open, moving to the next opens at once for 300ms. base-ui Tooltip.">
      <Frame label="Before: native title= attribute" tag="REAL" note="Browser delay, no grouping.">
        <div className="absolute inset-0 flex items-center justify-center gap-sm">
          {icons.map((ic, i) => (
            <button key={ic} type="button" title={names[i]} aria-label={names[i]} className={btn}>
              <span className="material-symbols-outlined" aria-hidden>{ic}</span>
            </button>
          ))}
        </div>
      </Frame>
      <Frame label="After: base-ui Tooltip, delay 600 / timeout 300" tag="COPY" note="Hover the first, then slide across.">
        <Tooltip.Provider delay={600} timeout={300}>
          <div className="absolute inset-0 flex items-center justify-center gap-sm">
            {icons.map((ic, i) => (
              <Tooltip.Root key={ic}>
                <Tooltip.Trigger render={<button type="button" aria-label={names[i]} className={btn} />}>
                  <span className="material-symbols-outlined" aria-hidden>{ic}</span>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Positioner sideOffset={6}>
                    <Tooltip.Popup className="rounded-lg bg-on-surface px-sm py-xs font-label-md text-label-md text-surface shadow-lg transition-opacity duration-150 data-[starting-style]:opacity-0 data-[instant]:duration-0">
                      {names[i]}
                    </Tooltip.Popup>
                  </Tooltip.Positioner>
                </Tooltip.Portal>
              </Tooltip.Root>
            ))}
          </div>
        </Tooltip.Provider>
      </Frame>
    </Row>
  );
}

/* 9 + 10 — sheet */
function Sheet({ onClose }: { onClose: () => void }) {
  const y = useMotionValue(0);
  const ref = useRef<HTMLDivElement>(null);
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function onEnd(_: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) {
    const h = ref.current?.offsetHeight ?? 300;
    if (info.offset.y > h * 0.4 || info.velocity.y > 500) {
      animate(y, h, { type: 'spring', bounce: 0, duration: reduce ? 0 : 0.3, velocity: info.velocity.y }).then(onClose);
    } else {
      animate(y, 0, { type: 'spring', bounce: 0, duration: reduce ? 0 : 0.35, velocity: info.velocity.y });
    }
  }
  return (
    <div className="absolute inset-0 z-20">
      <div aria-hidden onClick={onClose} className="absolute inset-0 bg-on-surface/60" />
      <motion.div
        ref={ref}
        role="dialog"
        aria-label="Account menu"
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0.15, bottom: 0.6 }}
        dragMomentum={false}
        onDragEnd={onEnd}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', bounce: 0, duration: reduce ? 0 : 0.4 }}
        style={{ y }}
        className="absolute inset-x-0 bottom-0 touch-none rounded-t-[20px] border border-outline-variant bg-surface-container-lowest p-md pb-lg shadow-xl"
      >
        <div className="mx-auto mb-md h-1 w-10 rounded-full bg-outline-variant" aria-hidden />
        <div className="overscroll-contain">
          {['History', 'Profile', 'Account', 'Sign out'].map((t) => (
            <div key={t} className="rounded-lg px-sm py-sm font-body-md text-body-md text-on-surface">{t}</div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

function SheetRow() {
  const [open, setOpen] = useState(false);
  const [popover, setPopover] = useState(false);
  return (
    <Row n={9} name="Velocity spring + rubber band (sheet)" pattern="Patterns 9 + 10: drag the sheet down. Past 40% height or a fast flick dismisses with the release velocity (spring, bounce 0). Pulling up resists asymptotically, then springs to 0.">
      <Frame label="Before: popover menu on a phone width" tag="COPY" note="No drag, no spring; anchored popover.">
        <Backdrop />
        <div className="absolute right-md top-md">
          <Button onClick={() => setPopover((v) => !v)}>Account</Button>
          {popover && (
            <div className="absolute right-0 mt-xs w-48 rounded-[12px] border border-outline-variant bg-surface-container-lowest p-xs shadow-lg">
              {['History', 'Profile', 'Sign out'].map((t) => (
                <div key={t} className="rounded-lg px-sm py-sm font-body-md text-body-md text-on-surface">{t}</div>
              ))}
            </div>
          )}
        </div>
      </Frame>
      <Frame label="After: draggable bottom sheet" tag="COPY" tall note="Drag down, flick, and pull up.">
        <Backdrop />
        <div className="absolute right-md top-md z-10"><Button onClick={() => setOpen(true)}>Account</Button></div>
        {open && <Sheet onClose={() => setOpen(false)} />}
      </Frame>
    </Row>
  );
}

export default function MotionSpecimen() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-xxl p-lg">
      <style>{CSS}</style>
      <header className="flex flex-col gap-xs">
        <h1 className="font-headline-lg text-headline-lg text-on-surface">Motion specimen: 10 patterns</h1>
        <p className="font-body-md text-body-md text-on-surface-variant">
          Dev-only specimen, not the live app. REAL = current product component. COPY = specimen of the current or proposed motion. Pick or reject each row; nothing here is applied.
        </p>
      </header>
      <OverlayRow />
      <PressRow />
      <ShakeRow />
      <StepsRow />
      <HeightRow />
      <TransformRow />
      <ThemeRow />
      <TipRow />
      <SheetRow />
    </main>
  );
}
