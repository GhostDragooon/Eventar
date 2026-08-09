/**
 * Backtest the pass-delivery module against the REAL database.
 * Runs the exact queries app/events/[id]/details/page.tsx issues — not mocks —
 * and feeds the real rows through the real derivation.
 */
import { createClient } from '@supabase/supabase-js';
import { summariseDelivery, type DeliveryLogRow } from '@/lib/delivery/deliveryStatus';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const db = createClient(url, key, { auth: { persistSession: false } });

let bad = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '  ok  ' : '  FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) bad++;
};

async function main() {
  const { data: ev } = await db
    .from('events')
    .select('id, title, status')
    .eq('title', 'Clinical Update Seminar 2026')
    .maybeSingle();
  if (!ev) throw new Error('fixture event missing — run seed-demo first');
  console.log(`\nBacktest — ${ev.title} (${ev.status})\n`);

  // EXACT registrations query from page.tsx (post-change, incl. full_name).
  const { data: regs, error: regErr } = await db
    .from('registrations')
    .select('id, status, check_in_at, check_in_method, registered_at, full_name')
    .eq('event_id', ev.id);
  check('registrations query executes', !regErr, regErr?.message ?? '');
  check('full_name really comes back', !!regs?.[0] && 'full_name' in regs[0], `${regs?.length ?? 0} rows`);
  check('full_name is populated, not null', !!regs?.[0]?.full_name, String(regs?.[0]?.full_name));

  // EXACT delivery query from page.tsx — the one that has never run for real.
  const { data: rows, error: logErr } = await db
    .from('email_log')
    .select('registration_id, purpose, status')
    .eq('event_id', ev.id)
    .not('registration_id', 'is', null);
  check('email_log delivery query executes', !logErr, logErr?.message ?? '');
  check('returned rows have the 3 expected keys', !rows?.length || ['registration_id', 'purpose', 'status'].every((k) => k in rows[0]), JSON.stringify(rows?.[0] ?? {}));
  check('no NULL registration_id survived the filter', (rows ?? []).every((r) => r.registration_id !== null), `${rows?.length ?? 0} rows`);

  // Real statuses must be inside the union the module types claim.
  const statuses = new Set((rows ?? []).map((r) => r.status));
  check('every real status is a known value', [...statuses].every((s) => ['queued', 'sent', 'failed'].includes(s as string)), [...statuses].join(','));
  const purposes = new Set((rows ?? []).map((r) => r.purpose));
  console.log(`        purposes present: ${[...purposes].join(', ') || '(none)'}`);

  // The real derivation over real rows.
  const registered = (regs ?? []).filter((r) => r.status === 'registered').map((r) => ({ id: r.id, full_name: r.full_name }));
  const out = summariseDelivery(registered, (rows ?? []) as DeliveryLogRow[], 'reminder');
  check('one summary per registered attendee', out.length === registered.length, `${out.length}/${registered.length}`);

  const counts = out.reduce<Record<string, number>>((a, s) => ((a[s.state] = (a[s.state] ?? 0) + 1), a), {});
  console.log(`        derived states: ${JSON.stringify(counts)}`);

  // Ground truth: how many reminders were actually SENT in the DB?
  const actuallySent = new Set(
    (rows ?? []).filter((r) => r.purpose === 'reminder' && r.status === 'sent').map((r) => r.registration_id),
  );
  const derivedSent = out.filter((s) => s.state === 'sent').length;
  check('derived "sent" matches the database', derivedSent === actuallySent.size, `derived ${derivedSent} vs db ${actuallySent.size}`);

  // A queued row (dev stub — RESEND_API_KEY unset locally) must NOT read as sent.
  const queued = (rows ?? []).filter((r) => r.purpose === 'reminder' && r.status === 'queued').length;
  if (queued > 0) {
    check('a real queued row is not reported as delivered', derivedSent === actuallySent.size && counts.logged_not_emailed > 0, `${queued} queued → ${counts.logged_not_emailed ?? 0} logged_not_emailed`);
  }

  console.log(`\n${bad === 0 ? 'BACKTEST PASS' : `BACKTEST FAIL (${bad})`}\n`);
  process.exit(bad === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
