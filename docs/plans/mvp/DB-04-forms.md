# DB-04 (TypeScript half) The edit form carries agenda block ids, so a second save updates blocks instead of copying them
STATUS: DONE. Nothing staged or committed. Evidence tags: [X] executed, [R] read, [I] inferred.

## Changed
- `app/events/new/schema.ts`: `blockInputSchema` gains `id: z.string().uuid().optional()`.
- `app/events/[id]/edit/updateAction.ts`: after the RPC succeeds it reads `agenda_blocks.id` for the event ordered by `display_order` through the user-scoped client and returns `{ ok: true, blockIds }`. A read error or a count different from the payload returns an error saying the changes were saved and the page must be reloaded (no guessed mapping). `event_not_draft: ...` becomes the same sentence the action's own gate uses; `block_has_survey_answers: <title>` becomes `The block "<title>" has survey answers, so it cannot be removed. Nothing was saved.`; any other message is passed through.
- `app/events/new/NewEventForm.tsx`: new `savedBlockIds` state (localId to database id), seeded from `initialBlocks`; the payload sends `id: savedBlockIds[b.localId]`; after a successful edit save the returned ids are written back by the order the blocks were sent. `SubmitResult` gains optional `blockIds`.
- Tests: `app/events/new/schema.test.ts` (new), `app/events/new/NewEventForm.test.tsx`, `app/events/[id]/edit/updateAction.test.ts`.
- NOT changed, deliberately: `components/event-form/AgendaSection.tsx` and `app/events/[id]/edit/page.tsx` [R]. The page already passes `id: b.id` in `initialBlocks`, and `initialBlocksFrom` already sets `localId: b.id` for loaded blocks. A new block's `localId` is a client-only random uuid, so it cannot be sent as `id`. I kept the saved ids in a separate map rather than a new `id` field on `BlockDraft` because `blocks` feeds the dirty-check snapshot: a write-back into `blocks` would make a just-saved draft look unsaved [I].

## Tests and mutations (each restored with `cmp`, then the files rerun green) [X]
- `schema.test.ts :: keeps the id of a block that already exists`, `leaves a new block without an id`, `rejects an id that is not a uuid`. Mutants: id line removed (2 fail here, plus 3 in updateAction tests), `.uuid()` dropped (the reject test fails here and in updateAction).
- `updateAction.test.ts :: agenda block ids (DB-04)`: sends existing id and none for new; returns ids in payload order for a reordered payload with a new block (the mock's table is stored in reverse and only an `ORDER BY display_order` fixes it; mutant `ascending: false` fails it); rejects a non-uuid id with no RPC call; count mismatch (mutant: check removed, fails); read-back error; `event_not_draft` sentence; survey-answers sentence (mutant: raw `error.message`, both mapping tests fail). Existing success assertions changed from `{ ok: true }` to `{ ok: true, blockIds: [...] }`. One existing assertion, `expect(result).not.toEqual({ ok: true })` in the malformed `checkin_modes` test, would now pass on a success too, so it became `toHaveProperty('error')`. The operator test's comment was replaced as instructed; its assertions are unchanged apart from the new result shape.
- `NewEventForm.test.tsx :: agenda block ids across saves (edit mode)`: (1) existing block sends its id, the added block sends none, the second save sends the id the first save returned for it and keeps the titles; (2) removing the first block leaves the second block with its own id at `display_order` 0, not the removed block's id. Mutants: `id: undefined` (both fail), write-back removed (1 fails), ids taken by position (2 fails), `localId` used as id (1 fails).

## Gates [X]
`tsc --noEmit` exit 0. `eslint .` 0 errors, 11 warnings (none in my files). Full `vitest run --maxWorkers=4` with local-stack env: 205 files passed, 50 skipped; 1816 tests passed, 507 skipped. `check:ui-colours` fails only at `DashboardWorkstation.tsx:202` and `:362` (rgba); `check:ui-primitives` fails at 7 sites in `ProfileClient`, `RosterClient`, `OrgOnboardingClient`, `DashboardWorkstation`, `MultiBodyAccreditationWizard`. None of those files is in my diff, so none is new. No flaky test appeared. `next build` and `test:rls` not run (coordinator).

## Live check [X] (:3100, pane, ux-admin session; draft `DB-04 live check draft` made by SQL)
The pane was already signed in as ux-admin (an `auth.sessions` row for that user; I did not run the magic-link flow, the latest Mailpit message to that address is from 10:32Z). Read-backs of `agenda_blocks` (id prefix, title, display_order):
1. Added Alpha and Bravo (two Breaks), Save: `4ee3b01f Alpha 0`, `39fbcc97 Bravo 1`.
2. Added Charlie, Save, no reload: Alpha and Bravo keep their ids, `555a07be Charlie 2`. Three rows, no copies.
3. Save with no edit: identical three rows (proves Charlie's returned id is carried).
4. Removed Alpha (index 0), Save: `39fbcc97 Bravo 0`, `555a07be Charlie 1`. Ids unchanged, indexes shifted.
5. Inserted a survey response pointing at Charlie, removed Charlie in the form, Save: the form showed `The block "DB-04 Charlie" has survey answers, so it cannot be removed. Nothing was saved.`; the table still held Bravo 0 and Charlie 1.
The form has no reorder control (blocks keep add order; Components and Breaks are separate lists over one array), so a true reorder could not be driven; step 4 is the nearest reachable case and the unit test covers payload-order mapping.

## Deviations
Separate `savedBlockIds` map instead of an `id` on `BlockDraft`, with `AgendaSection.tsx` and `page.tsx` untouched (reason above). The "reorder keeps ids" form test is a removal test for the reason above. I left the pane's auth cookie in place (httpOnly, not mine to clear without signing out whoever shares the jar) and cleared localStorage and sessionStorage.

## Open questions for Ivan
1. After the survey-answers refusal the form still shows the block as removed while the database keeps it; the message says nothing was saved but the screen does not restore the block. Reload fixes it. Wanted: restore the block on that refusal, or leave it?
2. A block's survey answer pins it permanently, and there is no way to delete such a block from the UI. Intended for MVP?

## Create flow
Unchanged [R]. `createEvent` parses the same schema, but the form never has ids in create mode (`savedBlockIds` is empty, so `id` is `undefined` and is dropped when serialised), and `create_event_with_blocks` (last redefined in `20261002000000`, not touched by the DB-04 migration) reads each block field by `block->>'name'` and never reads `id`.

## Fixtures
Created: event `db040000-0000-4000-8000-000000000001`, its 3 blocks, one registration (`db04-fixture@example.invalid`), one survey response. All removed by deleting the event (cascade); read back: 0 events, 0 DB-04 blocks, 0 registrations, 0 survey responses, `agenda_blocks` total back to 1.

## Suggested commit message
feat(agenda): the edit form sends agenda block ids, so a second save updates blocks instead of copying them; a block with survey answers refuses removal in plain words
