// Shared organiser-language translator for the CPD accreditation RPC error
// vocabulary (set_event_cpd_config + the C5 multi-body CRUD functions all
// raise the same codes/details — see docs/adr/0002-multi-body-accreditation.md
// and 20260820000000_multi_body_accreditation_crud.sql). Extracted so a third
// call site doesn't hand-roll this mapping a third time (flagged in the
// 2026-08-20 restructuring review, C4).
export type CpdRpcError = { code?: string; details?: string };

export function translateCpdRpcError(error: CpdRpcError): string {
  if (error.code === '23514') return 'That value is out of the allowed range.';
  if (error.code === 'P0002') return 'That record could not be found — it may already have been removed.';

  if (error.code === '22023') {
    if (error.details === 'cross_event_occurrence') {
      return 'That day belongs to a different event and can’t be linked here.';
    }
    if (error.details === 'ambiguous_schedule') {
      return 'Two schedule rows cover the exact same days — there’s no way to choose between them. Change one row’s days, or remove one of them.';
    }
    return 'Credits have already been issued for this event, so its accreditation can no longer be changed. Raise a correction instead.';
  }

  if (error.code === '42501') {
    if (error.details === 'not_authorised_for_body') {
      return 'Your organisation isn’t authorised by that accrediting body, so its events can’t be marked as accredited by them. This is arranged with the body directly.';
    }
    if (error.details === 'multi_body_configured') {
      return 'This event has a multiple-body accreditation set up below — use that section to change accreditation, not this field.';
    }
    return 'Only the event owner (or staff) can make this change.';
  }

  return 'Could not save the change. Try again.';
}
