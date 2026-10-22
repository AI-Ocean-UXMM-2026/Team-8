# ParcelCare UI writing guide

Reference: [UX Writing Skill](https://github.com/content-designer/ux-writing-skill/blob/main/SKILL.md).

Use concise sentence case. Name the action and explain the next step. Preserve cyan/yellow design tokens and canonical backend values.

## Shared vocabulary

- Courier / ပို့ဆောင်သူ: the assigned in-house rider. Keep backend role `rider`.
- Third-party courier / ပြင်ပပို့ဆောင်ရေးကုမ္ပဏီ: external partner, not the in-house courier.
- Available / အသုံးပြုနိုင်သော: usable stock.
- On hold / စစ်ဆေးရန် ထိန်းထားသော: stock excluded from usable quantities. Keep `quarantined_qty` unchanged.
- Case status / ကိစ္စအခြေအနေ: lifecycle, separate from priority and review mode.
- Review mode / စစ်ဆေးမည့်နည်းလမ်း: review routing, not permission or approval.
- Confirm arrival / ရောက်ရှိကြောင်း အတည်ပြုရန်: courier reached the SME; not successful delivery.
- Confirm received / လက်ခံရရှိကြောင်း အတည်ပြုရန်: SME confirms physical receipt.

## Language and record safety

Use a complete EN/Myanmar catalog entry for each sentence, label and accessible name. Never compose a translated sentence from English fragments when a whole message is available. The existing DOM localization bridge remains for legacy screens; new native confirmations use `localizedText` at action time because browser dialogs are outside the DOM.

Keep canonical option values, identifiers, SKU, organization names, evidence notes, AI findings and user-authored records unchanged. Mark record content `data-user-content`. Use names only when supplied for verified membership. Live SME identity currently lacks an organization-name field: retain its account reference instead of borrowing a demo name or requesting a staff-only directory.

Avoid simultaneous English/Myanmar labels. Keep English/Myanmar names in the language selector recognizable.

## Accurate scope

Queue counts, search and sorting currently work within the loaded case page. Labels must say so. Do not claim warehouse-wide search or SLA ranking from these controls.

Route durations must show Car, Bicycle or Walking as returned by the routing service. Route time is not guaranteed arrival time. Never imply a bicycle/walking route is drivable.

Legacy demo checks are deterministic. Call them simulated investigation/rule checks, not an independent AI review. Live model/checker outputs must be labeled from persisted evidence.

## Errors and confirmations

Use `safeError` for untrusted service errors. Give an action, not a backend stack/message. Keep support references separate.

For uncertain writes, say the outcome could not be confirmed and retry the original request. Preserve its idempotency key. Never say it failed or invite a new submission unless rejection is known. `useCommand` release policy remains unchanged.

Do not remove physical-verification, consent, irreversible final-receipt or SME-confirmation requirements to shorten copy. Separate courier arrival from SME receipt and successful delivery.

## Empty states

Distinguish no records yet, no search matches, access denied, unavailable service and loading. Do not tell users to clear filters in a section with no filters.
