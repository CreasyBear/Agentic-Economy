# Product purpose

Agentic Economy is the home of agentic commerce: a daylight, local discovery surface where a person or an assistant types a need and gets a tailored answer — real local providers, what they do, where they work, how fast they reply, and the one safe next step. The surface looks crafted by a human. Underneath, the same facts are machine-readable, so an agent can route the same query a human types.

# North star

**The home of agentic commerce — a marketplace, routable queries, agent-first.**

Brand thesis: **Drawn by hand. Read by agents.** Human craft on top of machine-readable facts.

# Primary user

A person with a real-world local need (often urgent, often on mobile). Second: an assistant reading the same facts as data and routing. Third: an owner/operator hosting and correcting their page.

# Design read

A daylight regional register for agentic commerce — Google-Maps-clean local discovery crossed with an agentic.market-style plain registry, with a hand-drawn craft surface and an agent-readable underside. Leaning Tailwind v4 + shadcn-owned primitives + AE token seams + Fraunces/Hanken Grotesk/IBM Plex Mono. Restrained motion. One warm accent.

# Knobs

- CRAFT_LEVEL 8
- MOTION_INTENSITY 4
- VISUAL_DENSITY 3 (public), 5 (owner/admin)

# Principles

1. **Query in, generative answer out.** The hero interaction is a query box that produces a tailored answer panel, not a browse wall. Human and agent send the same intent.
2. **Honesty is shown, not labeled.** We show real services, real areas, real response times, and a plain "Not offered" line. The agent epistemic vocabulary (`KNOWN`/`UNKNOWN`/`UNAVAILABLE`/`NEXT_STEP`) never appears as labels on human surfaces — only in the JSON API, `llms.txt`, "Get as agent JSON," and owner/admin surfaces.
3. **Drawn by hand. Read by agents.** Hand-drawn line illustration is the signature brand asset — the human-craft counterpoint to the machine-readable underside.
4. **One warm accent.** Signage amber is the only hot color. Warmth by rarity, not wash.
5. **Local, not moody.** Daylight, real, grounded. No dark command terminals, no institutional cold, no Airbnb-coral.
6. **Shared systems outrank route polish.**
7. **One conversion action per public surface.**

# Color strategy

Coral retired (wrong family + Airbnb-derivative). Cream/linen body bg retired (AI-default tell). Sunlit drafting paper `#ECEAE1` (cool, not cream). Ink `#14161A`. Single warm accent: signage amber `#E89B3C`. Eucalyptus `#3F5947` for available/verified. Oxide brick `#A8322A` for unavailable/error (not coral). Slate `#345A7A` for info/routable. Hairline rules `#C9C8BE` carry hierarchy, not shadows.

# Typography

- Display/Hero: **Fraunces** (variable serif) — wordmark, headlines, business names.
- Body/UI: **Hanken Grotesk** — all body, UI, chips, sentences.
- Data/mono: **IBM Plex Mono** (tabular-nums) — status bar, slugs, IDs, response times, breadcrumbs, "Get as agent JSON." Never for customer trust copy, never for epistemic labels.
- Free/CDN stack. Licensed upgrades (Söhne, Berkeley Mono) noted for future.

# Layout and shape

Hybrid: creative-editorial public hero (query box + generated answer + hand-drawn asset), grid-disciplined owner/admin. 12-col desktop / 4-col mobile. 4px panel/card radius, 6px buttons, 999px status pills only. No bubble radius on everything. Hairline rules + type scale + amber carry hierarchy.

# Motion

Minimal-functional, leaning intentional. 80–400ms, GPU-only, no scroll-jacking. Signature: the generated answer panel assembles in short staggered steps (answer line → cards → map → next step). Honor `prefers-reduced-motion` (render instantly).

# Imagery

Two modes, contrasted: real Australian local-business photography (vehicles, teams, tools, service areas) AND hand-drawn pen-and-ink line illustration of local architecture (Victorian/Edwardian houses, civic buildings, faint skylines) as the signature brand asset. No generic stock, no robot imagery, no abstract gradients, no flat vector illustration.

# Voice

Plain, warm, exact, consequence-aware. "What do you need done?", "Responds ~22m", "Available today", "Not offered: …", "Get as agent JSON", "No booking or payment on this page." Never `KNOWN`/`UNKNOWN`/`UNAVAILABLE`/`NEXT_STEP` as labels in public copy. Never protocol words (manifest, MCP, DTO, callable, etc.).

# Success metric for the surface

First-time visitor understands AE is the place to route a real-world need and trust what comes back — not booking/payment. Assistant knows it can read/compare/route but not book/pay/dispatch.

# Out of scope

No booking, payment, dispatch, autonomous fulfillment, fake ratings, or "verified" without a defined standard. No coral, cream, dark command terminals, or labeled epistemic ledger on human surfaces.

# References inform, not copy

Google Maps (clean info surfaces), agentic.market (plain registry, llms.txt), ARD spec (agent-readable catalogs), Shopify Polaris (admin), Stripe Checkout (action-moment trust), Uber Base (cross-surface language). Airbnb deliberately demoted.

# Authority

Full token spec lives in `DESIGN.md` §17. `src/styles/tokens.css` is the implementation. When they disagree, DESIGN.md wins.
