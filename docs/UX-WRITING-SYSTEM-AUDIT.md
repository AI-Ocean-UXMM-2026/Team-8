# ParcelCare — System-wide UX writing scan

စစ်ဆေးရက်: 22 October 2026
Reference: https://github.com/content-designer/ux-writing-skill/blob/main/SKILL.md
Code snapshot: codex/gps-demo-recovery @ 862d34b (local preview)

## Scope and limits

Warehouse, SME, Courier/Rider, Manager/legacy workspace, authentication, receiving, inventory, shipments, cases, evidence, AI categorization, tracking, settings နှင့် shared localization ကို source-based scan လုပ်ထားသည်။ Source inventory တွင် JS/TS/TSX/HTML 144 ဖိုင်ရှိပြီး TSX 96 ဖိုင်မှ static JSX text occurrences 841 ခု ထုတ်စစ်ထားသည်။ Source inventory သည် စာသားတိုင်းကို လူကိုယ်တိုင် အတည်ပြုဖတ်ပြီးဖြစ်ကြောင်း မဆိုလိုပါ။ အဓိက workflow components နှင့် localization runtime ကို သီးခြားဖတ်စစ်ထားသည်။

Local browser တွင် /demo/sme ကို English/မြန်မာ နှစ်မျိုးဖြင့် စစ်ထားသည်။ Production, authenticated permissions, every error branch နှင့် screen-reader application ကို ဤ scan တွင် live test မလုပ်ထားပါ။ Visual spacing/color audit အပြည့်အစုံမဟုတ်ဘဲ UX writing နှင့် meaning consistency audit ဖြစ်သည်။ Code/business logic မပြောင်းထားပါ။

## Priority findings

### P1-01 — Language mode တစ်မျိုးတည်း မပြည့်စုံခြင်း
Source: src/features/portal/sme.tsx:29, src/features/portal/decision.tsx, src/features/exceptions/case-panels.tsx; src/shared/i18n/runtime.js.
Browser-confirmed: English mode တွင် “Own stock / မိမိပစ္စည်းစာရင်း”, “Cases / ကိစ္စများ” ပေါ်သည်။ Myanmar mode တွင် “Pending decisions”, “Your stock, shipments and decisions…” နှင့် “ကုန်ပစ္စည်း records” ကျန်နေသည်။
Fix: language-independent message keys နှင့် complete EN/MM messages သုံးရန်။ Fragment substitution ဖြင့် sentence တစ်ကြောင်းကို တစ်ဝက်ဘာသာမပြန်ရန်။ User names, references, SKU နှင့် user-entered content ကို မပြန်ရန်။
Example EN: “Your stock” / MM: “မိမိကုန်လက်ကျန်”; EN: “Decisions needed” / MM: “ဆုံးဖြတ်ရန်လိုအပ်ချက်များ”.

### P1-02 — Case count/search/sort scope ကို အဓိက label က မဖော်ပြခြင်း
Source: src/features/warehouse/cases.tsx:14,22,31–34.
“Matching cases” နှင့် “Highest priority first” သည် လက်ရှိ API page မှ rows များကိုသာတွက်/စီသည်။ Page-only explanation ကို အောက်တွင် ရေးထားပေမဲ့ အဓိက control label က warehouse အားလုံးအဖြစ် နားလည်နိုင်သည်။
Copy-only fix: “Matching cases on this page”, “Search this page”, “Priority on this page”. MM: “ဤစာမျက်နှာတွင် ကိုက်ညီသောကိစ္စများ”, “ဤစာမျက်နှာတွင် ရှာရန်”.
Global search/ranking လုပ်ချင်ပါက copy ပြောင်းရုံနှင့်မရ၊ data/API behavior ပြင်ရန် သီးခြားလိုသည်။

### P1-03 — Route mode မတူသော်လည်း driving ဟု အမြဲပြခြင်း
Source: src/features/tracking/courier-route.tsx:38.
Car → bicycle → walking fallback ရှိသော်လည်း duration ကို “min driving” ဟု အမြဲပြသည်။ လမ်းလျှောက်/စက်ဘီးလမ်းကို ကားဝင်နိုင်ကြောင်း မှားယွင်းနားလည်စေနိုင်သည်။
Fix: mode နှင့်ညီသည့် label သုံးရန်။ EN: “Estimated route time: 12 min · Walking”; MM: “ခန့်မှန်းလမ်းကြောင်းကြာချိန်: ၁၂ မိနစ် · လမ်းလျှောက်”. Route time သည် live ETA မဟုတ်ကြောင်း ဆက်ဖော်ပြရန်။

