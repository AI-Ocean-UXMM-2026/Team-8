# Sign-in API connection fix

On 22 October 2026, a read-only request to the live frontend's `/api/me`
with an intentionally invalid diagnostic token returned HTTP 502 with
`Content-Type: text/html`. The healthy `/api/health` response only verified
the frontend process. No real account credentials were used.

This confirms a broken API connection, not an incorrect password. The public
response alone does not distinguish a failed backend from an incorrect backend
URL; Render settings and logs are required to identify that deployment condition.

## Changes

- The server proxy validates upstream response type and JSON before forwarding
  it. Hosting error pages become a structured 502 API error instead of raw HTML.
- The browser preserves 401/403 authentication/access status and reports HTML
  502/503 responses as service failures. Malformed replies never authenticate a
  user or silently select demo data.
- The Blueprint now sets frontend `PARCELCARE_API_URL` from the declared
  `parcelcare-api` service's `RENDER_EXTERNAL_URL`. It also shares the backend's
  Supabase URL and public key with the frontend. Only public configuration is
  shared; no worker, service-role or OpenAI key is exposed.
- The local `cn` utility fix is needed for a clean production build.

## Existing Render services

The Blueprint wiring takes effect only after a Blueprint sync. Updating Git
source does not itself repair manually configured Render environment variables.
For a manually managed deployment, set `PARCELCARE_API_URL` on the frontend to
the **FastAPI service's HTTPS origin**, without `/api` or another path, and
redeploy the frontend. The API service must run `api/app/main.py` from this
repository and have `SUPABASE_URL` and `SUPABASE_PUBLIC_KEY` configured. Do not
substitute a different ParcelCare project's backend merely because its name
matches: its endpoints and database schema may be incompatible.

Before testing real credentials, verify `/api/me` with an invalid diagnostic
token returns a JSON authentication error instead of a hosting HTML error page.
A 503 JSON error still indicates missing/unavailable backend configuration and
does not mean sign-in is repaired.

## Verification

`npm run test:frontend`: 38 passed, including raw HTML gateway/authentication
responses, upstream JSON validation, and outage-to-success proxy recovery.
`npm run build`: compilation, TypeScript and all static pages passed.

Render references: [cross-service variables](https://render.com/docs/blueprint-spec#referencing-service-properties),
[RENDER_EXTERNAL_URL](https://render.com/docs/environment-variables).
