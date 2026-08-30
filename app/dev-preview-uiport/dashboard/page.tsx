'use client';

import { useState } from 'react';
import { StaffShell } from '@/components/shell/StaffShell';
import { Breadcrumbs } from '@/components/navigation/Breadcrumbs';
import { ActionGroup } from '@/components/navigation/ActionGroup';
import { WorkspaceSwitcher } from '@/components/navigation/WorkspaceSwitcher';
import { Pagination } from '@/components/navigation/Pagination';
import { PinnedItemsList } from '@/components/navigation/PinnedItemsList';

export default function DashboardPreview() {
  const [page, setPage] = useState(1);
  const [pinned, setPinned] = useState([
    { id: '1', label: 'ICI Cardiovascular Summit 2026', href: '/events/1' },
    { id: '2', label: 'HKCP Annual Scientific Meeting', href: '/events/2' },
  ]);

  return (
    <StaffShell staff={{ email: 'organiser@example.com', role: 'organiser_admin' }}>
      <div className="mx-auto max-w-5xl space-y-lg p-xl">
        <Breadcrumbs items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'All events' }]} />

        <div className="flex flex-wrap items-center justify-between gap-md">
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
          <ActionGroup
            label="Event actions"
            actions={[
              { id: 'export', label: 'Export', icon: 'download' },
              { id: 'print', label: 'Print', icon: 'print' },
            ]}
            onAction={() => undefined}
          />
        </div>

        <div className="rounded-[16px] border border-outline-variant bg-surface-container-lowest p-lg">
          <h2 className="mb-md font-headline-sm text-headline-sm text-on-surface">Pinned events</h2>
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

        <div className="flex justify-center">
          <Pagination page={page} pageCount={5} onPageChange={setPage} />
        </div>
      </div>
    </StaffShell>
  );
}
