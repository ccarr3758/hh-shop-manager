# Live Start Schedule Update

This update makes the schedule switch from planned time to actual time after Start is pressed.

## Rule

Before Start:
- Schedule uses `jobs.start_time`.
- Display label shows `planned`.

After Start:
- Mobile Manager / Foreman Start writes `production_started_at`.
- Schedule uses `production_started_at` as the effective start time.
- Projected finish recalculates from the actual start time.
- Book time still stays unchanged.
- Scheduled start is preserved for reporting.

## Example

Planned:
- Start: 09:00
- Book: 4.0 hrs
- Finish: 13:00

Actual Start Pressed:
- 09:37

Live schedule:
- Start: 09:37 actual
- Book: 4.0 hrs
- Finish: 14:37 if lunch is crossed
