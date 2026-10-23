# Synthetic SME demonstration inventory

This dataset was generated specifically for ParcelCare. It is not Kaggle data,
GoMask data, actual stock, or evidence of real supplier receipts or deliveries.

- Golden Bloom: 30 skincare/cosmetics SKUs.
- Lotus Living: 15 household SKUs.
- Urban Threads: 30 clothing SKUs.
- Mandalay Goods: 15 local-food SKUs.
- Shwe Market: 30 phone-accessory SKUs.

There are 120 unique SKUs, including named sizes/colours/formulations. Opening
quantities vary from 120 to 500. Quantities mean individual retail pieces, or
retail packs for food, rather than cartons. Do not sum unlike units as a cost KPI.
No supplier addresses, GPS coordinates, live AI verdicts, or completed outcomes
are fabricated by this import.

## Import

1. Run `scripts/demo-catalog-preflight.sql` in Supabase SQL Editor. Confirm that
   the five canonical account emails map to five distinct SMEs in the intended
   warehouse. The import aborts completely if a mapping is missing or ambiguous;
   it never creates users, credentials, memberships, or a new warehouse.
2. Run `scripts/seed-sme-demo-catalog.sql`. It creates opening stock only for new
   SKUs and sets the confirmed SME/profile display names. Existing quantities,
   reservations, stock references, shipments and request history are untouched.
   Re-running the script does not replenish stock already released.
3. Category hints and descriptive metadata are imported as **pending**. Use the
   existing AI categorization/human verification workflow before presenting them
   as verified categories. No AI or human approval is forged by this script.
4. Run `scripts/review-old-test-products.sql`. Share the results for a targeted
   cleanup. It is read-only; no blanket removal of referenced test records occurs.

Sources: `data/demo/sme-products.json` and `.csv`. Rebuild them and the SQL with
`api/.venv/Scripts/python.exe scripts/generate-demo-catalog.py`.

The live release form remains scoped to the selected SME and uses server-side
search/pagination. The table accepts a quantity to add, checks remaining units,
and preserves the selected-items summary across searches and pages. The server
revalidates ownership and stock at final submission.

## Demo rehearsal

Use an SME account to choose one of its new products, request a small quantity,
review the saved SME location, and submit. Approve and dispatch through the normal
workflow; report the desired exception from the assigned rider account. Those
actions create genuine application history against clearly synthetic inventory.
