'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { StatusBadge, type RecordStatus } from './StatusBadge';

export type ManagementRecord = { id: string; name: string; owner: string; status: RecordStatus };

export function ManagementTable({
  records,
  onSelectionChange,
  onAction,
}: {
  records: readonly ManagementRecord[];
  onSelectionChange: (ids: string[]) => void;
  onAction: (id: string, action: 'open' | 'archive') => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);

  function toggle(id: string) {
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    setSelected(next);
    onSelectionChange(next);
  }

  return (
    <div className="overflow-x-auto rounded-[20px] border border-outline-variant bg-surface-container-lowest">
      <table className="w-full">
        <thead>
          <tr className="text-left text-on-surface-variant">
            <th className="p-md"><span className="sr-only">Select</span></th>
            <th className="p-md">Record</th>
            <th className="p-md">Owner</th>
            <th className="p-md">Status</th>
            <th className="p-md">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant">
          {records.map((record) => (
            <tr key={record.id} className={selected.includes(record.id) ? 'bg-primary-container text-on-primary-container' : ''}>
              <td className="p-md">
                <input
                  type="checkbox"
                  checked={selected.includes(record.id)}
                  onChange={() => toggle(record.id)}
                  aria-label={`Select ${record.name}`}
                  className="size-5 accent-primary"
                />
              </td>
              <td className="p-md font-semibold">{record.name}</td>
              <td className="p-md">{record.owner}</td>
              <td className="p-md"><StatusBadge status={record.status} /></td>
              <td className="p-md">
                <div className="flex gap-xs">
                  <Button type="button" variant="ghost" onClick={() => onAction(record.id, 'open')} className="min-h-11 px-sm text-primary-ink">
                    Open
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => onAction(record.id, 'archive')} className="min-h-11 px-sm text-error hover:bg-error-container hover:text-error">
                    Archive
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
