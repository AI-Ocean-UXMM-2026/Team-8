# Workspace access

Live sessions use the authenticated user's verified memberships. UI role selection,
URL parameters, demo preferences and client role headers do not grant live access.

| Membership | Workspace | Data scope |
| --- | --- | --- |
| Rider | `/rider`, `/courier` | Current assigned deliveries and their allowed delivery/report/GPS actions |
| SME | `/sme` | Shipments, stock, orders, tracking and cases for the member's SME |
| Owner or staff | `/warehouse` | Authorized warehouses and the operations allowed by database policies |

An account with multiple verified memberships may select those workspaces. A
missing membership prevents the workspace's domain components from mounting.
Backend authorization and PostgreSQL RLS independently enforce tenant and
assignment scope, including when an API is called directly.

## Demo behavior

Start at `/demo` and choose Rider, SME, Warehouse or Manager. The selected demo
role is retained per browser tab for reloads. Use **Change demo role** to return
to selection; other roles' deep links, accounts and tracking previews show an
access-denied screen. Signing out clears the selection. Legacy non-manager
workspace URLs redirect to their dedicated dashboards.

Demo selection is a browser preference for fictitious data, not authentication.
It never changes live memberships or replaces backend access checks. The Manager
prototype remains a separate demo; it does not create a live `manager` role.

## Verification

- `npm run test:rbac:browser`: demo selection, role-only menus, direct URLs,
  preview queries, manager entry, reload, sign-out and live cross-role page denial.
- `npm run test:frontend`: role mapping and demo route access matrix.
- `npm run test:database`: real database policies for SME isolation, warehouse
  scope, rider assignments, forged actions, evidence and idempotent commands.
- `npm run test:reports:browser`: reports still work after explicit demo selection.

Browser checks opening a demo workspace must first select its role at `/demo`.
Use separate tabs and select the appropriate role in each for tracking comparisons.
