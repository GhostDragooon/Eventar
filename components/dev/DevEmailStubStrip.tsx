/**
 * Presentational strip. No env read — the caller passes `show` (server-side
 * env boolean) or renders it unconditionally in a context that already knows.
 * Used inline from RegisterCard's success block, which is client-side.
 *
 * Its own file so that client import never reaches DevEmailStubBanner, whose
 * env read goes through lib/email/eventEmails.ts and so through server-only
 * modules that cannot enter a client bundle.
 */
export function DevEmailStubStrip() {
  return (
    <div
      role="status"
      className="rounded-lg border border-[color:var(--warning,#B26B00)] bg-[color:var(--warning-container,#F9EFD9)] px-md py-sm text-body-sm text-[color:var(--warning,#B26B00)]"
    >
      Email delivery: development stub (no inbox).
    </div>
  );
}
