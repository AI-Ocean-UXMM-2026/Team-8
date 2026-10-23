# Stock release deadlines

Apply `supabase/migrations/20261023150000_be1_release_deadlines.sql` before deploying the frontend/API.

New form submissions require a future delivery date/time, within 30 days. The form uses the user's local time and sends a timezone-qualified UTC timestamp. SQL validates the deadline and creates the accepted request, reservation, outbound shipment and shipment items in one transaction. Failed stock checks roll back everything. Default delivery mode is in-house; physical picking, packing, assignment and dispatch remain verified operations.

Urgency is derived from remaining time: more than 72 hours = Can wait; 72 hours or less = Urgent; past deadline = Urgent plus Overdue. The open warehouse queue updates every 15 seconds, sorted by earliest deadline within each pool. Completed/cancelled requests leave active pools. No scheduler or stored urgency value is needed. Existing requests and legacy saved submissions without deadlines retain the earlier approval behavior and appear under Other requests; their history is not rewritten. Exception SLA policies are separate.

## Manual tests after deployment
1. SME: choose owned stock, review, leave deadline blank: red reason appears; no submission.
2. Choose a past deadline or more than 30 days away: blocked with reason.
3. Choose tomorrow; submit: accepted immediately, stock reserved, one ready shipment/tracking link. No warehouse approval needed.
4. Warehouse > Shipments > Stock release requests: tomorrow appears in Urgent, with countdown and delivery deadline. Continue existing picking/packing/rider/dispatch steps.
5. Submit another request due in seven days: appears in Can wait. The automated boundary test covers its move to Urgent at 72 hours without waiting four days.
6. Submit a request due in two minutes and leave it unfulfilled: countdown becomes Overdue automatically (allow 15 seconds for refresh).
7. Open the same low-stock product in two SME windows; submit more than the remaining quantity from the second: backend rejects overbooking, without creating another shipment.
8. If the response is interrupted, retry the same saved request: same request/shipment, stock reserved only once. A completed command can still replay after its deadline.
9. Finish delivery: request leaves the active pools. Another SME cannot see or release this SME's stock.

Automated checks: `npm run typecheck`, `npm run test:frontend`, `node supabase/tests/orders.test.mjs`, API `test_sme_orders.py`.
