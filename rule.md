# ParcelCare — Warehouse Exception Review Rules

## Purpose and scope

SME က တင်သော Warehouse-related complaints တွေအတွက် AI Review / Human Review ခွဲပို့ရန် Business rules ဖြစ်သည်။ Human reviewer သည် **Warehouse Manager** ဖြစ်သည်။ ဤဖိုင်သည် product specification ဖြစ်ပြီး prototype ရှိ rule-catalog.js / rule-engine.js နှင့် ချိတ်ဆက်ထားသည်။

## Routing and permissions

- AI Review: **1, 2, 3, 4, 5, 6, 17, 19, 23, 24, 32, 38** (12 rules).
- Human Review: **7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 21, 22, 25, 26, 27, 28, 29, 30, 31, 33, 34, 35, 36, 37, 39** (27 rules).
- Case တစ်ခုတွင် rules အများအပြား ကိုက်ညီနိုင်သည်။ Human rule တစ်ခုခု ကိုက်ညီပါက Human Review ကို ဦးစားပေးရမည်။
- Rule 39 တွင် audit နမူနာရွေးချယ်ခြင်းကို System လုပ်နိုင်သော်လည်း ရွေးခံရသော Case ကို Warehouse Manager စစ်ဆေးရမည်။
- AI Review ခွင့်သည် Stock ပြင်ခြင်း၊ ငွေပြန်အမ်းခြင်း၊ တာဝန်ရှိသူဆုံးဖြတ်ခြင်း ခွင့်နှင့် မတူပါ။
- AI မဖြေရှင်းနိုင်ခြင်း၊ လိုအပ်သော source records မရခြင်း သို့မဟုတ် SME က လူစစ်ဆေးရန်တောင်းဆိုခြင်းတွင် Manager ဆီ escalate လုပ်ရမည်။

## AI Review rules

1. **Missing reference** — Order ID / Shipment ID / SKU မပါပါက မှန်ကန်သော Reference တောင်းရန်။
2. **Reference not found** — System တွင် ID မတွေ့ပါက ပြန်စစ်ပြီး Reference အမှန်တောင်းရန်။ မတွေ့ခြင်းကို ပစ္စည်းပျောက်သည်ဟု မကောက်ချက်ချရန်။
3. **Missing description** — Complaint အသေးစိတ်မပြည့်စုံပါက ရှင်းလင်းချက် ထပ်မေးရန်။
4. **Missing quantity** — Quantity-related complaint တွင် ထိခိုက်သောအရေအတွက် မပါပါက ထပ်တောင်းရန်။
5. **Missing evidence** — လိုအပ်သော Receipt / Photo / Record မပါပါက Evidence တောင်းရန်။
6. **Out of scope** — Courier delay / Failed delivery ကဲ့သို့ Warehouse scope ပြင်ပဖြစ်ပါက အကြောင်းရင်းရှင်းပြပြီး သတ်မှတ်ထားသော Contact ကိုညွှန်ရန်။ စစ်ဆေးမပြီးဘဲ Warehouse တာဝန်မရှိဟု မသတ်မှတ်ရန်။
17. **Processing deadline exceeded** — Record အရ Picking / Packing / Dispatch handover deadline ကျော်ပါက Alert ပေးပြီး အကြောင်းရင်းတောင်းရန်။
19. **Possible duplicate** — SME၊ Reference နှင့် Issue တူသော Report ရှိနိုင်ပါက ဆက်စပ် Case ကိုပြရန်။ Duplicate သံသယဖြင့် မဖျက်၊ မပိတ်၊ မပေါင်းရန်။
23. **Information-only request** — Status / Record ရှင်းပြရန်သာဖြစ်ပါက အတည်ပြုထားသော သက်ဆိုင်ရာ Records အပေါ်အခြေခံ၍ အဖြေပေးရန်။
24. **Additional information needed** — လိုအပ်သည့် အချက်အလက်များကို SME ဆီ ထပ်တောင်းရန်။
32. **Incorrect calculation** — Quantity / Amount တွက်ချက်မှုကို System calculation ဖြင့် ပြန်စစ်ရန်။ အလိုအလျောက် Stock / ငွေကြေး မပြင်ရန်။
38. **All required checks passed** — လိုအပ်သော Data / Records ပြည့်စုံပြီး checks အောင်မြင်ပါက ခွင့်ပြုထားသော Action အတွက် Resolution ပြင်ဆင်ရန်။ Human rule တစ်ခုခုရှိပါက ဤ rule ဖြင့် ကျော်ခွင့်မပြုရန်။

## Human Review rules — Warehouse Manager

