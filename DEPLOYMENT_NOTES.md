# Clean Redeploy Notes

This is a complete project snapshot with the newest scheduler/helper/attendance changes.

Before pushing:
1. Copy/extract all files over your GitHub repo folder.
2. Commit all changed files.
3. Push to `main`.

Vercel settings:
- Framework: Vite
- Install Command: `npm install --prefer-offline --no-audit --no-fund` or plain `npm install`
- Build Command: `npm run build`
- Output Directory: `dist`

Important: this ZIP includes a cleaned `package-lock.json` and `.npmrc` using the public npm registry.

Run these Supabase SQL files if not already applied:
- `supabase/job_helpers.sql`
- `supabase/technician_attendance.sql`
