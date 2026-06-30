---
name: Agentic Economy
description: Daylight Register — a hand-drawn, local, daylight discovery surface for agentic commerce. Query in, generative answer out. Human craft on top of machine-readable facts.
colors:
  ink: "#14161A"
  paper: "#ECEAE1"
  surfaceSunken: "#E2E1D8"
  surfaceRaised: "#F4F3EC"
  muted: "#6B6E63"
  hairline: "#C9C8BE"
  amber: "#E89B3C"
  amberDeep: "#C9822A"
  eucalyptus: "#3F5947"
  oxide: "#A8322A"
  slate: "#345A7A"
typography:
  display:
    fontFamily: "Fraunces, ui-serif, Georgia, serif"
    fontSize: "clamp(3rem, 7vw, 5.8rem)"
    lineHeight: "1.02"
    fontWeight: "560"
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Fraunces, ui-serif, Georgia, serif"
    fontSize: "2.5rem"
    lineHeight: "1.08"
    fontWeight: "540"
    letterSpacing: "-0.005em"
  body:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    lineHeight: "1.6"
    fontWeight: "430"
  mono:
    fontFamily: "IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.8125rem"
    lineHeight: "1.5"
    fontWeight: "450"
components:
  primary-action:
    radius: "6px"
    background: "#E89B3C"
    color: "#14161A"
    hover: "#C9822A"
  provider-card:
    radius: "4px"
    background: "#F4F3EC"
    border: "1px solid #C9C8BE"
    shadow: "none"
  status-pill:
    radius: "999px"
    background: "rgba(63, 89, 71, 0.12)"
    color: "#3F5947"
  query-box:
    radius: "6px"
    background: "#F4F3EC"
    border: "1px solid #C9C8BE"
---

# Design System — Agentic Economy (Daylight Register)

## 0. The Thesis

**Drawn by hand. Read by agents.**

Agentic Economy is the home of agentic commerce: a daylight, local discovery surface where a person or an assistant types a need and gets a tailored answer — real local providers, what they do, where they work, how fast they reply, and the one safe next step. The surface looks crafted by a human (hand-drawn, warm, local, daylight). Underneath, the same facts are machine-readable, so an agent can route the same query a human types.

The brand lives in that tension: **human craft on top of machine-readable facts.** Every visual decision serves it.

## 1. North Star

**The home of agentic commerce — a marketplace, routable queries, agent-first.**

Not "the Airbnb of agentic commerce." Not a coral marketplace skin. A query box that produces a generative answer, grounded in real local providers, honest about what is known and what is not, with the agent-readable payload one tap away.

The one thing a first-time visitor should remember: *this is the place I can route a real-world need through — and trust what comes back.*

## 2. Present-Tense Promise

Separate aspiration from what exists today.

Say:

- "Find real local providers you can trust."
- "See what they do, where they work, and how fast they reply."
- "Assistants can read the same published details and route to the next step."

Do not imply:

- Instant booking. Payment. Dispatch. Autonomous fulfillment.
- Reviews or ratings unless real. Verification unless a defined standard was met.

The ambition is agentic commerce. The present product is a trust and discovery loop that can become commerce.

## 3. First Market And Wedge

Start with Australian local and urgent services. The job is concrete, the wedge is broader: business-supplied commerce details that assistants can safely read, compare, and route.

Keep the first market narrow enough to make ranking, trust, and conversion measurable: one buyer job, one tight provider cluster, one geography, one safe conversion action, one trust standard per claim.

## 4. The Marketplace Loop

The product compounds through freshness and correction, not vibes.

1. A customer or assistant sends a query (natural language or structured intent).
2. Agentic Economy returns a generated answer: comparable providers that fit.
3. Each provider makes services, area, response time, availability, and next action clear.
4. The customer sends a qualified inquiry, or sees that inquiry is not live yet.
5. The business accepts, rejects, corrects, or claims the page.
6. The page gains clearer evidence and fresher constraints.
7. Better-supported listings rank higher and are safer for assistants to use.

The first owned conversion event is `qualified_inquiry_request`. If it is not implemented yet, the UI must not fake it. Use `View details`, `Show contact instructions`, or `Contact the business directly`.

