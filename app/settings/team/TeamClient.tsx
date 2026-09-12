'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createInviteLink } from './actions';

type Member = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  created_at: string;
};

type Invite = {
  id: string;
  role: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
};

const ROLE_LABELS: Record<string, string> = {
  organiser_admin: 'Admin',
  organiser_member: 'Member',
  eventar_staff: 'Platform Staff',
};

export function TeamClient({
  members,
  invites,
  isAdmin,
}: {
  members: Member[];
  invites: Invite[];
  isAdmin: boolean;
}) {
  return (
    <div className="space-y-xl">
      <section>
        <h2 className="font-title-lg text-title-lg text-on-surface mb-md">Members</h2>
        <div className="overflow-x-auto rounded-xl border border-outline-variant">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-lowest">
                <th className="px-md py-sm font-title-sm text-title-sm text-on-surface-variant">Name</th>
                <th className="px-md py-sm font-title-sm text-title-sm text-on-surface-variant">Email</th>
                <th className="px-md py-sm font-title-sm text-title-sm text-on-surface-variant">Role</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-b border-outline-variant last:border-0">
                  <td className="px-md py-sm text-body-md text-on-surface">{m.full_name ?? '—'}</td>
                  <td className="px-md py-sm text-body-md text-on-surface-variant">{m.email}</td>
                  <td className="px-md py-sm text-body-md text-on-surface-variant">{ROLE_LABELS[m.role] ?? m.role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {isAdmin && <InviteLinkGenerator />}

      {isAdmin && invites.length > 0 && (
        <section>
          <h2 className="font-title-lg text-title-lg text-on-surface mb-md">Recent invites</h2>
          <div className="space-y-sm">
            {invites.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between rounded-xl border border-outline-variant px-md py-sm"
              >
                <div>
                  <span className="text-body-md text-on-surface">{ROLE_LABELS[inv.role] ?? inv.role}</span>
                  <span className="ml-sm text-body-sm text-on-surface-variant">
                    {inv.accepted_at
                      ? 'Accepted'
                      : new Date(inv.expires_at) < new Date()
                        ? 'Expired'
                        : `Expires ${new Date(inv.expires_at).toLocaleDateString()}`}
                  </span>
                </div>
                <span
                  className={`rounded-full px-sm py-[2px] text-label-sm font-medium ${
                    inv.accepted_at
                      ? 'bg-success-container text-on-success-container'
                      : new Date(inv.expires_at) < new Date()
                        ? 'bg-surface-container-high text-on-surface-variant'
                        : 'bg-tertiary-container text-on-tertiary-container'
                  }`}
                >
                  {inv.accepted_at ? 'Used' : new Date(inv.expires_at) < new Date() ? 'Expired' : 'Active'}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function InviteLinkGenerator() {
  const [role, setRole] = useState('organiser_member');
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ kind: 'url'; url: string } | { kind: 'error'; message: string } | null>(null);

  async function generate() {
    setPending(true);
    setResult(null);
    const res = await createInviteLink(role);
    setPending(false);
    if ('error' in res) {
      setResult({ kind: 'error', message: res.error });
    } else {
      setResult({ kind: 'url', url: res.url });
    }
  }

  return (
    <section>
      <h2 className="font-title-lg text-title-lg text-on-surface mb-md">Invite a teammate</h2>
      <div className="flex items-end gap-md">
        <div className="space-y-xs">
          <span className="text-label-md text-on-surface">Role</span>
          <Select items={ROLE_LABELS} value={role} onValueChange={(v) => { if (v) setRole(v); }}>
            <SelectTrigger className="min-h-11 w-48 border-outline-variant bg-surface-container-lowest">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="organiser_member">Member</SelectItem>
              <SelectItem value="organiser_admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={generate} disabled={pending}>
          {pending ? 'Generating…' : 'Generate invite link'}
        </Button>
      </div>

      {result?.kind === 'url' && (
        <div className="mt-md rounded-xl border border-outline-variant bg-surface-container-lowest p-md">
          <p className="text-body-sm text-on-surface-variant mb-xs">Share this link (expires in 7 days):</p>
          <div className="flex items-center gap-sm">
            <code className="flex-1 overflow-x-auto rounded-lg bg-surface-container-high px-sm py-xs text-body-sm text-on-surface">
              {result.url}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigator.clipboard.writeText(result.url)}
            >
              Copy
            </Button>
          </div>
        </div>
      )}

      {result?.kind === 'error' && (
        <p role="alert" className="mt-md rounded-xl bg-error-container p-md text-on-error-container text-body-md">
          {result.message}
        </p>
      )}
    </section>
  );
}
