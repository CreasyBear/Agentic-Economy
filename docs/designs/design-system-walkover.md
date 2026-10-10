# Persona walkover, 2026-10-10

Source: 7 journeys walked by poteto agents with break-ui, emil-design-eng, cognitive-load-auditor, better-writing and Arc composition, against the design system spec. Each walk had a second opinion that checked its claims against source and a third that walked the same journey independently. Synthesis by opus.

## The read
Every journey either trips on vocabulary or reaches a tool it cannot use. Builders, phone visitors and data seekers land on Listed Bazaar pages marked "not callable through AE", and agents get search text with no name, price or call. Owners, providers and operators reach their goal and then find no next step: "A$0.00 has been added" after a top-up, a listing stuck Under review, a stuck call with no visible retry. All six in-flight worktrees hold uncommitted edits on branches still level with main (c2cecf494), so none of the fixes has shipped.

## Per journey

**1. Builder: scraping tool to install line**
- **Lost:**
  - The landing shows no search, tool or price (`MarketLanding.tsx:32-51`).
  - Results open with "N assessed … partial coverage" (`AeX402Directory.tsx:425-426`).
  - Convex `searchIndex` never matches "scraping" to "scrape".
  - Compare shows raw `JSON.stringify` inputs (`DirectoryComparison.tsx:39`), and its only action is "Inspect Tool".
- **Leaves:** after comparing two Listed scrapers. Both open `DirectoryToolPage`, which says "not callable through AE" (`:60`). Only admitted tools redirect (`tools.$providerHost.$slug.tsx:25`).
- **Supported:** surface `ToolConnect` gives a copy button and "It asks you before it pays", but only for callable tools (`ToolPage.tsx:148,154`). Three more steps follow it: authenticate in /mcp, sign in, add credit.
- **Spec:** First screen, Tool, Compare (S4), Language, Search down.
- **Change:**
  - Sort callable tools first and label each row Ready or Listed.
  - Drop the redirect.
  - Ready tools: the install line, then "Sign in when asked, add credit, then ask: use <tool> to scrape <example>".
  - Listed tools: "Ask us to add it" (Decision 1). No install line, because the agent would fail.
  - Match "scrape" when someone searches "scraping".

**2. Agent via MCP and CLI**
- **Lost:**
  - At initialize the agent gets 13 instructions, relative URLs and the id `agentic-economy` (`mcp-api.ts:53-66,362`).
  - tools/list is 37,858 B, and the agent must follow every `nextCursor`.
  - Search text names no tool or price, only raw `next` JSON (`:256-261`).
  - Describe text is just "<action>: found." (`:236`).
  - The CLI prints "ref", raw readiness and "× 10^-", and describe's Next skips the quote (`describe.ts:58`).
- **Leaves:** at search, because a text-only host has nothing to act on.
- **Refusals:**
  - A thrown problem shows only its title (`contract.ts:292`).
  - Refusals built from `REASON_COPY` carry no money state or URL (`mcp-api.ts:185`).
  - `mcp_toolset_required` returns `next: []` (`:603-608`), and `input_invalid` names no field.
  - Signed-out sessions hide quote and call (`:575`).
- **Spec:** Agent surfaces (spec:188-196), Error formula.
- **Change:**
  - Rename the id to `aecon`, cut to 6 instructions with absolute URLs, and put the four tools on page 1.
  - Search returns "24 tools match 'weather'", then the top 3, each with A$ price, status and one call line.
  - Describe text states the inputs and the price.
  - Errors read "title: detail", then money state, one `next` and a URL.
  - The CLI gets `--quote`.

**3. Phone visitor from a tweet**
- **Lost:**
  - At 390px, the 14.4vw h1 and a 300px tilted mark fill the screen.
  - A category tap sends "Finance" to the third-party ranker. Surface's `MarketCategoryRow.tsx:24` still does this.
  - Most results open Bazaar pages.
  - Primary buttons do a full page load through `window.location.assign`, and "Set up to get a Quote" hits a sign-up wall.
  - Admitted pages show input examples only.
  - "Performance history is unavailable right now" reads as broken.