## 5. Reference Translation

References inform the journey, not the skin.

- **Google Maps business pages:** map-led, glanceable, status pill, services, hours, one primary action, directions. Translation: provider pages are clean info surfaces, not audit logs. The map is a first-class element.
- **agentic.market:** a clean registry of services — `Service | Description | Price | Networks` — plain columns, agent-readable, `llms.txt`. Translation: the `/registry` surface and the agent-readable payload are plain and structured. No epistemic-state jargon on the human page.
- **Agentic Resource Discovery (ARD) spec / APIX:** machine-readable catalogs at well-known URIs, structured search by capability + trust + liveness, domain-anchored identity. Translation: agent-first is a posture, not a decoration. The agent contract is real.
- **Shopify Polaris:** predictable admin patterns, resource indexes, clear error recovery. Translation: owner and staff surfaces need predictable correction, status, and resource-management flows.
- **Stripe Checkout:** trust at the action moment — policies, validation, descriptive errors, proof. Translation: reduce risk at the inquiry moment with exact boundaries and recovery language.
- **Uber Base:** one foundation across many products. Translation: a shared language that stretches across customer, owner, assistant, and internal surfaces.

Airbnb is deliberately demoted. Its warm-coral marketplace skin is what we are rebuilding away from.

Primary references:

- https://agentic.market
- https://agenticresourcediscovery.org/spec/
- https://www.google.com/maps
- https://polaris.shopify.com/foundations
- https://stripe.com/payments/checkout
- https://base.uber.com/6d2425e9f/p/75f226-base-design-system

## 6. Core Object

The core object is a provider listing.

A strong listing answers:

- Who is behind this offer?
- What service or offer is published?
- Where does it apply (service area)?
- What is the safest next step?
- Where did the details come from?
- When were the details last checked?
- What needs human confirmation?
- What should an assistant refuse to assume?

A listing is not a database row. It is a public, structured promise with boundaries.

## 7. Trust-State Contract

Trust names source, freshness, and boundary. Internal state can be precise. **Public copy must be plain.**

| State | Public label | Meaning |
| --- | --- | --- |
| `listed` | Listed business | A public page exists. |
| `business_supplied` | Details supplied by the business | The business supplied or confirmed details. |
| `publicly_observed` | Based on public business information | Details came from public sources. |
| `checked` | Checked against supporting evidence | A defined check passed. |
| `contradicted` | Details need review | Sources disagree. |
| `stale` | Last checked date is old | Details need a refresh. |
| `disputed` | Correction requested | Someone challenged the details. |
| `unsupported` | Not enough evidence | The claim should not be presented strongly. |

Use "verified" only when the product has a named standard and the listing meets it. Otherwise use "checked," "supplied," "published," "last checked," or "needs confirmation."

**The agent-layer epistemic vocabulary — `KNOWN`, `UNKNOWN`, `UNAVAILABLE`, `NEXT_STEP` — never appears as labels on public human surfaces.** It lives in the JSON API, `llms.txt`, the "Get as agent JSON" payload, and owner/admin surfaces where operators fill in facts. On the human page, honesty is expressed through *what we choose to show truthfully*: the services they do, a plain "Not offered" line, real service areas, real response times, real availability. Never a labeled ledger of epistemic states.

## 8. Agent Contract

The agent layer is real but quiet. Public UI does not say protocol, manifest, gateway, MCP, OpenAPI, callable, DTO, capability, KNOWN, UNKNOWN, or UNAVAILABLE. Behind the scenes, every listing exposes an assistant-safe contract:

- `can_read`, `can_compare`, `can_summarize`, `can_route_to_next_step`
- `can_send_inquiry` (true only when qualified inquiry is live)
- `cannot_book`, `cannot_pay`, `cannot_dispatch` (true until those exist)
- `requires_human_confirmation` (fields a person must confirm)
- `provenance` (source, date, trust state per claim)
- `known` / `unknown` / `unavailable` / `next_step` (structured fields in the payload, not UI labels)

Customer-facing copy:

- "Assistants can read these published details."
- "Assistants may compare this business with others."
- "A person still confirms timing, quote, and availability."
- "This page does not book, charge, or dispatch work."

