'use client';

import { useId, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  addAccreditationGroup,
  removeAccreditationGroup,
  addAccreditationRow,
  removeAccreditationRow,
  linkAccreditationOccurrence,
  unlinkAccreditationOccurrence,
} from '@/app/events/[id]/details/multiBodyActions';
import type { AccreditingBodyOption } from './CpdAccreditationSection';

export type WizardOccurrence = { id: string; ordinal: number; name: string | null; starts_at: string };
export type WizardAccreditationRow = { id: string; credit_value: number; occurrenceIds: string[] };
export type WizardGroup = {
  id: string;
  bodyId: string;
  categoryCode: string | null;
  unit: string | null;
  awardScheme: 'proportional' | 'explicit_schedule';
  rows: WizardAccreditationRow[];
};

type Props = {
  eventId: string;
  /** Bodies the org may CLAIM new accreditation from — the add-body picker's option list. */
  bodies: AccreditingBodyOption[];
  /**
   * Superset of `bodies` for LABEL resolution only — includes bodies already
   * bound to an existing group even if the org's authorisation has since
   * lapsed (mirrors CpdAccreditationSection's `currentIsMissing` handling:
   * a binding that's no longer offerable is still a real binding, not an
   * "unknown" one).
   */
  bodyDirectory: AccreditingBodyOption[];
  occurrences: WizardOccurrence[];
  initialGroups: WizardGroup[];
  /** Credits already posted for this event — every write below is DB-frozen once this is true. */
  frozen: boolean;
};

const STEPS = ['Accrediting bodies', 'Schedule & occurrences', 'Review'] as const;

function bodyLabel(directory: AccreditingBodyOption[], id: string): string {
  const b = directory.find((x) => x.id === id);
  if (!b) return 'Body no longer authorised for this organisation';
  return b.short_name ? `${b.short_name} — ${b.full_name}` : b.full_name;
}

