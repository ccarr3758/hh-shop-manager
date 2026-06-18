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
