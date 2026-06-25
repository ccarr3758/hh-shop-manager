# Admin API setup

This ZIP expects a Supabase Edge Function named `admin-api`.

## 1. Deploy the Edge Function

In Supabase:

1. Go to **Edge Functions**.
2. Click **Deploy a new function** → **Via Editor**.
3. Name it exactly:

```text
admin-api
```

4. Replace `index.ts` with the contents of:

```text
supabase/functions/admin-api/index.ts
```

5. Deploy the function.

## 2. Add / replace function secrets

Go to **Edge Functions → Secrets → Add or replace keys** and add these:

```text
SUPABASE_URL=<your Project URL>
SUPABASE_PUBLISHABLE_KEY=<your Publishable key>
SUPABASE_SECRET_KEY=<your Secret key>
```

You find all three values in **Project Settings → API**.

Do not use the database password, JWT secret, or connection string.

## 3. Run the SQL helper if needed

Run this file in Supabase SQL Editor if you have not already:

```text
supabase/employee_management_admin_users.sql
```

It adds/repairs the admin RLS policy for `user_profiles`.

## 4. Deploy this ZIP to Vercel

After the Edge Function and secrets are done, deploy the app ZIP to Vercel.

## 5. Use it

Log in as Cameron/admin, open **Admin → Employee Management**, then use **Password** on the employee row.

This keeps the fake employee emails unchanged. It only changes the Supabase Auth password.
