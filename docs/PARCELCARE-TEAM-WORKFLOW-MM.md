# ParcelCare — Team Workflow

ရက်စွဲ — 22 October 2026

Source of truth — https://github.com/AI-Ocean-UXMM-2026/Team-8

ဤဖိုင်သည် Team အတွက် သတ်မှတ်ထားသော end-to-end workflow ကို ရှင်းပြထားခြင်းဖြစ်သည်။ Feature အားလုံး production တွင် စမ်းသပ်ပြီးကြောင်း အတည်ပြုချက် မဟုတ်ပါ။ Implementation status ကို code၊ tests နှင့် deployment verification တို့ဖြင့် သီးခြားစစ်ဆေးရမည်။

## 1. အသုံးပြုသူများနှင့် တာဝန်များ

- **SME owner** — Warehouse ဆီ request ပို့ရန်၊ မိမိ stock/shipment ကြည့်ရန်၊ ပြဿနာတင်ရန်၊ လိုအပ်သော ဆုံးဖြတ်ချက် အတည်ပြုရန်။
- **Warehouse staff** — ပစ္စည်းလက်ခံရန်၊ stock စစ်ရန်၊ dispatch ပြင်ဆင်ရန်၊ exception စုံစမ်းပြီး ဖြေရှင်းချက် အဆိုပြုရန်။
- **Warehouse manager** — Escalated cases စစ်ရန်၊ priority ပြောင်းရာတွင် အကြောင်းပြချက် မှတ်တမ်းတင်ရန်၊ manager approval လိုအပ်သော လုပ်ဆောင်ချက်များ အတည်ပြုရန်။
- **Courier** — Assigned delivery လက်ခံရန်၊ pickup စစ်ရန်၊ လမ်းကြောင်းကြည့်ရန်၊ consent ဖြင့် GPS မျှဝေရန်၊ delivery evidence တင်ရန်။

## 2. Inbound — Warehouse ဆီ ပစ္စည်းအပ်ခြင်း

**SME request → Expected shipment → Warehouse receiving → Stock update**

1. Warehouse staff က Expected quantity နှင့် shipment status စစ်မည်။
2. Received quantity နှင့် Damaged quantity ထည့်မည်။ Damaged quantity သည် Received quantity ထဲတွင် ပါဝင်သည်။
3. Good condition = Received − Damaged၊ Remaining = Expected − Received ကို တွက်ပြမည်။
4. Blank၊ negative၊ fractional quantity၊ Received ထက် Damaged များခြင်းနှင့် Expected ထက် Received များခြင်းကို validation ဖြင့် တားမည်။
5. Evidence စစ်ဆေးမှုကို အတည်ပြုမည်။ Read-only verified status နှင့် user confirmation checkbox ကို သီးခြားပြမည်။
6. Receipt summary ကို ပြန်စစ်ပြီး Partial receipt သိမ်းမည်၊ သို့မဟုတ် confirmation ဖြင့် Finalize လုပ်မည်။ Finalize မလုပ်မီ နောက်ပြန်ပြင်၍မရနိုင်သည့် သက်ရောက်မှုကို ရှင်းပြမည်။
7. Stock နှင့် verified timeline ကို update လုပ်မည်။ စစ်ဆေးရန် ခွဲထားသော damaged stock ကို available stock နှင့် သီးခြားပြမည်။
8. Damage/shortage ရှိပါက business rules အရ ဆက်စပ် case ဖန်တီးမည် သို့မဟုတ် ရှိပြီးသား case နှင့် ချိတ်မည်။ Partial receipt ကို မပြီးဆုံးသေးသော final shortage အဖြစ် မမှတ်ယူရပါ။

## 3. Outbound — Customer ဆီ ပို့ခြင်း

**SME order/request → Warehouse စစ်ဆေး → Picking → Packing → Ready → Courier assignment → Pickup verification → Dispatch → In transit → Delivery proof → သက်ဆိုင်ရာ confirmation**

