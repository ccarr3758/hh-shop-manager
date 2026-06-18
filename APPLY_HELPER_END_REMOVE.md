# Helper End / Remove Update

This update changes helper handling into two separate actions:

## End Help
Use this when a helper stops helping and moves to another job.

The app:
- sets `end_time` to the current time
- freezes the helper's credited `book_hours`
- marks the helper row as `ended`
- keeps the record for reporting

Credited helper hours are calculated from helper start time to helper end time, lunch-aware, and capped at the primary job's projected finish.

## Remove
Use this only when the helper was assigned by mistake.

The app:
- deletes the helper assignment row
- credits zero hours
- makes it act like the helper was never assigned

## Supabase
Run the updated `supabase/job_helpers.sql` in Supabase SQL Editor. It now includes the lifecycle columns:

- `end_time`
- `status`
- `ended_at`
