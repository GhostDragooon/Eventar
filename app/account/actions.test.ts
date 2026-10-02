// N1 + N3 of the 2026-09-25 two-persona review (WP5): the practitioner-only
// writes must refuse a staff session at the ACTION layer. The /account layout
// redirects staff, but by its own comment that is UI framing, and no RLS policy
// below it asks "is this an organiser?" (the self-write policies key on
// auth.uid() alone) — so before WP5 a staff session could call any of these
// actions directly and write practitioner data under its UUID.
//
// Real lib/auth (getStaffSessionState) runs against a fake session client, so
// what is asserted is the observable outcome: the action's result AND whether
// any write reached the database (`writes`). That second half is what makes a
// forgotten guard on any one action visible.
import { vi } from 'vitest';
vi.mock('server-only', () => ({}));

const { s } = vi.hoisted(() => ({
  s: {
    user: null as { id: string; email: string; email_confirmed_at: string | null } | null,
    staffRow: null as { id: string; email: string; status: string } | null,
    staffError: null as { code: string; message: string } | null,
    // Every write that reached the fake DB / auth / storage, by label.
    writes: [] as string[],
  },
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/rateLimit', () => ({
  rateLimitBySession: vi.fn(async () => ({ allowed: true, retryAfterMs: 0 })),
}));
vi.mock('@/lib/origin', () => ({ getRequestOrigin: vi.fn(async () => 'http://localhost:3000') }));
vi.mock('@/lib/accountCompleteness', () => ({
  isAccountComplete: vi.fn(async () => ({ complete: true })),
}));

// A query-builder stand-in: every step returns itself, and awaiting it yields
// `result` — enough for the action under test to run to completion.
function chain(result: unknown): Record<string, unknown> {
  const c: Record<string, unknown> = {
    then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(result).then(res, rej),
  };
  for (const step of ['eq', 'select', 'single', 'maybeSingle', 'order', 'limit', 'in', 'ilike', 'is']) {
    c[step] = () => c;
  }
  return c;
}

// Applies each .eq() predicate to the fixture row (same trick as lib/auth.test.ts).
function staffChain(row: typeof s.staffRow): Record<string, unknown> {
  return {
    eq: (field: string, value: unknown) =>
      staffChain(row && (row as Record<string, unknown>)[field] === value ? row : null),
    maybeSingle: async () => ({
      data: s.staffError || !row ? null : { id: row.id },
      error: s.staffError,
    }),
  };
}

const ROW = { id: 'row-1', institution_name: 'HKU', title: 'Lecturer', display_order: 0, society_code: 'HKMA', role_title: null, full_name: 'Ada Lovelace' };

vi.mock('@/lib/supabase/server', () => ({
  supabaseServer: vi.fn(async () => ({
    auth: {
      getUser: async () => ({ data: { user: s.user }, error: null }),
      updateUser: async () => {
        s.writes.push('auth.updateUser');
        return { error: null };
      },
    },
    from: (table: string) => {
      if (table === 'staff') return { select: () => staffChain(s.staffRow) };
      const write = (op: string) => () => {
        s.writes.push(`${table}.${op}`);
        return chain({ data: ROW, error: null });
      };
      return {
        update: write('update'),
        upsert: write('upsert'),
        insert: write('insert'),
        delete: write('delete'),
        select: () => chain({ data: [], error: null }),
      };
    },
    rpc: async (fn: string) => {
      s.writes.push(`rpc:${fn}`);
      return { data: fn === 'claim_registrations_for_user' ? 2 : { id: 'lic-1' }, error: null };
    },
    storage: {
      from: () => ({
        upload: async () => {
          s.writes.push('storage.upload');
          return { error: null };
        },
        getPublicUrl: () => ({ data: { publicUrl: 'http://127.0.0.1/avatar' } }),
      }),
    },
  })),
}));
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: vi.fn(() => ({
    auth: {
      resend: async () => {
        s.writes.push('auth.resend');
        return { error: null };
      },
    },
    from: () => chain({ count: 0, error: null }),
  })),
}));

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addMyAppointment,
  addMySocietyMembership,
  changeEmail,
  claimMyRegistrations,
  declareMyLicence,
  deleteMyAppointment,
  deleteMySocietyMembership,
  getAccountMenuState,
  listMyLicences,
  resendVerificationEmail,
  updateMyAccount,
  updateMyProfessionalProfile,
  uploadAvatar,
} from './actions';

const EMAIL = 'someone@example.com';
const CONFIRMED = '2026-01-01T00:00:00Z';

