from pathlib import Path
import json
D=Path(__file__).resolve().parent
c=json.loads((D/'content.json').read_text())
titles=['Problem hook','Disconnected conversations','Solution and AI role','One-case demo','Business model and impact','12-month roadmap','Outcome and pilot ask']
script='# ParcelCare — Burmese speaker script\n\nEnglish slides · Burmese narration · 7 slides · target duration 5:00. Timing is a rehearsal target, not a recording of the presenter.\n\n'
for i,(title,note) in enumerate(zip(titles,c['notes']),1): script+=f'## Slide {i} — {title}\n\n{note}\n\n'
script+='''## Recording note

Slide 4 contains a silent, 110-second edited walkthrough made from screenshots captured during actual interactions with the deployed public demo. It is not continuous screen capture, a voice recording, real AI inference, or a production delivery. Record your Burmese narration over it. Slide transitions are manual; use the timecodes above.

The seed complaint is stored user content in Burmese. English mode intentionally preserves it. Do not imply that English mode rewrites customer records.
'''
(D/'Burmese-Speaker-Script.md').write_text(script)
(D/'Demo-and-Judge-Guide.md').write_text('''# ParcelCare — demo, rehearsal and judge guide

## Open the deliverables

- `ParcelCare-5-Minute-Pitch.pptx`: 7 editable English slides, Burmese speaker notes, embedded MP4 on slide 4. In PowerPoint Slide Show, click the video to play. Check playback before presenting; the adjacent MP4 is the fallback if your viewer blocks embedded media.
- `ParcelCare-Demo-Walkthrough.mp4`: exactly 110 seconds, silent edited screenshot montage from the real deployed demo workflow. It is not a continuous screen recording. Captions explicitly identify fictitious data and deterministic rule checks.
- `Burmese-Speaker-Script.md`: narration with slide and demo timecodes. Record your own voice; no narration has been synthesized.
- `assets/`: actual captured states and video cover.
- `create-deck.cjs`, `content.json`, `make-walkthrough.py`: editable source. Build with `pptxgenjs`; video needs Pillow and imageio-ffmpeg. No application code or deployment was changed for this presentation.

## Narrative and timing

0:00–0:20 Hook → 0:20–0:55 Problem → 0:55–1:25 Solution → 1:25–3:15 Demo → 3:15–3:55 Business → 3:55–4:35 Roadmap → 4:35–5:00 Ask.

The pitch is about exception resolution for warehouse operators and SME owners. The paying customer is the warehouse/3PL operator. In-house couriers support the workflow. GPS is a backup capability, not the main story.

## Verified demo preparation

Open https://parcelcare-team8.onrender.com/demo/workspace?workspace=warehouse&view=reports . This legacy report demo uses browser-local storage. Role changes in the same browser share this report. Do not promise cross-browser persistence for this report workflow; shared GPS demo state is a separate system.

Use fictitious `WR-2001`, `IN-0081`, `Golden Bloom`: 100 sent, 95 recorded, affected quantity 5, reference `Delivery receipt IN-0081`. A receipt reference is not proof that a file was uploaded, read or physically verified.

Capture/rehearsal completed for these transitions:

1. Warehouse → Reports → View report WR-2001. Review What happened, Why this queue, Next step.
2. Click the deployed control `Run demo review`. Some builds label it `Run demo checks`. The rule engine routes this seed to Manager review; missing product data leaves priority pending. Do not fabricate a priority to make the demo look complete.
3. Close the dialog. Switch workspace to Warehouse Manager. View the same report. The seed has missing inputs; show the missing-information warning.
4. In the manager decision form, record this clearly labelled illustrative proposal: “DEMO PROPOSAL: Accept the recorded 95-unit receipt and acknowledge the five-unit discrepancy for separate follow-up. This records agreement only; no physical recount or stock correction is claimed.” Click Record manager decision.
5. Close the dialog. Switch to SME. Menu → Reports → View report WR-2001. Read the proposed resolution; click Confirm & Close. Show Case status Closed and Shared case history. Reopen report is the alternative if the SME disagrees.

The captured demo closes a report after a recorded agreement. It does not establish that the missing five items were found, independently verified, compensated or physically corrected in inventory. Explain that distinction explicitly.

The capture session changed only local fictitious report state. It did not submit an authenticated production case. The current browser seed may now be closed. Use a separate browser profile/session for a fresh seed. Do not reset a shared live workspace or silently erase someone else's draft.

## AI claim boundaries

Working in this demonstration: deterministic rules, queue routing, recorded manager proposal, SME-only report closure and history.

AI capability direction: evidence-grounded summaries, missing-information detection and suggested next actions. Only demonstrate actual inference after a configured worker/provider has produced a persisted model result. The presentation does not claim that a second AI checker ran, that PDF/image content was read, or that autonomous execution occurred.

Product verification: closing a demo report is distinct from physical stock verification. Avoid “fully autonomous”, “guaranteed correct”, “instant resolution”, “first to market” and unmeasured performance percentages.

## Judge answers

**What exactly does AI do?** It is intended to assist investigation: summarize supplied facts, flag gaps and suggest next actions. This recorded demonstration uses rules to illustrate review routing, not live model inference.

**Why would a warehouse pay?** To reduce investigation and coordination effort across multiple SME relationships and keep a traceable resolution history. Validate willingness to pay in a pilot; do not claim paid traction.

**Who are the primary users?** Warehouse staff/managers and SME owners. Couriers are supporting users. End customers are outside this MVP.

**Why not a spreadsheet or chat?** The differentiation to test is a connected case, evidence context, role-specific decisions and confirmation history. Do not claim no competitor provides these capabilities.

**Does a closed report mean the missing items were found?** No. Show the exact resolution recorded. Physical stock verification and any corrections require separate authorized steps.

**How do you measure ROI?** Cases/month × minutes saved/case ÷ 60 × staff cost/hour estimates labor-time value. It is not necessarily cash savings. Subtract subscription, incremental operating and change-management costs when evaluating customer benefit. Avoid double-counting staff time and labor savings.

**What are your costs?** AI usage, hosting/storage, onboarding, customer support and ongoing maintenance. Track cost per case and support effort per site. No numeric margin is validated yet.

**What is your pricing?** A per-warehouse monthly subscription is the hypothesis. Test included SME collaboration, usage limits and willingness to pay. Integrations and onboarding support could become paid options after validation.

**What about discounts?** Consider a time-limited pilot discount with explicit duration, usage limits and the normal price disclosed before paid conversion. No discount or price is committed by this deck.

**What are the top performance risks?** Case/evidence/AI waiting time and delayed cross-dashboard updates. Instrument them before declaring them measured bottlenecks.

**How large is the market?** Use a bottom-up warehouse-site model; do not reuse unrelated user counts. TAM = qualifying sites × annual revenue/site. SAM = reachable segment. SOM = sites the team can realistically sell, onboard and support in 12 months. Obtain sources before adding numeric market claims.

**How will you grow?** Operator referrals, targeted product demos and logistics partnerships, conditional on pilot value and affordable support. Track qualified leads → demo → pilot → paid site → retained site by channel.

## Effort versus impact

High impact / manageable first: receiving mismatch workflow, clear next action, correct SME permissions, evidence references and resolution history.

High impact / higher effort: reliable real AI investigation, independent checking, evidence reading and production monitoring.

Supporting later: richer GPS/route presentation, advanced reporting, multi-warehouse integrations. Do not build a full WMS to support the pitch.

## Monthly research cadence and one-year execution

Month 1: warehouse/SME interviews; validate the receiving mismatch story.
Month 2: establish case volume, first response and resolution-time baselines.
Month 3: agree a pilot workflow, data access and measurable success criteria.
Month 4: run the pilot and review stalled cases weekly.
Month 5: improve workflow and test willingness to pay.
Month 6: assess measured value, support load and pilot-to-paid conversion.
Months 7–9: test referrals and targeted demos; compare channel conversion and onboarding effort monthly.
Months 10–12: expand only where retention, operating costs and support capacity justify it; prioritize one integration from customer evidence.

These are proposed activities, not completed milestones. Do not invent numerical adoption targets before research. The monthly scorecard is active sites, weekly active staff, first-response/resolution time, SME confirmation rate, pilot-to-paid conversion, retention and support effort. State denominators and measurement windows.

## Three rehearsal passes before submission

Pass 1 — Accuracy: verify the case, quantities, evidence reference and AI disclosure. Check that no recording implies real model execution or physical inventory correction.
Pass 2 — Timing: rehearse all 7 slides with a timer. Hit 1:25 at the demo start, 3:15 at demo end and 5:00 at closing. Shorten narration if needed; do not speed up disclaimers until unreadable.
Pass 3 — Failure recovery: play the presentation offline, test embedded video and the separate MP4, check audio levels after recording your voice, and confirm captions are legible on the submission device.

One interaction capture pass has been performed for these assets. The three timed presenter rehearsals remain a team task; they are not claimed as completed.

## Visual choices

Current ParcelCare logo, white canvas, cyan primary and yellow emphasis. Editable PowerPoint shapes; one takeaway per slide. No invented TAM, revenue, testimonial, logo partnership or measured savings.
''')
print('Speaker script and judge/rehearsal guide created.')
