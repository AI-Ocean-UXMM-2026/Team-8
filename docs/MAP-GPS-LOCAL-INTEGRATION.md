# Local Map/GPS integration — 23 October 2026

Selected the Map/GPS changes through `862d34b` from the Render branch history, starting after `5a48b31`. This includes lifecycle/GPS fixes, road-following demo steps, arrival/SME receipt, shared server demo state and the role-aware delivery preview. Stock categorization and the later general UX rewrite are excluded.

The existing Profile/Language integration is retained, including on the new preview. Pre-existing inventory/workspace changes, styles, documents and presentations remain uncommitted and preserved. The narrow rider-report endpoint is retained. The production user database adapter now registers the two reviewed tracking settings/arrival RPCs; an endpoint regression test exercises that adapter.

## Local use

- Courier controls: <http://localhost:3218/demo/delivery-preview?role=courier>
- SME receipt: <http://localhost:3218/demo/delivery-preview?role=sme>
- Warehouse tracking: <http://localhost:3218/demo/warehouse/tracking>
- Tracking settings: <http://localhost:3218/demo/warehouse/settings>

Use **Move vehicle** for each road segment, then **Confirm arrival** within 100 m. The SME must explicitly confirm receipt to mark success. **Reset demo** enables replay. Demo simulation must be enabled in settings.

`/api/demo/tracking` shares fictitious state across browsers using a server-process hub, revisions and request keys. Restarting the local server resets that hub. Local and Render are separate servers and do not share demo progress. Demo routes never use device GPS or invoke a live routing provider.

## Database and live service requirements

The added migration is `supabase/migrations/20261022120000_be1_tracking_arrival_settings.sql`. Apply it to the intended database before using live tracking settings/arrival endpoints. No production migration was run by this integration.

Live route calculation still requires a configured Python API, authenticated assigned courier, explicit consent, browser location access and the server-only `OPENROUTESERVICE_API_KEY`. Real provider routing and physical-device GPS were not exercised. Backend provider responses and browser location were mocked for verification.

## Verification

- Typecheck; 55 frontend/map tests; backend routing and adapter tests; contract source/generated-type drift; migration naming/transaction validation.
- Isolated PGlite database suite, including tracking settings, arrival/SME receipt and existing rider-report workflows.
- `npm run test:maps:browser` with the local server running: independent browser contexts, ten road steps, observer synchronization, reload, stale-revision rejection, arrival, receipt confirmation, reset/replay, simulation disablement, connection loss/recovery and desktop/mobile overflow.
- `npm run test:maps:live`: isolated fixture server, authenticated mobile courier, explicit route/GPS consent, route request/result, initial GPS publish, watch cleanup and stop. Run separately from other fixture-server tests sharing `.next`.
- Profile/account and EN/MM persistence browser checks, sign-out failure/retry checks and header/sidebar layout checks passed.

The bundled native PostgreSQL test launcher could not initialize because its ICU dynamic library is missing. The isolated PGlite suite passed instead. Native Supabase tests require an explicitly configured environment.

Production database migrations and Render deployment were not performed during local integration.