### P1-04 — Demo နှင့် independent AI ကို အဓိကခေါင်းစဉ်တွင် မခွဲခြားနိုင်ခြင်း
Source: src/features/exceptions/maker-checker.js:1,7.
Source က deterministic simulation ဟု ရှင်းထားပြီး diagnostics တွင် simulation notice ရှိသည်။ သို့သော် “AI Maker → Rules → AI Checker” ကို သီးခြားဖတ်လျှင် model နှစ်ခုဖြင့် စစ်ပြီးဖြစ်ကြောင်း ထင်နိုင်သည်။
Fix demo heading: “Simulated investigation and rule checks”. MM: “နမူနာစုံစမ်းမှုနှင့် စည်းမျဉ်းစစ်ဆေးမှု”. Actual persisted AI checker result ရှိသော live view မှသာ independent checker wording သုံးရန်။

### P1-05 — User error တွင် backend message ကို တိုက်ရိုက်ပြခြင်း
Source: src/features/warehouse/shared.tsx:34; src/features/warehouse/command.ts; src/features/auth/login.tsx; src/features/portal/evidence.tsx.
ApiError/error.message ကို UI ထဲတိုက်ရိုက်ထည့်ထားသော branches ရှိသည်။ ပြန်ရသည့် message ပေါ်မူတည်ပြီး technical English/မရှင်းသော recovery instructions ဖြစ်နိုင်သည်။ Error တိုင်းမှာ အမှန်တကယ် technical text ပေါ်သည်ဟု မသတ်မှတ်ထားပါ။
Fix: known error codes ကို localized safe messages သို့ map လုပ်ပြီး support reference သီးခြားထားရန်။ Unconfirmed write ကို “မသိမ်းနိုင်ပါ” ဟု မအတည်ပြုရန်။
EN: “We couldn’t confirm whether this receipt was saved. Retry the same receipt.” MM: “ဤလက်ခံမှတ်တမ်း သိမ်းပြီးမပြီး အတည်မပြုနိုင်ပါ။ မူလမှတ်တမ်းကိုပဲ ထပ်ပို့ပါ။”

### P2-06 — Inventory terminology မတူခြင်း
Source: src/features/warehouse/inventory.tsx:34–45; src/features/portal/sme.tsx:29.
Warehouse: “Stock on hold / On hold”; SME: “Quarantined”. Browser-confirmed SME table header “QUARANTINED”.
Standard EN: “Available”, “On hold”, “Out of stock”. MM: “အသုံးပြုနိုင်သောလက်ကျန်”, “စစ်ဆေးရန်ထိန်းထားသောလက်ကျန်”, “အသုံးပြုနိုင်သောလက်ကျန်မရှိ”. Backend quarantined_qty name မပြောင်းရန်။ On hold ရှိခြင်းနှင့် Available ရှိခြင်း တစ်ပြိုင်နက် ဖြစ်နိုင်သည်ကို မဖျောက်ရန်။

### P2-07 — Empty state က filter မရှိသော်လည်း filter ကြောင့်ဟု ပြခြင်း
Source: src/features/warehouse/shared.tsx:39; src/features/portal/sme.tsx.
SME Cases တွင် data မရှိသည့်အခါ “No records match these filters.” ပေါ်သည်၊ ထို section တွင် filter control မရှိ။ Browser-confirmed.
EN: “No cases yet.” / MM: “ကိစ္စတိုင်ကြားချက် မရှိသေးပါ။”
Filtered state သီးခြား: “No cases match your search. Clear filters or try another reference.”

