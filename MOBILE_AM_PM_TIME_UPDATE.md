# Mobile Manager AM/PM Time Update

Changed user-facing time labels in the mobile manager and schedule cards from 24-hour values to AM/PM display.

Storage/calculation values remain unchanged:
- Database still stores time as `HH:mm` / timestamps.
- Inputs can still use native time controls.
- Displayed Start, Finish, and Helper Start/End now use AM/PM formatting.

Examples:
- `13:30` now displays as `1:30 PM`
- `08:00` now displays as `8:00 AM`
