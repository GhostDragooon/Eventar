'use client';

import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { exportParticipantsCsv, type ParticipantRow } from './actions';

export function ParticipantsClient({ participants }: { participants: ParticipantRow[] }) {
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return participants;
    const q = search.toLowerCase();
    return participants.filter(
      (p) => p.email.toLowerCase().includes(q) || (p.full_name?.toLowerCase().includes(q) ?? false),
    );
  }, [participants, search]);

  async function handleExport() {
    setExporting(true);
    setExportError(null);
    const res = await exportParticipantsCsv();
    setExporting(false);
    if ('error' in res) {
      setExportError(res.error);
      return;
    }
    const bytes = Uint8Array.from(atob(res.csvBase64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = res.filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-md">
      <div className="flex items-center gap-md">
        <Input
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Button variant="outline" onClick={handleExport} disabled={exporting}>
          {exporting ? 'Exporting…' : 'Export CSV'}
        </Button>
      </div>

      {exportError && (
        <p role="alert" className="rounded-xl bg-error-container p-md text-on-error-container text-body-md">
          {exportError}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-outline-variant">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-outline-variant bg-surface-container-lowest">
              <th className="px-md py-sm font-title-sm text-title-sm text-on-surface-variant">Name</th>
              <th className="px-md py-sm font-title-sm text-title-sm text-on-surface-variant">Email</th>
              <th className="px-md py-sm font-title-sm text-title-sm text-on-surface-variant text-right">Events</th>
              <th className="px-md py-sm font-title-sm text-title-sm text-on-surface-variant text-right">Attended</th>
              <th className="px-md py-sm font-title-sm text-title-sm text-on-surface-variant">Last registration</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-md py-lg text-center text-body-md text-on-surface-variant">
                  {search ? 'No participants match your search.' : 'No participants yet.'}
                </td>
              </tr>
            ) : (
              filtered.map((p, i) => (
                <tr key={`${p.email}-${i}`} className="border-b border-outline-variant last:border-0">
                  <td className="px-md py-sm text-body-md text-on-surface">{p.full_name ?? '—'}</td>
                  <td className="px-md py-sm text-body-md text-on-surface-variant">{p.email}</td>
                  <td className="px-md py-sm text-body-md text-on-surface-variant text-right">{p.events_count}</td>
                  <td className="px-md py-sm text-body-md text-on-surface-variant text-right">{p.attended_count}</td>
                  <td className="px-md py-sm text-body-md text-on-surface-variant">
                    {new Date(p.last_registration).toLocaleDateString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-body-sm text-on-surface-variant">
        {filtered.length} participant{filtered.length !== 1 ? 's' : ''}
        {search && ` matching "${search}"`}
      </p>
    </div>
  );
}
