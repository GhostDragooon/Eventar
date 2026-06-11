// lib/surveyTemplate.ts
//
// Single source of truth for the Phase-5 standard survey template. Display
// labels live here; the DB stores stable slugs (never display text). When the
// survey builder lands (future phase) these definitions move from this constant
// to a DB table — the render + validation code reads the same shape either way.

export const SESSION_FORMAT_VALUES = [
  'scientific_presentations', 'clinical_panels', 'interactive_qa', 'peer_networking',
] as const;
export const VALUE_PROPOSITION_VALUES = [
  'clinical_application', 'faculty_caliber', 'peer_collaboration', 'event_format',
] as const;
export const EXPECTATIONS_VALUES = [
  'exceeded', 'met', 'partially', 'not_met',
] as const;
export const FUTURE_PREFERENCE_VALUES = [
  'expanded_qa', 'increased_clinical_depth', 'structured_networking', 'subspecialty_topics',
] as const;

export type SessionFormat = (typeof SESSION_FORMAT_VALUES)[number];
export type ValueProposition = (typeof VALUE_PROPOSITION_VALUES)[number];
export type Expectation = (typeof EXPECTATIONS_VALUES)[number];
export type FuturePreference = (typeof FUTURE_PREFERENCE_VALUES)[number];

type Option<T extends string> = { value: T; label: string };

export const SESSION_FORMAT_OPTIONS: Option<SessionFormat>[] = [
  { value: 'scientific_presentations', label: 'Scientific Presentations' },
  { value: 'clinical_panels',          label: 'Clinical Panel Discussions' },
  { value: 'interactive_qa',           label: 'Interactive Q&A Sessions' },
  { value: 'peer_networking',          label: 'Peer Networking' },
];
export const VALUE_PROPOSITION_OPTIONS: Option<ValueProposition>[] = [
  { value: 'clinical_application', label: 'Practical insights for clinical application' },
  { value: 'faculty_caliber',      label: 'Scientific caliber of faculty' },
  { value: 'peer_collaboration',   label: 'Peer-to-peer collaboration opportunities' },
  { value: 'event_format',         label: 'Event format and organisation' },
];
export const EXPECTATIONS_OPTIONS: Option<Expectation>[] = [
  { value: 'exceeded',  label: 'Exceeded' },
  { value: 'met',       label: 'Met' },
  { value: 'partially', label: 'Partially' },
  { value: 'not_met',   label: 'Not Met' },
];
export const FUTURE_PREFERENCE_OPTIONS: Option<FuturePreference>[] = [
  { value: 'expanded_qa',              label: 'Expanded Interactive Q&A' },
  { value: 'increased_clinical_depth', label: 'Increased Clinical Depth' },
  { value: 'structured_networking',    label: 'Structured Networking' },
  { value: 'subspecialty_topics',      label: 'Diverse Sub-specialty Topics' },
];

export const KEY_HIGHLIGHTS_MAX = 2000;
