'use server';

import { z } from 'zod';
import { requireStaff } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

const provisionOrgSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(2).max(40).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Lowercase alphanumeric and hyphens only'),
  jurisdiction: z.string().min(1).max(10).default('HK'),
  firstAdminEmail: z.string().email().max(254),
});

export async function provisionOrganisation(input: {
  name: string;
  slug: string;
  jurisdiction?: string;
  firstAdminEmail: string;
}): Promise<{ orgId: string; staffId: string } | { error: string }> {
  const supabase = await supabaseServer();
  const staff = await requireStaff(supabase);

  if (staff.role !== 'eventar_staff') {
    return { error: 'Only Eventar operators can provision organisations.' };
  }

  const parsed = provisionOrgSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => i.message).join('; ') };
  }
  const { name, slug, jurisdiction, firstAdminEmail } = parsed.data;

  const admin = supabaseAdmin();

  // Step 1: INSERT organisation
  const { data: org, error: orgErr } = await admin
    .from('organisations')
    .insert({ name, slug, status: 'active', jurisdiction })
    .select('id')
    .single();

  if (orgErr) {
    if (orgErr.code === '23505') {
      return { error: 'An organisation with this slug already exists.' };
    }
    throw orgErr;
  }

  // Step 2: INSERT first admin staff row
  const { data: newStaff, error: staffErr } = await admin
    .from('staff')
    .insert({
      email: firstAdminEmail.toLowerCase().trim(),
      role: 'organiser_admin',
      organisation_id: org.id,
      status: 'active',
    })
    .select('id')
    .single();

  if (staffErr) {
    // Rollback the org if staff insert fails
    await admin.from('organisations').delete().eq('id', org.id);
    throw staffErr;
  }

  // Step 3: Audit event LAST (pivot-era hard rule)
  // eslint-disable-next-line no-restricted-syntax -- attribution degrades to NULL, same pattern as markAttended
  const { data: actor } = await supabase.auth.getUser();
  await admin.rpc('write_audit_event', {
    p_event_type: 'org_provisioned',
    p_actor_user_id: actor?.user?.id ?? null,
    p_actor_role: staff.role,
    p_organisation_id: org.id,
    p_subject_type: 'organisation',
    p_subject_id: org.id,
    p_payload: { first_admin_staff_id: newStaff.id, slug },
  });

  return { orgId: org.id, staffId: newStaff.id };
}
