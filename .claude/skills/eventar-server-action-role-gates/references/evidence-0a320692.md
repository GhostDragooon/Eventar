if (row.status !== 'draft') {
      return { error: 'This event is no longer a draft, so its details cannot be edited yet.' };
    }
  }" with comment: "Only a draft can be edited here, whoever asks (the platform operator included)... Checked after the organisation gate so a stranger learns nothing about the status."

DB-04 amendment: "amended 2026-10-23 (Ivan's ruling, UPD card): until the audited post-publish edit (P9b) exists, `update_event_with_blocks` refuses any event whose status is not `draft`, with a specific code (`event_not_draft`), for every role including `eventar_staff`"