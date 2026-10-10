# Public surface spec, 2026-10-09

This spec comes from a design swarm: three inventory agents, three opus design directions, three sonnet personas (Maya the builder, Dev the provider, Priya the budget owner), an opus judge and a builder feasibility check.

**Overrides from Joel, applied after the swarm:**
- **Keyless calls are not used.** Wherever this spec says "keyless curl" or "free tools run live signed out", read it this way:
  - Signed out, visitors see a sample response and the real quote.
  - Live runs happen in the tool-page playground after one-click sign-in with A$5 of sandbox credit.
  - The landing hero shows a sample, not a live call.
- **Competitive context.** treg.to ("OpenRouter for agent tools") and Tempo's Mercator already own "one key" and intent routing for agents. aecon leads on the budget and the receipt for the human who funds the agent, plus Airbnb-grade browsing.

## Familiar-first mapping (supersedes component choices below)

**Rule (Joel): don't handroll this, familiar first.** Every screen copies a pattern users already know from a named product and is assembled from stock Arc blocks or components as shipped, with props and content only. No bespoke component where a block exists.

**Positioning change (Joel, applied here):** the story is not budget, trust or protocol. It is what the x402 world opens up: thousands of paid APIs, data and services (the directory already indexes about 15k x402/Bazaar endpoints) that anyone or any agent can use per call, with no subscriptions, no per-provider accounts, no sales calls. The landing and browse lead with breadth and "things you can now do", Airbnb-style. Removed from the landing: the budget-led headline, the budget panel, the "how a call is paid" section, and the trust/money FAQ. Price per call stays on cards as a plain fact. Budget, receipts and quote stay inside the product (tool page, first run, signed-in shell), not on the landing.

**Headline candidates** (sub for all: "Thousands of APIs, data feeds and services. Use any of them per call, with no subscription and no account for each."):
1. "Every paid API, one call at a time."
2. "Thousands of tools, no subscriptions."
3. "Pay per call for anything an API can do."

**Recommend 1.** It names the breadth (every paid API), the unit (one call) and the absence of subscriptions in the sub. The count ("about 15k tools") goes in the stats band as a live number, never hard-coded.

### Mapping

Block ids are Arc ids. "As-is" means the block is used as shipped, with content and props only. Free = `@uiarc`, Pro = `@uiarc-pro`.

**Landing (`/`, server-rendered)**

| Section | Reference product pattern | Arc block id (as-is) | Props and content only | Bespoke? |
|---|---|---|---|---|
| Header | Stripe/Vercel marketing nav | `site-header` | Tools, Docs, For providers; "Sign in" link, "Get A$5 free" button | no |
| Hero with search | Airbnb search bar over the home page | `hero-section` (split) + `search-field` + `chip-group` | H1 candidate 1; one search field "Search 15k tools"; category chips (Finance, Maps, Web data, Identity, AI, Documents); media slot holds a `json-viewer` "Sample" response | no |
| Things you can now do | Airbnb "inspiration" categories; Zapier use-case tiles | `feature-bento` | Six cells, each a task ("Convert 100 AUD to USD", "Look up an ABN", "Scrape a page") with its tool name and price per call | no |
| Tools you can call today | Airbnb listing grid with rich cards | `product-listing` | Real tools only: name, provider, price per call, readiness `badge`; link "Browse all tools" | no |
| Breadth numbers | Stripe/Linear stats row | `stats-band` | Live counts: tools, providers, categories. Drop any count that is not real | no |
| Connect your client | Vercel/Clerk quickstart tabs | `tabs` + `code-block` + `copy-button` | Claude Code, Cursor, Codex, Your code; MCP line `claude mcp add --transport http aecon <MCP URL>` | no |
| Provider band | Stripe "Start selling" closing band | `cta-section` | "Sell your API per call to AI agents." Button "List an API" | no |
| FAQ | Stripe/Linear FAQ accordion | `faq-section` | Plain product questions only: What is a tool? Do I need crypto? Who runs aecon? (company, ABN, Sydney). No money-custody or trust questions here | no |
| Closing CTA and footer | Airbnb footer | `cta-section` + `site-footer` | "Find a tool in under a minute."; About, Status, Privacy, Terms | no |

