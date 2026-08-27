/**
 * "Email delivery is stubbed" marker. Sibling to ReviewBanner in intent — a
 * bypass that is easy to forget it is on becomes debt fast (see ReviewBanner
 * for the June-era precedent), so this makes the state visible without
 * requiring the operator to remember. Playbook item 3 (2026-08-27 §2.1).
 *
 * Gate is the presence of RESEND_API_KEY only — never the key value itself
 * (CLAUDE.md rule 10, no PII/secret in any user-visible surface). The env
 * lookup happens in server components; the presentational strip below is safe
 * to render from either a server or client component with a pre-computed
 * boolean.
 */

/**
 * Presentational strip. No env read — the caller passes `show` (server-side
 * env boolean) or renders it unconditionally in a context that already knows.
 * Used inline from RegisterCard's success block, which is client-side.
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

/**
 * Server-mount version. Reads RESEND_API_KEY presence, renders the strip when
 * absent, renders null otherwise. Used at the top of the operator dashboard.
 * Not `fixed` — the viewport bottom is taken by ReviewBanner. This one flows
 * with content so both can coexist.
 */
export function DevEmailStubBanner() {
  if (process.env.RESEND_API_KEY) return null;
  return (
    <div className="mb-md">
      <DevEmailStubStrip />
    </div>
  );
}
