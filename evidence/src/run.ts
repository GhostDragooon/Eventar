/**
 * CLI entry for the Q2 evidence slice.
 *
 *   pnpm tsx evidence/src/run.ts event-accredited-clean
 *   pnpm tsx evidence/src/run.ts event-accredited-messy
 *   pnpm tsx evidence/src/run.ts event-not-frozen
 *   pnpm tsx evidence/src/run.ts event-ordinary
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MockParticipationSource } from './ledger/mockParticipationSource.js';
import { orchestrateParticipation } from './orchestrator.js';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '../out');

async function main(): Promise<void> {
  const eventId = process.argv[2] ?? 'event-accredited-clean';
  const source = new MockParticipationSource();

  const pkg = await orchestrateParticipation({
    eventId,
    packageType:
      eventId === 'event-ordinary' ? 'verified_participation' : 'participation_only',
    source,
    generatedBy: 'cli@eventar',
    generatedAt: '2026-08-20T09:00:00.000Z',
  });

  await mkdir(outDir, { recursive: true });
  const outPath = join(outDir, `evidence-claims.${eventId}.json`);
  await writeFile(outPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

  const summary = {
    event_id: pkg.event_id,
    status: pkg.status,
    claim_count: pkg.claims.length,
    human_review: pkg.claims.filter((c) => c.human_review_required).length,
    refuse_reason: pkg.refuse_reason ?? null,
    out: outPath,
  };
  console.log(JSON.stringify(summary, null, 2));

  if (pkg.status === 'refused' || pkg.status === 'blocked') {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