**Browse (`/market`)**

| Section | Reference | Arc block id (as-is) | Props and content only | Bespoke? |
|---|---|---|---|---|
| Search, filters, grid | Airbnb search with category chips and filters | `search-results` (facets, suggestions) + `product-listing` (grid) + `chip-group` | Facets: category, price per call, readiness, provider; sort menu; listing cards as on the landing | no |
| Quick jump | Linear/Vercel command menu | `command-palette` | Cmd+K searches tools | no |
| No results | Linear empty state | `empty-states` | "No tools match 'abn lookp'. Try ABN lookup." with "Request a tool" | no |

**Tool page (`/tools/$toolRef`)**

| Section | Reference | Arc block id (as-is) | Props and content only | Bespoke? |
|---|---|---|---|---|
| Page layout | OpenRouter model page; Airbnb listing page | `product-detail` + `page-header` | Name, provider `avatar`, readiness `badge`, "A$0.012 per call", tool ref `copy-button`; sticky side panel with price and "Call with sample input" | no |
| Try it, Schema, Sample output | OpenRouter playground/tabs; Stripe API docs | `tabs` + `json-viewer` + `input` + `button` | Schema and Sample use `json-viewer`; Try it is the stock form fields from the schema | GAP (see below) |
| Quote before run | Airbnb price breakdown line | `checkout-summary` | One line item: "This call costs A$0.012. Paid from your credit." | no |
| Receipt after run | Stripe receipt | `checkout-summary` (paid state) | Tool, price, budget that allowed it, time, call id | GAP (see below) |
| Agent nudge | Vercel inline tip | `alert` | "Your agent can do this on its own. Add the MCP URL." | no |
| Connect | Clerk/Vercel quickstart tabs | `tabs` + `code-block` | Claude Code, Cursor, Codex, curl; this tool preselected | no |
| Signed out | Stripe docs sample response | `json-viewer` (Sample) + `button` | Sample response and real quote; button "Sign in to run it. A$5 free." | no |

**Pricing** (`/pricing`, only the loading fee, no plans): `plan-comparison` with one column, props only. Defer if no fee copy is final.

**First-run checklist**

| Section | Reference | Arc block id (as-is) | Props and content only | Bespoke? |
|---|---|---|---|---|
| Sign-in | Clerk sign-in | `sign-in` (or `login-centered`, passkey-first) | GitHub or passkey | no |
| "What will call aecon?" | Vercel/Linear onboarding question | `radio-cards` | Claude Code, Cursor, Codex, My own code, I want to sell an API | no |
| 3-step checklist | Vercel onboarding checklist; Stripe "get started" list | `release-readiness` | Steps: accept budget (A$5 a day, A$0.50 per call), connect agent (MCP URL), first call. Progress bar and final action are in the block | no |
| First receipt toast | Stripe/Linear toast | `toast` | "Your agent paid A$0.012 for fx-rate. Receipt saved." | no |
| Top up after first receipt | Stripe checkout | `radio-cards` in `alert` | A$10, A$25, A$50 with the loading fee shown | no |

**Provider flow (`/for-providers`)**

| Section | Reference | Arc block id (as-is) | Props and content only | Bespoke? |
|---|---|---|---|---|
| Entry | Stripe "Start selling" | `hero-section` + `cta-section` | "Get paid per call by AI agents." Button "List an API" | no |
| Four steps | Stripe Connect / Vercel import flow | `multi-step-form` | Paste, Price (`money-input`), Test, Publish; payouts via `radio-cards` | no |
| Test step | OpenRouter playground | the tool-page Try it, same blocks | "This is what a buyer sees." | no |

**Signed-in shell**

