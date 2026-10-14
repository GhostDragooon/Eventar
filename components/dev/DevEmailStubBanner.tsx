/**
 * "Email delivery is stubbed" marker. Sibling to ReviewBanner in intent — a
 * bypass that is easy to forget it is on becomes debt fast (see ReviewBanner
 * for the June-era precedent), so this makes the state visible without
 * requiring the operator to remember. Playbook item 3 (2026-08-27 §2.1).
 *
 * Gate is the presence of RESEND_API_KEY only — never the key value itself
 * (CLAUDE.md rule 10, no PII/secret in any user-visible surface). The env
 * lookup happens in server components; the presentational strip
 * (./DevEmailStubStrip) is safe to render from either a server or client
 * component with a pre-computed boolean.
 */
import { emailLive } from '@/lib/email/eventEmails';
import { DevEmailStubStrip } from './DevEmailStubStrip';

/**
 * Server-mount version. Reads RESEND_API_KEY presence, renders the strip when
 * absent, renders null otherwise. Used at the top of the operator dashboard.
 * Not `fixed` — the viewport bottom is taken by ReviewBanner. This one flows
 * with content so both can coexist.
 */
export function DevEmailStubBanner() {
  if (emailLive()) return null;
  return (
    <div className="mb-md">
      <DevEmailStubStrip />
    </div>
  );
}
