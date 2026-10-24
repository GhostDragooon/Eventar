// Test doubles for the staff list/detail PAGES: async Server Components that read
// through supabaseServer()/supabaseAdmin() and decide with canManageEvent().
//
// Unlike the "every method returns an empty chain" fakes used where a test only
// needs props to exist, this one APPLIES eq/in/is/gte filters and PROJECTS the select
// list. That lets a test state what a given staff member's query would return, and
// it catches the gate that reads a column the select forgot to ask for
// (canManageEvent sees `undefined`, and every owner is redirected).
//
// Deliberately not imported from tests/helpers/clients.ts: that module loads
// .env.local (which points at the Seoul production project) at import time.

type Row = Record<string, unknown>;
export type Tables = Record<string, Row[]>;

// Split a select list on top-level commas, so `a, b, c(d, e)` yields a, b, c(...).
// Embedded selects are dropped: no page test seeds the child rows they would carry.
function selectedColumns(list: string): string[] | null {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of list) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  const cols = parts.map((c) => c.trim()).filter((c) => c && !c.includes('('));
  return cols.length === 0 || cols.includes('*') ? null : cols;
}

export function fakeSupabase(tables: Tables) {
  return {
    from(table: string) {
      let rows: Row[] = tables[table] ?? [];
      let cols: string[] | null = null;
      const project = (r: Row): Row => (cols ? Object.fromEntries(cols.map((c) => [c, r[c]])) : r);
      const q = {
        select(list?: string) {
          if (typeof list === 'string') cols = selectedColumns(list);
          return q;
        },
        eq(col: string, val: unknown) {
          rows = rows.filter((r) => r[col] === val);
          return q;
        },
        in(col: string, vals: unknown[]) {
          rows = rows.filter((r) => vals.includes(r[col]));
          return q;
        },
        // Timestamps only (ISO strings): the pages use it for "end_time >= now".
        gte(col: string, val: string) {
          rows = rows.filter((r) => Date.parse(r[col] as string) >= Date.parse(val));
          return q;
        },
        is(col: string, val: unknown) {
          rows = rows.filter((r) => (r[col] ?? null) === val);
          return q;
        },
        // Ordering, limits and `not` never change WHO may see a row, so they are no-ops.
        order: () => q,
        limit: () => q,
        not: () => q,
        maybeSingle: async () => ({ data: rows[0] ? project(rows[0]) : null, error: null }),
        then<T>(
          resolve: (v: { data: Row[]; count: number; error: null }) => T,
          reject?: (e: unknown) => T,
        ) {
          return Promise.resolve({ data: rows.map(project), count: rows.length, error: null }).then(resolve, reject);
        },
      };
      return q;
    },
  };
}

// ---- fixtures ---------------------------------------------------------------
export const NOW = Date.parse('2026-10-10T08:00:00Z');
const at = (minutesFromNow: number) => new Date(NOW + minutesFromNow * 60_000).toISOString();

// A published event that is live at NOW; pass overrides for everything that matters.
export function eventRow(over: Row): Row {
  return {
    title: 'Event',
    start_time: at(-30),
    end_time: at(180),
    timezone: 'Asia/Hong_Kong',
    status: 'published',
    venue_name: 'Venue',
    registration_close_at: null,
    registration_open_at: null,
    deleted_at: null,
    max_attendees: null,
    created_by: 'staff-x',
    accrediting_body_id: null,
    cpd_hours: null,
    ...over,
  };
}
// Ended two days ago but still `published`: the shape that makes it a "completed"
// lifecycle without the cron that would flip the row (Stage 8).
export const ended = { start_time: at(-60 * 48), end_time: at(-60 * 46) };

// ---- reading what a page returned -------------------------------------------
type Node = { props?: { children?: unknown; href?: unknown } };

export function textOf(node: unknown): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(' ');
  return textOf((node as Node).props?.children);
}

export function hrefsOf(node: unknown): string[] {
  if (node == null || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(hrefsOf);
  const props = (node as Node).props;
  return [...(typeof props?.href === 'string' ? [props.href] : []), ...hrefsOf(props?.children)];
}

// next/navigation's real redirect()/notFound() throw errors carrying a digest. Turn
// the three ways a page can end into data, so a test asserts the OUTCOME.
type Outcome = { kind: 'render'; tree: unknown } | { kind: 'redirect'; to: string } | { kind: 'notFound' };

export async function settle(run: () => Promise<unknown>): Promise<Outcome> {
  try {
    return { kind: 'render', tree: await run() };
  } catch (e) {
    const digest = typeof (e as { digest?: unknown })?.digest === 'string' ? (e as { digest: string }).digest : '';
    if (digest.startsWith('NEXT_REDIRECT;')) return { kind: 'redirect', to: digest.split(';')[2] };
    if (digest === 'NEXT_HTTP_ERROR_FALLBACK;404') return { kind: 'notFound' };
    throw e; // a real failure stays a failure (Rule 12)
  }
}

export async function treeOf(run: () => Promise<unknown>): Promise<unknown> {
  const out = await settle(run);
  if (out.kind !== 'render') throw new Error(`expected the page to render, but it ended as ${JSON.stringify(out)}`);
  return out.tree;
}