| Section | Reference | Arc block id (as-is) | Props and content only | Bespoke? |
|---|---|---|---|---|
| Sidebar | Linear/Vercel app sidebar | `sidebar-rail` | Home, Tools, Receipts, Budget, Keys. This closes the earlier "Arc has no sidebar" gap | no |
| Budget | Stripe/Vercel spend limits; usage chart | `usage-forecast` (draggable budget line) | Caps A$5 a day, A$0.50 per call, ask above A$1 | no |
| Receipts list | Stripe payments list; Vercel logs | `webhooks` (history and payload inspector) | One row per call, payload in the inspector | no |
| Keys | Stripe/Vercel API keys | `api-keys` | Key shown once | no |
| Top up and usage | Stripe billing | `usage-billing` (installed under `ae/shared/arc-pro`) | Credit, loading fee | no |

**States**

| State | Reference | Arc block id | Bespoke? |
|---|---|---|---|
| Loading | Linear skeleton | `skeleton` | no |
| Empty | Linear empty state | `empty-states`, `empty-state` | no |
| Error and degraded | Stripe inline alert | `alert`, `badge` | no |

**GAPs (stock block missing or imperfect)**
1. **Receipt.** No Arc receipt block. Closest: `checkout-summary`. Minimal composition: its line-item list for tool, price, budget, time, and call id with `copy-button`. Props only, no new component.
2. **Tool playground.** aecon's `DirectoryToolPlayground`, `tool-input-form` and `QuoteConfirmation` are existing bespoke code, not Arc. Closest: `tabs` + `input` + `button` + `json-viewer`, with `agent-run` as a fallback to show call steps. Replace them with this composition and delete the old three. Keep the schema-to-fields mapping as the only custom logic.

**Install (not yet installed, Pro token required):**
`npx shadcn@latest add @uiarc/site-header @uiarc/cta-section @uiarc/page-header @uiarc/sign-in @uiarc/empty-states @uiarc/plan-comparison @uiarc/logo-marquee @uiarc/command-palette @uiarc/toast @uiarc/tabs @uiarc/card @uiarc/code-block @uiarc/json-viewer @uiarc-pro/product-listing @uiarc-pro/search-results @uiarc-pro/product-detail @uiarc-pro/release-readiness @uiarc-pro/usage-forecast @uiarc-pro/webhooks @uiarc-pro/sidebar-rail @uiarc-pro/multi-step-form @uiarc-pro/feature-bento @uiarc-pro/checkout-summary @uiarc-pro/api-keys @uiarc-pro/agent-run @uiarc/stats-band @uiarc/hero-section @uiarc/faq-section @uiarc/site-footer`
Note: `logo-marquee` and `plan-comparison` are installed only if real logos and fee copy exist. `hero-section`, `faq-section` and `site-footer` are already installed.

**Where the sections below conflict:** landing items 3 (budget panel), 4 (how a call is paid) and 8 (money FAQ) are removed. The rest of the landing, tool page, checklist, provider flow, states and visual system stand unless this mapping overrides a component choice. Keep the bespoke-removal list in "What to delete".

## Direction and why
Developer-first wins as the base, because it has the fastest route to the aha moment: a real call, a visible price and a receipt, all before signup. From trust-ledger it takes the budget-as-control story and the provider line "You receive the full price", since the fee is charged on loading credit, not on each call. From marketplace it takes the quote line shown before each run and the matched install tabs, and it drops the browse-first grid and the canned responses.

## Vocabulary
- **Tool**: a paid API your agent can call through aecon. Replaces "capability".
- **Quote**: the exact price of one call, shown before it runs.
- **Call**: one paid request to a tool.
- **Receipt**: what was paid, to whom, under which budget, and what came back.
- **Budget**: the limits your agent can't spend past. Replaces "Plan" and "spending policy".
- **Credit**: money loaded into your account. The loading fee applies here.

