# /for-agents: For agents

## Register & scene

**Register:** product.

**Physical scene:** A builder is integrating an assistant on a laptop in a bright shared office, moving between documentation and a terminal, and needs a quiet, high-contrast reference that can be scanned without losing the exact access and authority boundaries.

Use the restrained product color strategy from `DESIGN.md`: warm canvas around a white surface, ink for primary text, slate for secondary text, and eucalyptus only for the current navigation state, focus, and the primary quick-start action. No decorative status color.

## Job & IA position

**One job:** Give an agent builder one public, truthful starting point for discovering AE's current machine-readable artifacts and submitting a Customer Request through the documented API.

**Route class:** public discovery (`PRINCIPLES.md` IA-1). Canonical, loadable, indexable, and eligible for the sitemap (IA-5). This is the public face of the machine-discovery sibling IA required by IA-4.

**Entry points:**

- Public footer label **For agents**, linking to `/for-agents` rather than `/developers/discovery`, `/admin/*`, or a raw artifact. <!-- stupid-shit: S3 -->
- Human-facing links adjacent to `/SKILL.md` or `/llms.txt` may point back here as the readable orientation layer.
- Direct canonical URL and search engines.

**Exits:**

- `GET /SKILL.md` for assistant setup.
- `GET /llms.txt` for the generated public surface index.
- Public business list, search, detail, and per-business UCP fallback endpoints.
- `POST /api/v1/requests` quick-start path after obtaining an AE API key with `customer_requests:create`.
- Authenticated `/developers/discovery` for source-owned schema, freshness, route-health, examples, fixture labels, support matrix, unsupported-capability readback, and gated exclusions.
- Privacy and listing correction at `/privacy/remove-business`.

**Relationship to `/developers/discovery`:** `/for-agents` is the public onboarding and contract map. `/developers/discovery` remains an authenticated operator route, is `noindex`, and provides deeper readback and diagnostics rather than a second onboarding page. The public page links to it with the access label **Sign in for discovery readbacks** and never previews protected evidence. Public navigation never links directly into `/developers/discovery` or `/admin/*`.

**Blueprint:** editorial or trust skeleton, `AePublicShell` + `AePageHeader` + `max-w-5xl` section rail (IA-6). Two deliberate disclosure levels (LAW-7): the primary layer is “what works now + quick start”; the deeper layer is artifact details, envelope semantics, access expectations, and the authenticated readback handoff. The route owns loader/SEO only; composition belongs in a reusable page component (IA-8).

## Layout

**Skeleton:** `AePublicShell`; `AePageHeader`; one `max-w-5xl` editorial rail. Width is `5xl`; gutters are `px-4 md:px-6`; section rhythm is 12, page-block rhythm 6, and within-record rhythm 4 (IA-7). Body prose is capped at 70ch. The quick start is a two-column main-and-reference arrangement only at `lg`; it is not a sticky action rail because this page is reference material, not a single decision.

