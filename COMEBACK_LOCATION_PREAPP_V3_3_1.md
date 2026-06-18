# v3.3.1 Comeback Location + Pre-App Ticket Update

Changes:
- Moved Comebacks / Rework out of Admin.
- Added it as a sub-tab inside Production Log.
- Audit Log remains in Admin.
- Added Pre-App Ticket / older install option when creating a comeback.

Use Pre-App Ticket when the original install predates H&H Shop Manager and there is no completed job record to tie to.

Run updated SQL:

```sql
supabase/comeback_rework_audit.sql
```
