# Helper Performance Update

This version includes helper hours in technician performance without increasing job count.

## New performance behavior

Ended helper assignments now contribute to technician stats:

- Helper credited book hours add to total book hours.
- Helper actual hours add to total actual hours.
- Helper assignments do not add to completed job count.
- Efficiency is calculated using primary job hours plus ended helper hours.
- Monthly leaderboard includes helper hours for the current month.
- Shop dashboard/performance includes helper hours for the selected day.

## Example

Matt completes 3 primary jobs and later helps Wayne:

- Primary jobs: 8.0 book / 7.0 actual
- Helper time: 1.1 credited book / 1.0 actual

Matt performance becomes:

- Jobs completed: 3
- Total book hours: 9.1
- Total actual hours: 8.0
- Efficiency: 113.75%

The helper time improves performance stats but does not count as another completed job.