### Desktop wireframe (approximately 1200px viewport)

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ AE            Ask      Businesses      Claim your business page             │ <!-- stupid-shit: S3 -->
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  max-w-5xl, px-6                                                             │
│  FOR AGENTS                                                                  │
│  Connect an agent to real business information                              │
│  Read the public catalog, inspect published listings, and submit a          │
│  Customer Request through AE's documented API.                              │
│  [Read the assistant setup]   [Browse catalog JSON]                         │
│                                                                              │
│  ───────────────────────── WHAT WORKS TODAY ───────────────────────────────  │
│  1 Read the public catalog                                                   │
│  2 Inspect a listing and its non-callable UCP fallback                       │
│  3 Submit and resume one Customer Request with an authorized API key         │
│  Boundary: listings are facts, not routing or execution authority.           │
│                                                                              │
│  ───────────────────────────── QUICK START ────────────────────────────────  │
│  ┌──────────────────────────────────────┬─────────────────────────────────┐  │
│  │ 1 GET /llms.txt                     │ Access expectations             │  │
│  │ 2 GET /SKILL.md                     │ Public reads: no sign-in        │  │
│  │ 3 Obtain scoped AE API key          │ Request writes: Bearer key      │  │
│  │ 4 POST /api/v1/requests             │ 401/403 meanings                │  │
│  │ 5 Follow clarification.answerKind   │ Use one requestRef + idempotency│  │
│  │ 6 GET requestRef to resume          │ No inferred selection/consent   │  │
│  └──────────────────────────────────────┴─────────────────────────────────┘  │
│                                                                              │
│  ─────────────────────── CANONICAL ARTIFACTS ─────────────────────────────  │
│  Artifact | Method + path | Access | What it proves | What it does not prove │
│  [full-width semantic table, horizontal scroll only below 640px]             │
│                                                                              │
│  ───────────────────── CONVERSATION ENVELOPE ─────────────────────────────  │
│  Versioning · provenance · authorityScope · doesNotProve · exact readback    │
│  [View schema semantics]                                                     │
│                                                                              │
│  These interfaces support catalog discovery and request preparation only.   │
│                                                                              │
│  ───────────────────── DEEPER DISCOVERY READBACK ─────────────────────────  │
│  Signed-in builders can inspect source-owned schemas, freshness, health,     │
│  examples, support status, and gated exclusions.                             │
│  [Sign in for discovery readbacks]                                           │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Mobile wireframe (375px viewport)

```text
┌───────────────────────────────┐
│ AE                  [Menu]    │
├───────────────────────────────┤
│ px-4                         │
│ FOR AGENTS                   │
│ Connect an agent to real     │
│ business information         │
│ Read catalog facts and       │
│ submit a Customer Request.   │
│ [Read assistant setup      ] │
│ [Browse catalog JSON       ] │
│                              │
│ WHAT WORKS TODAY             │
│ 1  Read catalog              │
│ 2  Inspect listing + UCP     │
│ 3  Submit scoped request     │
│                              │
│ QUICK START                  │
│ 1  GET /llms.txt             │
│ 2  GET /SKILL.md             │
│ 3  Obtain scoped API key     │
│ 4  POST /api/v1/requests     │
│ 5  Follow answerKind         │
│ 6  Resume the same request   │
│ [Copy quick start          ] │
│                              │
│ ACCESS EXPECTATIONS          │
│ Public reads: no sign-in     │
│ Request writes: Bearer key   │
│                              │
│ CANONICAL ARTIFACTS          │
│ [Artifact disclosure 1     ] │
│ [Artifact disclosure 2     ] │
│ [Artifact disclosure 3     ] │
│ ...                          │
│                              │
│ ENVELOPE                     │
│ Version + claim boundaries   │
│ [View schema semantics     ] │
│                              │
│ CURRENT SCOPE                │
│ These interfaces support     │
│ catalog discovery and request│
│ preparation only.            │
│                              │
│ DEEPER READBACK              │
│ Sign-in required.            │
│ [Sign in for readbacks     ] │
└───────────────────────────────┘
```

## Section anatomy

### 1. Page header

- **Content:** eyebrow `For agents`; headline `Connect an agent to real business information`; description `Read the public catalog, inspect published listings, and submit a Customer Request through AE's documented API.` Primary link `Read the assistant setup`; secondary link `Browse catalog JSON`.
- **Data source:** static page copy plus canonical-origin route helper. Do not derive capability claims from marketing configuration.
- **Astryx:** `AePageHeader`, `Button`, `Text`; links use the AE router-link composition. Tailwind controls width, gap, and wrapping.

### 2. What works today

- **Content:** a numbered, non-card sequence:
  1. **Read catalog facts.** List or search published business records.
  2. **Inspect a business.** Read its public page, detail JSON, and AE-hosted UCP fallback. State that every UCP capability currently has `callable: false` and `paymentRequired: false`.
  3. **Submit a Customer Request.** Use a scoped Bearer API key, one opaque `requestRef`, and an idempotency key; follow `clarification.answerKind` and `nextAction`; resume the same request rather than creating a replacement.
