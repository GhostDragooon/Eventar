'use server';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';

function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz }).format(0);
    return true;
  } catch {
    return false;
  }
}

export const eventInputSchema = z
  .object({
    title: z.string().trim().min(1, 'Title required').max(200),
    topic: z.string().trim().max(80).optional().default(''),
    format: z.enum(['workshop', 'seminar', 'roundtable', 'other']).optional(),
    start_time: z.string().datetime(),
    end_time: z.string().datetime(),
    timezone: z.string().refine(isValidTimezone, 'Invalid IANA timezone'),
    location: z.string().trim().max(200).optional().default(''),
    description: z.string().max(4000).optional().default(''),
    agenda: z.string().max(8000).optional().default(''),
    max_attendees: z.coerce.number().int().positive().optional(),
  })
  .refine((d) => new Date(d.end_time) > new Date(d.start_time), {
    message: 'End time must be after start time',
    path: ['end_time'],
  });

export type EventInput = z.infer<typeof eventInputSchema>;

export async function createEvent(formData: FormData) {
  const staff = await requireStaff();

  const parsed = eventInputSchema.safeParse({
    title: formData.get('title'),
    topic: formData.get('topic'),
    format: formData.get('format') || undefined,
    start_time: formData.get('start_time'),
    end_time: formData.get('end_time'),
    timezone: formData.get('timezone'),
    location: formData.get('location'),
    description: formData.get('description'),
    agenda: formData.get('agenda'),
    max_attendees: formData.get('max_attendees') || undefined,
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; '),
    };
  }

  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from('events')
    .insert({ ...parsed.data, created_by: staff.id, status: 'draft' })
    .select('id')
    .single();

  if (error) return { error: error.message };

  revalidatePath('/dashboard');
  redirect(`/events/${data.id}/edit`);
}