## Landing page (`/`, server-rendered, no redirect)
1. **`site-header`**: wordmark, then Tools, Docs, Pricing and For providers. On the right, the text link "Sign in" and the button "Get A$5 free".
2. **`hero-section` (split)**
   - H1: "Give your agent a budget, not your card."
   - Sub: "One key for every paid API your agent calls. See the price before each call. Keep a receipt after."
   - Primary button: "Start with A$5 of calls, no card". Secondary button: "Run it here".
   - Meta: "No card to start", "Prices in AUD, USD shown as an estimate", "A receipt for every call".
   - Media:
     - A `code-block` (bash) with a keyless curl to `fx-rate`.
     - Under it, a second line with a `copy-button`: `claude mcp add --transport http aecon <MCP URL>`.
     - A `json-viewer` that is prefilled with a response labelled "Sample". "Run it here" fires the live call and swaps in the real response and receipt.
3. **Budget panel** (`card`), heading "Your agent stops at the line you set."
   - `usage-meter`: "A$1.84 of A$5.00 today".
   - Read-only rules: "A$5 a day", "A$0.50 per call", "Ask me above A$1".
   - A `timeline` of 3 receipt rows: "fx-rate · A$0.00 · within budget".
   - A "Sample" `badge` on the panel. Caption: "Calls stop at the cap. Nothing runs past it."
4. **How a call is paid.** Heading: "Your agent sees the price before it pays." Three `card`s, "Quote", "Call" and "Receipt", each with one line of copy and a small `json-viewer` excerpt.
5. **Matched proof** (`segmented-control`: Claude Code, Cursor, Codex, Your code). Each option shows that client's config in a `code-block` and one real tool card (name, provider, price, readiness `badge`). No testimonials or counts until they are real.
6. **Tools you can call today**: six `ToolListingCard`s, server-rendered, with the link "Browse all tools".
7. **Provider band** (`cta-section`): "Sell your API per call to AI agents. You receive the full price you set." Button: "List an API".
8. **`faq-section`** (`AeSiteFaq`): What does it cost? Where is my money held? Do I need crypto? What happens at the cap? What if a tool fails? Who runs aecon? (company name, ABN, Sydney)
9. **`cta-section`**: "Make your first call in under a minute." Then `site-footer` with About, Trust, Status, Privacy and Terms.

## Tool page (`/tools/$toolRef`, server-rendered)
- **`page-header`**: name, provider `avatar`, readiness `badge`, "A$0.012 per call", and a `copy-button` for the tool ref.
- **Main column**: `tabs` for Try it, Schema, Sample output and Receipts.
  - Try it reuses `DirectoryToolPlayground`, `tool-input-form` and `QuoteConfirmation`, with the sample input prefilled.
  - Schema and Sample output use `json-viewer`.
  - `AeToolLatencyChart` becomes a single Forest series.
- **Sticky side `card`**: the price, "Price confirmed before you pay", the MCP URL with `copy-button`, and the button "Call with sample input".
- **Run sequence**:
  1. The quote line "This call costs A$0.012. Paid from your credit."
  2. The result in `json-viewer`.
  3. A receipt `card` with tool, price, the budget that allowed it, time, and call id with `copy-button`.
  4. An `alert` underneath: "Your agent can do this on its own. Add the MCP URL."
- **Signed out**: free tools run live. Paid tools show the real quote, and the button reads "Sign in to run it. A$5 free."
- **Connect section**: `tabs` for Claude Code, Cursor, Codex and curl, with this tool preselected.

## First-run checklist
- **Sign-in**: `sign-in` with GitHub or a passkey, then one question in `radio-cards`: "What will call aecon?" Options: Claude Code, Cursor, Codex, My own code, I want to sell an API. The last option routes to the provider flow.
- **Checklist screen**: a `card` with `progress` and a vertical `stepper`. Heading: "Get your agent paying in 3 steps."
  1. **Accept your budget.** Prefilled with "A$5 a day, A$0.50 per call". Button: "Use this budget", plus an "Edit" link.
  2. **Connect your agent.** The client chosen at signup is preselected. MCP URL with `copy-button`. The key is shown once. The step ticks on the first handshake.
  3. **Make your first paid call.** Suggested prompt: "What is 100 AUD in USD today?" The step waits with "Listening for your agent's first call." and ticks when the receipt lands.
- **Sample data**:
  - `usage-meter` reads "A$5.00 sandbox credit".
  - The receipts list holds the landing call, or one "Sample" row, until a real receipt replaces it.
