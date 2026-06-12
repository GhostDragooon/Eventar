import { z } from 'zod';
import {
  SESSION_FORMAT_VALUES,
  VALUE_PROPOSITION_VALUES,
  EXPECTATIONS_VALUES,
  FUTURE_PREFERENCE_VALUES,
} from '@/lib/surveyTemplate';

// All fields optional (product decision: all questions optional, empty submit allowed).
export const surveyInputSchema = z.object({
  session_format:     z.enum(SESSION_FORMAT_VALUES).optional(),
  // Q2 (G1): most valuable session — an agenda_blocks uuid, or the 'general'
  // sentinel ("General sessions / overall"). The action verifies the block
  // belongs to the registration's event; Zod only pins the shape.
  valuable_session:   z.union([z.string().uuid(), z.literal('general')]).optional(),
  value_proposition:  z.enum(VALUE_PROPOSITION_VALUES).optional(),
  expectations:       z.enum(EXPECTATIONS_VALUES).optional(),
  future_preferences: z.array(z.enum(FUTURE_PREFERENCE_VALUES)).default([]),
});

export type SurveyInput = z.infer<typeof surveyInputSchema>;

// Returned by the Server Action. Never throws on user-recoverable errors.
export type SubmitSurveyResult = { ok: true } | { error: string };
