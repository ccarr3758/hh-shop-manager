# Helper 110% Cap Update

Helper performance is now calculated as a capped helper bucket:

- Helper Actual Hours = real working time spent helping, lunch-aware.
- Helper Book Credit = Helper Actual Hours × 1.10.
- Helper Efficiency = capped at 110%.
- Helper credit no longer compounds based on remaining job book time or over-book status.
- Overall technician efficiency blends primary work and helper work using actual helper hours in the denominator.

Example:

- Brad helps for 2.0 actual hours.
- Brad receives 2.2 helper book credit.
- Brad's helper efficiency contribution is 110%, not 200%+.

Older helper rows with excessive stored `book_hours` are capped in the performance reports by comparing stored helper book hours against `actual_hours × 1.10`.
