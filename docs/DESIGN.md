# Fairshare visual direction

The November 2026 refresh adapts the public [Fonzi homepage](https://fonzi.ai/): warm ivory, forest green, editorial serif headings, generous spacing, rounded controls, a connected-card illustration, and restrained entrance motion. Fairshare keeps its own name, copy, original geometric mark, and expense workflows. No Fonzi fonts, illustrations, testimonials, or assets are bundled.

- `client/design.tsx` owns color tokens, platform serif fallbacks, branding, and finite motion. Entrances last 650 ms; the decorative mark drifts once over 2.8 seconds. Motion stops when reduced motion is requested and cleans up on unmount.
- `client/Welcome.tsx` wraps the existing phone/password flow. Its switchable illustration is explicitly labeled “Example”; it never creates transactions or implies an assistant is connected. On small screens the sign-in shortcut scrolls directly to the form.
- `client/components.tsx` shares the button, field, pill, and card treatment across account, banking, receipts, and agent setup. `WebPolish` supplies keyboard focus rings, hover transitions, and reduced-motion CSS; it does nothing on native platforms.
- `client/ExpenseHome.tsx` uses the same palette and typography for groups, balances, activity, and dialogs. Navigation entrances preserve mounted content and do not reset form state. Desktop has a sidebar and framed workspace; mobile retains bottom navigation and horizontally scrolling group actions.

The API, database schema, accounting, authentication, OAuth grants, and MCP tools are unchanged. There are no new runtime dependencies or external font requests. Native uses the shared React Native primitives; visual verification for this PR covers the web app, not an iOS or Android simulator.
