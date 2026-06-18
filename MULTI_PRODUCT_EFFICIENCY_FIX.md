# Multi-product efficiency allocation fix

This update changes the Technician Performance / Technician Development product rows so multi-product jobs no longer assign the full actual time to only one product.

For each completed job, actual hours are allocated across every product line by book-time weight.

Example:
- Total job: 5.50 book hours / 3.85 actual hours
- Brake Controller: 0.50 book hours
- Brake Controller actual allocation = 3.85 × (0.50 / 5.50) = 0.35 actual hours

This prevents a technician from being penalized on a small product line when the full job was completed efficiently.
