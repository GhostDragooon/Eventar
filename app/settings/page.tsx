import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireStaff, NotAuthorizedError } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { StaffShell } from '@/components/shell/StaffShell';
import SettingsClient, { SettingsSignOut } from './SettingsClient';
import { OrgOnboardingClient } from './OrgOnboardingClient';

export const metadata = {
  title: 'Settings',
  robots: { index: false, follow: false },
};

export default async function SettingsPage() {
  let staff;
  try {
    staff = await requireStaff();
  } catch (e) {
    if (e instanceof NotAuthorizedError) redirect('/login');
    throw e;
  }

  // WP-D — org first-run capture (plan Phase 6). provisionOrganisation never
  // creates an organisers row, so its absence is the first-run signal — no
  // new flag column. Only organiser_admin/eventar_staff can complete it
  // (matches completeOrgOnboarding's own gate); other roles just don't see
  // the prompt, since they can't act on it anyway.
  //
  // Existence check uses supabaseAdmin(), not the cookie-bound RLS client:
  // organisers_org_staff_read gates on app_private.auth_email() reading a
  // real JWT session, which review mode's borrowed-staff-row bypass never
  // establishes (found live during backtest — the form kept reappearing
  // after a successful save under EVENTAR_REVIEW_MODE=true, even though the
  // row existed). A real signed-in organiser_admin would pass the RLS read
  // fine, but this check has no sensitive payload (id only) and the actual
  // write-path authorization stays in completeOrgOnboarding's own
  // requireStaff + role check — same posture as getUnlinkedRegistrationCount.
  let showOrgOnboarding = false;
  let professions: Array<{ code: string; label_en: string }> = [];
  let specialties: Array<{ code: string; label_en: string }> = [];
  if (
    staff.organisation_id &&
    (staff.role === 'organiser_admin' || staff.role === 'eventar_staff')
  ) {
    const supabase = await supabaseServer();
    const admin = supabaseAdmin();
    const [{ data: existingOrganiser, error: existingErr }, { data: professionRows }, { data: specialtyRows }] =
      await Promise.all([
        admin.from('organisers').select('id').eq('organisation_id', staff.organisation_id).limit(1),
        supabase.from('professions').select('code, label_en').order('display_order', { ascending: true }),
        supabase.from('specialties').select('code, label_en').order('display_order', { ascending: true }),
      ]);
    // Fail closed on a read error — the opposite default from the other
    // reads on this page (professions/specialties degrade to an empty
    // picker on failure, which is fine for those). Falling OPEN here would
    // show the onboarding form to an org that already completed it, purely
    // because this one read hiccuped. completeOrgOnboarding's own unique
    // constraint (organisers_one_per_organisation) still catches a
    // duplicate submit either way, but the form shouldn't invite one.
    showOrgOnboarding = !existingErr && (existingOrganiser ?? []).length === 0;
    professions = professionRows ?? [];
    specialties = specialtyRows ?? [];
  }

  return (
    <StaffShell staff={{ email: staff.email, role: staff.role }} backHref="/dashboard" backLabel="Programme">
      <header className="mb-lg">
        <h1 className="font-headline-lg text-headline-lg text-on-surface">Settings</h1>
        <p className="font-body-lg text-body-lg text-on-surface-variant mt-sm">
          Personal preferences for your Eventar session.
        </p>
      </header>

      {showOrgOnboarding && (
        <OrgOnboardingClient contactEmailDefault={staff.email} professions={professions} specialties={specialties} />
      )}

      <SettingsClient staff={{ email: staff.email, role: staff.role }} />

      <section className="mt-xl border-t border-outline-variant pt-lg">
        <h2 className="font-title-lg text-title-lg text-on-surface mb-sm">Team</h2>
        <p className="font-body-md text-body-md text-on-surface-variant mb-md">
          Manage your organisation's members and invite new teammates.
        </p>
        <Link
          href="/settings/team"
          className="inline-flex items-center gap-sm rounded-lg border border-outline-variant px-md py-sm font-label-lg text-label-lg text-primary hover:bg-surface-container-high transition-colors"
        >
          <span className="material-symbols-outlined text-[20px]" aria-hidden>group</span>
          Manage team
        </Link>
      </section>

      <section className="mt-xl border-t border-outline-variant pt-lg">
        <h2 className="font-title-lg text-title-lg text-on-surface mb-sm">Session</h2>
        <SettingsSignOut />
      </section>
    </StaffShell>
  );
}
