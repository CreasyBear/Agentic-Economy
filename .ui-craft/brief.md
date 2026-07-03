# Product purpose

Agentic Economy is a query-first commerce-routing surface where a person or an assistant states a need and gets a tailored answer: real local providers, what they do, where they work, how fast they reply when known, and what to do now. The same published facts remain machine-readable so assistants can read, compare, and route qualified inquiries without implying booking, payment, dispatch, or autonomous fulfillment.

# North star

**The home of agentic commerce — commerce clarity, routable queries, generated answers, human handoff.**

Brand thesis: **Human-readable answers over agent-readable facts.** The UI is calm, exact, and product-native; the data underside is structured enough for assistants.

# Primary user

A person with a real-world local need, often urgent and often on mobile. Second: an assistant reading the same facts as data and routing. Third: an owner/operator hosting and correcting their page.

# Design read

Astryx Era: Agentic Economy uses `DESIGN.md` as the visual authority, `@astryxdesign/core` with `@astryxdesign/theme-neutral` as the component layer, and Tailwind 4 CSS-first utilities only as layout glue. Public surfaces should feel like a clean local-discovery product with structured evidence, not a custom illustration brand, a dashboard, or a component-library demo.

# Knobs

- CRAFT_LEVEL 8
- MOTION_INTENSITY 4
- VISUAL_DENSITY 3 (public), 5 (owner/admin)

# Principles

1. **Query in, generative answer out.** The hero interaction is a query box that produces a tailored answer panel, not a browse wall. Human and agent send the same intent.
2. **Lead with fit, not caveat.** Show real services, real areas, real response cues, and a plain "Not offered" line where relevant. Do not lead public surfaces with defensive trust/safety/uncertainty copy. The agent epistemic vocabulary (`KNOWN`/`UNKNOWN`/`UNAVAILABLE`/`NEXT_STEP`) never appears as labels on human surfaces — only in the JSON API, `llms.txt`, "Get as agent JSON," and owner/admin surfaces.
3. **Astryx first.** Use Astryx components and templates for presentation; AE-owned modules keep behavior, state, routing, and data contracts.
4. **Theme-neutral, not route-local styling.** Typography, color, focus, elevation, and component states come from the Astryx theme bridge. Tailwind utilities arrange layout only.
5. **Local, not theatrical.** Public pages are clean, grounded, and evidence-led. No dark command terminals, no AI-gradient spectacle, no custom illustration dependency, no stock-hero clutter.
6. **Shared systems outrank route polish.** Improve reusable shells, cards, forms, and answer artifacts before one-off route styling.
7. **One conversion action per public viewport.** Ask, view details, or submit an inquiry — never competing primary actions.

# Color strategy

Use the Astryx theme-neutral palette and semantic bridge classes from `DESIGN.md`: `text-primary`, `text-secondary`, `bg-surface`, `bg-card`, `bg-body`, `border-border`, `rounded-md`, and `shadow-sm`. Functional status color is reserved for real status states. Do not introduce raw hex/OKLCH literals, arbitrary Tailwind colors, route-local palettes, or retired brand accent language outside token definitions.

# Typography

Typography comes from `@astryxdesign/theme-neutral`. Use the Astryx type scale and component defaults for headings, body, labels, data rows, and form controls. Do not add font packages, route-local `font-family`, or typeface-specific instructions to active specs.

# Layout and shape

Public surfaces use Astryx `AppShell` + `TopNav` with centered-hero, product-gallery, detail-page, and form templates as appropriate. Chat/answer surfaces use the Astryx `Chat*` family. Owner/admin surfaces use `AppShell` + `SideNav`, table-page/table-grouped patterns, settings/detail templates, and Astryx feedback primitives. Tailwind controls spacing, grid/flex, breakpoints, and viewport behavior only.

# Motion

Minimal-functional, leaning intentional. 80–400ms, GPU-only, no scroll-jacking. Signature: generated answers assemble in meaningful steps — answer line → cards/table/map when allowed → prose → what to do now. Honor `prefers-reduced-motion` by rendering instantly.

# Imagery

Use real provider evidence when the catalog publishes it. Otherwise prefer structured content, citations, maps only when data supports them, and Astryx empty/skeleton states. No generic stock, robot imagery, abstract gradients, or new custom illustration system.

# Voice

Plain, warm, exact, consequence-aware. Use: "What do you need done?", "Here’s what’s listed for … near …", "Check hours", "What to do now", "Get as agent JSON", "Assistants can read these published details.", "The business handles timing, price, and availability." Never `KNOWN`/`UNKNOWN`/`UNAVAILABLE`/`NEXT_STEP` as labels in public copy. Never protocol words (manifest, MCP, DTO, callable, etc.). Avoid "safe", "trusted", and uncertainty-first phrases as public positioning.

# Success metric for the surface

First-time visitor understands AE is the place to route a real-world need, see who fits, and decide what to do now. Assistant knows it can read/compare/route but not book/pay/dispatch.

# Out of scope

No booking, payment, dispatch, autonomous fulfillment, fake ratings, or "verified" without a defined standard. No retired pre-Astryx visual cues, dark command terminals, labeled epistemic ledger on human surfaces, or public claims that imply AE performs the service.

# References inform, not copy

Google Maps (clean info surfaces), agentic.market (plain structured catalog, llms.txt), Nike/Meta/Apple (physical product evidence + sticky action), Shopify (merchant pride), Wise/Stripe Checkout (action-moment clarity), Intercom/Cal/Linear (product artifact UI), ARD spec (agent-readable catalogs), Shopify Polaris/IBM Carbon (admin). Airbnb deliberately demoted.

# Authority

`DESIGN.md` is the visual/UI authority. Active UI Craft docs record product, IA, and surface constraints only; when they disagree with `DESIGN.md` on visuals, `DESIGN.md` wins.
