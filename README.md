# ParcelCare warehouse reporting prototype

HTML, Tailwind CSS and jQuery. Open dist/index.html or serve dist using `python3 -m http.server 8765 --directory dist`.

## Walkthrough
1. SME → My Reports → Report warehouse issue. Submit a reference, warehouse issue type, description and requested outcome.
2. Warehouse → SME Reports → Open report → Assign to me → Start review → Start investigation.
3. Request more information if necessary; switch to SME to reply.
4. Warehouse proposes a written resolution. The report stays Awaiting SME Confirmation.
5. SME confirms and closes, or supplies a reason and reopens the report.

Only SME confirmation closes a report. There is no automatic closure. Report status is separate from order/delivery status. Five warehouse issue categories are supported; courier failed-delivery and courier-delay reporting are excluded. Evidence is text references in this prototype, not uploads. Browser-local storage only; workspace switching simulates roles rather than real authentication. No live API, GPS or backend.

Validation: `node check-reports.cjs` covers transitions, required notes, information requests, reopen and SME-only closure. Browser visual/click QA was blocked by the browser approval gate in this session.
