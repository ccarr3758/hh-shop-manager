# Employee Management Setup

This ZIP adds Admin → Employee Management.

It can:
- list employee auth users
- create internal/fake-email logins
- change passwords
- activate/deactivate profiles
- change roles
- link a login to a technician

## Supabase setup

1. In Supabase SQL Editor, run:

`supabase/employee_management_admin_users.sql`

2. Deploy the Edge Function:

```bash
supabase functions deploy admin-users
```

3. Set the service-role secret for Edge Functions:

```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Supabase already provides `SUPABASE_URL` and `SUPABASE_ANON_KEY` to Edge Functions.

## Important

Do not put the service-role key in Vercel or the React frontend. It belongs only in Supabase Edge Function secrets.
