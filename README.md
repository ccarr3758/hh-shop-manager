# H&H Production Manager — Supabase Live Build

This build connects directly to your Supabase database using the Vercel environment variables you saved.

Required Vercel Environment Variables:
- VITE_SUPABASE_URL
- VITE_SUPABASE_ANON_KEY

Deploy settings:
- Framework: Vite
- Install command: npm install
- Build command: npm run build
- Output directory: dist

Cloud features included:
- Dashboard reads Supabase jobs
- New Job writes to Supabase
- Foreman status/complete actions write to Supabase
- Production Log deletes from Supabase
- Products add/edit/delete in Supabase
- Admin add/edit/delete for technicians, categories, statuses, delay reasons, labor rates
- Shop hours save to Supabase
- Basic realtime refresh on job/product/technician changes


## Helper over-book update
Helpers can now be assigned even after a job has exceeded book time. When help is ended, helper book hours equal actual helper working time, so the helper receives 100% efficiency credit.


## Helper over-book credit
Helpers can now be assigned even after the lead job is past book time. Actual helper time is stored in `actual_hours`; credited helper time is stored in `book_hours`. Any helper time after the lead job's projected book finish is credited at 110% efficiency.


## Helper hours breakdown

Technician performance now separates primary book hours, helper book hours, total book hours, hours helped, and help received. Helper hours add to book/actual performance totals but do not increase job count.