- **After step 3**:
  - A `toast`: "Your agent paid A$0.012 for fx-rate. Receipt saved."
  - An inline `alert`: "First receipt in. Top up when you're ready to go live." It shows `radio-cards` for A$10, A$25 and A$50, with the loading fee shown before payment.
  - A text link: "Show me around".

## Provider listing flow
- **`/for-providers` entry**
  - H1: "Get paid per call by AI agents."
  - Sub: "List an API in 10 minutes. You receive the full price you set. Buyers pay a loading fee when they top up."
  - A worked payout example, then the button "List an API".
  - The failure-liability line goes above the first step once it is decided (see the note at the end).
- **Four steps** in the horizontal Arc `stepper`:
  1. **Paste.** An `input` labelled "OpenAPI or MCP URL" and the button "Find endpoints". A `skeleton` list shows while it works. Results are `card` rows, each with a `switch` and a drafted name and description you can edit.
  2. **Price.** `money-input` with "AUD per call". The line "You receive A$X per call" updates as you type. The range hint "Similar tools charge…" appears only when real comparable tools exist. `radio-cards` set how aecon holds the upstream key.
  3. **Test.** The buyer's try-it panel, titled "This is what a buyer sees." It runs quote, call and receipt in the sandbox.
  4. **Publish.** A preview of the listing card and `radio-cards` for payouts (Stripe Connect or an x402 address). Payouts can be skipped with "Earnings wait here until you connect payouts." Button: "Publish tool". Success shows "Live at aecon.ai/tools/…" with `copy-button`.

## Navigation
- **Public**: Tools (`/market`), Docs (`/developers/api`), Pricing (`/pricing`, new), For providers, Sign in. No other menu.
- **Signed in sidebar**: Home (checklist), Tools, Receipts, Budget, Keys.

## States
- **Loading**: a `skeleton` shaped like the final card, receipt or result. Buttons keep their label with `loading`. No spinner without a label.
- **Empty**: no screen starts blank. Sample rows carry a "Sample" `badge`. `empty-state` has one action, for example "Run a free call". A search with no results reads "No tools match 'abn lookp'. Try ABN lookup." with a "Request a tool" link.
- **Error**: an inline `alert` that says what happened and what was charged, for example "The provider timed out. You weren't charged." Button: "Try again". If search fails: "Search is catching up. Here are popular tools."
- **Degraded readiness** is per tool, never shown sitewide.
  - `badge` warning: "Slower than usual", with "Checked 2 min ago" and a /status link.
  - Danger tone only for "Paused. Calls are off. You won't be charged."
  - The quote still shows.

## Visual system
- **Light colours**:
  - bg Chalk `#E8E4DA`, surface `#F2EFE7`, fg Charcoal `#141414`, muted `#595854`, border `#C5C1B8`.
  - **primary, ring and link: Forest `#24543D`**, with primary-fg Chalk.
  - success `#24543D`, warning `#8A5A0B` on `#F1E4C6`, danger `#9B2C2C` on `#F3DEDA`.
  - Charts use Forest and Stone `#AAA89E` only.
  - Gold appears only in the logo.
- **Dark colours**: bg `#141414`, surface `#1E1E1C`, fg `#E8E4DA`, muted `#AAA89E`, primary `#6FA587` with fg `#141414`.
- **Type**:
  - Manrope 400 and 500 only, in sentence case.
  - Scale: 13 / 15 / 17 / 20 / 28 / 40 / 56. Display is 400 at -0.02em. Labels and buttons are 500.
  - Numbers use `tabular-nums`.
- **Radius**: 10 for badges, 18 for controls and small cards, 26 for cards, 34 for hero panels. Controls are 44px high.
- **Spacing**: 4px base, using 8, 12, 16, 24, 32, 48, 64, and 96 between sections. Content max is 1200px, with a 16px gutter on mobile.
- **Motion**:
  - `motion-tokens` only: `snappy` for presses, `smooth` for results, receipts and step ticks.
  - `slot-text` for the balance ticking down after a call.
  - Reduced motion: instant swaps with opacity only. Nothing loops while idle.
  - No gradients, glows, eyebrows or em dashes.

