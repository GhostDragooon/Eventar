'use client';

import { useState, useTransition } from 'react';
import { selfCheckIn } from './actions';
import { Button } from '@/components/ui/button';

// The success banner used to render here, but user-lens 2026-08-26 caught
// that `revalidatePath('/checkin/confirm')` in selfCheckIn replaces the whole
// PassView subtree with CheckedInView in the same React 19 transition as the
// local `setState({kind:'ok', credit})` — the child never got a paint frame.
// The banner now lives in the RSC's CheckedInView (page.tsx), reading the
// ledger directly, which also closes the return-visit gap. This component is
// now just the button + its error state (which does not revalidate).
type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string };

export default function ConfirmButton({
  code,
}: {
  code: string;
}) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [, startTransition] = useTransition();

  function onClick() {
    setState({ kind: 'loading' });
    startTransition(async () => {
      const res = await selfCheckIn(code);
      if ('error' in res) {
        setState({ kind: 'error', message: res.error });
      }
      // Success: revalidatePath swaps PassView → CheckedInView; this
      // component unmounts before any local ok-state could paint.
    });
  }

  // Mockup CI-6: full-width primary "Confirm I'm here". `h-12` overrides the
  // Button primitive's `size='default'` h-8 (32px) — dev-lens 2026-08-26
  // caught the CTA had shrunk from ~48-56px, well under WCAG's 44px touch
  // target. Compact label (mockup verbatim) — the previous "I'm here —
  // confirm check-in" was wordier and added an icon the mockup doesn't show.
  return (
    <div className="flex flex-col gap-sm">
      <Button
        type="button"
        onClick={onClick}
        disabled={state.kind === 'loading'}
        // Was hand-rolled to get a visible focus ring: the base layer set an
        // outline *colour* but no width, so it fell back to the low-contrast
        // UA ring. The shared Button supplies its own `focus-visible:ring-3`,
        // which is what that workaround was reaching for — so the ring is
        // kept, not lost, by moving onto the primitive.
        className="h-12 w-full px-md py-md font-label-md text-body-md font-bold active:scale-[0.99]"
      >
        {state.kind === 'loading' ? 'Checking in…' : "Confirm I'm here"}
      </Button>
      {state.kind === 'error' && (
        <p
          role="alert"
          className="font-body-md text-body-md text-error bg-error-container border border-error-container rounded-lg px-md py-sm flex items-start gap-sm m-0"
        >
          <span className="material-symbols-outlined text-[calc(18px*var(--text-scale))] mt-[2px]" aria-hidden>warning</span>
          <span>{state.message}</span>
        </p>
      )}
    </div>
  );
}
