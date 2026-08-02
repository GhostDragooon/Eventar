'use client';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { Partner } from '@/app/events/new/schema';
import { PARTNER_MAX } from '@/app/events/new/schema';

export type PartnerDraft = { name: string; url: string };

export function emptyPartner(): PartnerDraft {
  return { name: '', url: '' };
}

/**
 * Wave 2 — hosted_by / organized_by repeatable list. Each row: Partner name
 * (required when row is present) + optional URL. A row whose name is empty
 * is treated as "not entered" and dropped from the submit payload — same
 * pattern as the existing AgendaSection topics. Cap at PARTNER_MAX per side
 * so the PE strip stays readable.
 */
type Props = {
  label: string;
  emptyHint: string;
  value: PartnerDraft[];
  onChange: (next: PartnerDraft[]) => void;
};

export function PartnersSection({ label, emptyHint, value, onChange }: Props) {
  function update(i: number, patch: Partial<PartnerDraft>) {
    onChange(value.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }
  function remove(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
  }
  function add() {
    if (value.length >= PARTNER_MAX) return;
    onChange([...value, emptyPartner()]);
  }

  return (
    <div className="space-y-sm">
      <span className="block font-label-md text-label-md uppercase tracking-wider text-on-surface">
        {label}
      </span>

      {value.length === 0 && (
        <p className="font-body-md text-body-md text-on-surface-variant">
          {emptyHint}
        </p>
      )}

      {value.map((p, i) => (
        <div
          key={i}
          className="flex flex-col gap-xs sm:flex-row sm:items-start sm:gap-sm rounded-lg border border-outline-variant bg-surface-container-lowest p-sm"
        >
          <Input
            value={p.name}
            onChange={(e) => update(i, { name: e.target.value })}
            placeholder="Partner name"
            aria-label={`${label} ${i + 1} name`}
            className="sm:flex-1"
          />
          <Input
            value={p.url}
            onChange={(e) => update(i, { url: e.target.value })}
            placeholder="https://… (optional)"
            inputMode="url"
            aria-label={`${label} ${i + 1} URL`}
            className="sm:flex-1"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => remove(i)}
            aria-label={`Remove ${label} ${i + 1}`}
            className="self-end sm:self-center"
          >
            <span className="material-symbols-outlined text-[calc(18px*var(--text-scale))]" aria-hidden>
              close
            </span>
          </Button>
        </div>
      ))}

      {value.length < PARTNER_MAX && (
        <Button type="button" variant="outline" size="sm" onClick={add}>
          <span className="material-symbols-outlined text-[calc(18px*var(--text-scale))] mr-xs" aria-hidden>
            add
          </span>
          Add {label.toLowerCase().replace(/^\w/, () => label[0]!.toLowerCase()).replace(/s$/, '')}
        </Button>
      )}
    </div>
  );
}

/**
 * Drop empty rows and serialize to the schema's `Partner[]` shape that the
 * Zod validator + RPC consume. Called by NewEventForm at submit time.
 */
export function serializePartners(rows: PartnerDraft[]): Partner[] {
  return rows
    .map((r) => ({ name: r.name.trim(), url: r.url.trim() }))
    .filter((r) => r.name !== '')
    .map((r) => (r.url === '' ? { name: r.name } : { name: r.name, url: r.url }));
}
