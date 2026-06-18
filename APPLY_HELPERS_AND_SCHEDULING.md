# Apply these changes

1. Push this project to GitHub or replace your local project files with this folder.
2. In Supabase, open SQL Editor and run:

```sql
supabase/job_helpers.sql
```

3. Deploy/rebuild the app.

Included changes:
- lunch-aware book time calculations using 12:00 PM–1:00 PM as non-working time
- job finish times that skip lunch and stop at shop close
- roll-over button in Mobile Manager
- assisting/helper technician assignments
- helper start time and helper book hours calculated from helper start to remaining job finish
- helper shows on schedule and live availability as `Assisting <lead tech>`
