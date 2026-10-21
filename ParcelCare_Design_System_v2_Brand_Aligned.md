# ParcelCare Design System v3 — shadcn/ui Vega / Teal & Yellow

This uses shadcn Vega components with the user-supplied teal/yellow palette. The filename is retained so existing links keep working. Product behavior and permissions follow the V4 PRD and implementation plan.

## Source of truth

- Selected preset: **b5JNedagS** — https://ui.shadcn.com/create?preset=b5JNedagS
- Style: **Vega**, Base UI primitives; neutral base, custom **Teal / Yellow** theme, based on the supplied Tailwind palette.
- Heading/body font: **Geist**, with system and Myanmar-capable fallbacks.
- Icon library: **Phosphor**. Corners: **Small**.
- Menu: **Default / Solid**. Menu accent: **Subtle**.
- Configuration: `components.json`. Theme tokens: `src/app/globals.css`.
- React primitives: `src/components/ui/`. Utilities: `src/lib/utils.ts`.
- Interactive reference: `/design-system`.

The preset defines component styles; the supplied palette in globals.css overrides its original Sky colors. Primary is primary-400 (#25CBD1), secondary is secondary-400 (#FFC738), with shade-950 foregrounds on filled controls. All shades 50?950 are available as Tailwind utilities. Do not maintain a competing hex palette inside feature components.

Install more components with `npx shadcn@latest add <component>` (npm is the project's current lockfile manager; the requested pnpm command has the same preset). Official shadcn 4.22.1 Tailwind variants are vendored with their MIT license in `src/styles/`, so the CLI and its transitive tooling are not production dependencies. Geist is self-hosted from the `geist` package, without build-time Google font requests.

## Foundations

White cards, a quiet neutral canvas, near-black headings, muted supporting text, thin neutral borders, restrained shadows and teal primary actions. Semantic success/warning/danger must still describe operational meaning with explicit text.

Consume semantic Tailwind classes: `bg-background`, `text-foreground`, `bg-card`, `text-card-foreground`, `text-muted-foreground`, `border-border`, `bg-primary`, `text-primary-foreground`, `ring-ring`. Charts use `chart-1` through `chart-5`. Corners use preset `rounded-sm`, `rounded-md` and `rounded-lg` tokens.

Geist headings use weight 500–600 and modest negative tracking. Body text is 14px, headings 24–28px and metadata 12px. Use tabular numerals for quantities, money and timestamps. Keep Myanmar text readable with an appropriate fallback. Use 4px spacing increments, 16–24px card padding and 24px section gaps. Warehouse is desktop-first, SME responsive, rider mobile-first with 44px touch targets.

Product name: **ParcelCare**. Product logo: `public/brand/parcelcare-logo.png` (full wordmark). Favicon: `public/brand/parcelcare-icon.png` (stork and parcel). Use these supplied images instead of placeholder icons or recreated wordmarks. Approved ParcelCare logo artwork retains its original colors, transparency and proportions. Logo artwork does not override the Teal / Yellow theme for application controls.

## Components

- **Button:** primary for the main action, outline for alternatives, ghost for low-emphasis controls, destructive for actual destructive intent. Include pending/disabled states.
- **Card:** title, concise description and content; small corners, neutral border, minimal shadow. Compose CardHeader, CardContent and CardFooter.
- **Input / Textarea / Select:** persistent labels, helper text, visible focus and explicit validation. Placeholders are not labels.
- **Badge:** status text and semantic styling. Priority, workflow and ownership remain separate. Brand color does not mean successful delivery.
- **Table:** aligned headers, tabular quantities, row actions and loading/empty/forbidden states. Preserve mobile horizontal scrolling.
- **Dialog:** accessible trigger/title/description, escape/cancel, focus return and explicit confirmation. Retain primitive keyboard behavior.
- **Tabs:** related views, with primitive keyboard navigation.
- **Icons:** Phosphor, 16–20px, consistent weight. Name icon-only actions accessibly; hide decorative icons from assistive technology.

## Operational UX

Backend tenant/role checks remain authoritative. UI visibility is not authorization. Never fabricate GPS, ETA, courier confirmation or SME approval. Show evidence provenance, human decisions and timeline context. Priority is independent of human escalation.

In-house GPS exposes consent, Start/Stop and freshness: Live, Updating, Stale, Offline, Permission Denied and Ended. Third-party shipments use verified handover details and external tracking references without internal courier GPS. Uploading proof alone does not confirm delivery.

## Migration and verification

New React features import shadcn primitives instead of inventing parallel controls. Existing HTML-driven operational screens share the preset through `src/features/workspace/theme.css`; remove adapters as owners migrate features to React. The grayscale low-fidelity preview stays a wireframe, not a second product theme.

Use compiled Tailwind instead of the old browser CSS runtime. Preserve `dist/` separately. Validate build/typecheck and workflow tests; inspect desktop/mobile screens, form/dialog focus and the interactive reference before accepting visual changes.