- **Data source:** route loader reads a small, source-owned discovery summary built from the same module that builds `llms.txt`, `SKILL.md`, and UCP output. If implementation cannot share that summary without duplicating behavior, keep the content static and protect it with executable source-contract tests. Never infer availability from the presence of a route file alone.
- **Astryx:** `List`, `Item`, `Heading`, `Text`, `Badge` only for access/status words such as `Public` or `API key required`. Use semantic sections rather than three equal cards.

### 3. Quick start and access expectations

- **Content:** ordered sequence copied from the shipped assistant setup contract:
  1. `GET /llms.txt`.
  2. `GET /SKILL.md`.
  3. Obtain an AE API key carrying `customer_requests:create`; send it as a Bearer token.
  4. `POST /api/v1/requests` with an idempotency key, opaque `requestRef`, and natural-language request.
  5. For `natural_language`, post to `/:requestRef/messages`; for `typed_value`, post only the requested fact to `/:requestRef/facts`.
  6. Prepare options only when `nextAction` permits it, and resume with `GET /api/v1/requests/:requestRef`.
  7. Treat `recommended` as objective-bound reasoning and `unranked` as no defensible ordering. Neither means selection or commitment.
<!-- journey-system: §8 -->
**API family contract:** `/api/v1/requests` and its `/api/v1/requests/:requestRef/*` descendants are the canonical Customer Request family. Agents MUST integrate against the v1 family only; every quick start, artifact, generated setup document, example, and discovery pointer MUST publish v1 URLs. The unversioned `/api/requests` family is legacy migration inventory, MUST NOT be advertised for new integrations, and MUST have a documented compatibility window, migration path to the corresponding v1 operation, announced sunset date, and terminal refusal after sunset. Compatibility MUST NOT create a second protocol contract or allow unversioned and v1 semantics to drift.
- **Access side note:** public discovery reads require no sign-in. Customer Request writes require the scoped API key. `401` means missing, invalid, expired, or revoked key. `403` means the key lacks `customer_requests:create`. Web Bot Auth is a signed-caller identity mechanism for the advanced routing surface, not an alternative source of customer authority.
- **Boundary immediately after recipe:** `Identity never grants authority. A signed caller identifies the agent; it does not approve a request, data disclosure, business selection, or consequential action.`
- **Data source:** `buildPublicAgentSkillMarkdown` and `buildLlmsTxt` source contracts; canonical origin from route loader.
- **Astryx:** `List`, `Item`, `Code`, `Button` (`Copy quick start`), `Banner` with neutral informational tone for access expectations. Copy success may use a brief toast but is not lifecycle evidence.

### 4. Canonical artifact inventory

The inventory is source-grounded in `src/modules/discovery/internal/discovery-files.ts`, `agent-skill.ts`, `ucp-manifest.ts`, the public route handlers, and the authenticated developer discovery route. Paths render against the current canonical origin, never `ae.example` in production.