7. **Ownership mismatch** — SME နှင့် Order / Shipment ပိုင်ရှင် မကိုက်ခြင်းကို စစ်ဆေးရန်။ သက်ဆိုင်မှုမအတည်ပြုမီ အခြား SME ၏ Data မဖော်ပြရန်။
8. **Receiving mismatch** — Expected / Sent quantity နှင့် Received quantity မကိုက်ခြင်း။
9. **Inventory mismatch** — System stock နှင့် Physical count မကိုက်ခြင်း။
10. **Missing item** — Order ထဲတွင် ပစ္စည်း သို့မဟုတ် Quantity လိုခြင်း။
11. **Wrong item / SKU** — မှားရွေး၊ မှားထုပ်ထားနိုင်ခြင်း သို့မဟုတ် Picking / Packing record မကိုက်ခြင်း။
12. **Damage reported** — Warehouse-related ပျက်စီးမှုနှင့် အကြောင်းရင်း စစ်ဆေးရန်။
13. **Conflicting evidence** — SME evidence နှင့် Warehouse record ဆန့်ကျင်ခြင်း။
14. **Unverifiable evidence** — Photo မရှင်း၊ Receipt ဖတ်မရ သို့မဟုတ် Evidence ကို ယုံကြည်စိတ်ချစွာ တိုက်စစ်မရခြင်း။
15. **Source record unavailable** — စစ်ဆေးရန်လိုအပ်သော Receiving / Packing / Stock movement records မရှိ သို့မဟုတ် မချိတ်ထားခြင်း။
16. **Physical inspection required** — Stock recount / Shelf / CCTV စစ်ဆေးရန်လိုခြင်း။
18. **Return receiving delay** — Warehouse ပြန်ရောက်ကြောင်း Record ရှိပေမယ့် Return စာရင်းမဝင်သေးခြင်း။
20. **Repeated issue** — SKU / Order / Warehouse area တူတွင် ပြဿနာ မကြာခဏပြန်ဖြစ်ခြင်း။
21. **Reopened case** — SME က Resolution လက်မခံဘဲ အကြောင်းပြချက်ဖြင့် ပြန်ဖွင့်ခြင်း။ Manager review ဆီပြန်ပို့ရန်။
22. **Human review requested** — SME က လူနှင့်တိုက်ရိုက် စစ်ဆေးပေးရန် တောင်းဆိုခြင်း။
25. **Stock adjustment requested** — Inventory quantity ပြင်ရန် တောင်းဆိုခြင်း။
26. **Replacement / Repacking requested** — ပစ္စည်းအစားထိုး၊ ပြန်ထုပ်ပိုး သို့မဟုတ် ပစ္စည်းမှန်ပြန်ပြင်ဆင်ရန် တောင်းဆိုခြင်း။
27. **Refund / Compensation requested** — ငွေပြန်အမ်း၊ နစ်နာကြေးပေးရန် ဆုံးဖြတ်ခြင်း။
28. **Liability decision required** — ဘယ်အဖွဲ့က တာဝန်ရှိကြောင်း ဆုံးဖြတ်ရန်လိုခြင်း။
29. **High-value impact** — ထိခိုက်မှုတန်ဖိုးက သတ်မှတ်ထားသော ပမာဏကျော်ခြင်း။
30. **Large quantity / Multiple orders affected** — ထိခိုက်သည့် Quantity / Orders က သတ်မှတ်အရေအတွက်ကျော်ခြင်း။
31. **Unsupported conclusion** — AI Maker အဖြေတွင် Records ဖြင့် မထောက်ခံထားသော ကောက်ချက်ပါခြင်း။
33. **Rule violation** — AI အကြံပြုချက်က Business rule / Permission နှင့် မကိုက်ခြင်း။ AI Checker က pass ပေးလည်း မကျော်ခွင့်ပြုရန်။
34. **Maker–Checker disagreement** — AI Maker နှင့် AI Checker စစ်ဆေးချက် မတူခြင်း။
35. **Unable to interpret** — Burmese / English Complaint၊ Product name သို့မဟုတ် အဓိပ္ပာယ်ကို မရှင်းလင်းစွာ နားလည်နိုင်ခြင်း။
36. **AI / API failure** — Timeout / Invalid response / Model service failure ကြောင့် စစ်ဆေးမှု မပြီးမြောက်နိုင်ခြင်း။
37. **Repeated unsuccessful handling** — အချက်အလက်တောင်း၊ အဖြေပြန်သော်လည်း သတ်မှတ်အကြိမ်ကျော်အောင် မပြေလည်ခြင်း။
39. **Random audit selection** — Automated checks pass ဖြစ်သော်လည်း လူပြန်စစ်ရန် နမူနာရွေးချယ်ခံရခြင်း။

## Maker–Checker workflow and case closure

1. SME က Warehouse complaint တင်မည်။
2. AI Maker က Category၊ Summary၊ Evidence references နှင့် Proposed Resolution ပြင်ဆင်မည်။ ဤအဆင့်ကို Solved ဟု မယူဆရ။
3. Rules engine က Rule IDs နှင့် Permission limits စစ်မည်။
4. AI Checker က မူရင်း Complaint / Source Records နှင့် Maker proposal ကို ပြန်တိုက်စစ်မည်။ Maker summary တစ်ခုတည်းကို မမှီခိုရ။
5. Human rules / warnings / audit ရှိပါက Warehouse Manager queue ထဲထည့်မည်။ မရှိပါက ခွင့်ပြုထားသော AI action ကိုသာ ဆောင်ရွက်နိုင်သည်။
6. Manager က Evidence စစ်ပြီး **Approve / Edit & Approve / Return for Rework** လုပ်နိုင်သည်။ Decision နှင့် အကြောင်းပြချက်ကို မှတ်တမ်းတင်ရမည်။
7. Approved Resolution ပို့ပြီး **Awaiting SME Confirmation** အဖြစ်ထားမည်။
8. **SME Confirm & Close လုပ်မှ Closed ဖြစ်မည်။** AI သို့မဟုတ် Warehouse Manager က တိုက်ရိုက် မပိတ်ရ။ Auto-close မလုပ်ရ။
9. SME က Reopen လုပ်ပါက အကြောင်းပြချက်လိုပြီး Manager queue သို့ပြန်ပို့ရမည်။

