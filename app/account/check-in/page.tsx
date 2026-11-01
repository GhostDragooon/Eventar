import { AccountShell } from '@/components/shell/AccountShell';
import { CHECKIN_OPEN_MINUTES } from '@/lib/lifecycle/eventLifecycle';
import { loadMyRegistrations } from '../loadMyRegistrations';
import { opensWithinADay, splitRegistrations } from '../myRegistrations';
import { EmptyState, LoadFailed, PageHeader, Rows, Section } from '../registrations/RegistrationRows';

export const metadata = { title: 'Check-in' };
export const dynamic = 'force-dynamic';

// Doctrine 2026-10-30 section 2: "Today's pass/QR/code; open/closed status". The pass itself is /checkin/confirm
// (it shows the QR and code); this page is the way to it from the portal. No capture here: that is the organiser's
// desk, and no offline or Bluetooth path is built.
export default async function AttendeeCheckinPage() {
  const { items, failed } = await loadMyRegistrations('/account/check-in');
  // eslint-disable-next-line react-hooks/purity -- the server's clock at render, handed down so the page is one consistent snapshot
  const nowMs = Date.now();
  const { live, upcoming } = splitRegistrations(items, nowMs);
  const soon = upcoming.filter((r) => opensWithinADay(r, nowMs));

  return (
    <AccountShell>
      <div className="mx-auto w-full max-w-2xl space-y-md px-grid-margin py-xl">
        <PageHeader
          title="Check-in"
          lead={`Show your pass to the organiser at the door. Check-in opens ${CHECKIN_OPEN_MINUTES} minutes before an event starts and closes when it ends.`}
        />
        {failed && <LoadFailed />}
        {!failed && live.length + soon.length === 0 && (
          <EmptyState action={{ href: '/account/registrations', label: 'See my registrations' }}>
            Nothing to check in to right now. Your pass appears here when an event you registered for is about to start.
          </EmptyState>
        )}
        {live.length > 0 && (
          <Section title="Open now">
            <Rows items={live} mode="pass" nowMs={nowMs} />
          </Section>
        )}
        {soon.length > 0 && (
          <Section title="Opening soon">
            <Rows items={soon} mode="pass" nowMs={nowMs} />
          </Section>
        )}
      </div>
    </AccountShell>
  );
}