## What to delete
- `AeHomeLanding.tsx`, the `brand-copy.ts` HOME block, and the redirect in `src/routes/index.tsx`.
- The mesh and Lumen/Relay sample media in `MarketLanding.tsx`.
- `--ae-weight-eyebrow`, `--ae-tracking-eyebrow`, every 600/700 weight, and the hexes `#7747FF`, `#8A66FF`, `#9C37BE`, `#7128A5`, `#FFCB62`, `#E66E00` and `#E457A0`.
- reui `stepper.tsx`. Move `AeSupplyLanding` and `AeProviderSetupWizard` to the Arc `stepper`.
- The 10-field `supplier-onboarding-wizard`.
- reui `data-grid`, once its 7 importers move to Arc `sortable-data-table`.
- The same-name `src/components/ui/` duplicates (button, input, textarea, skeleton, accordion, avatar), once their importers move to Arc.
- `ae/shared/usage-meter/`, replaced by the revived Arc `usage-meter`.
- "Capability" and "Plan" on every public page.

## Build order
1. **`/` is the landing with a live keyless call.**
   - Add the keyless, rate-limited `fx-rate` free tool, sourced from RBA daily rates and returning a receipt.
   - `/` renders the server-side hero (curl, MCP line, Run it here, `json-viewer`), the FAQ, the CTA and the footer.
   - Delete `AeHomeLanding`.
2. **Token and type cleanup across the site, then the rest of the landing.**
   - Forest primary and the semantic tokens; 400/500 only; eyebrows and off-palette hexes removed.
   - Then the budget panel, How a call is paid, Matched proof, the tool grid, the provider band and `/pricing`.
3. **Tool page try-it.** Quote line, receipt card, signed-out live run for free tools, the MCP alert, and server-side rendering.
4. **First run.**
   - Replace the admin-approved A$10 trial with automatic A$5 sandbox credit.
   - Add the one question, the 3-step checklist, the sample data, and the top-up alert after the first receipt.
5. **Provider flow.** `/for-providers` entry copy, paste-URL endpoint discovery, the 4-step Arc `stepper`, publish. Delete reui `stepper` and the old wizard.

**Open decision before step 5's copy ships:** who absorbs a failed settlement or a disputed top-up. The provider persona won't list until this is stated, and the copy must not claim it before it is decided. The budget-owner gaps (monthly and team caps, an approvals inbox, GST tax invoices, a pause switch, an 80% alert) come after step 5.

---

# Builder feasibility

**Feasibility: Developer-first spec vs. current code**

**Already installed** (`src/components/arc/`): accordion, alert, avatar, badge, button, chip-group, combobox, copy-button, donut-chart, empty-state, expandable-card, filter-toolbar, input, line-chart, radio-cards, search-field, segmented-control, skeleton, sortable-data-table, sparkline, stepper, textarea, usage-meter. Blocks: `hero-section`, `faq-section`, `site-footer`. Also `motion-tokens.ts`, `foundation.css`. The `usage-meter` is present at `src/components/arc/usage-meter/`, so it doesn't need reviving.

**Needs installing** (the `get_install_command` result was verified; Pro is attached):
`npx shadcn@latest add @uiarc/code-block @uiarc/json-viewer @uiarc/card @uiarc/timeline @uiarc/tabs @uiarc/progress @uiarc/toast @uiarc/switch @uiarc/money-input @uiarc/slot-text @uiarc/page-header @uiarc/cta-section @uiarc/site-header @uiarc/sign-in`
Not yet checked: `input`, `radio-cards` and `stepper` are already installed. `tool-input-form` is not an Arc id. It is aecon's own, at `src/components/ae/shared/tool-input-form`. `@uiarc` is already registered in `components.json`.

