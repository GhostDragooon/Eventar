'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

export type SharePerson = { id: string; name: string; detail: string };
export type ShareResult = { ok: true } | { error: string };

export function PersonShareSheet({
  people,
  onSend,
}: {
  people: readonly SharePerson[];
  onSend: (ids: string[]) => Promise<ShareResult>;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected(selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id]);
  }

  async function send() {
    setPending(true);
    setStatus(null);
    const result = await onSend(selected);
    setPending(false);
    setStatus('error' in result ? result.error : 'Shared successfully.');
  }

  return (
    <section className="space-y-md rounded-[20px] border border-outline-variant bg-surface-container-lowest p-lg">
      <ul className="divide-y divide-outline-variant">
        {people.map((person) => (
          <li key={person.id}>
            <label className="flex min-h-14 cursor-pointer items-center gap-md py-sm">
              <input type="checkbox" checked={selected.includes(person.id)} onChange={() => toggle(person.id)} className="size-5 accent-primary" />
              <span className="grid size-10 place-items-center rounded-full bg-primary-container text-on-primary-container" aria-hidden>
                {person.name.slice(0, 2).toUpperCase()}
              </span>
              <span>
                <strong className="block text-on-surface">{person.name}</strong>
                <small className="text-on-surface-variant">{person.detail}</small>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <Button type="button" disabled={!selected.length || pending} onClick={send} className="w-full">
        {pending ? 'Sending…' : 'Share'}
      </Button>
      {status && (
        <p role={status === 'Shared successfully.' ? 'status' : 'alert'} className={status === 'Shared successfully.' ? 'rounded-[12px] bg-success-container p-md text-on-success-container' : 'rounded-[12px] bg-error-container p-md text-on-error-container'}>
          {status}
        </p>
      )}
    </section>
  );
}
