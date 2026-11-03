import 'server-only';
import { getUnlinkedRegistrationCount } from './actions';

/** The guest-registration count for the claim banner. Advisory: a failed or throwing read is 0 (no banner), it never breaks the page. Both are logged (code or error name only, no PII) so a persistent failure is not mistaken for "nothing to claim". */
export async function readUnlinkedCount(): Promise<number> {
  try {
    const res = await getUnlinkedRegistrationCount();
    if (res.ok) return res.data.count;
    console.error('[readUnlinkedCount] read failed', { code: res.error });
    return 0;
  } catch (e) {
    console.error('[readUnlinkedCount] read threw', { name: e instanceof Error ? e.name : 'unknown' });
    return 0;
  }
}
