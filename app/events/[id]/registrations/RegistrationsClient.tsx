'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/Dialog';
import { setRegistrationRole, removeRegistrationRole } from '../details/multiBodyActions';
import { updateRegistrationContact } from './actions';

type Role = 'chair' | 'presenter';
type Status = 'registered' | 'attended' | 'cancelled';

export type RegistrationRow = {
  id: string;
  full_name: string;
  email: string;
  registration_code: string;
  status: Status;
  /** Formatted on the server in the event's timezone. */
  registeredLabel: string;
  checkInLabel: string | null;
  /** Registration belongs to an Eventar account: its email cannot be corrected here. */
  linked: boolean;
};

const STATUS_LABEL: Record<Status, string> = { registered: 'Registered', attended: 'Attended', cancelled: 'Cancelled' };
const FILTERS: { key: 'all' | Status; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'registered', label: 'Registered' },
  { key: 'attended', label: 'Attended' },
  { key: 'cancelled', label: 'Cancelled' },
];

export default function RegistrationsClient({
  eventId,
  rows: initialRows,
  initialRoles,
  rolesUnavailable,
  canEdit,
  canEditRoles,
}: {
  eventId: string;
  rows: RegistrationRow[];
  /** registration_id → non-default roles (attendee is implicit, never listed). */
  initialRoles: Record<string, Role[]>;
  rolesUnavailable: boolean;
  canEdit: boolean;
  /** Live role chips: the creator of the event or Eventar staff only (what the role RPCs accept). */
  canEditRoles: boolean;
}) {
  const [rows, setRows] = useState(initialRows);
  const [roles, setRoles] = useState(initialRoles);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | Status>('all');
  const [editing, setEditing] = useState<RegistrationRow | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);
  // Polite confirmation for screen readers: a toggled chip or a saved edit changes nothing else announceable.
  const [notice, setNotice] = useState('');

  const counts = useMemo(() => {
    const c: Record<'all' | Status, number> = { all: rows.length, registered: 0, attended: 0, cancelled: 0 };
    for (const r of rows) c[r.status] += 1;
    return c;
  }, [rows]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (filter === 'all' || r.status === filter) &&
        (!q || r.full_name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q)),
    );
  }, [rows, search, filter]);

  async function toggleRole(r: RegistrationRow, role: Role, has: boolean) {
    const key = `${r.id}:${role}`;
    setPending((p) => new Set(p).add(key));
    setRoleError(null);
    let res: Awaited<ReturnType<typeof setRegistrationRole>>;
    try {
      res = has
        ? await removeRegistrationRole({ registrationId: r.id, eventId, roleCode: role })
        : await setRegistrationRole({ registrationId: r.id, eventId, roleCode: role });
    } catch {
      res = { error: `Could not change ${r.full_name}’s role. Please try again.` };
    } finally {
      setPending((p) => {
        const next = new Set(p);
        next.delete(key);
        return next;
      });
    }
    if ('error' in res) {
      setRoleError(res.error);
      return;
    }
    setNotice(`${r.full_name} ${has ? 'is no longer' : 'is now'} ${role === 'chair' ? 'chair' : 'a presenter'}.`);
    setRoles((prev) => {
      const current = prev[r.id] ?? [];
      return { ...prev, [r.id]: has ? current.filter((x) => x !== role) : [...current, role] };
    });
  }

  return (
    <div className="flex flex-col gap-md">
      {rolesUnavailable && (
        <p role="status" className="rounded-lg bg-warning-container px-md py-sm font-body-md text-body-md text-on-warning-container">
          Roles could not be loaded just now, so chair and presenter are not shown. The people listed are correct.
        </p>
      )}
      <p role="status" className="sr-only">{notice}</p>
      {roleError && (
        <p role="alert" className="rounded-lg bg-error-container px-md py-sm font-body-md text-body-md text-on-error-container">
          {roleError}
        </p>
      )}

      <div className="flex flex-col gap-sm md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-sm">
          {FILTERS.map((f) => (
            <Button
              key={f.key}
              type="button"
              variant={filter === f.key ? 'secondary' : 'outline'}
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
              className="min-h-11 px-md font-label-md text-label-md"
            >
              {f.label} ({counts[f.key]})
            </Button>
          ))}
        </div>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or email"
          aria-label="Search name or email"
          className="min-h-11 w-full rounded-lg border border-outline bg-surface-container-lowest px-md font-body-md text-body-md text-on-surface md:w-72"
        />
      </div>

      {shown.length === 0 ? (
        <p className="rounded-lg border border-outline-variant bg-surface-container-lowest p-md font-body-md text-body-md text-on-surface-variant">
          {search || filter !== 'all' ? 'No matches.' : 'No one has registered yet.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-xs rounded-lg border border-outline-variant bg-surface-container-lowest p-xs">
          {shown.map((r) => (
            <RegistrationItem
              key={r.id}
              row={r}
              roles={roles[r.id] ?? []}
              pending={pending}
              canEdit={canEdit}
              canEditRoles={canEditRoles}
              onToggleRole={(role, has) => toggleRole(r, role, has)}
              onEdit={() => setEditing(r)}
            />
          ))}
        </ul>
      )}

      {editing && (
        <EditDialog
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={(name, email) => {
            setRows((prev) => prev.map((r) => (r.id === editing.id ? { ...r, full_name: name, email } : r)));
            setNotice(`Saved changes to ${name}.`);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function RegistrationItem({
  row: r,
  roles,
  pending,
  canEdit,
  canEditRoles,
  onToggleRole,
  onEdit,
}: {
  row: RegistrationRow;
  roles: Role[];
  pending: Set<string>;
  canEdit: boolean;
  canEditRoles: boolean;
  onToggleRole: (role: Role, has: boolean) => void;
  onEdit: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-sm px-md py-sm">
      <div className="min-w-0 flex-1 basis-56">
        <p className="font-body-md text-body-md font-semibold text-on-surface">{r.full_name}</p>
        <p className="truncate font-body-md text-body-md text-on-surface-variant">{r.email}</p>
        <p className="font-body-md text-body-md text-on-surface-variant">
          Registered {r.registeredLabel}
          {r.checkInLabel ? ` · Attended ${r.checkInLabel}` : ''}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-xs">
        {(['chair', 'presenter'] as const).map((role) => {
          const has = roles.includes(role);
          if (!canEditRoles) {
            return has ? (
              <span key={role} className="rounded-full bg-primary-container px-sm font-label-md text-label-md capitalize text-on-primary-container">
                {role}
              </span>
            ) : null;
          }
          // A role set after check-in cannot change the credit already posted (award_attendance_credit runs at
          // check-in; the database refuses it too), so the chip locks once the person has attended. A cancelled
          // registration earns nothing, so its chips lock as well.
          const locked = r.status === 'attended' || r.status === 'cancelled';
          return (
            <button
              // ui-primitive-allow: role toggle pill (aria-pressed), moved verbatim from the check-in desk's chip
              key={role}
              type="button"
              // aria-disabled (not disabled) while the call is in flight, so keyboard focus stays on the chip.
              disabled={locked}
              aria-disabled={pending.has(`${r.id}:${role}`) || undefined}
              aria-pressed={has}
              aria-label={`${role} — ${r.full_name}${locked ? ` (locked: ${r.status === 'attended' ? 'already attended' : 'cancelled'})` : ''}`}
              title={locked ? (r.status === 'attended' ? 'Already attended: a role change now would not change the credit already posted.' : 'Cancelled registrations cannot take a role.') : undefined}
              onClick={() => !pending.has(`${r.id}:${role}`) && onToggleRole(role, has)}
              className={`min-h-11 rounded-full px-md font-label-md text-label-md capitalize transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary-ink disabled:opacity-50 ${
                has
                  ? 'bg-primary-container text-on-primary-container'
                  : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest'
              }`}
            >
              {role}
            </button>
          );
        })}
        <span className="rounded-full bg-surface-container-high px-sm font-label-md text-label-md text-on-surface-variant">
          {STATUS_LABEL[r.status]}
        </span>
        {canEdit && (
          <Button
            type="button"
            variant="outline"
            onClick={onEdit}
            aria-label={`Edit ${r.full_name}`}
            className="min-h-11 px-md font-label-md text-label-md"
          >
            Edit
          </Button>
        )}
      </div>
    </li>
  );
}

function EditDialog({
  row,
  onClose,
  onSaved,
}: {
  row: RegistrationRow;
  onClose: () => void;
  onSaved: (name: string, email: string) => void;
}) {
  const [name, setName] = useState(row.full_name);
  const [email, setEmail] = useState(row.email);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // After check-in the email decides who receives the credit, so the database refuses the change (email_locked_attended).
  const attended = row.status === 'attended';
  const emailLocked = row.linked || attended;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    let res: Awaited<ReturnType<typeof updateRegistrationContact>>;
    try {
      res = await updateRegistrationContact({ registrationId: row.id, fullName: name, email });
    } catch {
      setSaving(false);
      // The write may have landed before the reply was lost: never say nothing was saved.
      setError('Could not confirm the change. Reload this page to see what was saved before you try again.');
      return;
    }
    setSaving(false);
    if ('error' in res) {
      setError(res.error);
      return;
    }
    onSaved(name.trim(), email.trim().toLowerCase());
  }

  const field =
    'min-h-11 w-full rounded-lg border border-outline bg-surface-container-lowest px-md font-body-md text-body-md text-on-surface disabled:opacity-60';

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !saving && onClose()}
      title="Edit registration"
      description="Correct a mistyped name or email. Each change is recorded with who made it and which fields changed."
    >
      <form onSubmit={submit} className="flex flex-col gap-sm">
        <label className="flex flex-col gap-xs font-label-md text-label-md text-on-surface">
          Full name
          <input className={field} value={name} onChange={(e) => setName(e.target.value)} required maxLength={200} aria-invalid={error ? true : undefined} aria-describedby={error ? 'edit-error' : undefined} />
        </label>
        <label className="flex flex-col gap-xs font-label-md text-label-md text-on-surface">
          Email
          <input
            className={field}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={emailLocked}
            required
            maxLength={254}
            aria-describedby={error ? 'edit-email-note edit-error' : 'edit-email-note'}
            aria-invalid={error ? true : undefined}
          />
        </label>
        <p id="edit-email-note" className="font-body-md text-body-md text-on-surface-variant">
          {row.linked
            ? 'This registration belongs to an Eventar account, so its email cannot be changed here. The name can.'
            : attended
              ? 'This person has already checked in, so their email cannot be changed. The name can.'
              : 'Their check-in code stays the same, so a pass already emailed to them keeps working.'}
        </p>
        {error && (
          <p id="edit-error" role="alert" className="font-body-md text-body-md text-error">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-sm">
          <Button type="submit" disabled={saving} className="min-h-11 px-md font-label-md text-label-md">
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving} className="min-h-11 px-md font-label-md text-label-md">
            Cancel
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
