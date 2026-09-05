import { z } from 'zod';

export const KINDS = [
  'workshop','seminar','webinar','scientific_program',
  'panel','roundtable','keynote','other',
  'break','transition',
] as const;

// Wave 2 — partner reference for hosted_by / organized_by. URL is optional
// (some partners just have a name). Empty string normalises to undefined so
// the DB sees null rather than ''. Hard cap at 8 partners per side to keep
// the PE strip layout readable.
const partnerSchema = z.object({
  name: z.string().trim().min(1, 'Partner name required').max(80),
  url: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v === '' || v === undefined ? undefined : v))
    .pipe(z.string().url().optional()),
});
export type Partner = z.infer<typeof partnerSchema>;
export const PARTNER_MAX = 8;

const topicSchema = z.object({
  title: z.string().trim().min(1).max(200),
  speaker_name: z.string().trim().min(1).max(100),
  speaker_credential: z.string().trim().max(120).optional().default(''),
  speaker_affiliation: z.string().trim().max(120).optional().default(''),
});

export const blockInputSchema = z.object({
  start_time: z.string().datetime(),
  end_time: z.string().datetime(),
  kind: z.enum(KINDS),
  title: z.string().trim().min(1).max(200),
  host: z.string().trim().max(120).optional().default(''),
  topics: z.array(topicSchema).default([]),
  notes: z.string().max(2000).optional().default(''),
  display_order: z.number().int().nonnegative().default(0),
})
.refine(d => new Date(d.end_time) > new Date(d.start_time), {
  message: 'Block end must be after start', path: ['end_time'],
})
.refine(d => !(d.kind === 'break' || d.kind === 'transition') || d.topics.length === 0, {
  message: 'Break/transition blocks must not have topics', path: ['topics'],
});

export const eventInputSchema = z.object({
  title: z.string().trim().min(1, 'Event name required').max(200),
  topic: z.string().trim().max(80).optional().default(''),
  description: z.string().max(4000).optional().default(''),
  start_time: z.string().datetime(),
  end_time: z.string().datetime(),
  venue_name: z.string().trim().min(1, 'Pick a venue from the dropdown').max(200),
  venue_address: z.string().trim().max(300).optional().default(''),
  city: z.string().trim().min(1).max(120),
  region: z.string().trim().max(120).optional().default(''),
  country: z.string().trim().min(1).max(120),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  max_attendees: z.coerce.number().int().positive().optional(),
  hosted_by:    z.array(partnerSchema).max(PARTNER_MAX).default([]),
  organized_by: z.array(partnerSchema).max(PARTNER_MAX).default([]),
  hero_image_url: z
    .string()
    .trim()
    .max(500)
    .optional()
    .default(''),
  // Editor v4: explicit registration window (open → close) + the profession
  // category behind the dashboard tag / public-list tabs. All optional.
  registration_open_at:  z.string().datetime().optional(),
  registration_close_at: z.string().datetime().optional(),
  // WP5 E1 (2026-09-05) — profession categories aligned to Eventar's HK medical
  // CPD audience: medicine_dentistry / allied_health / other. Old cross-industry
  // keys (life_sciences / engineering / finance / technology) are removed. No
  // events use them (WP5 E1 rename shipped alongside; the public /events tabs
  // and this picker were mismatched between shipping and now, guaranteeing every
  // non-All tab was empty). If any legacy row exists with an old key, it fails
  // this validate — that's the intended fail-visibly (Rule 12) posture: an
  // organiser sees the mismatch and picks a valid category on next save.
  category: z.enum(['medicine_dentistry', 'allied_health', 'other']).optional(),
  // How attendance is captured at the door. `self_serve` is the only half the
  // form offers: nothing reads `staff` (mark_attended has no flag check), so a
  // staff toggle would be a control that does nothing — the form sends
  // `staff: true` constant, which is the accurate description of reality.
  //
  // The default MUST match events.checkin_modes' column default. Both event
  // RPCs are full-replace, so a drift between the two defaults would silently
  // change how the door works on a no-edit Save.
  checkin_modes: z
    .object({ staff: z.boolean(), self_serve: z.boolean() })
    .default({ staff: true, self_serve: false }),
})
.refine(d => new Date(d.end_time) > new Date(d.start_time), {
  message: 'End time must be after start time', path: ['end_time'],
})
.refine(
  d => !d.registration_open_at || !d.registration_close_at ||
    new Date(d.registration_close_at) > new Date(d.registration_open_at),
  { message: 'Registration must close after it opens', path: ['registration_close_at'] },
);

export type EventInput = z.infer<typeof eventInputSchema>;
export type BlockInput = z.infer<typeof blockInputSchema>;