- **Leaves:** after the tap, on a not-callable page.
- **Spec:** First screen (3 priced tools on phones), Tool, Decision 3.
- **Change:**
  - Land surface's first screen and hide the mark on phones.
  - Make the chips filter `marketCategories` locally.
  - Use router navigation.
  - Show the output fields with "No example yet".
  - Replace the unavailable line with "Not enough calls yet".

**4. Data seeker comparing price feeds**
- **Lost:**
  - Filters say USDC and "Payer breadth", and the "Output example" filter is hidden under Advanced.
  - With a query, sort turns into static "Search relevance" text (`AeX402Directory.tsx:540`), so there is no price sort.
  - Cards print a raw "Source:" enum (`ToolListingCard.tsx:29`).
- **Leaves:** in compare.
  - Prices mix A$, US$ and "Quote required" (`directory-card.view-model.ts:26-32`).
  - A JSON blob sits beside a one-line summary.
  - There is no speed row, although admitted tool pages already chart latency.
  - A disabled Compare button gives no reason (`:443`).
- **Spec:** discovery.md "Too many", Compare (S4), R9, Decision 24.
- **Change:**
  - Add Cheapest, Fastest and Has example chips, promoting the existing filter.
  - Allow price sort alongside a query.
  - Show A$ only.
  - Add a latency row for Ready tools, with "Not enough calls yet" under 5 calls.
  - Summarise schemas with `jsonSchemaFieldSummary`.

**5. Returning owner**
- **Lost:**
  - `/owner` lands on the public hero.
  - /activity:
    - Four intros come before the first row.
    - `callRef` is the first column and the tool name the third, with two statuses and "Agent prn_…".
    - The attention count covers loaded rows only.
  - /agent-access:
    - There are two "Connect an Agent" buttons.
    - "Already approved access?" lists agents the owner already has.
- **Leaves:** at top-up, which says "A$0.00 has been added until…" (`AeCreditTopUpPanel.tsx:125`). A toast and an alert both say "Payment received" (`:86,134`), and the alert uses `role="alert"`, so a success is announced like an error.
- **Supported:** the line items already exist (`:176-193`).
- **Spec:** Your tools, Returning, List, Money, "Never say money moved", Onboarding.
- **Change:**
  - Send a signed-in `/owner` to `/market?view=saved`, titled "Your tools", with a balance line and a line for calls that need the owner (counted on the server).
  - Activity rows show tool, agent name, amount, one status and time.
  - Move finance and month close to `/owner/reports`.
  - Top-up shows "Confirming your payment…" and confirms once.
  - Keep one "Add an agent" button.
  - Show the intent question only before the first receipt, and drop "The AE team".

**6. Provider listing an API**
- **Lost:**
  - The page says "endpoint". x402 on the landing is allowed (Decision 35).
  - The price shows as `Price 10000 · payTo · eip155:84532` (`SupplyCandidateSection.tsx:63`), then as "Provider source payment".
  - The button reads "List this endpoint".
  - Success says "readiness has not been observed" and links only to the inventory.
- **Leaves:** after publish, with the tool stuck Under review (`SupplyPublicationFlow.tsx:172`).
  - The wizard has no step to prove the payTo address.
  - The proof needs `window.ethereum` `personal_sign`, which shuts out custodial and server wallets.
  - Sepolia listings probably never appear in production search (`browse.ts:30`, not verified).
- **Spec:** no provider archetype yet; Principle 2; Language.
- **Change:**
  - Add a provider-listing archetype.
  - Show the price as "A$0.003 per call (0.002 USDC)" on both screens.
  - Add an inline "Prove you receive payments" step.
  - On success, link the public page and flag sandbox-only listings.