- Warehouse staff က stock နှင့် ပို့ဆောင်ရန် အချက်အလက်များ စစ်ဆေးမည်။
- Courier က မိမိထံ assigned လုပ်ထားသော delivery ကို လက်ခံမည်။
- Physical pickup နှင့် dispatch ကို သက်ဆိုင်ရာ တာဝန်ရှိသူက အတည်ပြုမှတ်တမ်းတင်မည်။
- Courier က delivery ပြီးသောအခါ proof of delivery တင်မည်။ Proof တင်ခြင်းနှင့် workflow ၏ နောက်ဆုံး confirmation ကို မရောထွေးရပါ။
- Third-party courier အတွက် handover details၊ courier name၊ waybill နှင့် external tracking reference ကို မှတ်တမ်းတင်မည်။ ParcelCare in-house GPS ရှိသကဲ့သို့ မပြရပါ။

## 4. GPS နှင့် လမ်းကြောင်း

1. Courier က recipient address နှင့် destination pin ကို စစ်မည်။
2. Provider ဆီ GPS origin နှင့် destination ပို့ရန် consent ပေးပြီး **Calculate driving route** နှိပ်မည်။
3. openrouteservice ဖြင့် တွက်ထားသော route plan ကို shipment အတွက် သိမ်းမည်။ Courier ရွေးထားသော destination ကို verified shipment address ဟု မသတ်မှတ်ရပါ။
4. Pickup အတည်ပြုပြီး location-sharing consent ဖြင့် **Start sharing** နှိပ်မည်။
5. Warehouse staff က မိမိ warehouse ၏ သက်ဆိုင်ရာ shipments ကို ကြည့်နိုင်မည်။
6. SME owner က မိမိ account နှင့် ကိုက်ညီသော shipments ကိုသာ ကြည့်နိုင်မည်။
7. Last updated၊ accuracy နှင့် stale indication ကို ပြမည်။ Route duration ကို guaranteed ETA သို့မဟုတ် live traffic ဟု မပြရပါ။
8. Sharing ရပ်ခြင်း၊ eligible session ပြီးဆုံးခြင်း သို့မဟုတ် delivery terminal state ရောက်ခြင်းတွင် access rules အရ shared route/location ကို ဖျောက်မည်။

GPS capture သည် foreground-only ဖြစ်သည်။ Courier page မှ ထွက်ခြင်း သို့မဟုတ် offline ဖြစ်ခြင်းတွင် capture ရပ်သည်။ Route plans သည် လက်ရှိ implementation တွင် 24 နာရီ သက်တမ်းရှိသည်။ တကယ့်ဖုန်း GPS verification အတွက် accepted/picked-up assignment နှင့် rider location permission လိုသည်။

**Demo:** PC-OUT-0003 အတွက် illustrative route နှင့် simulated movement ကို သုံးသည်။ တကယ့် GPS သို့မဟုတ် road directions မဟုတ်ကြောင်း ရှင်းလင်းစွာ ပြရမည်။

## 5. Exception ဖြေရှင်းခြင်း

**Report တင် → Shipment/issue အလိုက် case ချိတ် → Priority/SLA risk သတ်မှတ် → စုံစမ်း → ဖြေရှင်းချက်အဆိုပြု → လိုအပ်သော approval → အကောင်အထည်ဖော် → SME confirmation → Close**

1. SME သို့မဟုတ် authorized operational workflow မှ issue၊ shipment reference နှင့် evidence တင်မည်။
2. တူညီသော shipment/issue အတွက် case ရှိမရှိ စစ်ပြီး create-or-match လုပ်မည်။
3. သတ်မှတ်ထားသော business rules အရ priority သတ်မှတ်မည်။ Required data မလုံလောက်ပါက priority pending/review လိုအပ်ကြောင်း ပြမည်။
4. Warehouse staff က evidence စစ်ပြီး လိုအပ်သော အချက်အလက် ထပ်တောင်းမည်။
5. ဖြေရှင်းချက် အဆိုပြုပြီး manager သို့မဟုတ် SME approval လိုအပ်မှုကို စစ်မည်။
6. Authorized action ကို အကောင်အထည်ဖော်ပြီး verified outcome နှင့် timeline မှတ်တမ်းတင်မည်။
7. SME က resolution ကို အတည်ပြုပြီးမှ case ပိတ်မည်။ မပြေလည်ပါက ထပ်မံစုံစမ်းရန် ပြန်ပို့မည်။

## 6. AI Maker–Checker — ရည်ရွယ်ထားသော Flow

