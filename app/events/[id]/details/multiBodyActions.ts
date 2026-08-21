'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireStaff, NotAuthorizedError } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { translateCpdRpcError } from '@/lib/cpd/rpcErrors';

// Server Action wrappers around the C5 multi-body CRUD RPCs
// (20260820000000_multi_body_accreditation_crud.sql). One thin function per
// RPC, same shape as cpdActions.ts: requireStaff, Zod, call, translate,
// revalidate. Every call passes p_actor_override: staff.id — inert for a
// real session (resolve_actor's override branch only fires when
// auth.role() = 'service_role'), but makes every one of these callable under
// review mode too, matching the exact fix already applied to
// publish_event/mark_attended/set_event_cpd_config (20260814020000).

export type MultiBodyResult<T = undefined> = { ok: true; data: T } | { error: string };

async function actingStaffId(): Promise<{ id: string } | { error: string }> {
  try {
    const staff = await requireStaff();
    return { id: staff.id };
  } catch (e) {
    if (e instanceof NotAuthorizedError) return { error: 'Not authorised.' };
    throw e;
  }
}

function revalidateEvent(eventId: string) {
  revalidatePath(`/events/${eventId}/details`);
  revalidatePath(`/events/${eventId}/edit`);
}

const uuid = z.string().uuid();

export async function addAccreditationGroup(input: {
  eventId: string;
  bodyId: string;
  categoryCode: string | null;
  unit: string | null;
  awardScheme: 'proportional' | 'explicit_schedule';
}): Promise<MultiBodyResult<{ id: string }>> {
  const staff = await actingStaffId();
  if ('error' in staff) return staff;

  const parsed = z
    .object({
      eventId: uuid,
      bodyId: uuid,
      categoryCode: z.string().trim().min(1).max(64).nullable(),
      unit: z.enum(['points', 'hours']).nullable(),
      awardScheme: z.enum(['proportional', 'explicit_schedule']),
    })
    .safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the accreditation details.' };

  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .rpc('add_event_accreditation_group', {
      p_event_id: parsed.data.eventId,
      p_body_id: parsed.data.bodyId,
      p_category_code: parsed.data.categoryCode,
      p_unit: parsed.data.unit,
      p_award_scheme: parsed.data.awardScheme,
      p_actor_override: staff.id,
    })
    .single();
  if (error) return { error: translateCpdRpcError(error) };

  revalidateEvent(parsed.data.eventId);
  return { ok: true, data: { id: (data as { id: string }).id } };
}

export async function removeAccreditationGroup(input: {
  groupId: string;
  eventId: string;
}): Promise<MultiBodyResult> {
  const staff = await actingStaffId();
  if ('error' in staff) return staff;

  const parsed = z.object({ groupId: uuid, eventId: uuid }).safeParse(input);
  if (!parsed.success) return { error: 'Invalid request.' };

  const supabase = await supabaseServer();
  const { error } = await supabase.rpc('remove_event_accreditation_group', {
    p_group_id: parsed.data.groupId,
    p_actor_override: staff.id,
  });
  if (error) return { error: translateCpdRpcError(error) };

  revalidateEvent(parsed.data.eventId);
  return { ok: true, data: undefined };
}

export async function addAccreditationRow(input: {
  groupId: string;
  eventId: string;
  creditValue: number;
}): Promise<MultiBodyResult<{ id: string }>> {
  const staff = await actingStaffId();
  if ('error' in staff) return staff;

  const parsed = z
    .object({ groupId: uuid, eventId: uuid, creditValue: z.number().positive().max(1000).multipleOf(0.5) })
    .safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Enter a credit value greater than 0 (in half-point steps, up to 1000).' };

  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .rpc('add_event_accreditation_row', {
      p_group_id: parsed.data.groupId,
      p_credit_value: parsed.data.creditValue,
      p_actor_override: staff.id,
    })
    .single();
  if (error) return { error: translateCpdRpcError(error) };

  revalidateEvent(parsed.data.eventId);
  return { ok: true, data: { id: (data as { id: string }).id } };
}

