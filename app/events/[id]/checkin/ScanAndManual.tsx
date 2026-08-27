'use client';

import { useEffect, useRef, useState } from 'react';
import { isValidRegistrationCode } from '@/lib/registrationCode';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/Dialog';

/**
 * Check-in entry (E.4). Two peer actions — scan a badge, or type the code —
 * each a button that opens a popup. Scan opens the camera panel the parent
 * owns; the code path opens a dialog here.
 *
 * The code dialog's behaviour follows the OTP reference Ivan supplied:
 *   - it submits the moment a complete, well-formed code is present, so a
 *     receptionist working a queue never has to reach for a confirm button;
 *   - a rejected code re-selects the field so the next attempt overwrites it,
 *     and states the reason in an assertive live region;
 *   - a success swaps the icon and moves focus to Done, so the operator can
 *     dismiss and carry on from the keyboard.
 */

type SubmitResult = { ok: true; name: string } | { error: string };
type CodeState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'ok'; name: string }
  | { kind: 'error'; message: string };

export function ScanAndManual({
  onScanClick,
  onManualSubmit,
}: {
  onScanClick: () => void;
  onManualSubmit: (code: string) => Promise<SubmitResult>;
}) {
  const [codeOpen, setCodeOpen] = useState(false);

  return (
    <>
      <div className="grid grid-cols-1 gap-grid-gutter sm:grid-cols-2">
        <Button
          type="button"
          size="lg"
          onClick={onScanClick}
          className="min-h-[64px] w-full gap-sm text-[calc(16px*var(--text-scale))] font-bold"
        >
          <span className="material-symbols-outlined text-[calc(22px*var(--text-scale))]" aria-hidden>
            qr_code_scanner
          </span>
          Scan badge
        </Button>

        <Button
          type="button"
          size="lg"
          variant="outline"
          onClick={() => setCodeOpen(true)}
          className="min-h-[64px] w-full gap-sm text-[calc(16px*var(--text-scale))] font-bold"
        >
          <span className="material-symbols-outlined text-[calc(22px*var(--text-scale))]" aria-hidden>
            keyboard
          </span>
          Enter code
        </Button>
      </div>

      {/* Mounted only while open, so each opening starts from fresh state.
          A dialog that reopens holding the previous attendee's code — or
          their success message — is how the wrong person gets checked in.
          Mounting is the reset; an effect doing it would be a synchronous
          setState in an effect (the DatePicker/TimePicker15 convention). */}
      {codeOpen && <ManualCodeDialog onOpenChange={setCodeOpen} onSubmit={onManualSubmit} />}
    </>
  );
}

function ManualCodeDialog({
  onOpenChange,
  onSubmit,
}: {
  onOpenChange: (open: boolean) => void;
  onSubmit: (code: string) => Promise<SubmitResult>;
}) {
  const [value, setValue] = useState('');
  const [state, setState] = useState<CodeState>({ kind: 'idle' });
  const inputRef = useRef<HTMLInputElement>(null);
  const doneRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (state.kind === 'ok') doneRef.current?.focus();
    // Selecting must happen AFTER the error state renders: during submit the
    // input is disabled, and select() on a disabled input is a silent no-op —
    // which left the rejected code in place and made the next attempt append
    // to it (WK-ZZZZZZWK-ADAWNG). Caught by driving the real dialog.
    if (state.kind === 'error') {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [state.kind]);

  async function submit(code: string) {
    setState({ kind: 'submitting' });
    const res = await onSubmit(code);
    if ('error' in res) {
      // Select (not clear) rather than clear: the operator sees what was
      // rejected, and typing overwrites it in one motion. The selection is
      // applied in the effect above, once the field is enabled again.
      setState({ kind: 'error', message: res.error });
      return;
    }
    setState({ kind: 'ok', name: res.name });
    setValue('');
  }

  function handleChange(raw: string) {
    const next = raw.toUpperCase();
    setValue(next);
    if (state.kind === 'error') setState({ kind: 'idle' });

    // Auto-submit the instant the code is complete and well-formed.
    if (isValidRegistrationCode(next.trim())) void submit(next.trim());
  }

  const submitting = state.kind === 'submitting';

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      title={state.kind === 'ok' ? 'Checked in' : 'Enter code'}
      labelledById="manual-code-title"
      description={
        state.kind === 'ok' ? (
          <span>
            <strong>{state.name}</strong> is checked in.
          </span>
        ) : (
          <span>
            Type the attendee&rsquo;s code. It checks them in as soon as it&rsquo;s complete &mdash; no need to press
            anything.
          </span>
        )
      }
      footer={
        state.kind === 'ok' ? (
          <Button ref={doneRef} type="button" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        ) : undefined
      }
    >
      <div className="flex flex-col items-center gap-md">
        <div
          aria-hidden
          className={
            'grid size-12 shrink-0 place-items-center rounded-full ' +
            (state.kind === 'ok'
              ? 'bg-success-container text-on-success-container'
              : state.kind === 'error'
                ? 'bg-error-container text-on-error-container'
                : 'bg-surface-container text-on-surface-variant')
          }
        >
          <span className="material-symbols-outlined" data-fill={state.kind === 'ok' ? '1' : undefined}>
            {state.kind === 'ok' ? 'check_circle' : state.kind === 'error' ? 'error' : 'keyboard'}
          </span>
        </div>

        {state.kind !== 'ok' && (
          <>
            <label htmlFor="manual-code-input" className="sr-only">
              Registration code
            </label>
            <input
              id="manual-code-input"
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => handleChange(e.target.value)}
              disabled={submitting}
              placeholder="XXXXXX"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={state.kind === 'error' || undefined}
              aria-describedby={state.kind === 'error' ? 'manual-code-error' : 'manual-code-hint'}
              className={
                'w-full rounded-lg border-2 bg-surface-container-lowest px-md py-sm text-center font-mono text-[calc(24px*var(--text-scale))] uppercase tracking-[0.16em] text-on-surface focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 ' +
                (state.kind === 'error' ? 'border-error' : 'border-outline-variant')
              }
            />

            {state.kind === 'error' ? (
              <p
                id="manual-code-error"
                role="alert"
                className="text-center font-body-md text-body-md text-error"
              >
                {state.message}
              </p>
            ) : (
              <p
                id="manual-code-hint"
                className="text-center font-label-md text-label-md text-on-surface-variant"
              >
                {submitting ? 'Checking in…' : '6 characters (no 0, O, 1, I, or L). Legacy WK- codes also accepted.'}
              </p>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}
