'use server';

import { requireStaff } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { buildCsv } from '@/lib/csv';

export type ParticipantRow = {
  email: string;
  full_name: string | null;
  events_count: number;
  attended_count: number;
  last_registration: string;
};

export async function getOrgParticipants(): Promise<ParticipantRow[]> {
  const staff = await requireStaff();
  const admin = supabaseAdmin();

  const { data, error } = await admin.rpc('get_org_participants', {
    p_org_id: staff.organisation_id,
  });

  if (error) throw error;
  return (data ?? []) as ParticipantRow[];
}

export async function exportParticipantsCsv(): Promise<{ csvBase64: string; filename: string } | { error: string }> {
  const participants = await getOrgParticipants();
  if (participants.length === 0) return { error: 'No participants to export.' };

  const rows = [
    ['Email', 'Name', 'Events', 'Attended', 'Last Registration'],
    ...participants.map((p) => [
      p.email,
      p.full_name ?? '',
      String(p.events_count),
      String(p.attended_count),
      new Date(p.last_registration).toISOString().slice(0, 10),
    ]),
  ];

  const csv = buildCsv(rows);
  return {
    csvBase64: Buffer.from(csv).toString('base64'),
    filename: `participants-${new Date().toISOString().slice(0, 10)}.csv`,
  };
}
