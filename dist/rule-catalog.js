const REVIEW_RULES=[
  {
    "id": 1,
    "title": "Missing reference",
    "review": "AI",
    "description": "Order ID / Shipment ID / SKU မပါပါက မှန်ကန်သော Reference တောင်းရန်။"
  },
  {
    "id": 2,
    "title": "Reference not found",
    "review": "AI",
    "description": "System တွင် ID မတွေ့ပါက ပြန်စစ်ပြီး Reference အမှန်တောင်းရန်။ မတွေ့ခြင်းကို ပစ္စည်းပျောက်သည်ဟု မကောက်ချက်ချရန်။"
  },
  {
    "id": 3,
    "title": "Missing description",
    "review": "AI",
    "description": "Complaint အသေးစိတ်မပြည့်စုံပါက ရှင်းလင်းချက် ထပ်မေးရန်။"
  },
  {
    "id": 4,
    "title": "Missing quantity",
    "review": "AI",
    "description": "Quantity-related complaint တွင် ထိခိုက်သောအရေအတွက် မပါပါက ထပ်တောင်းရန်။"
  },
  {
    "id": 5,
    "title": "Missing evidence",
    "review": "AI",
    "description": "လိုအပ်သော Receipt / Photo / Record မပါပါက Evidence တောင်းရန်။"
  },
  {
    "id": 6,
    "title": "Out of scope",
    "review": "AI",
    "description": "Courier delay / Failed delivery ကဲ့သို့ Warehouse scope ပြင်ပဖြစ်ပါက အကြောင်းရင်းရှင်းပြပြီး သတ်မှတ်ထားသော Contact ကိုညွှန်ရန်။ စစ်ဆေးမပြီးဘဲ Warehouse တာဝန်မရှိဟု မသတ်မှတ်ရန်။"
  },
  {
    "id": 7,
    "title": "Ownership mismatch",
    "review": "Human",
    "description": "SME နှင့် Order / Shipment ပိုင်ရှင် မကိုက်ခြင်းကို စစ်ဆေးရန်။ သက်ဆိုင်မှုမအတည်ပြုမီ အခြား SME ၏ Data မဖော်ပြရန်။"
  },
  {
    "id": 8,
    "title": "Receiving mismatch",
    "review": "Human",
    "description": "Expected / Sent quantity နှင့် Received quantity မကိုက်ခြင်း။"
  },
  {
    "id": 9,
    "title": "Inventory mismatch",
    "review": "Human",
    "description": "System stock နှင့် Physical count မကိုက်ခြင်း။"
  },
  {
    "id": 10,
    "title": "Missing item",
    "review": "Human",
    "description": "Order ထဲတွင် ပစ္စည်း သို့မဟုတ် Quantity လိုခြင်း။"
  },
  {
    "id": 11,
    "title": "Wrong item / SKU",
    "review": "Human",
    "description": "မှားရွေး၊ မှားထုပ်ထားနိုင်ခြင်း သို့မဟုတ် Picking / Packing record မကိုက်ခြင်း။"
  },
  {
    "id": 12,
    "title": "Damage reported",
    "review": "Human",
    "description": "Warehouse-related ပျက်စီးမှုနှင့် အကြောင်းရင်း စစ်ဆေးရန်။"
  },
  {
    "id": 13,
    "title": "Conflicting evidence",
    "review": "Human",
    "description": "SME evidence နှင့် Warehouse record ဆန့်ကျင်ခြင်း။"
  },
  {
    "id": 14,
    "title": "Unverifiable evidence",
    "review": "Human",
    "description": "Photo မရှင်း၊ Receipt ဖတ်မရ သို့မဟုတ် Evidence ကို ယုံကြည်စိတ်ချစွာ တိုက်စစ်မရခြင်း။"
  },
  {
    "id": 15,
    "title": "Source record unavailable",
    "review": "Human",
    "description": "စစ်ဆေးရန်လိုအပ်သော Receiving / Packing / Stock movement records မရှိ သို့မဟုတ် မချိတ်ထားခြင်း။"
  },
  {
    "id": 16,
    "title": "Physical inspection required",
    "review": "Human",
    "description": "Stock recount / Shelf / CCTV စစ်ဆေးရန်လိုခြင်း။"
  },
  {
    "id": 17,
    "title": "Processing deadline exceeded",
    "review": "AI",
    "description": "Record အရ Picking / Packing / Dispatch handover deadline ကျော်ပါက Alert ပေးပြီး အကြောင်းရင်းတောင်းရန်။"
  },
  {
    "id": 18,
    "title": "Return receiving delay",
    "review": "Human",
    "description": "Warehouse ပြန်ရောက်ကြောင်း Record ရှိပေမယ့် Return စာရင်းမဝင်သေးခြင်း။"
  },
  {
    "id": 19,
    "title": "Possible duplicate",
    "review": "AI",
    "description": "SME၊ Reference နှင့် Issue တူသော Report ရှိနိုင်ပါက ဆက်စပ် Case ကိုပြရန်။ Duplicate သံသယဖြင့် မဖျက်၊ မပိတ်၊ မပေါင်းရန်။"
  },
  {
    "id": 20,
    "title": "Repeated issue",
    "review": "Human",
    "description": "SKU / Order / Warehouse area တူတွင် ပြဿနာ မကြာခဏပြန်ဖြစ်ခြင်း။"
  },
  {
    "id": 21,
    "title": "Reopened case",
    "review": "Human",
    "description": "SME က Resolution လက်မခံဘဲ အကြောင်းပြချက်ဖြင့် ပြန်ဖွင့်ခြင်း။ Manager review ဆီပြန်ပို့ရန်။"
  },
  {
    "id": 22,
    "title": "Human review requested",
    "review": "Human",
    "description": "SME က လူနှင့်တိုက်ရိုက် စစ်ဆေးပေးရန် တောင်းဆိုခြင်း။"
  },
  {
    "id": 23,
    "title": "Information-only request",
    "review": "AI",
    "description": "Status / Record ရှင်းပြရန်သာဖြစ်ပါက အတည်ပြုထားသော သက်ဆိုင်ရာ Records အပေါ်အခြေခံ၍ အဖြေပေးရန်။"
  },
  {
    "id": 24,
    "title": "Additional information needed",
    "review": "AI",
    "description": "လိုအပ်သည့် အချက်အလက်များကို SME ဆီ ထပ်တောင်းရန်။"
  },
  {
    "id": 25,
    "title": "Stock adjustment requested",
    "review": "Human",
    "description": "Inventory quantity ပြင်ရန် တောင်းဆိုခြင်း။"
  },
  {
    "id": 26,
    "title": "Replacement / Repacking requested",
    "review": "Human",
    "description": "ပစ္စည်းအစားထိုး၊ ပြန်ထုပ်ပိုး သို့မဟုတ် ပစ္စည်းမှန်ပြန်ပြင်ဆင်ရန် တောင်းဆိုခြင်း။"
  },
  {
    "id": 27,
    "title": "Refund / Compensation requested",
    "review": "Human",
    "description": "ငွေပြန်အမ်း၊ နစ်နာကြေးပေးရန် ဆုံးဖြတ်ခြင်း။"
  },
  {
    "id": 28,
    "title": "Liability decision required",
    "review": "Human",
    "description": "ဘယ်အဖွဲ့က တာဝန်ရှိကြောင်း ဆုံးဖြတ်ရန်လိုခြင်း။"
  },
  {
    "id": 29,
    "title": "High-value impact",
    "review": "Human",
    "description": "ထိခိုက်မှုတန်ဖိုးက သတ်မှတ်ထားသော ပမာဏကျော်ခြင်း။"
  },
  {
    "id": 30,
    "title": "Large quantity / Multiple orders affected",
    "review": "Human",
    "description": "ထိခိုက်သည့် Quantity / Orders က သတ်မှတ်အရေအတွက်ကျော်ခြင်း။"
  },
  {
    "id": 31,
    "title": "Unsupported conclusion",
    "review": "Human",
    "description": "AI Maker အဖြေတွင် Records ဖြင့် မထောက်ခံထားသော ကောက်ချက်ပါခြင်း။"
  },
  {
    "id": 32,
    "title": "Incorrect calculation",
    "review": "AI",
    "description": "Quantity / Amount တွက်ချက်မှုကို System calculation ဖြင့် ပြန်စစ်ရန်။ အလိုအလျောက် Stock / ငွေကြေး မပြင်ရန်။"
  },
  {
    "id": 33,
    "title": "Rule violation",
    "review": "Human",
    "description": "AI အကြံပြုချက်က Business rule / Permission နှင့် မကိုက်ခြင်း။ AI Checker က pass ပေးလည်း မကျော်ခွင့်ပြုရန်။"
  },
  {
    "id": 34,
    "title": "Maker–Checker disagreement",
    "review": "Human",
    "description": "AI Maker နှင့် AI Checker စစ်ဆေးချက် မတူခြင်း။"
  },
  {
    "id": 35,
    "title": "Unable to interpret",
    "review": "Human",
    "description": "Burmese / English Complaint၊ Product name သို့မဟုတ် အဓိပ္ပာယ်ကို မရှင်းလင်းစွာ နားလည်နိုင်ခြင်း။"
  },
  {
    "id": 36,
    "title": "AI / API failure",
    "review": "Human",
    "description": "Timeout / Invalid response / Model service failure ကြောင့် စစ်ဆေးမှု မပြီးမြောက်နိုင်ခြင်း။"
  },
  {
    "id": 37,
    "title": "Repeated unsuccessful handling",
    "review": "Human",
    "description": "အချက်အလက်တောင်း၊ အဖြေပြန်သော်လည်း သတ်မှတ်အကြိမ်ကျော်အောင် မပြေလည်ခြင်း။"
  },
  {
    "id": 38,
    "title": "All required checks passed",
    "review": "AI",
    "description": "လိုအပ်သော Data / Records ပြည့်စုံပြီး checks အောင်မြင်ပါက ခွင့်ပြုထားသော Action အတွက် Resolution ပြင်ဆင်ရန်။ Human rule တစ်ခုခုရှိပါက ဤ rule ဖြင့် ကျော်ခွင့်မပြုရန်။"
  },
  {
    "id": 39,
    "title": "Random audit selection",
    "review": "Human",
    "description": "Automated checks pass ဖြစ်သော်လည်း လူပြန်စစ်ရန် နမူနာရွေးချယ်ခံရခြင်း။"
  }
];
