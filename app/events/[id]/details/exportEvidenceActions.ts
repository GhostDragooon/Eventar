'use server';

/**
 * Task 10.7/10.9 (Step 6) + A3 — evidence export for one event.
 *
 * Two artefacts from one Server Action:
 *   - `evidence-claims.json` — an array of EvidencePackage objects, one per
 *     accrediting body that posted credit for the event. Produced by the
 *     `evidence/` Q2 orchestrator against `SupabaseParticipationSource`.
 *     Its per-package `rule_version` is the RFC 8785 canonical SHA-256 of
 *     that body's `category_taxonomy` jsonb at export time — the A3 hash.
 *   - `evidence-{slug}.csv` — a flat one-row-per-ledger-entry projection
 *     built directly from `credit_ledger`, shaped for a College's Academy
 *     submission. Distinct shape, distinct reader; not derived from the
 *     claims JSON (Step 6 spec).
 *
 * `credit_ledger` and `verify_ledger_chain()` are service_role-only, so the
 * whole read path uses the admin client. requireStaff() gates the caller;
 * inside, the event's created_by or eventar_staff role is a second gate.
 */

import { requireStaff } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { SupabaseParticipationSource } from '@/evidence/src/ledger/participationSource';
import { orchestrateParticipation } from '@/evidence/src/orchestrator';
import type { EvidenceClaim, EvidencePackage } from '@/evidence/src/types';

/** Fields the Q2 orchestrator emits for its own reasoning trail — Q2 internals,
 * not evidence a College clerk expects to see in the hand-off JSON. The
 * underlying claim schema keeps them; this strip only runs at export time. */
const INTERNAL_CLAIM_FIELDS = [
  'observation',
  'depends_on',
  'how_would_we_know_this_failed',
  'leading_indicator',
] as const satisfies ReadonlyArray<keyof EvidenceClaim>;

function stripInternalFields(pkg: EvidencePackage): EvidencePackage {
  return {
    ...pkg,
    claims: pkg.claims.map((claim) => {
      const stripped: Record<string, unknown> = { ...claim };
      for (const f of INTERNAL_CLAIM_FIELDS) delete stripped[f];
      return stripped as unknown as EvidenceClaim;
    }),
  };
}

/**
 * Extract a human-readable error message from an unknown throw. Cannot use
 * `err instanceof Error` alone: PostgrestError from `@supabase/postgrest-js`
 * DOES extend Error, but a throw that crosses a Turbopack RSC module-loader
 * boundary loses its prototype chain and `instanceof Error` returns false —
 * verified in user-lens R2 (2026-08-27): a real `.rpc()` throw hit the
 * fallback instead of the underlying "function public.verify_ledger_chain()
 * does not exist" message. Read `.message` structurally instead.
 */
function errorMessageOr(err: unknown, fallback: string): string {
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const msg = (err as { message: unknown }).message;
    if (typeof msg === 'string' && msg.length > 0) return msg;
  }
  return fallback;
}

export type ExportEvidenceResult =
  | { ok: true; jsonBase64: string; csvBase64: string; filename: string; bodyCount: number; entryCount: number }
  | { ok: false; error: string };

// Kept in sync with the CSV shape below — one row per credit_ledger entry.
type CsvRow = {
  event_id: string;
  event_title: string;
  event_start_time: string;
  event_timezone: string;
  body_id: string;
  body_short_name: string;
  body_full_name: string;
  licence_id: string;
  licence_number: string;
  licence_type: string | null;
  ledger_entry_id: string;
  chain_seq: number;
  chain_verified: 'yes' | 'no' | 'unknown';
  entry_type: string;
  points: string;
  hours: string;
  category: string;
  effective_date: string;
  attestation_status: string;
  created_at: string;
  rule_version_hash: string;
};

function csvEscape(v: string | number | null | undefined): string {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: CsvRow[]): string {
  const header = [
    'event_id', 'event_title', 'event_start_time', 'event_timezone',
    'body_id', 'body_short_name', 'body_full_name',
    'licence_id', 'licence_number', 'licence_type',
    'ledger_entry_id', 'chain_seq', 'chain_verified',
    'entry_type', 'points', 'hours', 'category',
    'effective_date', 'attestation_status', 'created_at',
    'rule_version_hash',
  ];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push([
      csvEscape(r.event_id), csvEscape(r.event_title),
      csvEscape(r.event_start_time), csvEscape(r.event_timezone),
      csvEscape(r.body_id), csvEscape(r.body_short_name), csvEscape(r.body_full_name),
      csvEscape(r.licence_id), csvEscape(r.licence_number), csvEscape(r.licence_type),
      csvEscape(r.ledger_entry_id), csvEscape(r.chain_seq), csvEscape(r.chain_verified),
      csvEscape(r.entry_type), csvEscape(r.points), csvEscape(r.hours), csvEscape(r.category),
      csvEscape(r.effective_date), csvEscape(r.attestation_status), csvEscape(r.created_at),
      csvEscape(r.rule_version_hash),
    ].join(','));
  }
  return lines.join('\n');
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'event';
}

