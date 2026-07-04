# AE Brand Grounding

Source of truth for every brand/imagegen subagent this effort spawns. Read this
before generating anything. Authorities above this file: `PRODUCT.md` (thesis),
`DESIGN.md` (visual system), `AGENTS.md` (contract). This file synthesizes them
for brand work.

## 1. Product soul (what we are giving a face to)

Agentic Economy is the **trust-and-discovery layer for agentic commerce**. A
person or an assistant asks for a real-world need, compares business-published
facts, and takes **one honest next step** — a *qualified inquiry* sent for owner
review. Nothing is booked, charged, dispatched, or auto-fulfilled.

One-sentence soul: **AE is the trustworthy clerk at the threshold of a new
marketplace** — it reads the room, shows the real options, names what is known,
and hands you to the business with the right evidence packet. Browsable and
provider-proud like a marketplace, but *stricter* than a marketplace: every
attractive surface exposes its limits.

Who it serves: customers needing a real provider + safe next step; business
owners who want accurate representation and *pride* in being listed; assistants
needing structured facts, provenance, and refusal boundaries; internal reviewers
resolving stale/contradicted/disputed facts.

Feeling to evoke: **warm, exact, useful, commercially credible.** A civic /
commercial trust desk — not a chatbot toy, not protocol theater, not a generic
SaaS directory.

## 2. The honest boundary (non-negotiable in every image + caption)

- AE **reads, compares, summarizes, routes**, and **sends a qualified inquiry**
  when the listing publishes that action.
- AE does **not** book, charge, dispatch, auto-fulfil, or confirm
  availability/timing/price. The business confirms those, later.
- Receipts matter: the qualified inquiry returns a **receipt**; the durable
  trail behind the handoff is core to the brand.
- "Verified" only with a **named standard** the listing meets; otherwise use
  *checked / supplied / published / last checked / needs confirmation*.
- Never render `KNOWN` / `UNKNOWN` / `UNAVAILABLE` / `NEXT_STEP` as labels on
  human surfaces (they live only in JSON/llms.txt/owner surfaces).
- Public human copy must avoid internal architecture words: source-owned,
  readback, manifest, capability, gateway, operator, MCP, OpenAPI, callable,
  autonomous, agent-native, DTO, fixture.
- No imagery implying a completed booking, payment, dispatch, star reviews, or
  marketplace liquidity that doesn't exist yet.

## 3. Current visual system (the substrate we build the soul onto)

- **Component layer:** Astryx — `@astryxdesign/core` + `@astryxdesign/theme-neutral`,
  `mode="light"`, wired in `src/routes/__root.tsx`. Astryx is the build substrate
  for real UI. Brand = identity + motifs + imagery layered on top.
- **Utility layer:** Tailwind 4, CSS-first (no config file), layout glue only.
- **Style entry:** `src/styles/globals.css` cascade; a shrinking `legacy.css`
  still carries retiring tokens.
- **Tokens in use:** semantic classes `text-primary/secondary`, `bg-surface/card/body`,
  `border-border`, `rounded-md`, `shadow-sm`; radii 4px panels / 6px controls /
  999px pills; rare soft hairline shadows; 8px spacing scale.
- **Retired identity — do NOT relapse into it:** "Daylight Register"
  (Fraunces serif, amber, paper, hand-drawn hero, bespoke `Ae*` components,
  handwritten CSS). Banned.

## 4. Anti-slop bans (align with the taste skills)

No purple/AI gradients · no 3-column icon grids · no centered-everything · no
bubble radius on everything · no gradient CTAs · no glassmorphism · no blobs ·
no new bespoke `Ae*` presentation components · no shadcn/radix/cva · no new
handwritten CSS files · no font-source/ad-hoc font packages · no Daylight
amber/paper/Fraunces/hand-drawn relapse.

## 5. Why it feels soulless today (the problem we are solving)

1. Home (`src/routes/index.tsx`) is a centered prompt + safe thesis copy — a
   search box, not the *beginning of a marketplace*. No inventory, proof,
   receipt, handoff, or world-building.
2. Public copy repeats correct boundary phrases until emotion is squeezed out —
   reads like compliance copy, not a brand.
3. Astryx-neutral is used as a safe default, not a brand: neutral cards, badges,
   grids, facts, and a plain `AE` square — no signature AE material.
4. Registry (`src/routes/registry.tsx`) is a competent-but-familiar card grid;
   no editorial comparison object or marketplace drama.
5. Provider pages (`AeProviderListingPage.tsx`) explain a business but don't make
   the owner feel *proud to be listed*; flat card hierarchy.
6. The trust layer exists as text + badges, not as a **visceral artifact**
   (proof spine / docket / receipt trail / clearance stamp).
7. The answer surface (`AeGenerativeAnswer.tsx`) uses "Process" step-cards — a
   generic AI-product trope, not a uniquely AE trust journey.

## 6. Brand opportunity + motifs that fit (design targets)

Own the territory of **the trust handoff for agentic commerce**. Motifs that fit
Astryx-era without violating bans:

- **Receipt / docket cards** — structured, flat, sharp, tangible-but-paperless;
  hairline rules, mono timestamps. NOT skeuomorphic paper.
- **Source / freshness stamps** — "business supplied · 12 Jun", "checked against X".
- **Proof spine** — a chain: Published → Source/Freshness → Inquiry sent →
  Business reply pending/received. Hairline connectors, constrained accent.
- **Provider storefront pride** — quality category imagery + geography +
  owner-confirmed notes + a pride-forward headline before the facts grid.
- **The inquiry-receipt moment** — the conversion made a tangible object, not a
  generic success alert.
- **Local, tangible commerce** — service area, response cue, honest boundary all
  visually felt.

## 7. Where assets land in the app (for later production tickets)

- Home / search: `src/routes/index.tsx`, `src/components/ae/chat/AeChatWelcome.tsx`
- Brand mark / shell: `src/components/ae/layout/AePublicShell.tsx` (plain `AE` square today)
- Registry + cards: `src/routes/registry.tsx`, `src/components/ae/primitives/AeProviderCard.tsx`
- Provider storefront: `src/components/ae/listing/AeProviderListingPage.tsx`
- Inquiry receipt: `src/routes/$slug.inquiry.tsx`, `src/components/ae/inquiries/*`
- Answer/chat journey: `src/components/ae/artifacts/AeGenerativeAnswer.tsx`,
  `AeProtectedByAe.tsx`, `AeGenerativeMap.tsx`, `src/components/ae/chat/*`
- Agent affordance: `src/components/ae/landing/AeAgentJsonAffordance.tsx`
  (keep, but warm it into "assistant-readable details")
