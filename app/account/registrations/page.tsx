import Link from 'next/link';
import { AccountShell } from '@/components/shell/AccountShell';
import { loadMyRegistrations } from '../loadMyRegistrations';
import { splitRegistrations } from '../myRegistrations';
import { EmptyState, LoadFailed, OUTLINE_LINK, PageHeader, Rows, Section } from './RegistrationRows';

export const metadata = { title: 'Registrations' };
export const dynamic = 'force-dynamic';

// Doctrine 2026-10-30 section 2: "Upcoming + live sign-ups; empty -> Events". Past events are History.
export default async function RegistrationsPage() {
  const { items, failed } = await loadMyRegistrations('/account/registrations');
  // eslint-disable-next-line react-hooks/purity -- the server's clock at render, handed down so the page is one consistent snapshot
  const nowMs = Date.now();
  const { live, upcoming } = splitRegistrations(items, nowMs);

  return (
    <AccountShell>
      <div className="mx-auto w-full max-w-2xl space-y-md px-grid-margin py-xl">
        <PageHeader title="Registrations" lead="The events you have signed up for." />
        {failed && <LoadFailed />}
        {!failed && live.length + upcoming.length === 0 && (
          <EmptyState action={{ href: '/events', label: 'Find events' }}>
            You are not registered for any upcoming events. Past events are in History.
          </EmptyState>
        )}
        {live.length > 0 && (
          <Section title="Check-in is open">
            <Rows items={live} mode="list" nowMs={nowMs} />
          </Section>
        )}
        {upcoming.length > 0 && (
          <Section title="Upcoming">
            <Rows items={upcoming} mode="list" nowMs={nowMs} />
          </Section>
        )}
        {live.length + upcoming.length > 0 && (
          <Link href="/events" className={OUTLINE_LINK}>
            Find more events
          </Link>
        )}
      </div>
    </AccountShell>
  );
}