## Queue, audit and reporting

- Human queue တွင် Priority၊ Assigned Manager၊ Waiting Since၊ Matched Rule IDs၊ Warning reasons၊ Original Complaint၊ Maker proposal နှင့် Evidence references ပြရန်။
- **Processed cases / Flagged cases / Warning findings / Pending AI Review / Pending Human Review** ကို သီးခြားရေတွက်ရန်။ Case တစ်ခုတွင် Warning အများကြီးရှိနိုင်သည်။
- Automated pass သည် အမှားမရှိကြောင်း အာမခံချက်မဟုတ်ပါ။ AI ကိုယ်တိုင်ပြောသော confidence တစ်ခုတည်းဖြင့် Rule / Permission မကျော်ရ။
- AI action၊ Checker findings၊ Manager decision နှင့် SME confirmation ကို Case History ထဲသိမ်းရန်။
- Demo-generated records / simulated checks ကို အမှန်တကယ် AI inference၊ source verification သို့မဟုတ် operational action အဖြစ် မပြရန်။

## Pending configuration — မသတ်မှတ်ရသေးသော Thresholds

Processing deadline၊ high-value amount (MMK)၊ affected quantity / order count၊ repeat-issue window၊ unsuccessful handling attempts၊ queue escalation time နှင့် random audit rate တို့ကို Business owner က သတ်မှတ်ရန် ကျန်ရှိသည်။ မသတ်မှတ်ရသေးသော values ကို အတည်ပြုထားသကဲ့သို့ မယူဆရ။ လိုအပ်သော threshold မရှိ၍ Case ခွဲခြားမရပါက Manager review ဆီပို့ရန်။

## Prototype implementation note

`parcelcare-prototype/dist/rule-catalog.js` တွင် Rule IDs၊ Labels၊ Routing နှင့် descriptions ကို ဤဖိုင်မှ ထုတ်ထားသည်။ `rule-engine.js` က structured facts၊ issue type၊ ရိုးရှင်းသော action keywords နှင့် duplicate references ကိုသုံး၍ routing လုပ်သည်။ Human rule တစ်ခုခု match ဖြစ်ပါက Manager ဆီပို့သည်။ `rule-controls.js` တွင် demo facts ပြင်ပြီး rules ပြန်စစ်နိုင်သည်။ Rule 29 / 30 / 37 အတွက် threshold မသတ်မှတ်ရသေးပါက manager review သို့ပို့သည်။ AI Maker / Checker က simulated demo ဖြစ်ပြီး Hugging Face inference သို့မဟုတ် source records verification မချိတ်ရသေးပါ။ Browser workspace switch သည် တကယ့် authorization မဟုတ်ပါ။

## Product impact priority — approved configurable model

- Routing (AI / Human) and priority are separate decisions. Priority levels are Critical, High, Normal and Low.
- Affected value is the sum of affected quantity × unit price in MMK for every affected product line. Order total is not used.
- Manager sets all three positive, ascending Normal / High / Critical thresholds. Equality meets that threshold; values below Normal are Low. User-requested starter thresholds are Normal 50,000 MMK, High 200,000 MMK and Critical 1,000,000 MMK; below 50,000 is Low. These are editable application defaults, not an industry standard.
- All category names are supported. Manager explicitly configures ordinary categories (all risk flags off) or perishable / fragile / temperature-sensitive / safety-sensitive profiles. Each profile can configure the priority for a safety incident, temperature breach, and damage / missing / wrong item, including None. Category flags alone do not escalate a case.
- Safety incidents apply to perishable / safety-sensitive profiles; temperature breaches apply to temperature-sensitive profiles; damage / missing / wrong-item incidents apply to any flagged risk profile. Default incident priorities in the category editor are Critical, Critical and High respectively; saving a profile approves its settings.
- The highest applicable value or category/incident priority wins. A known elevated priority remains visible if other data is missing, with a Manager check warning. Otherwise incomplete data shows Priority pending, never assumed Low.
- Missing product data, category profile or money thresholds requires Manager review (R24 plus an explicit priority warning), without claiming that a numbered Human rule matched. R38 cannot bypass this requirement.
- Manager overrides require a reason and history entry. Overrides do not bypass missing-data escalation or any Human routing rule. Settings edits record before/after values and reason in browser-local history and reevaluate pending review queues. Approved and closed cases are preserved.
- Product inputs, reported safety signals and category settings remain demo inputs, not verified source records. Browser role switching is not production authorization.
