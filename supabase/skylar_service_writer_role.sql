-- Fix Skylar role to Service Writer.
-- Run this in Supabase SQL Editor if Skylar is already saved as Manager.

update technicians
set role = 'Service Writer'
where lower(name) = 'skylar';

update user_profiles
set role = 'service_writer'
where lower(full_name) = 'skylar'
   or email ilike '%skylar%';
