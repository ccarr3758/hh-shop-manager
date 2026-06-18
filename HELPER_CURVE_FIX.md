# Helper Curve Efficiency Fix

This update changes helper performance so it rewards helping without letting tiny helper assignments inflate a technician to extreme efficiency.

## New rule

- Helper Actual Hours = real working time helped, lunch-aware.
- Helper Book Hours = Helper Actual Hours at 100% for core efficiency.
- Helper Curve Bonus = +0.5 efficiency point per helper hour.
- Helper Curve Bonus is capped at +5.0 percentage points.

## Example

Brad helps for 0.2 hrs.

- Helper Actual Hours: 0.2
- Helper Book Hours: 0.2
- Helper Curve Bonus: +0.1%

This will not create a 344% efficiency spike.

## Larger example

Matt helps for 6.0 hrs this month.

- Helper Actual Hours: 6.0
- Helper Book Hours: 6.0
- Helper Curve Bonus: +3.0%

This improves his score enough to incentivize assisting without overpowering primary job performance.

## Cap

At 10 helper hours, the curve reaches the cap:

- 10.0 helper hrs = +5.0% max bonus
- 20.0 helper hrs = still +5.0% max bonus