export async function exportEventEvidence(eventId: string): Promise<ExportEvidenceResult> {
  const supabase = await supabaseServer();
  const staff = await requireStaff(supabase);
  const admin = supabaseAdmin();

  // Event + owner gate. The details page already renders behind requireStaff,
  // but this action is callable outside that render, so re-check ownership
  // (or eventar_staff) here. Manager peers cannot export other organisers'
  // events — same posture as the details page's confirmationsSent gate.
  const eventRes = await admin
    .from('events')
    .select('id, title, start_time, timezone, created_by, organisation_id')
    .eq('id', eventId)
    .maybeSingle();
  if (eventRes.error) return { ok: false, error: eventRes.error.message };
  if (!eventRes.data) return { ok: false, error: 'Event not found.' };
  const event = eventRes.data;
  const isOwner = event.created_by === staff.id;
  const isEventarStaff = staff.role === 'eventar_staff';
  if (!isOwner && !isEventarStaff) {
    return { ok: false, error: 'Not authorised to export evidence for this event.' };
  }

  // Distinct bodies that actually posted credit for this event. If nothing
  // was posted, there is no evidence to export — surface that plainly rather
  // than emit an empty deliverable that reads as success.
  const ledgerBodiesRes = await admin
    .from('credit_ledger')
    .select('body_id')
    .eq('event_id', eventId);
  if (ledgerBodiesRes.error) return { ok: false, error: ledgerBodiesRes.error.message };
  const distinctBodyIds = [...new Set((ledgerBodiesRes.data ?? []).map((r) => r.body_id as string))];
  if (distinctBodyIds.length === 0) {
    return { ok: false, error: 'No credit has been posted for this event yet — nothing to export.' };
  }

  // Body names — needed by both the orchestrator (to stamp per-package
  // identity so a College reviewer can attribute one package to one body
  // without cross-referencing UUIDs) and the CSV builder below.
  const bodiesRes = await admin
    .from('accrediting_bodies')
    .select('id, short_name, full_name')
    .in('id', distinctBodyIds);
  if (bodiesRes.error) return { ok: false, error: bodiesRes.error.message };
  const bodyById = new Map<string, { short_name: string; full_name: string }>();
  for (const b of bodiesRes.data ?? []) {
    bodyById.set(b.id as string, {
      short_name: (b.short_name as string) ?? '',
      full_name: (b.full_name as string) ?? '',
    });
  }

  // One package per body — see participationSource.ts's class comment on
  // why the seam splits by body. Sequential (not Promise.all) to serialise
  // the verify_ledger_chain() calls, which each read the full ledger.
  //
  // Wrapped in try/catch: any throw from the source (RPC failure, missing
  // body row, canonicalize edge case) would otherwise propagate through
  // startTransition → error boundary and leave the button in "Preparing…"
  // with no visible reason. Rule 12 (fail visibly): surface it as an inline
  // error the same shape as the "no credit posted" case above.
  const packages: EvidencePackage[] = [];
  const generatedAt = new Date().toISOString();
  const generatedBy = `staff:${staff.id}`;
  try {
    for (const bodyId of distinctBodyIds) {
      const source = new SupabaseParticipationSource(admin, { bodyId });
      const bodyMeta = bodyById.get(bodyId);
      const pkg = await orchestrateParticipation({
        eventId,
        packageType: 'verified_participation',
        source,
        generatedAt,
        generatedBy,
        body: {
          id: bodyId,
          shortName: bodyMeta?.short_name ?? '',
          fullName: bodyMeta?.full_name ?? '',
        },
      });
      packages.push(pkg);
    }
  } catch (err) {
    return {
      ok: false,
      error: errorMessageOr(err, 'Failed to build evidence package(s).'),
    };
  }

  try {
    const fullLedgerRes = await admin
      .from('credit_ledger')
      .select('id, chain_seq, licence_id, body_id, entry_type, points, hours, category, effective_date, attestation_status, created_at')
      .eq('event_id', eventId)
      .in('body_id', distinctBodyIds)
      .order('chain_seq', { ascending: true });
    if (fullLedgerRes.error) return { ok: false, error: fullLedgerRes.error.message };
    const fullLedger = fullLedgerRes.data ?? [];

    const licenceIds = [...new Set(fullLedger.map((r) => r.licence_id as string))];
    const licencesRes = await admin
      .from('practitioner_licences')
      .select('id, licence_number, licence_type')
      .in('id', licenceIds);
    if (licencesRes.error) return { ok: false, error: licencesRes.error.message };
    const licenceById = new Map<string, { licence_number: string; licence_type: string | null }>();
    for (const l of licencesRes.data ?? []) {
      licenceById.set(l.id as string, {
        licence_number: (l.licence_number as string) ?? '',
        licence_type: (l.licence_type as string | null) ?? null,
      });
    }

    // Per-body rule_version hash from the packages (already computed by the
    // seam) — mirrored into CSV rows so a spreadsheet reader can pin an entry
    // to its pack version without opening the JSON. null means the pack was
    // missing/empty for that body (rule_version_status: 'missing') — leave
    // the CSV cell blank rather than emit a sentinel a reviewer would read
    // as a real hash.
    const hashByBody = new Map<string, string>();
    for (let i = 0; i < distinctBodyIds.length; i++) {
      const bodyId = distinctBodyIds[i];
      const pkg = packages[i];
      if (pkg?.rule_version) hashByBody.set(bodyId, pkg.rule_version);
    }

    const csvRows: CsvRow[] = fullLedger.map((r) => {
      const body = bodyById.get(r.body_id as string);
      const lic = licenceById.get(r.licence_id as string);
      return {
        event_id: eventId,
        event_title: (event.title as string) ?? '',
        event_start_time: (event.start_time as string) ?? '',
        event_timezone: (event.timezone as string) ?? '',
        body_id: (r.body_id as string) ?? '',
        body_short_name: body?.short_name ?? '',
        body_full_name: body?.full_name ?? '',
        licence_id: (r.licence_id as string) ?? '',
        licence_number: lic?.licence_number ?? '',
        licence_type: lic?.licence_type ?? null,
        ledger_entry_id: (r.id as string) ?? '',
        chain_seq: Number(r.chain_seq),
        chain_verified: chainVerdictForEntry(packages, r.id as string),
        entry_type: (r.entry_type as string) ?? '',
        points: r.points == null ? '' : String(r.points),
        hours: r.hours == null ? '' : String(r.hours),
        category: (r.category as string) ?? '',
        effective_date: (r.effective_date as string) ?? '',
        attestation_status: (r.attestation_status as string) ?? '',
        created_at: (r.created_at as string) ?? '',
        rule_version_hash: hashByBody.get(r.body_id as string) ?? '',
      };
    });

    // Q2 orchestrator internals stripped for the College-facing JSON — the
    // underlying claim schema keeps them (agents + tests still need them);
    // the export layer decides what a College clerk sees.
    const externalPackages = packages.map(stripInternalFields);
    const claimsJson = JSON.stringify(
      { event_id: eventId, generated_at: generatedAt, packages: externalPackages },
      null,
      2,
    );
    const csv = toCsv(csvRows);
    // Slug truncates at 60 chars; two exports of the same event within one
    // second can share a slug + truncated timestamp and silently overwrite
    // in the browser downloads folder. Suffix with the first 8 chars of the
    // event id so sibling exports across events never collide either.
    const slug = slugify((event.title as string) ?? 'event');
    const filename = `evidence-${slug}-${eventId.slice(0, 8)}`;

    return {
      ok: true,
      jsonBase64: Buffer.from(claimsJson, 'utf8').toString('base64'),
      csvBase64: Buffer.from(csv, 'utf8').toString('base64'),
      filename,
      bodyCount: distinctBodyIds.length,
      entryCount: fullLedger.length,
    };
  } catch (err) {
    return {
      ok: false,
      error: errorMessageOr(err, 'Failed to build evidence export.'),
    };
  }
}

/**
 * Look up the per-entry chain verdict emitted by the participation agent.
 * Missing → 'unknown' (matches the agent's own semantics for a chain check
 * that has not run against that seq).
 */
function chainVerdictForEntry(packages: EvidencePackage[], entryId: string): 'yes' | 'no' | 'unknown' {
  for (const pkg of packages) {
    for (const claim of pkg.claims) {
      if (claim.evidence_refs.includes(entryId)) {
        if (claim.status === 'attendance_verified') return 'yes';
        if (claim.human_review_required) return 'unknown';
        return 'no';
      }
    }
  }
  return 'unknown';
}