| Artifact | Method and canonical path | Access | Current contract | Explicit boundary |
|---|---|---|---|---|
| Human onboarding | `GET /for-agents` | Public | The single readable entry point for all machine artifacts and current access expectations. | Documentation only; it grants no API scope or action authority. |
| Assistant setup | `GET /SKILL.md` | Public | Cold-path setup, Customer Request sequence, refusal recovery, advanced-routing pointer, and privacy path. | Selection, purchase, and booking remain with the principal in this workflow. | <!-- de-hedge -->
| Public surface index | `GET /llms.txt` | Public | Generated list of public surfaces, request endpoints/lifecycle, advanced-routing endpoints, eligible catalog entries, and listing boundary. | Presence in the index does not make an endpoint callable or authorized. |
| Business catalog list | `GET /api/businesses` | Public | Published public business catalog DTO page, schema `public-business-catalog-api:v1`. | Catalog facts do not select a business or execute a route. |
| Business catalog search | `GET /api/businesses/search?q={query}` | Public | Searches the published catalog window and returns the same public DTO page shape. | Results are not proof of exhaustive coverage, live availability, or a universal ranking. |
| Business detail | `GET /api/businesses/{slug}` | Public | One public catalog detail readback when the slug is published. | A listing is discoverable inventory; routability requires separate admitted capability evidence. |
| Business page | `GET /{slug}` | Public | Human-readable projection of the published catalog. | Published facts are not booking, ordering, payment, acceptance, or confirmation. |
| AE-hosted UCP fallback | `GET /{slug}/ucp` | Public | `ae-ucp-fallback:v1`; business, location, source version/freshness, tested routes, services, first-request disclosure, and capability status. | It explicitly emits `callable: false`, `paymentRequired: false`, and `unsupportedCapabilities` with both false. It is discovery metadata, not a callable operation surface. |
| Customer Request create | `POST /api/v1/requests` | Bearer AE API key with `customer_requests:create`; idempotency required | Starts or replays the documented request lifecycle from an opaque `requestRef` and natural-language request. | Starts decision support only. It does not select, contact, order, pay, book, or confirm. |
| Customer Request readback | `GET /api/v1/requests/{requestRef}` | Same authorized API context | Resumes the same request and returns its current lifecycle and `nextAction`. | Readback state must not be promoted into business acceptance or customer authority. |
| Natural-language clarification | `POST /api/v1/requests/{requestRef}/messages` | Same scoped API key | Accepts an answer only when `clarification.answerKind` is `natural_language`. | A message is information, not approval for a consequential action. |
| Typed clarification | `POST /api/v1/requests/{requestRef}/facts` | Same scoped API key | Accepts only the requested typed value when `answerKind` is `typed_value`. | Supplied facts do not widen data-sharing or action authority. |
| Options preparation | `POST /api/v1/requests/{requestRef}/options` | Same scoped API key; follow returned `nextAction` | Prepares registered business options for the same request. | Every option is a proposal. `recommended` does not mean selected, purchased, booked, or authorized. |
| Advanced routing descriptor | `GET {routingBase}/.well-known/ae-routing.json` | Public descriptor; operations have their own signed access contract | Describes low-level signed routing, including HTTP and MCP endpoint locations. | The page labels this advanced and separate from the public Customer Request quick start; no operation is advertised beyond descriptor readback. |
| Advanced routing HTTP | `{routingBase}/v1/route` | Signed access per descriptor | Canonical HTTP location advertised by `llms.txt`. | A route response is not approval or execution authority. |
| Advanced routing MCP | `{routingBase}/mcp` | Signed access per descriptor | Canonical MCP location advertised by `llms.txt`. | Do not describe it as generally callable without satisfying its signed admission contract. |
| Web Bot Auth key directory | `GET /.well-known/http-message-signatures-directory` | Public read | AE-owned signature-agent public keys; media type `application/http-message-signatures-directory+json`. | Verifies caller attribution only. Identity never grants principal authority. |
| Versioned conversation projection | `ConversationEnvelope` contract, linked as schema semantics rather than a fabricated fetch endpoint | No public endpoint claimed by this page unless one exists and passes a route readback | `protocolVersion`, `schemaVersion`, capabilities, and public items with claim provenance and boundaries. | Raw `ConversationItem` is internal. Envelope possession never authorizes action. |
| Discovery readbacks | `GET /developers/discovery` | Authenticated operator, role `developer`; `noindex` | Source-owned public facts, schema shape, examples, fixture labels, freshness, route health, support matrix, unsupported capabilities, and gated exclusions. | Diagnostic depth, not the public onboarding route and not private owner evidence. |

The implementation may add a compact `Copy path` action to each public endpoint. On mobile the table becomes one Astryx `Collapsible` per artifact, preserving the same field order and all boundary text. It must not become an identical promotional card grid.

### 5. ConversationEnvelope semantics