- **AI Maker** — Evidence အခြေခံပြီး စုံစမ်း၊ classification/priority နှင့် action အဆိုပြုမည်။
- **AI Checker** — Evidence၊ classification၊ priority နှင့် proposed action ကို သီးခြားစစ်မည်။
- Check မအောင်ပါက execution ပိတ်ပြီး staff/manager review ဆီ ပို့မည်။
- Evidence မလုံလောက်ပါက အချက်အလက် ထပ်တောင်းမည်။
- AI သည် policy ခွင့်ပြုသော action ကိုသာ လုပ်နိုင်သည်။ Physical receipt၊ pickup၊ delivery proof သို့မဟုတ် GPS consent ကို အလိုအလျောက် အတည်မပြုရပါ။

## 7. Approval နှင့် Case Closure

**SME approval လိုအပ်သော အခြေအနေများ**

- Return ပြုလုပ်ရန်။
- Disposal ပြုလုပ်ရန်။
- Partial shipment ပို့ရန်။
- Additional charge ကောက်ခံရန်။

ပုံမှန် investigation အတွက် SME approval မလိုပါ။ Warehouse က resolution အဆိုပြုနိုင်သော်လည်း SME resolution confirmation ရပြီးမှ case ပိတ်မည်။ Manager approval သည် SME approval သို့မဟုတ် SME closure confirmation ကို အစားမထိုးပါ။

## 8. Priority၊ Review၊ Status နှင့် SLA

- **Priority** — မည်မျှ အရေးကြီးသနည်း။
- **Review status** — မည်သူ စစ်ဆေးနေသနည်း၊ review မည်သည့်အဆင့်တွင်ရှိသနည်း။
- **Case status** — Case ဖြေရှင်းမှု မည်သည့်အခြေအနေတွင်ရှိသနည်း။
- **Escalation flag** — အထက်တာဝန်ရှိသူထံ ပို့ရန်လိုသလား။ Priority နှင့် သီးခြားထားမည်။
- **SLA risk** — First-response/resolution deadline နီးကပ်ခြင်း၊ overdue ဖြစ်ခြင်းကို သက်ဆိုင်ရာ policy အရ ပြမည်။

MMK thresholds နှင့် category risk တို့ကို အတည်ပြုထားသော business rules/settings အတိုင်း သုံးရမည်။ ဤဖိုင်တွင် threshold အသစ် မသတ်မှတ်ထားပါ။ SLA/risk ranking နှင့် AI integration တို့၏ လက်ရှိ production coverage ကို သီးခြားစစ်ဆေးရန် လိုသည်။

## 9. Dashboard Navigation နှင့် UI Rules

- **Warehouse** — Overview၊ Inventory၊ Shipments၊ GPS tracking၊ Open cases။
- **SME** — မိမိ stock/shipment/case overview၊ မိမိ shipments အတွက် tracking နှင့် သက်ဆိုင်ရာ decisions။
- **Manager** — Review queue၊ escalated reports နှင့် priority settings။
- **Courier** — Assigned deliveries၊ Route & GPS၊ pickup/delivery evidence နှင့် issue reporting။

Warehouse dashboard ကို UI consistency reference အဖြစ် သုံးမည်။ Logo၊ sidebar width၊ spacing၊ typography၊ card/table styles၊ hover/focus states ကို တစ်သမတ်တည်း ထားမည်။ Cyan primary နှင့် yellow secondary palette ကို ဆက်သုံးမည်။ English-only သို့မဟုတ် Myanmar-only mode ကို user ရွေးနိုင်မည်။

Loading၊ empty၊ error၊ retry နှင့် uncertain submission states ကို ရှင်းပြရမည်။ GPS၊ evidence၊ approval သို့မဟုတ် success မရှိဘဲ ရှိသကဲ့သို့ မပြရပါ။

## 10. မျှဝေစမ်းသပ်ရန် Demo Links

- Warehouse: https://parcelcare-team8.onrender.com/demo/warehouse
- SME: https://parcelcare-team8.onrender.com/demo/sme
- Manager: https://parcelcare-team8.onrender.com/demo/manager
- Courier: https://parcelcare-team8.onrender.com/demo/courier

Demo workspace များသည် production identity၊ stock နှင့် physical delivery verification ကို အစားမထိုးပါ။
