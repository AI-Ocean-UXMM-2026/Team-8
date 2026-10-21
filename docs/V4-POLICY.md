# V4 operational policy baseline — version 1

SET-10 defines this baseline; it does not implement the later closure, delivery or GPS APIs. Machine-readable source: `contracts/policies/v1.json`. Pure backend guards: `api/app/features/policies/service.py`. Record the policy version on analyses/decisions/actions. Changes require a new version and cross-domain review, not editing an old decision.

## Closure and physical handling

Only authorized warehouse owner/staff confirms closure, with current source/policy versions, no mandatory pending action, a written resolution and verified same-case evidence. SME decisions are recorded by that SME; riders submit POD; backend verification of POD plus receiver confirmation authorizes delivered status. A submitted photograph, generated summary, notified SME or approval alone is insufficient. AI never supplies verification. The closure matrix in v1.json defines requirements for all ten SQL case types.

For quantity mismatch, a final count, persisted SME decision and staff-confirmed handling are required. `accept_partial` can advance only after physical handling is verified. `await_remainder` additionally requires verified remainder completion linked to a follow-up shipment; the original final receipt is not reopened. Rejection or no decision cannot count as acceptance. Damage requires assessed condition, quarantine and verified disposition with the SME decision. Missing/incorrect stock requires completed investigation and verified reconciliation/correction. Staff verifies physical stock changes through operations commands, never by interpreting AI text.

For recipient unavailable, SME proposes a retry; warehouse confirms capacity; rider completes the confirmed task, POD is verified and the receiver confirms. Delivery failure can end in verified redelivery or return. Courier delay requires a verified courier response and completed outcome, not just an ETA request. Transit damage/loss needs verified condition/carrier facts and resolution; responsibility remains UNDETERMINED when disputed. `responsibility_reviewed` records evidence review, not a final legal judgment or mandatory admission of carrier liability.

The closure helper consumes evidence UUIDs already resolved and verified by a domain repository. Never pass browser-controlled “verified” flags into it. Binding those facts to a case and committing case state remains CASE-08, not a claim of this foundation.

## Priority and actions

Version 1 explicitly adopts configurable prototype MMK boundaries as application defaults: below 50,000 low; 50,000–199,999 normal; 200,000–999,999 high; at least 1,000,000 critical. These are not industry rules. Amounts come from authorized product records (quantity × recorded unit price), not a model guess. Perishable incidents have minimum high priority; safety/temperature incidents minimum critical. Missing impact data leaves priority pending; known incident escalation can still be displayed while pending. High/critical does not itself authorize a human-only action or imply manager approval.

The seven allowed planner actions match SQL: save_summary, notify_sme, request_information, request_sme_decision, propose_correction, escalate, update_workflow. Validate action, role, tenant, current policy, source version and idempotency again before execution. update_workflow is restricted to safe case progression; it cannot close a case or change physical/delivery/stock state. Correction is a proposal until an authorized operational command verifies it. Stock mutation, dispatch, liability declaration, closure and GPS start are never planner actions. The old 39 routing rules and universal SME-only closure are not inherited.

## GPS and delivery confirmation

Use the current SQL defaults: foreground send interval at least 10 seconds; stale after 60 seconds; raw retention 24 hours; reject samples more than 30 seconds in the future or 5 minutes old, and replay/out-of-order packets. Latest-only visibility is warehouse staff, correct SME and assigned rider during an active in-house session. Stop on rider request, logout/revocation, reassignment, completion or cancellation; UI clears watchers/markers. Riders must accept pickup and explicitly consent, with browser permission. No promised ETA or uninterrupted background tracking. Third-party deliveries show verified handover and safe external links, with no internal GPS.

The trusted worker must run `private.purge_expired_locations()` hourly to meet physical deletion within 25 hours; reads already exclude expired points. Scheduling is still GPS-08/worker integration work, not installed here. Warehouse verifies dispatch/handover; recorded courier acceptance/evidence is needed for third-party handover. Rider POD submission is pending until backend verification and receiver confirmation. SME approval never marks a shipment delivered.
