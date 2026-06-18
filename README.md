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


## Helper Curve Fix

Latest update changes helper performance so helper time acts as a small positive curve instead of a multiplier:

- Helper book hours are capped at 100% of helper actual hours.
- Helper curve bonus is +0.5 efficiency point per hour helped.
- Helper curve bonus is capped at +5.0 percentage points.
- This prevents short helper assignments from creating extreme efficiency values like 344%.