The signature public affordance for the agent layer is a quiet **"Get as agent JSON"** link on each provider card and listing. It copies or fetches the deterministic structured payload — the exact bytes an agent would read. The page is the API; the affordance proves it without parading protocol words.

## 9. Journey

### 9.1 Discovery — Query → Generative UI

The home page opens into a query box, not a browse wall. This is the core interaction.

A human types a natural-language need ("no hot water in Preston 3072, need someone today"). An assistant sends the same intent to the API. The surface returns a **generated answer panel** tailored to the query:

- A one-line answer ("3 verified hot-water plumbers near Preston, available today").
- Provider mini-cards that fit the query (name, status pill, response time, service chips, mini CTA).
- A slim inline map when location is relevant.
- A short "What to do now" next step.
- A quiet "Get as agent JSON" link.

Different query, different shaped answer. This is routable queries made into the hero. Search-as-browse (service + location fields, category entry points) remains available as a secondary path for people who prefer to browse.

### 9.2 Provider Card

The card is the marketplace handshake — Google-Maps-clean, not a table.

Each card answers in five seconds: Who is this? What do they do? Where do they operate? What can happen next? Why inspect further?

Card anatomy:

- Provider name (Fraunces).
- Category or offer.
- Service area (suburb/radius).
- Status pill ("Available today" / "Closed" / "By appointment").
- Response time and one trust cue ("Responds ~22m · Licensed · Insured").
- Service chips (the things they do).
- Primary next action (amber).
- One optional real photo or the hand-drawn category mark.

Do not put internal statuses on cards. No "business proof," "manifest," "source status," "assistant-ready," and no `KNOWN`/`UNKNOWN`/`UNAVAILABLE` labels.

### 9.3 Listing Detail — Google-Maps-clean

The detail page is where browsing becomes a safe decision. It is a clean info surface with a sticky service-area map, not an audit log.

Above the fold:

- Provider identity (Fraunces).
- Category and service area.
- A single row of plain trust signals.
- Status pill.
- Primary next action (amber), sticky on scroll.

Core sections, in plain marketplace language:

- `Services` — what they do (chips/list).
- `Service area` — map + covered suburbs.
- `Photos` — real work/vehicle/team imagery.
- `About` — short description, ABN, location.
- `Not offered` — a small, plain, muted one-line list of things they do not do. Not a strikethrough ledger. Not labeled "unavailable."
- `Where these details came from` — plain provenance.
- `Correct or remove this page`.

Decision copy:

- "Published plumbing details you can check before contacting the business."
- "Your message goes to the business. This does not book, charge, or dispatch work."
- "Availability, quote, and job acceptance still need a reply."

A sticky "Protected by AE" module sits beside the primary CTA — compressed into one signal, not a badge cemetery.

### 9.4 Qualified Inquiry

The first owned conversion is a qualified inquiry. Collect only what improves handoff quality: service needed, location, timing, contact method, short description, consent to send.

After submission: the customer sees what was sent and what happens next; the business can accept, reject, ask for more, or correct; the listing gains outcome data without pretending a booking happened.

If inquiry is not live: say "This business has not published a contact option yet." Show `View details` or external contact instructions. Never show disabled fake booking buttons.

### 9.5 Provider Claim

The provider path feels like creating a trusted storefront, not filling out a schema. Flow: find/create business → confirm ownership → review generated draft → correct services, areas, hours, exclusions, contact posture → choose next step → add evidence → preview exactly as customers and assistants see it → publish with a consequence summary.

This is where the `known`/`unknown`/`unavailable`/`next_step` vocabulary lives, because this is where an operator states facts. Even here, label them plainly: "What we do," "What we don't do," "What needs confirmation," "Next step for customers."

### 9.6 Return Loops

Marketplace value compounds only if listings get fresher. Customer loops: saved searches, recently viewed, compare again, notify me. Provider loops: listing status, refresh stale details, add evidence, correct disputes, share URL. Assistant loops: fetch fresh data, avoid stale/disputed, prefer clear boundaries, return users to AE when action exceeds the safe contract. Internal loops: stale queue, contradiction queue, dispute queue, suppression review.

## 10. Visual World — Daylight Register

