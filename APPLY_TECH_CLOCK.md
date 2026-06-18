# H&H Tech Clock / Availability Update

## Supabase step

Run this file in Supabase SQL Editor before using the new tab:

```txt
supabase/technician_attendance.sql
```

## App changes included

- New manager/admin-only nav tab: `Tech Clock`
- Clock In / Clock Out / Absent controls for active technicians
- `Live Technician Availability` now shows techs who are not clocked in as `Not Available`
- Shop capacity now uses clocked-in active technicians instead of every active technician
- Realtime refresh added for `technician_attendance`

## Behavior

A technician is available only when they have a row for the selected work date with:

```txt
clock_in_at = set
clock_out_at = null
```

No attendance row means they are not clocked in and will show unavailable.
