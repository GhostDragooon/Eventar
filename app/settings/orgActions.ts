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

// ---------------------------------------------------------------------------
// completeOrgOnboarding — WP-D organisation first-run capture (write-up §4).
// provisionOrganisation creates ONLY an organisations + staff row; there is
// no organisers row yet, which is exactly the signal /settings uses to show
// this form ("NOT EXISTS organisers WHERE organisation_id = ...", no new
// flag column needed — see migration 20260916030000).
//
// legal_name / display_name are NOT NULL on organisers but are not part of
// the write-up's requested field set (§4 asks for type / professions /
// scale / contact only) — default both to the organisation's existing name
// rather than ask the org to retype something they already gave at
// provisioning.
// ---------------------------------------------------------------------------

const completeOrgOnboardingSchema = z.object({
  organisation_type: z.enum([
    'training_provider', 'professional_body', 'academic_institution',
    'conference_producer', 'law_firm', 'accounting_firm',
    'corporate_lnd', 'medical_society', 'other',
  ]),
  professions_served: z.array(z.string().trim().min(1).max(120)).max(32),
  specialties_served: z.array(z.string().trim().min(1).max(120)).max(32),
  approximate_scale: z.enum(['1-10', '11-50', '51-200', '201+']),
  contact_email: z.string().email().max(254),
  primary_contact_name: z.string().trim().min(1).max(200),
  primary_contact_role: z.string().trim().min(1).max(200),
});

export async function completeOrgOnboarding(
  raw: unknown,
): Promise<{ ok: true; organiserId: string } | { ok: false; error: string }> {
  const supabase = await supabaseServer();
  const staff = await requireStaff(supabase);

  if (staff.role !== 'organiser_admin' && staff.role !== 'eventar_staff') {
    return { ok: false, error: 'Only an organisation admin can complete this.' };
  }
  if (!staff.organisation_id) {
    return { ok: false, error: 'No organisation on your staff record.' };
  }

  const parsed = completeOrgOnboardingSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join('; ') };
  }
  const input = parsed.data;

  const admin = supabaseAdmin();

  // Double-submit is caught by organisers_one_per_organisation (migration
  // 20260916030000), not an app-layer check — dev-review CRITICAL-adjacent
  // finding: a SELECT-then-INSERT check here would be a plain TOCTOU race
  // under concurrent submission, and the DB constraint is smaller code
  // besides. 23505 below is that constraint firing.
  const { data: org, error: orgErr } = await admin
    .from('organisations')
    .select('name')
    .eq('id', staff.organisation_id)
    .single();
  if (orgErr || !org) return { ok: false, error: 'Could not load organisation.' };

  const { data: organiser, error: insertErr } = await admin
    .from('organisers')
    .insert({
      organisation_id: staff.organisation_id,
      legal_name: org.name,
      display_name: org.name,
      organisation_type: input.organisation_type,
      professions_served: input.professions_served,
      specialties_served: input.specialties_served,
      approximate_scale: input.approximate_scale,
      contact_email: input.contact_email,
      primary_contact_name: input.primary_contact_name,
      primary_contact_role: input.primary_contact_role,
    })
    .select('id')
    .single();
  if (insertErr) {
    if (insertErr.code === '23505') return { ok: false, error: 'Organisation profile already completed.' };
    return { ok: false, error: 'Could not save organisation profile.' };
  }
  if (!organiser) return { ok: false, error: 'Could not save organisation profile.' };

  // eslint-disable-next-line no-restricted-syntax -- attribution degrades to NULL, same pattern as provisionOrganisation
  const { data: actor } = await supabase.auth.getUser();
  await admin.rpc('write_audit_event', {
    p_event_type: 'org_onboarding_completed',
    p_actor_user_id: actor?.user?.id ?? null,
    p_actor_role: staff.role,
    p_organisation_id: staff.organisation_id,
    p_subject_type: 'organiser',
    p_subject_id: organiser.id,
    p_payload: { organisation_type: input.organisation_type },
  });

  return { ok: true, organiserId: organiser.id };
}