The public product feels local, daylight, human-crafted, and commercially credible. Not dark. Not moody. Not institutional. Not Airbnb-coral.

Use:

- Sunlit drafting paper as the field (`#ECEAE1`) — cool enough to never read as cream/linen, warm enough to feel daylight.
- Ink near-black for primary text.
- A single warm accent — **signage amber** `#E89B3C` — for primary actions, the "next step," and active map pins. Amber is civic, sunlit, Australian (road signage). It is the only hot color on the page and earns warmth by being rare.
- **Eucalyptus** `#3F5947` for available/verified/success (local flora, calm confidence).
- **Oxide brick** `#A8322A` for errors/unavailable/danger — earthy, not coral, not cozy.
- **Slate** `#345A7A` for neutral info and "routable" tags.
- Hairline rules (`#C9C8BE`) for structure instead of shadows.
- 4px radius on panels and cards. 6px on buttons. 999px on status pills only.

Avoid:

- Coral, pink, and any Airbnb-derivative accent.
- Cream, linen, sand, beige body backgrounds (the AI-default tell).
- Dark command-center pages in public flows.
- Purple-blue AI gradients. Glassmorphism. Floating blobs. Decorative orbs.
- Drop shadows as a primary hierarchy tool.
- 3-column icon feature grids. Centered-everything. Bubble radius on everything.
- Mono typography for customer trust copy.
- Table-like provider cards. Status walls. Decorative proof badges.
- The words `KNOWN`/`UNKNOWN`/`UNAVAILABLE` as visible labels on human surfaces.

## 11. Imagery — Real local + hand-drawn craft

Two imagery modes, deliberately contrasted:

**Real local photography.** The inventory is the hero. Real or realistic images of Australian local businesses: work vehicles, teams, service tools in context, service areas, storefronts, provider portraits. No generic office stock, no robot imagery, no abstract gradients, no fake dashboards.

**Hand-drawn line illustration — the signature brand asset.** Pen-and-ink line drawings of local Australian architecture (Victorian/Edwardian suburban houses, civic buildings, faint city skylines). Used on the landing hero and as section accents. This is the human-craft counterpoint to the machine-readable underside. It is the visual form of "drawn by hand, read by agents." It must look hand-drawn (ink line, paper), never vector-flat-illustration, never corporate-cartoon.

The hand-drawn mark is what makes AE not-a-generic-marketplace. Protect it.

## 12. Components

### Query Box + Generated Answer Panel (signature)

The signature component. A query input ("What do you need done?") that produces a tailored answer panel: one-line answer, fitting provider mini-cards, optional inline map, a "What to do now" next step, and "Get as agent JSON." The panel is generated per query — different query, different shape. This is the core interaction, not a feature.

### Provider Card

Stable dimensions, real photo or hand-drawn category mark, plain practical copy, one amber CTA, status pill, service chips. Hairline border, 4px radius, no drop shadow. Badges/chips never resize the card.

### Status Pill

One pill, one meaning. `Available today` (eucalyptus), `Closed` (muted), `By appointment` (slate). 999px radius, soft tinted background, never a medal.

### Service Chips

Plain outlined chips listing what the provider does. A separate, quiet, muted "Not offered: …" line where relevant — plain language, not a strikethrough ledger.

### Service-Area Map

A first-class element on listing and answer panels. Clean, daylight-styled, amber pins, eucalyptus service-area polygon, suburb labels in mono. Not a decorative map screenshot.

### Protected-by-AE Module

One platform-backed protection signal beside every high-intent CTA. Compressed, not a badge cemetery. Names what is covered in one line.

### Get-as-Agent-JSON Affordance

A quiet mono link on each card and listing. Copies or fetches the structured payload. The public proof that agents and people read the same facts — without parading protocol words.

### Claim Wizard

Guided, preview-driven, correction-first. Start from a generated draft. Operators state facts in plain language ("What we do," "What we don't do," "What needs confirmation," "Next step"). Preview exactly as customers and assistants see it. Publish with a consequence summary.

## 13. Copy Voice

Plain, warm, exact, consequence-aware.

