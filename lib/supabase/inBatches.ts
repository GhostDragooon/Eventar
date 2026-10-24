import type { PostgrestError } from '@supabase/supabase-js';

// PostgREST's db.max_rows (supabase/config.toml): a read that returns this many rows may have been cut, silently.
export const MAX_ROWS = 1000;

// An `.in()` puts every id in the request URL: 242 uuids are a 9 KB URL and the gateway answers 414. 100 ids are
// about 3.7 KB.
export function idBatches(ids: string[], size = 100): string[][] {
  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += size) batches.push(ids.slice(i, i + size));
  return batches;
}

// Runs `run` once per batch of at most 100 ids and merges the rows. Any failed batch gives the error and no rows,
// never a partial result: the caller keeps its own `if (res.error)` check.
// ponytail: a batch whose matching rows exceed PostgREST's max_rows (1000) is still cut without an error. Only a
// lookup keyed on a non-unique column can reach that (at most 100 rows per batch otherwise), so the caller checks
// its own batch length; paginate with .range() if one ever needs more.
export async function selectInBatches<T>(
  ids: string[],
  run: (batch: string[]) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
): Promise<{ data: T[]; error: PostgrestError | null }> {
  const results = await Promise.all(idBatches(ids).map(run));
  const error = results.find((r) => r.error)?.error ?? null;
  return { data: error ? [] : results.flatMap((r) => r.data ?? []), error };
}