- **Content:** Label this section `Versioned conversation records`, not “raw events” or “internal items.” Explain that raw `ConversationItem` is internal and must never be advertised as the machine interface.
- **Contract pointer:** show the exact public envelope field groups from `CONVERSATION-ITEM-SPEC.md`: `protocolVersion`, `schemaVersion`, `capabilities`, and `items`. Each public item carries `claimType`, `assertedBy`, `sourceRef`, `observedAt`, `authorityScope`, `doesNotProve`, `boundaryText`, and `payload`.
- **Version behavior:** consumers ignore unknown item types without reinterpreting them; additive optional fields may appear within a protocol version; breaking meaning changes require a new protocol version and migration window.
- **Exact authority statement:** `Identity never grants authority. Third-party surfaces offering a consequential action must render AE's exact, current consequence readback without paraphrase or hand the person off to AE for review and authorization.`
- **Exact envelope boundary:** `Sent never means confirmed. AE never books, charges, or confirms. The business confirms.`
- **`doesNotProve` example:** a receipt may list `business acceptance`, `booking`, `payment`, and `confirmed availability`; it proves only AE's recorded handoff. A business response supplies information only inside the business's asserted scope.
- **Current-availability caveat:** this page documents the versioned projection semantics but must not invent a public envelope URL. Add an endpoint row only after a real route, access policy, schema, and readback test exist.
- **Data source:** item projection contract/version registry when implemented; until then, static normative content verified against `CONVERSATION-ITEM-SPEC.md`.
- **Astryx:** `Heading`, `Text`, `Collapsible` for field definitions, `Code` for names, neutral `Banner` for the exact authority statement.

### 6. Current-scope boundary

- **Content:** one compact sentence: `These interfaces support catalog discovery and request preparation only.` Do not expand it into a feature-by-feature unavailable catalogue. Endpoint-level contract readback remains where source-owned: the AE-hosted UCP fallback continues to show `callable: false` and `paymentRequired: false`, and individual endpoint rows retain their actual authority boundaries.
- **Data source:** shipped public discovery/request contracts and the UCP endpoint projection; no future-capability inventory.
- **Astryx:** semantic section with `Heading` and `Text`, or a neutral `Banner` when needed for proximity. Ordinary scope is not warning-red.

### 7. Deeper authenticated discovery

- **Content:** `Need source-level readbacks?` Signed-in builders can inspect schema fields, public DTO examples, fixture labels, freshness, route HTTP/schema/cache status, support status, unsupported capabilities, and gated exclusions. CTA: `Sign in for discovery readbacks`.
- **Access copy immediately beside CTA:** `Authentication is required. This area diagnoses public read paths; it does not grant access to private owner evidence or consequential actions.`
- **Data source:** no protected loader data on the public route. Link only to `/developers/discovery`; its own operator route performs authentication and loads the readback.
- **Astryx:** `Heading`, `Text`, `Button`, neutral `Banner` only if sign-in posture needs extra prominence.

## States

### Loading

The route is predominantly static. If canonical-origin or source-owned artifact status is loaded, render a geometry-preserving skeleton with the final header height, three numbered capability rows, six quick-start rows, artifact table header plus at least six body rows, envelope block, not-available list, and final handoff. Use Astryx `Skeleton`; do not replace the entire page with a centered spinner. Endpoint text widths remain stable to avoid layout shift (DS-14).

### Empty

- **Primary meaning:** `no source data` (DS-13) only when there are no eligible published catalogs. The onboarding, request quick start, static endpoints, authority boundaries, and compact current-scope sentence still render.
- **Copy:** `No published business entries are available in the catalog right now. You can still read the integration contract and prepare your client.`
- **Action:** `Read the assistant setup`.
- Do not show `No integrations yet`, hide the catalog contract, or imply that request submission is available if its route-health source says otherwise.
- A missing authenticated session is not a public-page empty state. The link to deeper readbacks names its sign-in requirement.

### Error

Keep `AePublicShell`, page header, static quick start, artifact paths, authority boundaries, and compact current-scope sentence. Replace only the unavailable dynamic readback with an Astryx `Banner`:

`Current artifact status could not be checked. The canonical paths below remain the contract; verify the endpoint response before depending on it.`

Actions: `Try status check again` and `Read /llms.txt`. Never print raw error messages. A specific failed endpoint row receives `Temporarily unavailable` plus its status-check recovery rather than causing page-wide failure (DS-14, DS-13).

