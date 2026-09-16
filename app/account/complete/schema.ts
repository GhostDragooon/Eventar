// Types for the guided account-completion flow. Kept local to this route —
// the controlled-list read shape has exactly one consumer (this flow's
// page.tsx + CompleteClient), so no shared lib/controlledLists.ts file
// (ponytail: a file for one-line .from(x).select() calls with no shared
// logic is premature; add one when a second consumer needs it).

export type ControlledListOption = {
  code: string;
  label_en: string;
};
