# H&H Shop Manager

Clean redeploy project snapshot.

Recent updates included:
- Lunch-aware scheduling
- Job rollover
- Helper technician assignments
- End Help / Remove helper lifecycle
- Technician clock-in availability
- Helper performance metrics
- Helper hours breakdown
- Helper 110% cap fix

## Helper 110% Cap Rule

Helper Actual Hours = real time spent helping.

Helper Book Credit = Helper Actual Hours × 1.10.

Helper credit is capped at 110% and does not compound based on remaining job book time or over-book status.

Older helper records with excessive stored book hours are capped in performance reporting using actual_hours × 1.10.


## Helper-Only Performance Fix

Technicians with no primary completed jobs but with helper hours now show helper contribution instead of sitting at 0%. Helper hours count at 100% in core performance, with a small separate Helper Curve bonus capped at +5%. Active helper time for today is included live.


## Live Start Scheduling

Start buttons now stamp `production_started_at`. Before a job is started, the schedule uses planned `start_time`. After Start is pressed, the schedule and projected finish use the actual start time while preserving the original planned start for reporting.

## Latest UI Update
- Mobile Manager now displays user-facing times in AM/PM format instead of military time.


## v3.0.1 Manager View UI

- Compact bottom navigation
- Larger technician name
- Prominent Book Time
- Live Time Remaining / Over By display
- Thin actual-start progress bar
