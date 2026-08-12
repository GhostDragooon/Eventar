# Venue-scan check-in — design spec

_Written 2026-08-06. **Spec only — no production code.** The block-architecture admission checklist
passes 5 of 6; item 6 (current-milestone critical path) fails because the active phase is Stage 8,
so the guardrail's own instruction is "DEFERRED entry, not code". Ivan's call was to settle the
design now and build after Stage 8._

**Verification status of everything below:** the "what exists today" facts were read out of the
running database and the checked-in source, not from memory or from prior docs — the prior doc got
this wrong, see §1. Everything in §3 onward is proposed design and has been built by nobody.

---

## 1. Why this exists — the finding that triggered it

`docs/plans/2026-08-05-frontend-review.md` Decision 1 asked how to distinguish "the attendee tapped
their own pass" from "a staff member scanned them", treating both as legitimate paths. Ivan
rejected the premise on 2026-08-06: the intended product model is

> either attendees scan the QR code, or staff scan theirs. The other way is for staff to enter the
> attendee's code manually. No other way.

Checked against the code. What actually exists:

| Path | Exists? | Evidence |
|---|---|---|
| Staff scan the attendee's QR | **yes** | `ScanAndManual.tsx` → `mark_attended(p_method := 'qr')` |
| Staff key the attendee's code | **yes** | same component → `mark_attended(p_method := 'manual')` |
| **Attendee scans a QR at the venue** | **NO SUCH PATH** | the poster/event QR encodes `/events/{id}`, the public event page (`lib/qr.ts:21`). Nothing displayed at a venue checks anyone in. |
| Attendee taps a button on their own phone | **yes** | `ConfirmButton.tsx:63`, label "Confirm I'm here", subtitle "Tap when you arrive · staff will see you in the roster instantly" |

So self-serve check-in was **implemented as a tap, not as a scan**. The attendee's personal QR (from
the Email #2 reminder) encodes `/checkin/confirm?code=…` — *their own pass page*, never a scanner.

`self_check_in(p_code, p_ip)` guards, read from `pg_get_functiondef` on the live local DB: registration
exists → guess-rate-limit → rate-limit → not already attended → not cancelled → event published and
not soft-deleted → `checkin_modes.self_serve` is true → `now() >= start - 60 min` → `now() <= end_time`
→ UPDATE with predicate `status = 'registered'`.

**There is no location check, and grepping the whole repo for `geoloc|venue_token|proximity|nfc|beacon`
returns nothing.** That tap works from anywhere on earth inside the event window.

Mitigating: `checkin_modes` defaults to `{"staff": true, "self_serve": false}`, so the tap is off
unless switched on. The only event with it on is the demo seed (`scripts/demo/seed-demo.ts:377`),
which this spec's companion change flips to `false`.

---

## 2. The threat this must actually defeat

A venue QR is only evidence if it cannot be **photographed and forwarded**. That single attack is the
whole design problem — everything in §3 is a different answer to it.

Bar to clear: an attendee who is not at the venue should not be able to check themselves in without
a *live accomplice at the venue relaying to them in real time*. Real-time relay is not preventable by
any QR scheme and is the accepted industry bar; it also requires a confederate who is physically
present, which is a materially different evidentiary claim from "forwarded a photo yesterday".

**Non-goal:** defeating a determined collusive attacker. CPD attendance fraud at this bar is a
human-review problem (B8, advisory-only, never auto-action).

---

## 3. Token options — Ivan picks one at build time

All three keep the attendee's own phone as the scanning device and the door as the displaying device,
which is the reverse of today's staff-scan path.

### Option A — static per-event token

Door displays a QR encoding `/checkin/venue?e={eventId}&t={secret}`. `secret` is a column on `events`,
generated at publish.

- **Cost:** smallest. One column, one route, one guard in `self_check_in`.
- **Defeated by:** one photograph. Anyone who has ever seen the door QR can check in for the rest of
  the event, from anywhere.
- **Honest evidentiary value:** marginally above the current tap. Recommend against for a
  regulator-facing record; acceptable only if the venue scan is treated as convenience, not evidence.

### Option B — rotating QR on a staff door display

A new **staff** surface (`/events/{id}/door`) held open at reception on a tablet or laptop renders a
QR that regenerates every N seconds (proposed N = 30) from a per-event secret plus the current time
window — TOTP in shape. The server accepts the current window and one previous, absorbing clock skew
and slow scans.

- **Cost:** highest. New staff surface, rotation secret, clock-skew handling, and a device that has to
  stay awake and online at the door.
- **Defeated by:** real-time relay only. A photo is worthless in 30 seconds.
- **Bonus:** the display is opened by an authenticated staff member, so the token can carry *which
  staff session* was at the door. That is a candidate fix for the `credit_ledger.actor_id` gap
  (DEFERRED, "cannot reference a staff actor"), which currently degrades attribution to NULL.
