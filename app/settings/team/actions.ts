'use server';

import { requireStaff, NotAuthorizedError } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { getRequestOrigin } from '@/lib/origin';

export async function listTeamMembers() {
  const supabase = await supabaseServer();
  const staff = await requireStaff(supabase);

  const { data, error } = await supabase
    .from('staff')
    .select('id, email, full_name, role, created_at')
    .eq('organisation_id', staff.organisation_id!)
    .eq('status', 'active')
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function createInviteLink(role: string): Promise<{ url: string } | { error: string }> {
  const supabase = await supabaseServer();
  const staff = await requireStaff(supabase);

  if (staff.role !== 'organiser_admin' && staff.role !== 'eventar_staff') {
    return { error: 'Only admins can create invite links.' };
  }

  if (role !== 'organiser_admin' && role !== 'organiser_member') {
    return { error: 'Invalid role.' };
  }

  const { data, error } = await supabase.rpc('create_invite_token', { p_role: role });
  if (error) {
    if (error.message.includes('too many active invites')) {
      return { error: 'Too many active invites (max 10). Wait for some to expire or be used.' };
    }
    return { error: error.message };
  }

  const origin = await getRequestOrigin();
  return { url: `${origin}/invite/${data}` };
}

export async function listInvites() {
  const supabase = await supabaseServer();
  const staff = await requireStaff(supabase);

  const { data, error } = await supabase
    .from('invite_tokens')
    .select('id, role, created_at, expires_at, accepted_at')
    .eq('organisation_id', staff.organisation_id!)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) throw error;
  return data ?? [];
}
