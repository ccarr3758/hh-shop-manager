# v3.3 Comebacks / Rework + Admin Audit Log

## Added

- Comeback / rework tracking.
- Comebacks are tied to the original completed job.
- Original installer is captured from the original job's technician.
- Rework technician and rework hours are tracked separately.
- Admin Audit Log panel.
- Audit events are written for core actions such as job edits, job creation, helpers, rollovers, deletions, and comeback changes.

## Supabase

Run this file in Supabase SQL Editor:

```sql
supabase/comeback_rework_audit.sql
```

## Location in app

Admin tab:

- Comebacks / Rework
- Audit Log

## Important distinction

- `original_technician_id` = technician tied to the original install.
- `rework_technician_id` = technician who corrected the comeback.
- `rework_hours` = hours spent correcting the issue.