### P2-08 — Courier / Rider / Delivery naming မတူခြင်း
Source: src/features/auth/login.tsx; src/features/portal/rider.tsx; src/features/courier/workspace.tsx; src/features/portal/shell.tsx.
Product navigation အတွက် “Courier” ကို စံထားပြီး MM “ပို့ဆောင်သူ” သုံးရန်။ Backend role rider ကို မပြောင်းရန်။ “Third-party courier” ကို “ပြင်ပပို့ဆောင်ရေးကုမ္ပဏီ” ဟု ရှင်းခွဲရန်။ Courier arrival, SME receipt, delivery successful သုံးမျိုးကို ဆက်ခွဲထားရန်။

### P2-09 — Approval dropdown တွင် backend enums ကို လူဖတ်စကားအဖြစ် ပြခြင်း
Source: src/features/portal/decision.tsx.
Option labels သည် human(option) ဖြင့် underscore ကိုသာဖြုတ်သည်။ “propose retry” စသည့် command-oriented wording ပေါ်နိုင်သည်။
Fix: offered options တစ်ခုချင်းကို label map သုံးရန်။ EN “Request another delivery time” / MM “ထပ်ပို့မည့်အချိန် တောင်းဆိုရန်”. Backend value မပြောင်းရန်။ “Proposed; warehouse confirmation needed” ကို သိသာစွာ ထားရန်။

### P2-10 — Receipt label casing နှင့် abbreviation မတူခြင်း
Source: src/features/warehouse/receipt.tsx.
“Good Condition”, “Remaining Qty”, “Expected Qty” နှင့် sentence-case labels ရောနေသည်။
EN: “Good condition”, “Remaining quantity”, “Expected quantity”. MM: “ကောင်းမွန်သောအရေအတွက်”, “ကျန်အရေအတွက်”, “မျှော်မှန်းအရေအတွက်”.
Partial receipt နှင့် irreversible Finalize receiving warning သည် လက်ရှိရှင်းလင်းပြီးသားဖြစ်၍ မဖျောက်ရန်။

### P2-11 — Status label formatting မတူခြင်း
Source: src/features/warehouse/shipment-status.tsx; src/features/portal/sme.tsx; src/features/exceptions/case-panels.tsx.
Warehouse က shared ShipmentStatus သုံးသော်လည်း SME က human(status) ကို Badge ထဲပြသည်။ “State”, “Case state”, “Case status” အမည်များလည်း မတူ။
Fix: shared display-label map သုံးပြီး Priority / Review / Case status / Delivery status ကို သီးခြားထားရန်။ “Ready” tooltip ကဲ့သို့ အဓိပ္ပာယ်ကို mobile မှာလည်း ဖတ်နိုင်ရန်။

### P2-12 — Demo badge accessible label နှင့် target မကိုက်ခြင်း
Source: src/shared/layout/global-header.tsx:9.
Visible text “Demo Data”, aria-label “Return to warehouse dashboard”, target /demo. SME/Courier မှာလည်း warehouse destination ဟု screen-reader က ဖတ်ပေးနိုင်သည်။
EN aria-label: “Open demo home”; MM: “နမူနာပင်မစာမျက်နှာသို့”. Badge status နှင့် navigation purpose ကို ပေါင်းမရှုပ်ရန်။

### P2-13 — Native confirm dialogs မှာ selected-language pipeline မဖြတ်ခြင်း
Source: src/features/exceptions/review.tsx; src/features/portal/delivery.tsx.
window.confirm ထဲက English စာသားကို DOM localization MutationObserver က မပြန်နိုင်ပါ။ Myanmar mode တွင် native confirm စာသား English ကျန်နိုင်သည်။ Source-confirmed mechanism; dialog live branch ကို ဤ scan တွင် မလုပ်ထားပါ။
Fix: localized message lookup သုံးရန်၊ သို့မဟုတ် shared accessible localized dialog သုံးရန်။ Action/consequence/back button ကို သေချာဖော်ပြရန်။

### P2-14 — Account identity ကို short technical IDs ဖြင့်သာ ပြခြင်း
Source: src/features/portal/shell.tsx; src/features/warehouse/shell.tsx; src/features/tracking/delivery-preview.tsx.
SME dashboard selector တွင် “SME · 0003”, profile “Account · 00000098”. Preview mobile တွင် “SME owner · Lotus Trading” ကို ပြင်ပြီးသား ဖြစ်သော်လည်း အခြား shell များအနှံ့မတူသေးပါ။
Fix: authenticated membership နှင့်ကိုက်သော organization name ကို အဓိကထားရန်။ အမှန်တကယ်ရရှိမှ user name ထည့်ရန်။ Public demo တွင် “Demo account / နမူနာအကောင့်” ဆက်ထားရန်။ အခြား account အမည်များကို current-user area တွင် မပြရန်။