export function MultiBodyAccreditationWizard({ eventId, bodies, bodyDirectory, occurrences, initialGroups, frozen }: Props) {
  const [open, setOpen] = useState(initialGroups.length > 0);
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [groups, setGroups] = useState<WizardGroup[]>(initialGroups);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<WizardGroup | null>(null);

  const [newBodyId, setNewBodyId] = useState('');
  const [newScheme, setNewScheme] = useState<'proportional' | 'explicit_schedule'>('proportional');
  const [newUnit, setNewUnit] = useState<'points' | 'hours'>('hours');
  const [newCategory, setNewCategory] = useState('');
  const baseId = useId();
  const errorId = `${baseId}-error`;
  const bodyFieldId = `${baseId}-body`;
  const schemeFieldId = `${baseId}-scheme`;
  const unitFieldId = `${baseId}-unit`;
  const categoryFieldId = `${baseId}-category`;
  const addedBodyIds = new Set(groups.map((g) => g.bodyId));
  const availableBodies = bodies.filter((b) => !addedBodyIds.has(b.id));

  function addGroup() {
    if (!newBodyId) {
      setError('Choose an accrediting body first.');
      return;
    }
    setError(null);
    const categoryCode = newCategory.trim() || null;
    startTransition(async () => {
      const res = await addAccreditationGroup({ eventId, bodyId: newBodyId, categoryCode, unit: newUnit, awardScheme: newScheme });
      if ('error' in res) {
        setError(res.error);
        return;
      }
      setGroups((g) => [...g, { id: res.data.id, bodyId: newBodyId, categoryCode, unit: newUnit, awardScheme: newScheme, rows: [] }]);
      setNewBodyId('');
      setNewCategory('');
    });
  }

  function removeGroup(groupId: string) {
    setError(null);
    setPendingRemoval(null);
    startTransition(async () => {
      const res = await removeAccreditationGroup({ groupId, eventId });
      if ('error' in res) {
        setError(res.error);
        return;
      }
      setGroups((g) => g.filter((x) => x.id !== groupId));
    });
  }

  // event_accreditations.accreditation_group_id is ON DELETE CASCADE
  // (20260815020000), so removing a body silently takes its schedule rows
  // with it — confirm first when there are any. ConfirmDialog, not
  // window.confirm(): that component exists specifically to replace it.
  function requestRemoveGroup(group: WizardGroup) {
    if (group.rows.length === 0) {
      removeGroup(group.id);
      return;
    }
    setPendingRemoval(group);
  }

  function addRow(groupId: string, creditValue: number): Promise<boolean> {
    if (!(creditValue > 0)) {
      setError('Enter a credit value greater than 0.');
      return Promise.resolve(false);
    }
    setError(null);
    return new Promise((resolve) => {
      startTransition(async () => {
        const res = await addAccreditationRow({ groupId, eventId, creditValue });
        if ('error' in res) {
          setError(res.error);
          resolve(false);
          return;
        }
        setGroups((gs) => gs.map((g) => (g.id === groupId ? { ...g, rows: [...g.rows, { id: res.data.id, credit_value: creditValue, occurrenceIds: [] }] } : g)));
        resolve(true);
      });
    });
  }

  function removeRow(groupId: string, accreditationId: string) {
    setError(null);
    startTransition(async () => {
      const res = await removeAccreditationRow({ accreditationId, eventId });
      if ('error' in res) {
        setError(res.error);
        return;
      }
      setGroups((gs) => gs.map((g) => (g.id === groupId ? { ...g, rows: g.rows.filter((r) => r.id !== accreditationId) } : g)));
    });
  }

  function toggleOccurrence(groupId: string, accreditationId: string, occurrenceId: string, linked: boolean) {
    setError(null);
    startTransition(async () => {
      const res = linked
        ? await unlinkAccreditationOccurrence({ accreditationId, occurrenceId, eventId })
        : await linkAccreditationOccurrence({ accreditationId, occurrenceId, eventId });
      if ('error' in res) {
        setError(res.error);
        return;
      }
      setGroups((gs) =>
        gs.map((g) =>
          g.id !== groupId
            ? g
            : {
                ...g,
                rows: g.rows.map((r) =>
                  r.id !== accreditationId
                    ? r
                    : { ...r, occurrenceIds: linked ? r.occurrenceIds.filter((id) => id !== occurrenceId) : [...r.occurrenceIds, occurrenceId] },
                ),
              },
        ),
      );
    });
  }

  if (!open) {
    return (
      <div className="mt-md">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-label-md font-semibold text-primary-ink underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-ink"
        >
          Configure multiple accrediting bodies →
        </button>
      </div>
    );
  }

  return (
    <section className="mt-lg rounded-xl border border-outline-variant bg-surface-container-lowest p-lg">
      <div className="flex flex-wrap items-start justify-between gap-md">
        <div>
          <h2 className="font-heading text-headline-sm text-on-surface">Multiple accrediting bodies</h2>
          <p className="mt-xs text-body-md text-on-surface-variant">
            For events accredited by more than one body at once (each awarding its own points, per day if needed).
            Only one body? Use the &ldquo;Accrediting body&rdquo; field above instead — the two can&rsquo;t be mixed.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-label-md text-on-surface-variant underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-ink"
        >
          Collapse
        </button>
      </div>

      {frozen && (
        <p className="mt-md rounded-lg bg-warning-container px-md py-sm text-body-md text-on-warning-container">
          Credits have already been issued for this event, so accreditation is locked. Changing it now would alter records an accrediting body already holds.
        </p>
      )}

      <ol className="mt-lg flex items-center gap-sm text-label-md" aria-label="Wizard steps">
        {STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-sm">
            <button
              type="button"
              onClick={() => setStep(i as 0 | 1 | 2)}
              aria-current={step === i ? 'step' : undefined}
              className={`flex items-center gap-xs rounded-full px-sm py-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-ink ${
                step === i ? 'bg-primary-container text-on-primary-container font-semibold' : 'text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              <span
                className={`flex size-5 items-center justify-center rounded-full text-[11px] font-semibold ${
                  step === i ? 'bg-primary-ink text-on-primary' : 'bg-surface-container-high text-on-surface-variant'
                }`}
              >
                {i + 1}
              </span>
              {label}
            </button>
            {i < STEPS.length - 1 && <span className="text-on-surface-variant" aria-hidden="true">›</span>}
          </li>
        ))}
      </ol>

      {error && (
        <p id={errorId} role="alert" className="mt-md rounded-lg bg-error-container px-md py-sm text-body-md text-on-error-container">
          {error}
        </p>
      )}

      {step === 0 && (
        <div className="mt-lg space-y-md">
          {groups.length === 0 && <p className="text-body-md text-on-surface-variant">No accrediting bodies added yet.</p>}
          <ul className="space-y-sm">
            {groups.map((g) => (
              <li key={g.id} className="flex items-center justify-between rounded-lg border border-outline-variant bg-surface px-md py-sm">
                <div>
                  <p className="text-body-md font-medium text-on-surface">{bodyLabel(bodyDirectory, g.bodyId)}</p>
                  <p className="text-label-md text-on-surface-variant">
                    {g.awardScheme === 'proportional' ? 'Proportional' : 'Explicit per-day schedule'} · {g.unit ?? 'hours'}
                    {g.categoryCode ? ` · category ${g.categoryCode}` : ''}
                  </p>
                </div>
                <Button type="button" variant="destructive" size="sm" disabled={pending || frozen} onClick={() => requestRemoveGroup(g)}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>

          {!frozen && (
            <fieldset className="rounded-lg border border-outline-variant p-md" disabled={pending}>
              <legend className="px-xs text-label-md font-semibold text-on-surface-variant">Add a body</legend>
              <div className="mt-sm grid gap-md sm:grid-cols-2">
                <div>
                  <label htmlFor={bodyFieldId} className="block text-label-md font-semibold text-on-surface-variant">
                    Accrediting body
                  </label>
                  <select
                    id={bodyFieldId}
                    value={newBodyId}
                    onChange={(e) => setNewBodyId(e.target.value)}
                    aria-describedby={error ? errorId : undefined}
                    className="mt-xs w-full rounded-lg border border-outline-variant bg-surface px-md py-sm text-body-md text-on-surface"
                  >
                    <option value="">Choose a body…</option>
                    {availableBodies.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.short_name ? `${b.short_name} — ${b.full_name}` : b.full_name}
                      </option>
                    ))}
                  </select>
                  {availableBodies.length === 0 && (
                    <p className="mt-xs text-label-md text-on-surface-variant">
                      Every authorised body has already been added below.
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor={schemeFieldId} className="block text-label-md font-semibold text-on-surface-variant">
                    Award scheme
                  </label>
                  <select
                    id={schemeFieldId}
                    value={newScheme}
                    onChange={(e) => setNewScheme(e.target.value as 'proportional' | 'explicit_schedule')}
                    className="mt-xs w-full rounded-lg border border-outline-variant bg-surface px-md py-sm text-body-md text-on-surface"
                  >
                    <option value="proportional">Proportional (credit split by attendance)</option>
                    <option value="explicit_schedule">Explicit per-day schedule (e.g. Day 1 / Day 2 / Both)</option>
                  </select>
                </div>
                <div>
                  <label htmlFor={unitFieldId} className="block text-label-md font-semibold text-on-surface-variant">
                    Unit
                  </label>
                  <select
                    id={unitFieldId}
                    value={newUnit}
                    onChange={(e) => setNewUnit(e.target.value as 'points' | 'hours')}
                    className="mt-xs w-full rounded-lg border border-outline-variant bg-surface px-md py-sm text-body-md text-on-surface"
                  >
                    <option value="hours">Hours</option>
                    <option value="points">Points</option>
                  </select>
                </div>
                <div>
                  <label htmlFor={categoryFieldId} className="block text-label-md font-semibold text-on-surface-variant">
                    Category code <span className="font-normal text-on-surface-variant">(optional)</span>
                  </label>
                  <input
                    id={categoryFieldId}
                    type="text"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    placeholder="e.g. 6.1 or A"
                    className="mt-xs w-full rounded-lg border border-outline-variant bg-surface px-md py-sm text-body-md text-on-surface"
                  />
                  <p className="mt-xs text-label-md text-on-surface-variant">
                    Leave blank unless the body has told you which category code to use for each role (chair,
                    presenter, attendee) — most haven&rsquo;t published this yet.
                  </p>
                </div>
              </div>
              <Button type="button" className="mt-md" disabled={pending} onClick={addGroup}>
                {pending ? 'Adding…' : 'Add body'}
              </Button>
            </fieldset>
          )}
        </div>
      )}

      {step === 1 && (
        <div className="mt-lg space-y-lg">
          {groups.length === 0 && <p className="text-body-md text-on-surface-variant">Add at least one accrediting body first.</p>}
          {groups.map((g) => (
            <div key={g.id} className="rounded-lg border border-outline-variant p-md">
              <h3 className="text-body-md font-semibold text-on-surface">{bodyLabel(bodyDirectory, g.bodyId)}</h3>
              <ul className="mt-sm space-y-sm">
                {g.rows.map((row) => (
                  <li key={row.id} className="rounded-lg bg-surface-container-high p-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-body-md text-on-surface">
                        {g.awardScheme === 'proportional' ? 'Total credit value: ' : ''}
                        {row.credit_value} {g.unit ?? 'hours'}
                      </span>
                      <Button type="button" variant="destructive" size="xs" disabled={pending || frozen} onClick={() => removeRow(g.id, row.id)}>
                        Remove
                      </Button>
                    </div>
                    <div className="mt-xs flex flex-wrap gap-sm">
                      {occurrences.map((occ) => {
                        const linked = row.occurrenceIds.includes(occ.id);
                        return (
                          <label key={occ.id} className="flex items-center gap-xs text-label-md text-on-surface-variant">
                            <input
                              type="checkbox"
                              checked={linked}
                              disabled={pending || frozen}
                              onChange={() => toggleOccurrence(g.id, row.id, occ.id, linked)}
                              className="size-4 rounded border-outline-variant"
                            />
                            {occ.name ?? `Day ${occ.ordinal}`}
                          </label>
                        );
                      })}
                    </div>
                  </li>
                ))}
              </ul>
              {/* A proportional group's engine only ever reads its earliest row as
                  the total (award engine comment, 20260815030000) — capping to 1
                  here prevents a second row from being silently ignored. */}
              {!frozen && (g.awardScheme !== 'proportional' || g.rows.length === 0) && (
                <AddRowForm groupId={g.id} pending={pending} onAdd={addRow} isProportional={g.awardScheme === 'proportional'} />
              )}
              {g.awardScheme === 'proportional' && g.rows.length > 0 && (
                <p className="mt-sm text-label-md text-on-surface-variant">
                  Proportional bodies use a single total — remove this row first to change the value.
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {step === 2 && (
        <div className="mt-lg space-y-md">
          {groups.length === 0 && <p className="text-body-md text-on-surface-variant">Nothing configured yet.</p>}
          {groups.map((g) => (
            <div key={g.id} className="rounded-lg border border-outline-variant p-md">
              <div className="flex items-center gap-xs">
                <span className="flex size-5 items-center justify-center rounded-full bg-primary-container text-[11px] font-semibold text-on-primary-container" aria-hidden="true">
                  ✓
                </span>
                <h3 className="text-body-md font-semibold text-on-surface">{bodyLabel(bodyDirectory, g.bodyId)}</h3>
              </div>
              <ul className="mt-sm list-disc pl-lg text-body-md text-on-surface-variant">
                {g.rows.map((row) => (
                  <li key={row.id}>
                    {row.credit_value} {g.unit ?? 'hours'} —{' '}
                    {row.occurrenceIds.length === 0 ? (
                      <span className="text-on-error-container">no occurrences linked — this row will award nothing</span>
                    ) : (
                      `${row.occurrenceIds.length} occurrence${row.occurrenceIds.length === 1 ? '' : 's'} linked`
                    )}
                  </li>
                ))}
                {g.rows.length === 0 && <li>No schedule rows yet — nothing will be awarded for this body.</li>}
              </ul>
            </div>
          ))}
        </div>
      )}

      <div className="mt-lg flex justify-between">
        <Button type="button" variant="outline" disabled={step === 0} onClick={() => setStep((s) => (s - 1) as 0 | 1 | 2)}>
          Back
        </Button>
        <Button type="button" variant="outline" disabled={step === 2} onClick={() => setStep((s) => (s + 1) as 0 | 1 | 2)}>
          Next
        </Button>
      </div>

      <ConfirmDialog
        open={pendingRemoval !== null}
        title="Remove this accrediting body?"
        body={
          pendingRemoval
            ? `${bodyLabel(bodyDirectory, pendingRemoval.bodyId)} and its ${pendingRemoval.rows.length} schedule ${
                pendingRemoval.rows.length === 1 ? 'row' : 'rows'
              } will be removed. Nothing will be awarded for this body unless you add it again.`
            : ''
        }
        confirmLabel="Remove body"
        tone="danger"
        pending={pending}
        onConfirm={() => pendingRemoval && removeGroup(pendingRemoval.id)}
        onCancel={() => setPendingRemoval(null)}
      />
    </section>
  );
}

function AddRowForm({
  groupId,
  pending,
  onAdd,
  isProportional,
}: {
  groupId: string;
  pending: boolean;
  onAdd: (groupId: string, creditValue: number) => Promise<boolean>;
  isProportional: boolean;
}) {
  const [value, setValue] = useState('');
  const inputId = useId();
  return (
    <div className="mt-sm flex items-end gap-sm">
      <div>
        <label htmlFor={inputId} className="block text-label-md font-semibold text-on-surface-variant">
          {isProportional ? 'Total credit value' : 'Credit value'}
        </label>
        <input
          id={inputId}
          type="number"
          step="0.5"
          min="0.5"
          value={value}
          disabled={pending}
          onChange={(e) => setValue(e.target.value)}
          className="mt-xs w-28 rounded-lg border border-outline-variant bg-surface px-md py-sm text-body-md text-on-surface"
        />
      </div>
      <Button
        type="button"
        size="sm"
        disabled={pending}
        onClick={async () => {
          const v = Number(value);
          const ok = await onAdd(groupId, v);
          if (ok) setValue('');
        }}
      >
        Add row
      </Button>
    </div>
  );
}