Use: "Details supplied by the business," "Last checked June 2026," "Needs owner confirmation," "Service area may vary," "No booking or payment on this page," "Accepts quote requests," "Send a human inquiry," "Correct or remove this page," "What do you need done?", "Get as agent JSON."

Avoid in public copy: "source-owned," "source-verified," "readback," "manifest," "protocol," "capability endpoint," "MCP," "UCP," "OpenAPI," "DTO," "fixture," "artifact," "gateway," "proof gap," "operator," "agent-ready," "agent-native," "callable," "autonomous fulfillment," "verified" without a defined standard — and **never** `KNOWN`/`UNKNOWN`/`UNAVAILABLE`/`NEXT_STEP` as labels.

Internal language may exist in developer and owner/admin surfaces. It must not leak into customer surfaces.

## 14. Route Implications

- `/` — the query → generative UI front door. Query box, generated answer, hand-drawn hero, "Agents: read the registry" as the quiet agent door.
- `/registry` — a clean, agentic.market-style browse list (`Provider | Services | Service area | Status | Response`) with filters. Plain, agent-readable, no epistemic labels.
- `/[slug]` — the canonical Google-Maps-clean provider page: identity, services, service-area map, photos, "Not offered," provenance, sticky amber next action, Protected-by-AE, Get-as-agent-JSON.
- `/claim` — provider onboarding: create, improve, correct.
- `/owner/*` — status, checks, freshness, correction workflows in plain consequence language.
- Internal audit, schema, and provenance tools stay behind staff/developer surfaces.

## 15. Design Rules

Do:

- Lead with the query box and real generated answers.
- Make provider cards Google-Maps-clean and comparable.
- Make trust visible at decision points in plain language.
- Pair every positive claim with its boundary.
- Use the hand-drawn line illustration as the signature brand asset.
- Give assistants a real, quiet contract and a "Get as agent JSON" affordance.
- Make correction and claim part of the main loop.
- Keep warmth in one disciplined amber, not a wash.

Do not:

- Use coral, pink, cream, linen, or any Airbnb-derivative palette.
- Show `KNOWN`/`UNKNOWN`/`UNAVAILABLE` as labels on human surfaces.
- Lead with internal architecture or protocol vocabulary.
- Turn proof into decorative badges or a badge cemetery.
- Use public "verified" language without a defined standard.
- Show fake booking, payment, dispatch, review, or rating UI.
- Make the product feel like a dashboard for insiders or a dark command terminal.
- Replace the hand-drawn craft with flat vector illustration.

## 16. The Bar

When someone lands on Agentic Economy, they should understand the product before they understand the system. They should think: *"I can route a real need through this and trust what comes back."*

When an assistant reads Agentic Economy, it should know: *"I can read, compare, and route — but I cannot book, pay, dispatch, or assume unsupported facts."*

That is the bar. Everything else is implementation.

## 17. Design Tokens (source of truth for implementation)

### Color

| Token | Hex | Role |
| --- | --- | --- |
| `--ae-paper` | `#ECEAE1` | Page field — sunlit drafting paper, cool (not cream) |
| `--ae-surface-sunken` | `#E2E1D8` | Panels engraved below the paper |
| `--ae-surface-raised` | `#F4F3EC` | Cards, inputs, hover lift |
| `--ae-ink` | `#14161A` | Primary text, near-black cool |
| `--ae-muted` | `#6B6E63` | Secondary copy, metadata |
| `--ae-hairline` | `#C9C8BE` | Borders, rules, structure |
| `--ae-amber` | `#E89B3C` | Primary action, next-step, active pins |
| `--ae-amber-deep` | `#C9822A` | Pressed/hover amber |
| `--ae-eucalyptus` | `#3F5947` | Available / verified / success |
| `--ae-oxide` | `#A8322A` | Error / unavailable / danger |
| `--ae-slate` | `#345A7A` | Info / routable |

Semantic mapping: `success = eucalyptus`, `warning = amber`, `danger = oxide`, `info = slate`. No `coral` token remains; legacy `--ae-*-coral` aliases are repointed to amber and marked deprecated.

### Typography

