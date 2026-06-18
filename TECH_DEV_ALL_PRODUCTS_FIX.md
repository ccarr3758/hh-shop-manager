# Technician Development All Products Fix

Updated `buildSpecialtyDevelopmentRows` so the Technician Development tab no longer uses only `job.product_id`.

## What changed

- Job Mix and Specialties now reads every row from `job_products` for each completed job.
- If a job has multiple products, each product contributes to the technician's specialty mix.
- Book hours are taken from each product line.
- Actual hours are split across product lines proportionally by book hours.
- Older jobs without saved product lines still fall back to the original single `job.product_id` field.

## Example

A completed job with:

- Lift Kit: 4.0 book hours
- Alignment: 1.0 book hours
- Actual: 6.0 hours

Will now count both categories instead of only Lift Kit.
Actual time will be allocated roughly:

- Lift Kit: 4.8 actual hours
- Alignment: 1.2 actual hours