### P3-15 — Technical implementation language ကို user guidance အဖြစ်အသုံးများခြင်း
Source: src/features/tracking/courier-route.tsx; src/features/portal/decision.tsx; src/features/categorization/product-categorization.tsx; src/features/exceptions/case-panels.tsx.
“metadata”, “request key”, “source version”, “No displayable summary supplied”, “No missing-information list supplied” စသည့် wording သည် action ကို မရှင်းပေးနိုင်သည်။
Fix: “Product details”, “Retry the same request”, “No AI summary available yet”, “Check the evidence before continuing”. Technical diagnostics ကို details ထဲထားပြီး uncertainty ကို မဖျောက်ရန်။

## Localization inventory (not a pass/fail score)

Myanmar catalog: 1,170 entries. English normalization: 64 entries.
TSX static JSX text occurrences: 841. Exact-key မရှိသော candidates: 425.
425 သည် missing translations 425 ခုဟု မဆိုလိုပါ။ Partial JSX nodes, proper names, design-system examples, composed labels နှင့် substring translation များ ပါဝင်သည်။ JS template strings, dynamic backend messages နှင့် attributes မပါသည့် heuristic inventory သာဖြစ်သည်။ Browser verification နှင့် message-key audit ဆက်လိုသည်။ Candidate JSON ကို တွဲပေးထားသည်။

## Preserve these good patterns

- Courier arrival အဝါ၊ SME physical receipt ပြီးမှ success အစိမ်းနှင့် စာသားတွဲပြခြင်း။
- Device GPS နှင့် simulation ကို ခွဲရှင်းထားခြင်း။
- မရရှိသော ETA/phone/name မဖန်တီးခြင်း။
- Partial/final receipt ခွဲခြင်း၊ irreversible warning နှင့် unconfirmed-submit retry ကို ထိန်းထားခြင်း။
- Priority, case status, review နှင့် physical verification ကို မရောခြင်း။
- Stock on hold နှင့် available quantities ခွဲပြခြင်း။

## Recommended implementation order

1. EN/MM message keys, shared glossary, safe errors, native confirmation localization.
2. Case pagination wording, route-mode duration, demo AI accuracy.
3. SME/warehouse/courier labels, empty states, profile names, accessible labels.
4. Typography/casing and concise helper text.

လက်ရှိ scan သည် recommendations ဖြစ်ပြီး application copy၊ navigation၊ business rules၊ production deployment ကို မပြောင်းထားပါ။

## Acceptance checks for a later implementation

- EN နှင့် MM တစ်မျိုးစီတွင် navigation, buttons, placeholders, dialogs, validation, screen-reader labels စစ်ရန်။
- Warehouse, Manager, SME, Courier တို့၏ role identity ကို မှန်ကန်သည့် membership မှသာ ပြရန်။
- Route car/bicycle/walking တစ်မျိုးစီနှင့် stale/offline/permission-denied states စစ်ရန်။
- Empty/no-match, unauthorized/not-found, timeout နှင့် unknown-write outcome ကို သီးခြားစမ်းရန်။
- More than one API page ရှိသော cases ဖြင့် summary/search/sort scope စစ်ရန်။
- Courier arrival တစ်ခုတည်းဖြင့် success မပြရန်၊ SME receipt confirmation သာ success ဖြစ်ရန်။
- Language switch ကြောင့် entered quantities, selected option values, backend enums နှင့် user content မပြောင်းရန်။
- 390px/768px/desktop တွင် MM wrapping, focus order, action label truncation စစ်ရန်။


## Implementation follow-up

The approved fixes have been applied locally. See [implementation and validation](UX-WRITING-IMPLEMENTATION.md) and [ongoing writing guide](UX-WRITING-GUIDE.md). The original findings above describe the pre-fix snapshot.
