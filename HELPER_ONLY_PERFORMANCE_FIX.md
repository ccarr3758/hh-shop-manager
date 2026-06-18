# Helper-Only Performance Fix

This update fixes the case where a foreman/manager has no assigned primary jobs but has helped other technicians.

Rules now used:

- Helper actual hours count in technician stats.
- Helper book hours count at 100% of helper actual hours.
- Helper curve remains separate: +0.5% per helped hour, capped at +5%.
- A technician with no primary jobs but active/ended helper time no longer shows as 0% just because they have no completed primary jobs.
- Active helpers show live contribution for today without requiring End Help first.

Example:

- Brad primary jobs: 0
- Brad helper time: 0.2 hrs
- Helper book: 0.2 hrs
- Base helper efficiency: 100%
- Helper curve: +0.1%
- Displayed efficiency: about 100%, not 0% and not 344%
