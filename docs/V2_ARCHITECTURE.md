# H&H Shop Manager V2 Architecture

This package is the first V2 refactor checkpoint.

## What changed

The production app is still intact, but the giant `App.jsx` has been moved into:

- `src/legacy/ProductionManager.jsx`

The new `src/App.jsx` is now a small entry point. This lets us begin moving pages, services, hooks, and components out of the legacy file without changing production behavior all at once.

## Current structure

```text
src/
  App.jsx
  legacy/ProductionManager.jsx
  components/auth/LoginPanel.jsx
  services/auth.js
  supabaseClient.js
  styles.css
api/
  ics.js
supabase/
  auth_user_profiles.sql
```

## Next step

1. Run `supabase/auth_user_profiles.sql` when ready to start real logins.
2. Enable Supabase Auth providers/password login.
3. Wire `LoginPanel` into `App.jsx`.
4. Move one page at a time out of `legacy/ProductionManager.jsx`.

Recommended extraction order:

1. `Schedule`
2. `Dashboard`
3. `MobileManager`
4. `OutlookCalendar`
5. `NewJobModal` / `EditJobModal`
6. `Admin`
7. `Performance`

## Role model

- `admin`
- `manager`
- `foreman`
- `service_writer`
- `technician`

Technicians should ultimately only query and update their own assigned jobs.