**Reuse:**
- `PublicToolDetail`
- `QuoteConfirmation.tsx`
- `AeSiteFaq`
- `ae/shared/arc-pro/*` (multi-step-form, api-keys, usage-billing, settings-page)
- `routes/tools.$toolRef.tsx` (already has a loader and `head`, so it is server-rendered)
- `tools.$providerHost.$slug.tsx`
- `for-providers.tsx`, `status.tsx`, `trial.tsx`, `sign-in.$.tsx`

**Delete or move:**
- `ae/home/AeHomeLanding.tsx`
- The redirect in `routes/index.tsx`
- `arc/blocks/hero-section/hero-{mesh,lumen,relay,cadence}*`
- reui `stepper.tsx` and `data-grid` (13 importers, not 7)
- `AeSupplyLanding` and `AeProviderSetupWizard`
- The same-name `ui/` duplicates (33 importers)
- `ae/shared/usage-meter`
- `ae/trial` and `AdminTrialAccess`

**Backend:**
- **Keyless free tool:** none. `fx-rate`, RBA and "keyless" have zero hits. The only unauthenticated paths are `/chat/anonymous` and `sandbox-reference`, a seed. You need a new unauthenticated HTTP route plus the `convex/rateLimit.ts` component (present) and a receipt for an anonymous caller. Receipts today assume an Account, so this is the biggest schema question.
- **Public tool pages:** yes, with a loader.
- **A$5 sandbox credit:** no. A trial exists, but it is admin-approved: `TRIAL_AMOUNT_UNITS='10000000'` in `modules/money/trial-access-contracts.ts`, with grant authority checks in `lib/money/trials/*`. Making it automatic means rewriting the activation and authority path, not changing a constant. This touches money, so it is high blast radius.
- **GitHub or passkey in Clerk:** I can't verify this. The repo only has `@clerk/tanstack-react-start`, and the providers are enabled in the Clerk dashboard. Joel needs to check it.
- **First-handshake and first-receipt ticks:** need new reactive queries.
- **Endpoint discovery:** `api.v1.supply.sources.preview` exists. Check how much of paste-URL discovery it already covers.
- **`/pricing`:** none.

**Contradictions and risks:**
1. **Font and weights.** Arc's installed fonts are Geist and Inter, but the spec uses Manrope. Manrope is already in `globals.css`, but it is a variable font loaded at 200–800. Capping it at 400/500 means changing the CSS, not the font file.
2. **Arc rule: "no eyebrows."** The spec's 56px display size at weight 400 is fine. But `--ae-weight-eyebrow` is wired into the Tailwind `font-weight` theme (`globals.css:99`), so removal needs a repo-wide check.
3. **Arc tokens.** The spec's hexes should be set on Arc's semantic tokens in `foundation.css`. The spec gives no `--accent` mapping, and Arc requires one. Define it as Forest.
4. **The "Sample" badge on the landing page** is fine. But the hero's "Sample" json-viewer swapping to a live response needs a loading state and an error state defined.
5. **USD "shown as an estimate"** needs the FX source stated. It also implies an extra RBA call on every page view, so cache it.
6. **Sidebar.** The signed-in sidebar uses reui `sidebar.tsx`, and Arc has no sidebar component. That is a gap in the "move off reui" story.
7. **"Capability" and "Plan" removal** touches the whole codebase and the API vocabulary (`plans/quote`, `capabilityExecution`). Limit this to public copy.
8. **"Gold only in logo"** conflicts with `#FFCB62`, which is still referenced in the code (see the hex deletions).
9. **First run and money.** Anonymous keyless calls and an auto-granted A$5 need abuse limits per IP and per account. The spec has none.
10. **The failure-liability open decision** blocks the step 5 copy and the provider flow.

**Effort (days):**
- Step 1: 4–5. The free tool and anonymous receipt are the hard part.
- Step 2: 5–6. The token sweep is wide, and the new blocks and `/pricing` add to it.
- Step 3: 3–4.
- Step 4: 6–8. The automatic credit is the risky part.
- Step 5: 6–7, plus the reui deletions.

Total is about 24–30 days. Run step 1's backend spike first, since it decides the receipt model.
