'use server';

import { supabaseServer } from '@/lib/supabase/server';

export async function acceptInvite(token: string): Promise<{ orgName: string } | { error: string }> {
  const supabase = await supabaseServer();

  const { data: user } = await supabase.auth.getUser();
  if (!user?.user) {
    return { error: 'You must be signed in to accept an invite.' };
  }

  const { data, error } = await supabase.rpc('accept_invite_token', { p_token: token });
  if (error) {
    if (error.message.includes('already been used')) return { error: 'This invite link has already been used.' };
    if (error.message.includes('expired')) return { error: 'This invite link has expired.' };
    if (error.message.includes('already a member')) return { error: 'You are already a member of this organisation.' };
    if (error.message.includes('invalid')) return { error: 'Invalid invite link.' };
    return { error: error.message };
  }

  return { orgName: data as string };
}
