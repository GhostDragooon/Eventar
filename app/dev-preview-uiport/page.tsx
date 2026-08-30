'use client';

import { useState } from 'react';
import { EventCard } from '@/components/event-discovery/EventCard';
import { ExpandableEventCard } from '@/components/event-discovery/ExpandableEventCard';
import { CreateEventWizard, type CreateEventWizardValue } from '@/components/event-form/CreateEventWizard';
import { MagicLinkSignInForm } from '@/components/auth/MagicLinkSignInForm';
import { AuthShell } from '@/components/auth/AuthShell';
import { ControlledAccessNotice } from '@/components/auth/ControlledAccessNotice';
import { AuthStatusMessage } from '@/components/auth/AuthStatusMessage';
import { SignOutAction } from '@/components/auth/SignOutAction';
import { Pagination } from '@/components/navigation/Pagination';
import { WorkspaceSwitcher } from '@/components/navigation/WorkspaceSwitcher';
import { Breadcrumbs } from '@/components/navigation/Breadcrumbs';
import { ActionGroup } from '@/components/navigation/ActionGroup';
import { PinnedItemsList } from '@/components/navigation/PinnedItemsList';

const event = {
  id: 'event-1',
  title: 'Clinical Workshop on Evidence-Based Practice',
  summary: 'A structured, hands-on session covering the latest guidance.',
  format: 'Workshop',
  dateLabel: '16 August 2026',
  venueLabel: 'Main Hall, HKCEC',
  imageUrl: '',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-md rounded-[16px] border border-outline-variant bg-surface-container-lowest p-lg">
      <h2 className="font-headline-sm text-headline-sm text-on-surface">{title}</h2>
      {children}
    </section>
  );
}

export default function DevPreview() {
  const [open, setOpen] = useState(false);
  const [wizardValue, setWizardValue] = useState<CreateEventWizardValue>({
    title: '', officialTitle: '', format: '', summary: '',
  });
  const [page, setPage] = useState(3);
  const [saved, setSaved] = useState(false);
  const [pinned, setPinned] = useState([
    { id: '1', label: 'ICI Summit 2026', href: '/events/1' },
    { id: '2', label: 'HKCP Annual Meeting', href: '/events/2' },
  ]);

  return (
    <div className="min-h-dvh space-y-xl bg-surface p-xl">
      <h1 className="font-headline-lg text-headline-lg text-on-surface">
        UI-port dev preview — Categories 01–03 (not a live route)
      </h1>

      <Section title="Breadcrumbs">
        <Breadcrumbs items={[{ label: 'Events', href: '/events' }, { label: 'Clinical Workshop' }]} />
      </Section>

      <Section title="ActionGroup">
        <ActionGroup
          label="Page actions"
          actions={[{ id: 'export', label: 'Export', icon: 'download' }, { id: 'print', label: 'Print', icon: 'print' }]}
          onAction={() => undefined}
        />
      </Section>

      <Section title="Pagination">
        <Pagination page={page} pageCount={7} onPageChange={setPage} />
      </Section>

      <Section title="PinnedItemsList">
        <div className="max-w-md">
          <PinnedItemsList
            items={pinned}
            onMove={(id, dir) => {
              setPinned((prev) => {
                const i = prev.findIndex((p) => p.id === id);
                const j = dir === 'up' ? i - 1 : i + 1;
                if (j < 0 || j >= prev.length) return prev;
                const next = [...prev];
                [next[i], next[j]] = [next[j], next[i]];
                return next;
              });
            }}
            onRemove={(id) => setPinned((prev) => prev.filter((p) => p.id !== id))}
          />
        </div>
      </Section>

      <Section title="EventCard + ExpandableEventCard (click Save, click View details)">
        <div className="grid gap-lg sm:grid-cols-2">
          <div>
            <p className="mb-xs font-label-md text-label-md text-on-surface-variant">Standalone EventCard</p>
            <EventCard event={event} saved={saved} onOpen={() => undefined} onSaveChange={(_, v) => setSaved(v)} />
          </div>
          <div>
            <p className="mb-xs font-label-md text-label-md text-on-surface-variant">ExpandableEventCard (opens a dialog)</p>
            <ExpandableEventCard event={event} open={open} onOpenChange={setOpen} />
          </div>
        </div>
      </Section>

      <Section title="WorkspaceSwitcher (type to filter, arrow keys + Enter, Escape to close)">
        <div className="max-w-sm">
          <WorkspaceSwitcher
            workspaces={[
              { id: 'a', name: 'HKCP', description: 'Hong Kong College of Physicians' },
              { id: 'b', name: 'MCHK', description: 'Medical Council of Hong Kong' },
              { id: 'c', name: 'HKAM', description: 'Hong Kong Academy of Medicine' },
            ]}
            currentId="a"
            onSelect={() => undefined}
            onCreate={() => undefined}
          />
        </div>
      </Section>

      <Section title="AuthStatusMessage (error / success / info)">
        <div className="space-y-sm">
          <AuthStatusMessage status={{ kind: 'error', message: 'Could not send link right now. Try again.' }} />
          <AuthStatusMessage status={{ kind: 'success', message: 'Check your inbox for a sign-in link.' }} />
          <AuthStatusMessage status={{ kind: 'info', message: 'Access is limited to authorised staff.' }} />
        </div>
      </Section>

      <Section title="ControlledAccessNotice">
        <div className="max-w-md">
          <ControlledAccessNotice />
        </div>
      </Section>

      <Section title="MagicLinkSignInForm">
        <div className="max-w-sm">
          <MagicLinkSignInForm submitMagicLink={async () => ({ ok: true })} />
        </div>
      </Section>

      <Section title="SignOutAction">
        <SignOutAction signOut={async () => undefined} />
      </Section>

      <Section title="CreateEventWizard (full 3-step flow)">
        <div className="max-w-xl">
          <CreateEventWizard value={wizardValue} onChange={setWizardValue} onReady={() => undefined} />
        </div>
      </Section>

      <Section title="AuthShell (full-page shell — shown inline here, normally fills the viewport)">
        <div className="h-[500px] overflow-auto rounded-[12px] border border-outline-variant">
          <AuthShell title="Staff sign-in" description="Enter your work email to receive a one-time sign-in link.">
            <MagicLinkSignInForm submitMagicLink={async () => ({ ok: true })} />
          </AuthShell>
        </div>
      </Section>
    </div>
  );
}
