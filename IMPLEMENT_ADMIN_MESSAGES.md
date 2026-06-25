# Admin + Direct Messages Setup

1. Deploy this project to Vercel as usual.
2. In Supabase, deploy the Edge Function at `supabase/functions/admin-api/index.ts` as `admin-api`.
3. Keep JWT verification OFF for `admin-api`.
4. Make sure the Edge Function secret `HH_SERVICE_ROLE_KEY` is set to your current Supabase secret key.
5. Run these SQL files in Supabase SQL Editor:
   - `supabase/admin_api_rls_policy.sql`
   - `supabase/messages_threads_activity.sql`
6. Refresh the app.

What changed:
- Restored the Shop Pulse dashboard version from the attached polished build.
- Added Employee Management back to the Admin tab, including password changes.
- Added Last Activity on the Admin tab.
- Added direct user-to-user message threads accessible from desktop and mobile.
