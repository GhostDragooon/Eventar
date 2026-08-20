---
name: eventar-evidence
description: >
  Orchestrator skill for Eventar. Given an event id, it produces a complete,
  auditable evidence package for a professional or accredited activity. It fans
  out to three specialist subagents, one per permanently separate question, and
  synthesises their falsifiable claims into a single package. It never transfers
  trust, only the evidence needed for another party to recognise a trust
  decision. Use when an organiser requests an evidence package, a verified
  participation package, or a structured submission package.
version: 0.1.0
---

# eventar-evidence (orchestrator)

## 1. Directive layer (what this skill is and is not)

Eventar is an evidence and interoperability layer. It transfers the evidence
needed for one party to recognise the trust decision made by another. It does
not itself transfer trust. This skill inherits that boundary without exception.

Three questions stay permanently separate. This skill never collapses them.

- Q1. Was the activity approved by an identified accreditor?
- Q2. Did the practitioner complete the approved activity?
- Q3. Did the receiving institution accept the record for local compliance?

This skill can provide evidence for all three. It only declares Q3 when
independent confirmation is actually received. Absent that confirmation, Q3 is
reported as not confirmed, never inferred.

Hard prohibitions, mirrored from the repo coding contract:

- Do not accredit an activity.
- Do not decide how an authority should classify an activity.
- Do not determine a practitioner's overall CPD compliance.
- Do not assert that a receiving institution will accept a record.
- Never report success when something was bypassed. Fail visibly.
- No personal data in logs or claim bodies. Reference subjects by UUID only.

## 2. Orchestration layer (how a package is assembled)

Input: a single `event_id`, plus a `package_type` of one of
`activity_accreditation`, `verified_participation`, or `structured_submission`.

Steps:

1. Load the event, its pathway (`ordinary` or `accredited`), its frozen rule
   version, and its accreditation records. Do not proceed on an accredited
   package if the pathway is `ordinary`. Surface the conflict and stop.
2. Dispatch the three subagents. They run independently and must not read each
   other's drafts. Each returns a list of evidence claims that conform to
   `schema/evidence-claim.schema.json`.
   - `eventar-accreditation` answers only Q1, across N concurrent bodies.
   - `eventar-participation` answers only Q2, from the credit ledger.
   - `eventar-submission` prepares Q3 material without asserting Q3.
3. Gate before synthesis. If any subagent returns a claim with
   `human_review_required: true`, or a claim whose
   `how_would_we_know_this_failed` check is currently tripped, the package is
   marked `blocked` and generation of the final deliverable stops.
4. Synthesise. Only after the gate passes, assemble the claims into one package
   object, ordered Q1, then Q2, then Q3 material. Preserve every claim verbatim.
   Do not average or reconcile conflicting claims. Record disagreements.
5. Emit. Write a markdown package and the underlying claim JSON. PDF rendering is
   a later execution step, not part of this skill.

Multi body events (Task 10.8 shape). One event may carry several concurrent
accreditations with distinct point values, day or track splits, and approval
references. The accreditation subagent returns one Q1 claim per body. The
package presents them as a set, never merged into a single approval statement.

## 3. Execution layer (division of labour with deterministic code)

The subagents draft and explain. They do not compute audit truth. All of the
following stay in deterministic code in the repo, never in the model:

- credit ledger hash chain verification
- the freeze trigger on credited event configuration
- registration code and check in integrity checks
- any retry, routing, or threshold logic

The subagents read the outputs of that deterministic code and express what they
found as falsifiable claims. If a deterministic check has not run, the subagent
returns `human_review_required: true` rather than assuming a result.

## 4. Falsifiability contract (non negotiable)

Every claim carries four fields, enforced by the JSON schema:

- `observation`: the first principle observation the claim rests on.
- `depends_on`: the other claims or states this claim depends on.
- `how_would_we_know_this_failed`: the explicit falsification check.
- `leading_indicator`: the metric to monitor for early failure.

A claim without all four fields is invalid and must not enter a package.

## 5. Output shape

```
package = {
  package_id, event_id, package_type, pathway, rule_version,
  status: draft | blocked | ready,
  claims: [ ...evidence-claim objects, ordered Q1, Q2, Q3 ],
  generated_at, generated_by, package_version
}
```

Two artefacts per run: `EVIDENCE-PACKAGE.md` for humans and
`evidence-claims.json` for the audit record. The JSON is the source of truth.
The markdown is a projection.

## Honest limits (v0.1)

- Build-time authoring scaffold + executable Q2 CLI under `evidence/`.
  Not the Vercel or Supabase request path.
- Q2 is executable against mock or a future SupabaseParticipationSource.
  Q1 and Q3 are specified seams only until wired.
- Presence-only registrations (walk-in / pending account) are out of scope for
  v0.1 claim emission; do not narrate them as `attendance_verified`.
