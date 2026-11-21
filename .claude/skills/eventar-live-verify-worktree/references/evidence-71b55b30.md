ERROR:  column "start_at" does not exist
LINE 1: select id,status,start_at,end_at,created_by from events wher...
Columns of events (from the same run): start_time timestamp with time zone, end_time timestamp with time zone, status text 'draft'::text
registration_checkins FOREIGN KEY (occurrence_id) REFERENCES event_occurrences(id)