export async function removeAccreditationRow(input: {
  accreditationId: string;
  eventId: string;
}): Promise<MultiBodyResult> {
  const staff = await actingStaffId();
  if ('error' in staff) return staff;

  const parsed = z.object({ accreditationId: uuid, eventId: uuid }).safeParse(input);
  if (!parsed.success) return { error: 'Invalid request.' };

  const supabase = await supabaseServer();
  const { error } = await supabase.rpc('remove_event_accreditation_row', {
    p_accreditation_id: parsed.data.accreditationId,
    p_actor_override: staff.id,
  });
  if (error) return { error: translateCpdRpcError(error) };

  revalidateEvent(parsed.data.eventId);
  return { ok: true, data: undefined };
}

export async function linkAccreditationOccurrence(input: {
  accreditationId: string;
  occurrenceId: string;
  eventId: string;
}): Promise<MultiBodyResult> {
  const staff = await actingStaffId();
  if ('error' in staff) return staff;

  const parsed = z.object({ accreditationId: uuid, occurrenceId: uuid, eventId: uuid }).safeParse(input);
  if (!parsed.success) return { error: 'Invalid request.' };

  const supabase = await supabaseServer();
  const { error } = await supabase.rpc('link_accreditation_occurrence', {
    p_accreditation_id: parsed.data.accreditationId,
    p_occurrence_id: parsed.data.occurrenceId,
    p_actor_override: staff.id,
  });
  if (error) return { error: translateCpdRpcError(error) };

  revalidateEvent(parsed.data.eventId);
  return { ok: true, data: undefined };
}

export async function unlinkAccreditationOccurrence(input: {
  accreditationId: string;
  occurrenceId: string;
  eventId: string;
}): Promise<MultiBodyResult> {
  const staff = await actingStaffId();
  if ('error' in staff) return staff;

  const parsed = z.object({ accreditationId: uuid, occurrenceId: uuid, eventId: uuid }).safeParse(input);
  if (!parsed.success) return { error: 'Invalid request.' };

  const supabase = await supabaseServer();
  const { error } = await supabase.rpc('unlink_accreditation_occurrence', {
    p_accreditation_id: parsed.data.accreditationId,
    p_occurrence_id: parsed.data.occurrenceId,
    p_actor_override: staff.id,
  });
  if (error) return { error: translateCpdRpcError(error) };

  revalidateEvent(parsed.data.eventId);
  return { ok: true, data: undefined };
}

export async function setRegistrationRole(input: {
  registrationId: string;
  eventId: string;
  roleCode: 'attendee' | 'chair' | 'presenter';
}): Promise<MultiBodyResult> {
  const staff = await actingStaffId();
  if ('error' in staff) return staff;

  const parsed = z
    .object({ registrationId: uuid, eventId: uuid, roleCode: z.enum(['attendee', 'chair', 'presenter']) })
    .safeParse(input);
  if (!parsed.success) return { error: 'Invalid request.' };

  const supabase = await supabaseServer();
  const { error } = await supabase.rpc('set_registration_role', {
    p_registration_id: parsed.data.registrationId,
    p_role_code: parsed.data.roleCode,
    p_actor_override: staff.id,
  });
  if (error) return { error: translateCpdRpcError(error) };

  revalidatePath(`/events/${parsed.data.eventId}/checkin`);
  return { ok: true, data: undefined };
}

export async function removeRegistrationRole(input: {
  registrationId: string;
  eventId: string;
  roleCode: 'attendee' | 'chair' | 'presenter';
}): Promise<MultiBodyResult> {
  const staff = await actingStaffId();
  if ('error' in staff) return staff;

  const parsed = z
    .object({ registrationId: uuid, eventId: uuid, roleCode: z.enum(['attendee', 'chair', 'presenter']) })
    .safeParse(input);
  if (!parsed.success) return { error: 'Invalid request.' };

  const supabase = await supabaseServer();
  const { error } = await supabase.rpc('remove_registration_role', {
    p_registration_id: parsed.data.registrationId,
    p_role_code: parsed.data.roleCode,
    p_actor_override: staff.id,
  });
  if (error) return { error: translateCpdRpcError(error) };

  revalidatePath(`/events/${parsed.data.eventId}/checkin`);
  return { ok: true, data: undefined };
}
