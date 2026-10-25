-  // RLS lets any signed-in session read every organisation's PUBLISHED events, so
-  // scope to the caller's own, like app/dashboard/data.ts (eventar_staff sees all).
-  let eventsQuery = supabase
-    .from('events')
+  const { data: events, error: eventsErr } = await ownEvents(
+    supabase,
+    staff,
+    'id, title, start_time, end_time, timezone, status, venue_name, registration_close_at, registration_open_at, deleted_at',
+  )
...
a /checkin status=200 loc=- sees=[aLive]
b /checkin status=200 loc=- sees=[bLive]
x /checkin status=200 loc=- sees=[aLive,bLive]