- **Display / hero — Fraunces** (Google Fonts, variable, optical sizing). Wordmark, headlines, business names. Authority a grotesk cannot give.
- **Body / UI — Hanken Grotesk** (Google Fonts). All body, UI, chips, sentences. Civic-signage readability.
- **Mono / data — IBM Plex Mono** (Google Fonts, tabular-nums). Status bar, slugs, IDs, response-time figures, breadcrumbs, "Get as agent JSON" link. Never for customer trust copy, never for epistemic-state labels.
- **Loading:** Google Fonts via `<link>` (or self-hosted). One display, one body, one mono.
- **Scale:** display `clamp(3rem, 7vw, 5.8rem)` / section `2.5rem` / lede `1.45rem` / body `1rem` / sm `0.875rem` / xs `0.78rem` / mono `0.8125rem`.
- **Letter-spacing:** display `-0.01em`, headlines `-0.005em`, body `0`, mono small-caps labels `0.06em`.

### Spacing

8px base. Comfortable on public surfaces (density 3), compact on owner/admin (density 5). Scale: 2xs(2) xs(4) sm(8) md(16) lg(24) xl(32) 2xl(48) 3xl(64). Content max `80rem`; measure `36rem`.

### Layout

- **Approach:** hybrid — grid-disciplined for owner/admin, creative-editorial for the public hero.
- **Grid:** 12-col desktop, 4-col mobile.
- **Radius:** panel/card `4px`, button `6px`, status pill `999px`. No bubble radius on everything.
- **Hierarchy:** hairline rules + type scale + the single amber carry hierarchy. Drop shadows are rare and soft, never the primary tool.

### Motion

- **Approach:** minimal-functional, leaning intentional.
- **Easing:** enter `cubic-bezier(0.16, 1, 0.3, 1)`, exit `cubic-bezier(0.4, 0, 1, 1)`, move `cubic-bezier(0.22, 1, 0.36, 1)`.
- **Duration:** micro `80-120ms`, short `150-220ms`, medium `250-400ms`. No scroll-jacking. GPU-only (opacity, transform). Honor `prefers-reduced-motion`.
- **Signature motion:** the generated answer panel assembles in short staggered steps (answer line → cards → map → next step) so the query → answer feels generative, not static. Reduced-motion: render instantly.

## 18. Decisions Log

| Date | Decision | Rationale |
| --- | --- | --- |
| 2026-06-30 | Rebuilt design system from coral/linen/Geist ("Airbnb of agentic commerce") to Daylight Register | Coral rated 3/10: wrong hue family + too Airbnb-derivative. North star reframed to "home of agentic commerce, routable queries, agent-first." |
| 2026-06-30 | Coral retired; signage amber `#E89B3C` is the single warm accent | Amber is civic/sunlit/Australian, not hospitable-coral. Warmth by rarity, not wash. |
| 2026-06-30 | Cream/linen body bg retired; sunlit drafting paper `#ECEAE1` | Avoids the 2026 AI-default cream-bg tell; cool enough to read as daylight field, not rental-app warmth. |
| 2026-06-30 | KNOWN/UNKNOWN/UNAVAILABLE labels banned from human surfaces | Internal epistemic vocabulary does not serve the user journey. It lives in the JSON API, llms.txt, Get-as-agent-JSON payload, and owner/admin surfaces only. Honesty on the human page is shown through truthful content, not labeled ledger rows. |
| 2026-06-30 | Core interaction is query box → dynamic generative UI | Agentic commerce breaks browse-a-list. Human and agent send the same intent; the surface returns a tailored answer. This is the north star made into the hero. |
| 2026-06-30 | Hand-drawn line illustration promoted to signature brand asset | "Drawn by hand. Read by agents." — human craft as the counterpoint to the machine-readable underside. Makes AE not-a-generic-marketplace. |
| 2026-06-30 | Typography: Fraunces (display) + Hanken Grotesk (body) + IBM Plex Mono (data) | Trusted-record authority + civic-signage readability + instrument. Free/CDN stack; licensed upgrades (Söhne, Berkeley Mono) noted as future. |
| 2026-06-30 | Google Maps + agentic.market as primary references; Airbnb demoted | Provider pages are clean info surfaces; registry is a plain structured list; agent-first is a posture. Airbnb's warm-coral skin is what we rebuilt away from. |
