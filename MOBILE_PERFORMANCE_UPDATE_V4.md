# H&H Shop Manager Mobile Performance Update v4

This build adds the approved technician mobile update:

- Waiting button replaced with Pause Job / Resume Job.
- Active labor time separates technician working time from elapsed shop time.
- Approved variance fields added to jobs.
- App notification center added.
- Foreman / Manager / Admin notifications for job assignment, status changes, pauses, resumes, completions, helper changes, approved variance, and shop records.
- Technician notifications for assigned jobs, beating book time, personal records, shop records, Hall of Fame entries, efficiency streaks, and no-comeback streaks.
- Hall of Fame records are based only on the product assigned to the work order from the Products page.
- Hall of Fame shop records unlock after 10 qualifying installs of the same product.
- Qualifying installs require normal completion, no approved variance, and no comeback.
- Mobile bottom navigation now prioritizes Home, Current Job, Performance, Records, and Alerts.

## Database migration

Apply this migration in Supabase before using the new controls:

`supabase/mobile_performance_update_v4.sql`

## Build result

`npm run build` completes successfully.
