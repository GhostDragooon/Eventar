// tests/helpers/mustDelete.ts — fail-loud fixture cleanup.
//
// Every RLS suite's afterEach/afterAll used to call `admin.from(x).delete()...`
// bare, discarding any error. A cleanup failure (e.g. a grant regression, a
// blocked delete on an append-only table used by mistake) then went silent:
// the test run still reported green while leaving orphan fixture rows behind
// on the live project. Wrap every cleanup delete so it throws instead.
export async function mustDelete(
  op: PromiseLike<{ error: { message: string; code?: string } | null }>,
  label: string,
): Promise<void> {
  const { error } = await op;
  if (error) throw new Error(`mustDelete(${label}): ${error.message}${error.code ? ` [${error.code}]` : ''}`);
}