### Streaming

No streaming state. This route is a stable reference page. Request lifecycle states are described, not executed or simulated here.

### Zero-JS and SEO posture

- Server-render the complete onboarding, quick start, artifact inventory, envelope semantics, authority statements, and compact current-scope boundary.
- Every endpoint remains a normal link or selectable text without JavaScript. Copy buttons are progressive enhancement.
- Canonical URL is `/for-agents`; index and include in sitemap.
- Structured headings and descriptive metadata: `For agents | Agentic Economy`; description names catalog reads and the Customer Request API without claiming booking or execution.
- `/developers/discovery`, `/admin/*`, and private/operator URLs remain excluded and `noindex`.
- Raw machine artifacts remain directly fetchable but do not replace the human-readable canonical onboarding page.

## Interactions

### Primary action

**`Read the assistant setup`** opens `/SKILL.md` as a normal same-origin document.

State contract:

- **Default:** primary eucalyptus action with explicit destination.
- **Hover:** Astryx primary-button hover.
- **Focus:** visible Astryx focus ring; focus order follows heading, primary action, secondary action, then document sections.
- **Active:** Astryx pressed state.
- **Disabled:** not used for a static public link. If route health is known unavailable, retain the link and attach a visible status rather than disabling access speculatively.
- **Loading:** navigation uses standard route pending semantics; label remains stable and exposes `aria-busy` only if client navigation is actually pending.
- **Error:** the fetched artifact owns its HTTP response. Returning to this page preserves the last focused link.

**Confirmation depth:** link-out review, depth 1 under AX-2. No modal or confirmation is justified because reading a public artifact has no consequential effect.

### Secondary interactions

- `Browse catalog JSON`: ordinary link-out review.
- `Copy quick start` and per-path `Copy`: no confirmation; button announces `Quick start copied` or `{artifact name} path copied` once. Failure leaves selectable text and announces `Could not copy; select the text instead`.
- Artifact disclosures on mobile use Astryx `Collapsible`, keyboard-operable with `aria-expanded` and `aria-controls`.
- `Sign in for discovery readbacks`: ordinary navigation to the authenticated route. Authentication occurs there, not in a public-page modal.
- No action on this page submits a Customer Request. Code examples explain the API but do not include a live “Run request” control, which would require credentials, payload review, idempotency, error, and durable readback semantics.

### Keyboard and focus

- One `Skip to main content` target.
- Logical DOM order matches visual order.
- Tab reaches only interactive controls, not code blocks or status labels.
- Copy actions have persistent text labels; endpoint text remains selectable.
- Collapsible trigger receives focus; closing it returns focus to its trigger.
- Route navigation moves focus to the destination `h1`; returning restores focus to the originating link where supported.

## Copy voice

### Headline and key labels

- Eyebrow: `For agents`
- Headline: `Connect an agent to real business information`
- Description: `Read the public catalog, inspect published listings, and submit a Customer Request through AE's documented API.`
- Section labels: `What works today`, `Quick start`, `Access expectations`, `Canonical artifacts`, `Versioned conversation records`, `Current scope`, `Deeper discovery readbacks`.
- Actions: `Read the assistant setup`, `Browse catalog JSON`, `Copy quick start`, `View schema semantics`, `Sign in for discovery readbacks`.

Builder vocabulary is permitted here: request, route quote, provider, capability, approval, run, incident, API key, schema, route health, and protocol version. Customer-facing passages still prefer business, option, price, timing, and confirmation where those concepts appear.

### Boundary placement

- Beside the quick start: `Identity never grants authority.`
- Beside options/recommendation semantics: `Every option is a proposal. It is not a selection or commitment.`
- In the envelope section: `Sent never means confirmed. AE never books, charges, or confirms. The business confirms.`
- Beside the authenticated handoff: `Authentication permits the readback view; it does not grant consequential action authority.`
- In every UCP description: `Discovery metadata only; callable is false.`