- **Note:** the door display is an S-Organiser surface, and S-Organiser was **unfrozen 2026-08-01**,
  so it is not blocked by the frontend freeze. The attendee-facing half is not S-Organiser — see §7.

### Option C — rotating short code, no camera

Door displays a 4–6 character code rotating on the same schedule as B. The attendee types it into
their existing pass page; "Confirm I'm here" becomes "Enter the code shown at reception".

- **Cost:** between A and B. Same rotation machinery as B, but no camera permission, no scanner, and
  the attendee surface is a text input on a page that already exists rather than a new scan flow.
- **Defeated by:** real-time relay, same as B — but a short code is far easier to relay by voice or
  text than a QR is, so the practical bar is lower than B's.
- **Accessibility:** best of the three. No camera, works on any device, screen-reader friendly, and it
  reuses the manual-code affordance attendees are already shown ("If the QR won't scan, give
  reception this code instead").

**My recommendation: B, with C as the documented fallback** when a door device is unavailable —
they share one rotation secret and one server-side validator, so C costs little once B exists. A is
not worth building; it spends a migration and a route to arrive somewhere barely better than today.

---

## 4. What changes in the data model

Grounded in the live schema, not assumed:

1. **`registrations.check_in_method` CHECK is currently `= ANY (ARRAY['qr','manual'])`** — verified via
   `pg_get_constraintdef`. A venue scan needs its own value (proposed `'venue'`) so the ledger can
   answer "how was presence witnessed". **This closes review Decision 1**, which existed only because
   the tap and the staff scan both wrote `'qr'`. Widening a CHECK is a migration; existing `'qr'` rows
   stay ambiguous and should be left alone rather than backfilled.
2. **Rotation secret** — a column on `events` (option A) or a small `event_door_tokens` table if the
   secret must be rotatable independently of the event row. B1 owns it either way.
3. **`self_check_in` signature changes** from `(p_code, p_ip)` to `(p_code, p_ip, p_token)`. The token
   check slots in immediately after the existing `checkin_modes.self_serve` guard and before the window
   guards, and returns its own distinct result code (`bad_token`) — the confirm page maps every result
   code to its own attendee copy today, and that pattern must be extended, not collapsed into
   `default`. Collapsing it is precisely the bug fixed on 2026-08-04.
4. The hardcoded `check_in_method = 'qr'` at the UPDATE becomes `'venue'` on this path.

---

## 5. Kill switch and rollback

Already solved: `checkin_modes.self_serve` is the flag, defaults false, and is enforced *inside* the
definer function rather than in the UI. Turning it off disables the path without orphaning any record —
rows already written stay valid and keep their `'venue'` method. Admission-checklist item 4 passes on
the existing mechanism with no new work.

---

## 6. What this does NOT cover, deliberately

- **The visual design of the attendee-facing scan surface.** That is a new surface, which under the
  locked frontend pipeline runs `impeccable-design-polish` → `frontend-design` → the four taste skills
  → `ui-ux-pro-max` → `emilkowalski-motion` + `review-animations`, in that order. Specifying pixels
  here would pre-empt a pipeline Ivan locked on 2026-08-04. The flow is specified; the look is not.
- **Whether the door device is a tablet, a laptop or a phone** — an operations question, and it changes
  the display surface's layout constraints. Needs a real answer before B is built.
- **Multi-room events.** One rotating token per event means a single door. An event with two entrances
  either shares the secret (fine) or needs per-door tokens (not designed here).

---

## 7. Open questions Ivan must answer before build

1. **Which token option** — A, B or C (§3). Recommendation is B+C.
2. **Is the attendee-facing scan page inside or outside the freeze?** The pivot record puts
   "the practitioner app / S-Attendee" off-limits until post-M4, but `/checkin/confirm` is an existing
   public attendee surface that has been edited as recently as 2026-08-05. A *new* attendee surface is
   a different question from editing an existing one, and I could not find a ruling either way. This
   needs an explicit call, not an inference.
3. **Rotation period.** 30s proposed. Shorter is stronger and more frustrating on a bad venue network.
4. **Does the door token carry the staff session** (§3 option B bonus), which would let this close the
   `credit_ledger.actor_id` attribution gap at the same time? That widens the scope but kills two
   DEFERRED items with one migration.

---

## 8. Re-entry criterion

**Build when Stage 8 is closed** (deploy live, scheduler triggered, first real tick observed), **or
sooner if an accrediting body asks how attendance is witnessed** — that question makes the current
answer, "we cannot tell you, and the self-serve path had no location check at all", the blocking
problem rather than a deferred one.

Until then `checkin_modes.self_serve` stays `false` everywhere, including the demo seed.