**7. Operator triaging admin**
- **Lost:**
  - The "Founder console" stacks eight regions.
  - Raw `<a href>` links do a full page load, and three different labels go to the same queue.
  - Exceptions say "indexed state" and "Legacy unset", and the detail sheet can only open the record.
  - The call page shows its title and breadcrumbs twice, points the breadcrumb to `/admin/search`, and shows a raw enum (`AdminCallEvidence.tsx:65`).
  - A calm day and a failed load both render `null`, so they look the same.
- **Leaves:** on a stuck call. Reconciliation runs on its own (`reconcileScheduled`, `capabilityCalls.ts:185,194`), but the page shows no next attempt, attempt count or owner. Overview links drop the investigation scope (`PurchaseActivity.tsx:118`), so "Return to exceptions" never shows.
- **Spec:** Admin inbox, Record, Settings.
- **Change:**
  - Rename the page "Inbox".
  - Show "Automatic retry at T, attempt n" or "Waiting on buyer's evidence", without adding a new settle effect.
  - Pass the investigation scope through.
  - Give all-clear and load-failed separate states.
  - Delete "Legacy unset" and map enums through `reason-copy.ts`.
  - Show how many tools Suppress hides in its sheet, and style it as destructive.

## Cross-journey issues
1. **Ledger words and raw enums**: all 7 journeys.
2. **Listed tools look like equals, then dead-end**: 5 journeys (1, 2, 3, 4, 6).
3. **Several price formats or raw units**: 5 journeys (2 to 6).
4. **Primary action missing or empty**: 5 journeys (1, 2, 5, 6, 7).
5. **Sign-in or funding walls before any value**: 4 journeys (1, 2, 3, 6).
6. **Duplicate headers and intros**: 3 journeys (4, 5, 7).

## Mapped to migration
| Change | Owner |
|---|---|
| Banned words, raw enums, price formatting | Foundations (formatters, oxlint, `/aecon-audit`); each branch clears its own screens |
| Search retry, stemming, result-count copy | S0 search: `feat/public-surface` |
| MCP and CLI text, errors, `--quote`, top-up copy | S0 trust: `fix/payment-speed-trust` (its diff so far is Convex only) |
| MCP id, instructions, page-1 tools | **Unowned, assigned to S0 trust** |
| First screen, chips, redirects, Ready/Listed label, callable-first sort, router navigation | S1 public: `feat/public-surface` |
| Per-tool Google title and description | **Unowned, assigned to S1 public** |
| /activity, Reports, server-side status filter | S1 workspace: `feat/snappy-workspace` |
| `/owner` to Your tools | **Unowned, assigned to S1 workspace** |
| Second agent, intent question | S1 onboarding: `feat/journey-measurement` |
| Examples, Ready status, reason copy | S2: `feat/call-any-x402` |
| Provider price display, payTo proof step | Was Wave 3 provider, **moved to S2** because it blocks supply |
| Sepolia visibility check | **Unowned, assigned to S2** |
| Task chips, price sort | S3 |
| Compare page, latency row | S4 |
| Admin inbox, retry visibility, investigation scope | Wave 3 admin |

## What we still are not asking
1. Is any scraping, weather or token-price tool Ready today? D3 is 0%, so journeys 1 to 4 have no good ending yet.
2. Should Listed rows appear on /market at all before S2?
3. Can providers on custodial or server wallets prove their payTo address, and how much of our supply do they make up?
4. How often, and how fast, does automatic reconciliation close an uncertain call?
5. How much starter credit does a first call get? It is still open for Joel, and it gates A1 and A2.

## Benchmarks this will move
D1, D2 (first screen); D3, D4, D6 (callable-first sort, stemming); D5 (retry); D7 (no redirect); D9 (search returns a URL and a call); C1 (examples); G1, G2 (MCP); A1, A2 (install, top-up, second agent); R2 (banned words); R3, R9 (price); R8 (compare on `AeRecordTable`); S2 (router navigation); R4 (papercuts).

Draft: /private/tmp/claude-501/-Users-joelchan-Documents-Coding-App-Dev-live-01--Pre-Implementation-Agentic-Economy/f5f7123e-e2af-4469-8b1b-9930508c1636/scratchpad/ux4.md
