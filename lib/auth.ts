import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseServer } from './supabase/server';

export type Staff = {
  id: string;
  email: string;
  role: 'organizer' | 'manager';
  full_name: string | null;
};

export class NotAuthorizedError extends Error {
  constructor(message = 'not authorized') {
    super(message);
    this.name = 'NotAuthorizedError';
  }
}

export async function requireStaff(client?: SupabaseClient): Promise<Staff> {
  const supabase = client ?? (await supabaseServer());

  const { data: userRes } = await supabase.auth.getUser();
  const email = userRes?.user?.email?.toLowerCase();
  if (!email) throw new NotAuthorizedError('no session');

  const { data: staff } = await supabase
    .from('staff')
    .select('id, email, role, full_name')
    .eq('email', email)
    .maybeSingle();

  if (!staff) throw new NotAuthorizedError('email not in staff table');
  return staff as Staff;
}
