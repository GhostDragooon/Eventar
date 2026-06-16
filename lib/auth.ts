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
  // REVIEW MODE — temporarily return a stub staff record so the user can
  // browse the redesigned staff pages without going through magic-link auth.
  // Activated by EVENTAR_REVIEW_MODE=true in .env.local. NEVER set this in
  // production — delete the env var (and this block on a follow-up commit)
  // before pushing. The stub uses the real ahf.ivan@gmail.com staff row id
  // so owner/manager gates resolve correctly against existing data.
  if (process.env.EVENTAR_REVIEW_MODE === 'true') {
    return {
      id: '18084e4e-87de-4f3e-bba2-9981d6fa0ad4',
      email: 'ahf.ivan@gmail.com',
      role: 'manager',
      full_name: 'Ivan (review mode)',
    };
  }

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
