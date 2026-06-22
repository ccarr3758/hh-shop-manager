# Safe Migration Note

Use `supabase/mobile_performance_update_v4.sql` for this update.

This migration is non-destructive:

- No `DROP TABLE`
- No `TRUNCATE`
- No `DELETE FROM`
- No database reset
- Existing users, companies, products, jobs, technicians, and history are preserved

The previous version attempted to insert `sort_order` into `public.statuses`. Some live H&H databases do not have that column, so this corrected version inserts the Paused status using only:

- `company_id`
- `name`
- `color`

Run the corrected migration once in Supabase SQL Editor.
