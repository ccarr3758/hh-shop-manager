# H\&H Production Manager — Supabase Live Build

This build connects directly to your Supabase database using the Vercel environment variables you saved.

Required Vercel Environment Variables:

* VITE\_SUPABASE\_URL
* VITE\_SUPABASE\_ANON\_KEY

Deploy settings:

* Framework: Vite
* Install command: npm install
* Build command: npm run build
* Output directory: dist

Cloud features included:

* Dashboard reads Supabase jobs
* New Job writes to Supabase
* Foreman status/complete actions write to Supabase
* Production Log deletes from Supabase
* Products add/edit/delete in Supabase
* Admin add/edit/delete for technicians, categories, statuses, delay reasons, labor rates
* Shop hours save to Supabase
* Basic realtime refresh on job/product/technician changes
* 