### Banned-word and claim check

- Customer-facing copy does not use the internal inquiry object name or frame AE as a lead, posting, household, wallet, checkout, marketplace, procurement, campaign, vendor workflow, autonomous purchase, or universal best.
- `protocol` appears only in builder-facing version/access explanations, never as public brand positioning.
- The current-scope sentence is stated once; actual endpoint rows carry their own source-owned flags and boundaries rather than a promotional or speculative feature catalogue.
- Do not call a published listing routeable unless admitted, conformant capability evidence proves it.
- Do not claim the `ConversationEnvelope` has a public endpoint until a tested route exists.
- Do not say Web Bot Auth authorizes an action. It attributes the signed caller.

## Responsive

- **Below `lg`:** quick start and access expectations stack in one column. No sticky rail.
- **Below `md`:** public navigation collapses through the shared `AePublicShell`; section gutters remain `px-4`; actions become full-width only where labels would otherwise wrap awkwardly.
- **At 640px and below:** the artifact table becomes ordered `Collapsible` records. Each record preserves artifact, method/path, access, current contract, and boundary in that order. Do not remove boundary columns to make the table fit.
- **At 375px and 320px:** no horizontal page overflow; code/path text wraps at safe separators or scrolls inside its own code region; headings fit within two to three lines; endpoint copy controls remain adjacent to the endpoint they affect.
- Touch targets are at least 44px. Stacked actions keep primary first in reading context for this non-confirmation page; no sticky bottom action.
- At 200% zoom, the artifact inventory uses the mobile record projection rather than a clipped table.

## Accessibility

- Landmarks: shared `<header>` and `<nav>` from `AePublicShell`; one `<main id="main-content">`; each major section has an `h2`; artifact records use a `<table>` with caption on wide screens or an ordered list of labelled disclosures on narrow screens; final site footer remains shared.
- Page outline has one `h1`; section headings descend without skipped levels.
- Endpoint paths use visible text and accessible link names that include purpose, not only `Open`.
- Method and access status are text, never color-only. `Badge` supplements but does not replace labels.
- `aria-live` policy: no page-load announcement and no live region for static endpoint status. Copy success uses one shared polite region. Dynamic route-health refresh announces one summary such as `Artifact status updated`; individual rows remain silent unless focused. Failed refresh uses one `role="alert"` with the recovery label.
- Collapsibles expose `aria-expanded`/`aria-controls`; hidden content is not focusable. Do not auto-collapse the focused artifact.
- Reduced motion: no entrance choreography. Collapsible and status transitions use Astryx motion tiers and reach final state immediately under reduced motion.
- Code examples must be text, not images; syntax color is optional and cannot be the only carrier of meaning.
- External routing-base links state the destination if they leave the AE origin. New-tab behavior is not forced.

## Rule compliance

