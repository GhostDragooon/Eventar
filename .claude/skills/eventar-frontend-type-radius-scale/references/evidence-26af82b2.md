Four values were rounded to 4 decimals (12.5px gave 12.4992px). Fixing them to exact.

Correction to the Batch 1 text above: swapping to the token classes (`text-body-sm` etc.) is NOT zero-diff, because those tokens carry their own line-height, letter-spacing and weight. Sites got a rem `calc` instead.

Ivan picked radii option (a) (rem tokens) and the recommended order; Batch 2 not started.