beforeEach(() => {
  s.user = { id: 'user-1', email: EMAIL, email_confirmed_at: CONFIRMED };
  s.staffRow = null;
  s.staffError = null;
  s.writes = [];
  // lib/auth consults review mode; pin it off so an exported
  // EVENTAR_REVIEW_MODE=true can't route these into the cookie-reading bypass.
  vi.stubEnv('EVENTAR_REVIEW_MODE', 'false');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const asStaff = () => {
  s.staffRow = { id: 'staff-1', email: EMAIL, status: 'active' };
};
const asUnknown = () => {
  s.staffError = { code: '57014', message: 'canceling statement due to statement timeout' };
};

// The 11 guarded writes: valid input for each (so that an UNguarded action
// would clearly run on to its write — a missing guard cannot hide behind an
// input-validation error), the label of the write it reaches, and the one
// session fact that action also depends on (claim needs a confirmed email,
// resend needs an unconfirmed one).
const png = () => {
  const fd = new FormData();
  fd.set('file', new File([new Uint8Array([1, 2, 3])], 'a.png', { type: 'image/png' }));
  return fd;
};
const GUARDED: Array<{
  name: string;
  call: () => Promise<unknown>;
  write: string;
  emailConfirmed: boolean;
}> = [
  { name: 'updateMyAccount', call: () => updateMyAccount({ first_name: 'Ada', last_name: 'Lovelace' }), write: 'users.update', emailConfirmed: true },
  { name: 'updateMyProfessionalProfile', call: () => updateMyProfessionalProfile({ profession_code: 'doctor' }), write: 'professional_profiles.upsert', emailConfirmed: true },
  { name: 'claimMyRegistrations', call: () => claimMyRegistrations(), write: 'rpc:claim_registrations_for_user', emailConfirmed: true },
  { name: 'resendVerificationEmail', call: () => resendVerificationEmail(), write: 'auth.resend', emailConfirmed: false },
  { name: 'declareMyLicence', call: () => declareMyLicence({ body_id: '11111111-2222-4333-8444-555555555555', licence_number: 'L-1' }), write: 'rpc:declare_licence', emailConfirmed: true },
  { name: 'uploadAvatar', call: () => uploadAvatar(png()), write: 'storage.upload', emailConfirmed: true },
  { name: 'addMyAppointment', call: () => addMyAppointment({ institution_name: 'HKU', title: 'Lecturer' }), write: 'additional_appointments.insert', emailConfirmed: true },
  { name: 'deleteMyAppointment', call: () => deleteMyAppointment('row-1'), write: 'additional_appointments.delete', emailConfirmed: true },
  { name: 'addMySocietyMembership', call: () => addMySocietyMembership({ society_code: 'HKMA' }), write: 'society_memberships.insert', emailConfirmed: true },
  { name: 'deleteMySocietyMembership', call: () => deleteMySocietyMembership('row-1'), write: 'society_memberships.delete', emailConfirmed: true },
  { name: "changeEmail (nextPath '/account')", call: () => changeEmail('new@example.com', '/account'), write: 'auth.updateUser', emailConfirmed: true },
];

function setEmailConfirmed(confirmed: boolean) {
  s.user = { id: 'user-1', email: EMAIL, email_confirmed_at: confirmed ? CONFIRMED : null };
}

describe('practitioner-only writes — a staff session is refused before anything is written (N3)', () => {
  it.each(GUARDED)('$name → not_authorized, nothing written', async ({ call, emailConfirmed }) => {
    setEmailConfirmed(emailConfirmed);
    asStaff();

    expect(await call()).toEqual({ ok: false, error: 'not_authorized' });
    expect(s.writes).toEqual([]);
  });
});

describe("practitioner-only writes — an 'unknown' staff state fails closed (N1)", () => {
  it.each(GUARDED)('$name → db_error, nothing written', async ({ call, emailConfirmed }) => {
    setEmailConfirmed(emailConfirmed);
    asUnknown();

    expect(await call()).toEqual({ ok: false, error: 'db_error' });
    expect(s.writes).toEqual([]);
  });
});

describe('practitioner-only writes — a confirmed non-staff session still reaches the write (positive control)', () => {
  // Without this, the two tables above would also pass for an action that
  // refuses EVERYONE (e.g. a mis-wired guard or a broken fake).
  it.each(GUARDED)('$name → proceeds to $write', async ({ call, write, emailConfirmed }) => {
    setEmailConfirmed(emailConfirmed);

    const result = await call();

    expect(s.writes).toContain(write);
    expect(result).toMatchObject({ ok: true });
  });
});

// What the guard deliberately does NOT cover (WP5 scope, plan 2026-09-25):
describe('exclusions — staff keep what they legitimately use', () => {
  it("changeEmail('/settings') stays allowed for staff: the organiser settings page uses this same action", async () => {
    asStaff();

    expect(await changeEmail('new@example.com', '/settings')).toEqual({
      ok: true,
      data: { sent: true, new_email: 'new@example.com' },
    });
    expect(s.writes).toEqual(['auth.updateUser']);
  });

  it('getAccountMenuState must still see staff (shells branch on it)', async () => {
    asStaff();

    expect(await getAccountMenuState()).toEqual({ isStaff: true, accountComplete: false, unlinkedCount: 0 });
  });

  // m1 (Band 1 dev review): /login used to read isStaff:false from a FAILED
  // staff lookup as "practitioner" and told a possible organiser so. The flag
  // lets it show the honest "could not check" form instead; menus keep the
  // fail-open false.
  it("getAccountMenuState flags staffUnknown (and still isStaff:false) when the staff read fails", async () => {
    asUnknown();

    expect(await getAccountMenuState()).toEqual({
      isStaff: false,
      accountComplete: false,
      unlinkedCount: 0,
      staffUnknown: true,
    });
  });

  it('getAccountMenuState flags staffUnknown when the server holds no session at all', async () => {
    s.user = null;

    expect(await getAccountMenuState()).toMatchObject({ isStaff: false, staffUnknown: true });
  });

  it('a confirmed non-staff session is not flagged unknown', async () => {
    expect(await getAccountMenuState()).not.toHaveProperty('staffUnknown');
  });

  it('reads are not guarded: listMyLicences still answers a staff session', async () => {
    asStaff();

    expect(await listMyLicences()).toEqual({ ok: true, data: { licences: [] } });
  });
});