| Rule | How this page satisfies it |
|---|---|
| LAW-3 | Any displayed endpoint/readback status names known facts, next check, recovery, timestamp where sourced, and endpoint identity; no decorative lifecycle states. |
| LAW-4 | Separates listed, submitted, recommended, selected, authorized, sent, and confirmed claims. States exactly that sent never means confirmed. |
| LAW-5 | The page itself performs no consequential action. It teaches that exact scope and current readback must precede any consequential action. |
| LAW-7 | Uses two levels: current capability + quick start first; artifact/envelope/access detail second. No third summary. |
| LAW-8 | No-published-catalog empty state names the source gap and offers the smallest valid next step without silently broadening. |
| LAW-10 | Public nav projects `Ask`, `Businesses`, and `Claim your business page`; the public footer projects `For agents` to `/for-agents`. Authenticated builder navigation continues to project `/developers/discovery` from the operator registry. Raw artifacts are destinations, not competing nav entries. | <!-- stupid-shit: S3 -->
| IA-1 | Classifies `/for-agents` as public discovery and `/developers/discovery` as authenticated operator. |
| IA-2 | Requires top nav, footer, sitemap, and operator navigation to derive from the single route/action registry; public links never point into authenticated routes. |
| IA-4 | Provides one labelled public onboarding page with real scope, access, quick start, boundaries, and canonical SKILL, llms, UCP, Web Bot Auth, catalog, and request endpoints. |
| IA-5 | Only `/for-agents` is indexed as the human gateway; authenticated and private routes remain absent from sitemap and `noindex`. |
| IA-6 | Uses the editorial/trust `AePublicShell` + `AePageHeader` + `max-w-5xl` skeleton. |
| IA-7 | Uses named `5xl` width, `px-4 md:px-6` gutters, and 12/6/4 rhythm. |
| IA-8 | Route owns loader and SEO; reusable composition owns the document body. |
| IA-9 | No action rail; reference facts remain in the main document and actions sit with their destinations. |
| CH-2 | Public copy exposes sanitized contract facts only; raw tools, private run evidence, and owner evidence remain authenticated. |
| CH-3 | Shows no hidden reasoning or decorative execution theatre. |
| CH-9 | Each endpoint-status failure has one specific recovery; API 401 and 403 meanings remain distinct. |
| AX-2 | All page actions are link-out review or non-consequential copy. No modal-as-first-thought. |
| AX-3 | Labels name destinations and effects; no bare Continue, Submit, Confirm, Yes, or OK. |
| AX-6 | Options, approval, execution, and business confirmation remain separate. |
| AX-7 | Portable authority and confirmation boundaries sit beside quick start, envelope, UCP, and authenticated handoff claims. |
| DS-1 | Uses Astryx `Button`, `List`, `Item`, `Badge`, `Banner`, `Code`, `Collapsible`, `Skeleton`, `Heading`, and `Text`; no new behavioral primitive. |
| DS-2 | Tailwind handles grid, width, spacing, wrapping, and responsive structure; Astryx owns behavior and states. |
| DS-3 | Uses only DESIGN.md semantic tokens: ink, warm canvas, white surface, slate, and eucalyptus by role; no route-local palette. |
| DS-4 | Buttons and disclosures preserve label, focus-visible, keyboard, disabled/loading where applicable, and 44px targets. |
| DS-5 | Any transition uses Astryx motion tiers; no literal duration. |
| DS-6 | Reduced motion reaches the final disclosure/status state immediately. |
| DS-7 | Access and availability use text-first labels; any badge/color is supplementary. |
| DS-8 | Dynamic status check times, if shown, use the shared timestamp composition and `<time dateTime>`. |
| DS-10 | The route sits under the honest `aeTheme`; it does not call the effective theme neutral. |
| DS-11 | No local dark-mode claim or treatment. |
| DS-13 | Defines the `no source data` empty meaning and its next valid action; authentication is handled as access, not empty content. |
| DS-14 | Loading preserves final geometry and errors preserve shell, static contract, and context. |
| DS-15 | Minimum 44px targets, semantic endpoint text, no fake examples, and no illustrative claims of live authority. |
| WEDGE R1 | Submission is one Customer Request and does not expose fan-out, structured quote comparison, procurement, ordering, booking, or payment authority. |
| ConversationEnvelope | Advertises only the versioned public projection semantics, preserves `doesNotProve`, and claims no endpoint that does not exist. |

## Anti-slop check

- No side-stripe accents.
- No gradient text.
- No glassmorphism.
- No hero-metric template.
- No identical card grid. The page uses an editorial sequence, ordered quick start, semantic inventory, and compact disclosures.
- No modal as first thought. Public links navigate directly; copy is inline; authentication occurs at the protected destination.
- No centered-everything landing composition, AI glow, ornamental graph, fake provider, fake request, fake activity, fake price, or protocol theatre.
- No decorative motion or display font in UI labels.
- **Category-reflex check:** this does not default to a dark terminal aesthetic because it is a developer page. The bright shared-office scene calls for the existing warm canvas, white surface, ink/slate hierarchy, and restrained eucalyptus action state.
- **R1 category check:** this is a truthful machine gateway, not an API marketplace, autonomous agent console, procurement portal, payment surface, or future routing-control dashboard.
