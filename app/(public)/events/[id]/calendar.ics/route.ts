import { NextResponse, type NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { rateLimitByIp } from '@/lib/rateLimit';
import { getRequestOrigin } from '@/lib/origin';
import { buildIcs } from '@/lib/calendarLinks';

// Public .ics download — the "Apple Calendar" link in Email #1. Published
// events only (anon RLS enforces the same); rate-limited like every public
// GET endpoint. Not under /api/* (that namespace is reserved for Phase 9
// cron callbacks); this is a public resource of the event page.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const limit = await rateLimitByIp('calendarIcs', { windowMs: 60_000, max: 60 });
  if (!limit.allowed) return new NextResponse('Too many requests', { status: 429 });

  const supabase = await supabaseServer();
  const { data: event } = await supabase
    .from('events')
    .select('id, title, status, start_time, end_time, venue_name, venue_address')
    .eq('id', id)
    .maybeSingle();
  if (!event || event.status !== 'published') {
    return new NextResponse('Not found', { status: 404 });
  }

  const origin = await getRequestOrigin();
  const venue = event.venue_address ? `${event.venue_name}, ${event.venue_address}` : event.venue_name;
  const ics = buildIcs({
    title: event.title,
    startIso: event.start_time,
    endIso: event.end_time,
    venue,
    detailsUrl: `${origin}/events/${event.id}`,
    uid: event.id,
  });

  return new NextResponse(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="event.ics"',
    },
  });
}
