# Technician Walk-In Job Book Time Lock

This update allows technicians to add an unscheduled walk-in job while preventing them from editing book time.

## Technician behavior

- Technicians can create a new walk-in job.
- The job is automatically assigned to the logged-in technician.
- The technician selects product(s) from the Products page.
- Book time is pulled from the selected product(s).
- Product labor is hidden from technicians in the walk-in job form.
- Total book time is read-only.
- Once the job is saved, technicians can only edit job details/notes and QC.
- Technicians cannot edit their own book time after creating the job.

## Manager/Admin behavior

- Admin, Manager, Foreman, and Service Writer users retain the full New Job form.
- Manager-level users can still edit core job fields and book time where allowed by the app.

## Notification behavior

- The assigned technician receives a New Job Assigned notification.
- Foreman, Manager, and Admin receive a New Job Added notification.
