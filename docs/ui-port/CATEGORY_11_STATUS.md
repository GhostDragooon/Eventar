# Category 11 — Pricing and Commercial Selection: status

**Library-only. Not wired to any route. Weaker footing than Category 08.**

`docs/architecture/BLOCK-ARCHITECTURE.md` doesn't just defer commercial UI to
a future stage — it says pricing/billing gets **no block at all yet**:
"pricing/billing → new block B9 (Commercial) when it becomes code at all
(invoice-first = zero code, no block needed yet)." Eventar's current billing
model is manual invoicing with no in-app checkout, entitlement, or plan
concept anywhere in the schema.

That makes this category more speculative than Category 08 (which at least
has a committed Stage 13 target). Ported for completeness per the sweep, but
worth Ivan's explicit call: keep as a ready-made library for whenever
commercial-in-product work is scoped, or delete as premature per the YAGNI
default ("does this need to exist at all?").

Components: `PlanSelectionCards.tsx`, `BillingPeriodToggle.tsx`,
`PricingComparison.tsx`, `ExpandablePlanPicker.tsx`. No prices, discounts, or
commercial claims are embedded — every label is caller-supplied, per the
source manifest's commercial boundary.
