# Skylar Role + Admin Access Log

Changes included:

- Added SQL to set Skylar as Service Writer instead of Manager.
- Added `access_logs` table for login/access tracking.
- App records a login/access row after a valid profile loads.
- Admin tab now shows a Login / Access Log panel below the Audit Log.

Run these in Supabase SQL Editor before/after deploy:

1. `supabase/access_logs.sql`
2. `supabase/skylar_service_writer_role.sql`
