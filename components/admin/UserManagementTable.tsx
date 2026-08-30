'use client';

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { IdentityAvatar } from './IdentityAvatar';
import { StatusBadge, type RecordStatus } from './StatusBadge';

export type UserRecord = { id: string; name: string; email: string; role: string; status: RecordStatus };

export function UserManagementTable({
  users,
  onCreate,
  onOpen,
}: {
  users: readonly UserRecord[];
  onCreate: () => void;
  onOpen: (id: string) => void;
}) {
  const [q, setQ] = useState('');
  const rows = useMemo(
    () => users.filter((x) => `${x.name} ${x.email} ${x.role}`.toLowerCase().includes(q.trim().toLowerCase())),
    [q, users],
  );

  return (
    <section className="overflow-hidden rounded-[20px] border border-outline-variant bg-surface-container-lowest">
      <header className="flex flex-col gap-md border-b border-outline-variant p-md sm:flex-row sm:items-center sm:justify-between">
        <label className="relative">
          <span className="sr-only">Search users</span>
          <span className="material-symbols-outlined absolute left-sm top-1/2 -translate-y-1/2 text-on-surface-variant" aria-hidden>search</span>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search users" className="min-h-11 w-full pl-xl pr-md" />
        </label>
        <Button type="button" onClick={onCreate} className="min-h-11 px-lg">
          <span className="material-symbols-outlined align-middle" aria-hidden>person_add</span>
          Create user
        </Button>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left text-on-surface-variant">
              <th className="p-md">User</th>
              <th className="p-md">Role</th>
              <th className="p-md">Status</th>
              <th className="p-md"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant">
            {rows.map((user) => (
              <tr key={user.id}>
                <td className="p-md">
                  <div className="flex items-center gap-sm">
                    <IdentityAvatar name={user.name} />
                    <span>
                      <strong className="block text-on-surface">{user.name}</strong>
                      <small className="text-on-surface-variant">{user.email}</small>
                    </span>
                  </div>
                </td>
                <td className="p-md text-on-surface">{user.role}</td>
                <td className="p-md"><StatusBadge status={user.status} /></td>
                <td className="p-md text-right">
                  <Button type="button" variant="ghost" onClick={() => onOpen(user.id)} className="min-h-11 px-md text-primary-ink">
                    Open
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="p-xl text-center text-on-surface-variant">No matching users.</p>}
      </div>
    </section>
  );
}
