# aecon design system spec

aecon helps a person or their agent see what they can use. This spec applies the rulebook (`docs/specs/2026-10-10-aecon-rulebook.md`, R1 to R29) and the reconciled position in `docs/design-system/discovery.md`. Where they conflict with DESIGN.md, this spec wins, and DESIGN.md is amended to match. "verify" marks a value not found in the repo.

## Principles
1. **Real tools first.** Every public screen shows a named tool, its price and its output before asking for anything.
2. **One job, one primary action per screen.** A screen with two primary actions or two jobs becomes two pages.
3. **Money once, in one format, via `formatCurrencyAmount`.** Every failure says what happened to the money.
4. **The user's words.** No ledger words, raw enums or refs where a name fits.
5. **Calm by subtraction.** Grey by default, two type sizes, no in-page shadows, motion only for cause and effect.

## Foundations
Tokens live in `src/styles/globals.css`. Arc changes are overrides in `src/styles/arc-market.css`, so `foundation.css` stays unedited. The one vendored file we edit is `src/components/arc/motion-tokens.ts`, because CSS can't override JS. Clear deleted Tailwind namespaces (`--shadow-*: initial`, `--radius-*: initial`) so Tailwind's defaults don't return.

**Density.** Public is the default. `[data-density="workspace"]` on `AeAppShell` swaps values under the same names, which replaces R1's `--ae-text-ui`.

| Token | Public | Workspace |
|---|---|---|
| `--ae-text-body` | 16px / 1.5 | 13px / 1.4 |
| `--ae-text-title` | 24px / 1.25 | 20px / 1.3 (decision) |
| Rows / controls | 40 / 44px | 32 / 32px, 44px on `pointer: coarse` |
| Page padding | 48px | 24px |

- Weights are 400 and 500. Tracking is -0.01em for body and -0.025em for titles.
- Each screen uses two type sizes. h2 uses the body size at weight 500. Secondary text is `--ae-muted-fg` at the same size.
- Arc's `--text-*` and `--control-height-*` map onto these tokens.
- Delete the caption, eyebrow, deck, title-lg and display sizes and trackings, weights 200, 600 and 700, and `.font-display`.
- Manrope stays. Mono `tabular-nums` is only for money, refs and code.

**Spacing.** The grid is 4px:

| Space | Token |
|---|---|
| 8px | `--ae-space-intra` |
| 16px | `--ae-space-related` |
| 24px | `--ae-space-region` (new) |
| 32px | `--ae-space-section` |

`--ae-gutter-lg` drops from 26px to 24px. Delete `--ae-space-hero`, `-band`, `--ae-fold`, `--ae-chapter`, `--ae-fold-peek`, the `min-h-fold*` and `min-h-chapter` utilities, and the slogan hero.

**Radii.** Radii are concentric:

| Use | Value | Token |
|---|---|---|
| Control | 6px | `--radius-sm` |
| Card | 10px | `--radius-lg` |
| Overlay | 14px | `--radius-xl` |
| Chips | pill | `--radius-pill` |

Arc's `--radius-control`, `-panel` and `-surface` take these values. Today they are 10px and 14px in `.ae-arc`, and 18/26/34px in `.arc-market`. Delete `--radius-md`, `-2xl`, `-3xl`, `-card` and `-nav`, and change `rounded-md` to `rounded-sm`.

**Surfaces.**

| Surface | Token | Light | Dark |
|---|---|---|---|
| Canvas | `--ae-bg` | #E8E4DA | #141414 |
| Sunken | `--ae-surface-sunken` | #DEDBD4 | #0F0F0F |
| Raised | `--ae-surface` | #F2EFE7 | #1C1C1C |

- Hover moves one step: to sunken in light, and to `--ae-surface-raised` (#242424) in dark. This is what shadcn `--accent` does now. Nothing lifts or blurs.
- Delete the duplicates `--ae-container` and `--ae-fg-subtle`.
- A new `--ae-hairline: color-mix(in srgb, var(--ae-fg) 8%, transparent)` replaces `--ae-border` as `--border`. `--ae-border-strong` stays, for inputs.

**Shadow.** The only shadow is `--ae-shadow-overlay` (0 12px 32px -16px rgba(0,0,0,.18)), used on dialogs, sheets, menus and the command palette. Every other shadow token is deleted. Arc's `--shadow-resting` and `-raised` become `none`, and `--shadow-floating` becomes the overlay shadow.

**Colour.**
- Text is `--ae-fg` (Charcoal #141414). Muted text is `--ae-muted-fg` (#595854; dark #AAA89E).
- Forest is `--ae-brand` (#24543D; dark mint #B7E7CC). It marks only the one primary button, the selected row, keyboard focus and inline links.
- `--ae-primary` moves from `--ae-fg` to `--ae-brand`. Dark `--primary` becomes mint with #141414 text, as `.dark .arc-market` already does.
- Success, warning and danger colour status icons only.
- Delete `--ae-brand-strong`, `--ae-info*` and the dark `--arc-gradient*` overrides. Never set `data-accent`.
- Gold stays on the logo.

**Status.** Each status is a 16px lucide-react icon with a grey label, and no pills. Public pages show only the tool statuses (`AeStatusBadge` already has `audience`). Every `callStatusStateValues` value maps to one of the call statuses.

| Kind | Status | Icon | Colour |
|---|---|---|---|
| Tool | Ready | `CircleCheck` | success |
| Tool | Listed | `Circle` | muted |
| Call | Done | `CircleCheck` | success |
| Call | Needs you | `CircleAlert` | warning |
| Call | Failed | `CircleX` | danger |
| Call | Working | `LoaderCircle`, static under reduced motion | muted |
| Call | Refunded | `Undo2` | muted |
| Call | Cancelled | `CircleMinus` | muted |

**Motion.**
- Hover takes 80ms and changes colour only (new `--motion-duration-hover`).
- Exits take 120ms (`--motion-duration-fast`, now 150ms). Entrances take 150ms (`--motion-duration-base`, now 220ms). Easing is `--motion-ease-standard`.
- Delete `--motion-duration-slow`, `--motion-ease-emphasized`, their aliases and utilities. Also delete `[data-ae-site-button]` (mono uppercase, `base.css:89-204`) with its 220ms ink wash.
- Arc's durations map to 80/120/150ms, and `--ease-spring` (bounce .15) maps to the standard easing.
- `motion-tokens.ts` caps durations at 0.15 (exits 0.12) and sets all five springs to `visualDuration: 0.15, bounce: 0`. Its two direct importers move to `lib/motion-tokens`.
- Only transform and opacity animate. The command palette, shortcuts and row focus don't animate.
- Spinners appear after 300ms and stay for at least 500ms (Vercel guidelines).

**Focus.** Focus rings show for keyboard focus only: 2px solid `--ring`, 2px offset. `arc-market.css:10` drops from 3px to 2px. Arc's `outline: none` stays overridden. Delete `--ae-focus-ring`.

## Components
The numbers in brackets count the files that use each component, not counting the file that defines it.

| Job | The one | Delete |
|---|---|---|
| Table | `AeRecordTable` (`AeOperatorDataTable.tsx:154`) | Arc `sortable-data-table` (6), `AeSortableDataTable` (4), `AeComparisonTable` (3, in S4), `ui/table.tsx` (0), visible raw `<table>` |
| Tool row, card | `ToolListingCard`: rows in lists, cards on the first screen and in Compare on phones. Order: logo and name, output, price, status, buyers (5+), speed (5+ samples), compare | `DirectoryToolCard` (4), `AeCapabilityTile` (1) |
| Task tile | `ui/item.tsx` rows in one group: task, "14 tools · from A$0.003", three logos | |
| Price | `AeToolPrice`, without its "Total price" default label | `ToolPriceText`, 80 inline formatter sites |
| Status | `AeStatusBadge`, icon plus label | Arc `badge` used for status |
| Empty | `AeEmptyState` (Arc `empty-state`) | `ui/empty.tsx` |
| Error | Arc `alert` at the cause; `RouteError` per route | `ActivityUnavailableState` and similar |
| Skeleton | Arc `skeleton` in the final layout, with `aria-busy` | `ui/skeleton.tsx` (9), the full-screen "Loading workspace" |
| Page header | `AePageHeader`; records use `AeRecordPageHeader` | Unused `AeRecordHeader`, h2s that repeat the h1 |
| Nav | Public header and `AeSiteFooter` (Arc `site-footer`); `AeAppShell` header menu, no global sidebar; admin rail on `ui/sidebar.tsx` | `SignUpLegalFooter`, `StatusPageFooter`, the footer's gradient `logo` variant, `FounderDestinations` |
| Command palette | `AeCommandPanel` (cmdk). Every action is an item with its shortcut, also shown in tooltips (C, ⌘K, /, ?) | `useCommandPanelHotKeys.ts`, replaced by react-hotkeys-hook 5 (new dependency, pinned) |
| Install | `AeCopyCommand` under a client switch that remembers the last choice (Claude Code, Codex, Cursor, MCP URL); refs use `AeCopyReference` | `AeCopyValue` (1) |
| Receipt | `CallMoneyFacts` under `CallSummarySection` | The reconciliation form on buyer receipts |

## Page archetypes
Each route declares `job` and `primaryAction` in `StaticDataRouteOption` (`src/router.tsx:71`).

| View | Job / decision | Primary action | Top to bottom | Hidden by default | Reference |
|---|---|---|---|---|---|
| First screen `/market` | See what I can use / which tool | Search | One-line h1 ("Tools AI agents pay for, per call"); search; `marketCategories` chips that filter locally; the 6 to 8 most-bought tools (Listed and labelled until S2; on phones 3, then "See all N"); install line | Counts, provenance, slogan | Locus /tools |
| Tasks `/tasks` (S3) | Find my job / which task | Open a task | Category headings; "N tools · from A$x" for each task | | treg /use-cases |
| Task `/tasks/$slug` (S3) | Choose for one job / which tool | Until S4, "Add to your agent", naming our pick; from S4, "Try our pick" | H1; count and from-price; our pick (Ready, then most buyers, then cheapest) and why; ranked rows; example; install | Folded duplicates | treg use-case |
| Tool `/tools/$providerHost/$slug` | Judge fit and cost / use it or not | Ready tools: "Add to your agent" until S4, then "Try it". Listed tools: "Ask us to add it" | Identity, price, status, buyers; example, or the output fields and "No example yet"; install; inputs; 3 alternatives. The page never redirects | Schema, versions | Stripe API ref |
| Provider `/providers/$providerHost` | See one provider / which tool | Add to your agent | "13 tools · from A$x"; tasks; rows; other providers | Host notes | treg Serper |
| Compare `?compare=` (S4) | Pick from 2 to 4 / which one | Use this one | `AeRecordTable` with tools as columns: price, speed, buyers, inputs, example; cards on phones | Everything else | OpenRouter |
| For your agent `/for-agents`, `/llms.txt` | Install once / which client | Copy install | Availability; one block per client | Protocol detail | treg /agents |
| Your tools `/market?view=saved` | See what changed / which tool | Open the changed tool | Saved tools that changed; unfinished calls; last search | Unchanged tools | App Store Updates |
| List `/activity` | Calls needing me / which row | Act on the focused row | Filters in the URL; rows; pagination | Finance, exports | Carbon table |
| Reports `/owner/reports` (new) | Get the numbers / which export | Export menu | Period; totals; invoices and statements, generated automatically | Ledger lines | Stripe Reports |
| Record `/calls/$callRef` | What happened / done or next | The single next step | Outcome; receipt; output | Refs, evidence | Stripe receipt |
| Money `/owner/credit` | Add credit / pay or not | Pay A$X | Balance; amount; Credit, Fee, GST, Total; button | Legal text, treasury, daily close | Stripe Checkout |
| Settings `/owner/settings/*` | Change one thing / per row | Inline save | Grouped rows, destructive last | Advanced | Arc composition |
| Onboarding `/owner`, `/agent-access` | First paid call / next step | Next unchecked step | Connect agent; accept the prefilled A$5 a day budget; first call | Tour; collapses after the first receipt | GOV.UK task list |
| Admin inbox `/admin` | Clear what needs me / resolve, assign or snooze | Resolve the focused item | Rail; inbox; detail | Metrics, launcher | Linear inbox |
| Chat `/t/$threadId` | Get a result, with spend approved in place / approve | Approve inside its message | Messages with the result and receipt inline | Purchase form until asked | ChatGPT |

## Language
Web, CLI and MCP share one vocabulary, kept in `src/content/reason-copy.ts` and `src/content/brand-copy.ts`.

| Say | Never |
|---|---|
| Tool | capability, endpoint, listing, offering |
| Provider | Directory Host, publisher |
| Task | use case, need, bounded job |
| Ready / Listed | admitted, Routeable, readiness |
| Add to your agent | Connect an Agent, Set up to get a Quote |
| Try it | playground |
| 41 buyers on x402 · 30 days (hidden under 5) | Coinbase Bazaar calls |
| Credit | AUD Credit, wallet |
| Receipt | readback, evidence |
| aecon | Agentic Economy, AE (legal pages name the entity) |

**Price.** `formatCurrencyAmount` (`exact-amount.ts:182`) prints:
- AUD as "A$" with at least 2 decimals, trimming trailing zeros beyond that ("A$0.003", "A$5.00");
- other currencies as amount then code ("0.02 USDC");
- `--` when the amount is missing.

This replaces "AUD 0.012" and the em dash. Prices read "per call" and never include GST, which appears only in Credit line items. "from" appears only on tiles, provider pages and task headers. USDC appears only in receipts and JSON.

**Time.** Use only `format-time.ts`, and every function takes the account `timeZone`.
- Lists: relative time under 7 days (rendered after hydration), then "2 Jul 2026".
- Records: "2 Jul 2026, 1:14 pm" in `<time dateTime>`.
- Durations: "1.2s" (new `formatDuration`).
- Delete `formatUtcTimestamp` and both Perth functions.

**Banned.** Everything in the Never column, plus: assessed, coverage, scope, provenance, "ref" in prose, eip155, US$, sorry, invalid, "Not now", snake_case, em dashes, eyebrows, uppercase and Title Case. "x402" appears only on the first screen and on Listed tools.

**Availability.** One `AVAILABILITY` string in `brand-copy.ts`, shown once and first on every surface.

**Error formula.** What happened, then the money state, then one next step. The money states follow `callChargeStateSchema` (`call-contracts.ts:95`):
- "You weren't charged."
- "Charged A$0.003. Receipt: {url}"
- "Refunded A$0.003."
- For `outcome_unknown`: "We couldn't confirm the charge yet. Check the receipt before retrying: {url}"

Example: "Firecrawl didn't answer in {timeout}. You weren't charged. Try Jina Reader · A$0.002." `{timeout}` is the real call timeout (verify).

**Empty formula.** Why it is empty, then one next step: "No calls yet. Ask your agent to search for a tool."

Sample strings:
- "24 tools match 'weather'"
- "Not available through aecon yet. Call it directly over x402."
- "Couldn't save. Your limit is still A$5.00 a day."

## Agent surfaces
Names go in text and refs go in JSON (R25 to R29). The MCP server id becomes `aecon` (`mcp-api.ts:362`).

| Surface | Rule | Budget |
|---|---|---|
| MCP instructions (`src/lib/server/mcp-api.ts:52`) | 6 lines, absolute URLs, opens with "Search by task", states the timeout | 600 B |
| Context before the first call | Instructions plus tool definitions | Under 6 KB (now 37,858 B) |
| MCP success (`mcp-api.ts:230`) | One line (outcome, A$ price, excerpt, receipt), then the serialized `structuredContent` | 300 B line |
| MCP search | 3 results: name, provider, price, status, 3-line sample, exact call. Listed results are flagged in the text and by `access: "external_listing"` | 1.2 KB |
| MCP error (`src/modules/actions/contract.ts:292`) | `isError`, "title: detail", field, fix, request id, one `next`. Budget, credit and read-only (`mcp_toolset_required`) refusals give an absolute URL for a person to open. An expired quote returns the new price | 400 B |
| CLI `ae` | Readable by default; `--json`; A$ money, not "50 × 10^-2 USD" (`tools/ae/commands/call.ts:401`); suggests the next command; `--quote` pays the quoted price; retries reuse the inferred idempotency key and never charge twice (verify) | 24 lines |
| `/llms.txt` | Opens with "Search by task: POST /api/v1/market-tools/search"; static; never pages through the catalog or returns 503 | 2 KB first section, 8 KB total |
| Per-tool `.md` | Name, price, typed inputs, example, call | 3 KB |

## Hospitality behaviours
- **Failure (calls and Try it).** Keep the input. Say whether the input, the provider or a timeout caused it. State the money state. Offer the next pick at its price.
- **Try it.** The button reads "Try it · A$0.002" and pays from Credit. Signing in keeps the input. The starter credit amount is Joel's call.
- **Money.** Line items sit above a button that states the total. Never say money moved before Stripe confirms; poll and update in place. Changing the amount never locks the form.
- **Waiting.** Show the skeleton at once and a spinner after 300ms. Past 10s, say what is happening. Never show a full-screen loader.
- **First success.** Show the result and receipt in place, then one next step ("Set a daily limit"). Onboarding collapses.
- **Nothing matches.** Search the whole catalogue first. Then show the nearest task with its count, a broader search and "Tell me when one arrives" (`MarketSavedNeedAction`). If the person isn't signed in, they come back from sign-in with the request saved.
- **Search down.** Retry once automatically, because the D5 failures passed on retry. Then say "Search didn't finish. Your words are kept." with a Try again button, and keep showing the most-bought tools. `/status` reports search health.
- **Phones.** The install line becomes "Share link" (Web Share API, falling back to copy).
- **Returning.** Open on Your tools when something changed.

## Benchmarks it must move
Targets and baselines live in `docs/design-system/README.md`.

| IDs | Moved by |
|---|---|
| D1, D2 | First screen (3 tools on phones), `ToolListingCard` |
| D3 to D6 | S0, S2, the nothing-matches and search-down behaviours |
| D7, C1 | Tool template without redirects, Listed state, S2 examples |
| A1, A2 | Onboarding, Try it, first success |
| S1, S2, S5 | Skeletons, no full-screen loader |
| S3 | Clerk and Sentry off public pages |
| S4 | The call path, not design |
| R1, R2, R4 | Archetypes, language, `/aecon-audit` |
| R3, R9 | Price rule, oxlint `no-restricted-properties` |
| R5, R6 | Focus, status icons, motion and shadow tokens |
| R7, R8, R10 | Type tokens, `AeRecordTable` |
| G1, G2 | Agent surface budgets |

## Migration
Foundations go first. Only one editing agent touches a shared file at a time.

| Step | Work | Branch |
|---|---|---|
| Foundations (with S0) | Tokens, density, `arc-market.css` overrides, `motion-tokens.ts`, both formatters, DESIGN.md amendment, enforcement (below) | New `codex/design-foundations`; the other branches rebase on it |
| S0 search | Search errors, full-catalogue recall (the reranker caps at 24), automatic retry, `/status` search health, outage and no-match copy | `feat/public-surface` (UI), `feat/call-any-x402` (status copy) |
| S0 trust | Line items, "Decline", receipt block, money states, MCP text and errors, CLI money, `--quote` | `fix/payment-speed-trust` |
| S1 public | First screen, tool template without redirects, `ToolListingCard`, Listed state, one footer, availability string, glossary | `feat/public-surface` |
| S1 onboarding | `/agent-access` outage state, three-step list, named legal entity, email switches | `feat/journey-measurement` |
| S1 workspace | Density, `AeRecordTable` for the six admin tables (then delete Arc `sortable-data-table`), `/activity` and Reports, command palette, route skeletons | `feat/snappy-workspace` |
| S2 x402 | Ready status, an example for each Ready tool, shared reason copy, first-seen dates | `feat/call-any-x402` |
| S3 tasks | `/tasks` plus about 10 hand-written task pages, each gated on a Ready tool | New branch after public-surface |
| S4 try and compare | Try it; move `DirectoryComparison`, `chat/generative/ComparisonTable` and `chat/ToolCard` to `AeRecordTable`, then delete `AeComparisonTable`; show speed once 5 samples exist | New branch after S3 |

Enforcement in the Foundations step:
- oxlint `no-restricted-properties` catches formatter bypasses.
- eslint-plugin-better-tailwindcss 4.9, loaded through `jsPlugins`, bans shadows, `transition-all`, uppercase, arbitrary values, 600/700 weights and stray text sizes. Confirm it loads first.
- `npx impeccable detect` runs the deterministic checks.
- `.claude/skills/aecon-rulebook/` provides `/aecon-audit` and `/aecon-restyle`.

After S4 comes papercut Wave 3: provider workspace, chat, settings and the admin inbox.

## Decisions log
How each point was ruled where the second opinion (fidelity) or the third opinion (hospitality) differed from the draft. Corrections from checking the repo that neither opinion raised come after.

**Fidelity (second opinion)**
1. **Two primary actions on the Tool page.** Accepted. Ready tools get "Add to your agent", then "Try it" from S4. Listed tools get "Ask us to add it". Basis: R18, Principle 2, and discovery's "Not yet callable".
2. **Task page primary before Try it exists.** Accepted. The primary is "Add to your agent", naming the pick, until S4. Basis: the discovery second opinion puts S3 before S4.
3. **Chips need a taxonomy.** Problem accepted, fix changed. The chips are the existing `marketCategories` filtering locally. Fixed search queries would still send the label to the third-party ranker (papercut fix 10, `MarketLanding.tsx:58`).
4. **"41 buyers" is Bazaar data.** Accepted: "41 buyers on x402 · 30 days" (discovery second opinion).
5. **R1's `--ae-text-ui`.** Accepted. The spec now says the density scope replaces it.
6. **Missing rulebook items.** Accepted:
   - R13 shortcuts, and react-hotkeys-hook major 5 with the exact version pinned at install (verify).
   - R21's deletion of Arc `sortable-data-table`, which has 6 admin callers (verified).
   - eslint-plugin-better-tailwindcss, Impeccable, and the `aecon-rulebook` skill that creates `/aecon-audit`. That skill doesn't exist yet.
7. **S4 benchmark missing.** Accepted, as a target owned by the call path.
8. **Vendored Arc files.** Accepted: every Arc change is an override in `arc-market.css`.
   - `data-accent` stays unset rather than deleted. `foundation.css:121-155` only applies when the attribute is set, and nothing sets it.
   - The draft's note about deleting Arc's focus rule is withdrawn. `arc-market.css:8-17` already overrides `foundation.css:179` (DESIGN.md:40).
9. **Focus offset.** Accepted: 2px. Only `arc-market.css:10` uses 3px; the programmatic-focus rules already use 2px.
10. **Radii mapping.** Accepted, plus `--radius-surface`. The 18/26/34px values come from `foundation.css:63` and apply in `.arc-market` because nothing there overrides them.
11. **Motion tokens path.** Rejected. `lib/motion-tokens.ts` is a one-line re-export of `../motion-tokens`, so the root file is the source. Deleting the root file would break the 43 files that import `lib/`. The spec edits the root file and moves its 2 direct importers to `lib/`.
12. **`AeComparisonTable` and Compare.** Accepted. There is a third caller, `chat/ToolCard.tsx`. Deletion waits until all three callers move in S4.
13. **Perth timezone in `formatTimestamp` and `formatDate`.** Rejected as stated. `format-time.ts:24,28` are `perthTimestampFormatter` and `perthDateFormatter`, used only by the Perth functions the spec deletes. `formatTimestamp` and `formatDate` (`:52,57`) set no timezone and follow the runtime's. The account `timeZone` argument fixes that.
14. **USDC format.** Accepted: non-AUD amounts print "0.02 USDC". Today they print "USDC 0.02" (`exact-amount.ts:183`).
15. **MCP server id line reference.** Accepted: `mcp-api.ts:362`.
16. **File counts.** Accepted, and recounted as files that use each component, not counting the file that defines it. The opinion's figures included that file.
   - `AeComparisonTable` 3, `AeCopyValue` 1, `DirectoryToolCard` 4, `AeCapabilityTile` 1, `ui/table.tsx` 0.
   - `AeSortableDataTable` 4. It is an adapter over `AeRecordTable` (`AeSortableDataTable.tsx:5`).
   - Arc `sortable-data-table` 6.
   - Raw `<table>` appears in 6 vendored Arc or Arc Pro files. The screen-reader-only chart tables stay (`donut-chart.tsx:418`).
17. **`--ae-container` and `--ae-fg-subtle`.** Accepted. They equal `--ae-surface` and `--ae-muted-fg` in both themes (`globals.css:192-197,297-301`).
18. **Hover tint.** Accepted. Hover reuses the surface step that shadcn `--accent` already uses (R6, `globals.css:240,318`). The spec names the surface tokens instead of `--accent`, because `.arc-market` redefines `--accent` as Forest (`arc-market.css:58`).
19. **20px workspace title.** Kept, and marked as a decision.
20. **Missing archetypes.** Accepted:
   - Reports (papercut fix 15), on the new route `/owner/reports`.
   - `/tasks`.
   - For your agent.
   - Your tools, on the existing `/market?view=saved` (`market-route-data.ts:267`).

   Recipes stays out (discovery marks it Next).

**Hospitality (third opinion)**

21. **No example output.** Accepted: show the output fields and "No example yet". Changed: examples are gathered in S2, not S1, because nothing is callable before S2 (discovery second opinion).
22. **Cost of Try it, and sign-in.** Accepted (R10). The starter credit amount stays Joel's call (discovery, journey step 4).
23. **"Add to your agent" is undefined.** Accepted: a client switch. Codex is included because `brand-copy.ts` names it alongside Claude Code and Cursor.
24. **US$ hint next to prices.** Rejected. R9 allows one price format, and discovery bans US$. Whether to price AUD-first or globally is an open founder question (README). Showing GST only when buying Credit is accepted.
25. **Low counts.** Accepted: buyer counts are hidden under 5, the same k=5 floor that speed uses (`tool-latency.ts:3`). Partly accepted for Most used: the first-screen list is now the most-bought tools, so the separate rail goes instead of waiting for more data.
26. **Reason for our pick.** Accepted as a public ranking rule. "Placement is never paid" is not written as policy, because that is a commercial commitment for Joel. The stated rule leaves no room for paid placement anyway.
27. **MCP when nothing is callable.** Accepted, using the existing `access: "external_listing"` (`mcp-api.ts:246`) rather than a new `callable:false`.
28. **"Not charged" isn't always known.** Accepted: four money states, mapped to `callChargeStateSchema`. The "settle or refund within N min" promise is dropped because nothing in the code guarantees it (README: "Which promise is true today?"). The claim that a retry never charges twice is marked verify.
29. **Budget and read-only refusals.** Accepted (papercut agent item 2, `mcp-api.ts:603`).
30. **Quote changing under the agent.** Accepted (R26, R29).
31. **Timeout in the error example.** Accepted. The number is marked verify because no call timeout constant was found. S4 measured 86.8s at p95.
32. **One-sentence h1.** Accepted, worded so it is true before S2.
33. **Tool page redirects, phone fold and stacked compare.** Accepted.
34. **Install line on a phone.** "Share link" accepted. "Email me this" rejected, for the reason in 37.
35. **Jargon.** Partly accepted. The plainer Listed sentence is in. Banning x402 is rejected: builders are the current target users, and discovery keeps x402 on the landing and Listed tools. Ready and Listed already differ by icon and label, not by colour alone.
36. **Search down, Try it failing, and split availability text.** Accepted (D5 retry evidence; papercut theme 6, fix 9).
37. **"Tell me when one arrives" with only an email.** Rejected. It would add a new store of personal data while the legal pages name no entity or privacy contact (papercut fix 7), and per-email unsubscribe switches are still pending (fix 8). Instead, sign-in returns the person with the request saved; `MarketSavedNeedAction` already passes a redirect.
38. **A default budget.** Rejected. The rulebook keeps accepting a prefilled A$5 a day budget as an explicit step. Papercut theme 6 shows an implicit allowance already contradicting "You approve every purchase".
39. **Six statuses on public lists.** Accepted: public pages show tool statuses only.

**Repo corrections neither opinion raised**
- The ink wash runs at 220ms (`base.css:186-197`). No 260ms value exists, so DESIGN.md:385 is stale.
- Title tracking keeps the existing -0.025em (`globals.css:419`).
- Spinners now appear after 300ms and stay at least 500ms, inside the Vercel guideline (150 to 300ms delay, 300 to 500ms minimum). This replaces the draft's 400ms.
- `StaticDataRouteOption` is at `src/router.tsx:71`.
- DESIGN.md:90 rules out a global sidebar. `ui/sidebar.tsx` has no importer, so it is used only for the admin rail.
- The footers are now named: keep `AeSiteFooter`; delete `SignUpLegalFooter` and `StatusPageFooter`. The footer's `logo` variant is the only user of `--arc-gradient` (`site-footer.tsx:222`).
- `--control-height-sm` is 44px in `.arc-market` (`:76`) and 36px in `.ae-arc` (`:165`). All control heights map to the density value.
- The motion fix covers every duration and spring, not only `snappy` and `morph`, because the R6 baseline counts durations of 0.16 to 0.48s.
- `--radius-md` joins the deletes. The Tailwind namespaces must be cleared with `initial`, or Tailwind's defaults return.
- `AeToolPrice` defaults its label to "Total price" (`AeToolPrice.tsx:11`).
- The route state components are exported as `RouteError` and `OperatorRouteError`, not `AeRouteError`.
- `--ae-primary` is Charcoal today (`globals.css:202`), so a Forest primary button needs the token change.
- Done and Cancelled call statuses are added so every `callStatusStateValues` value has a label (rulebook Record archetype: "Done or next").

**Open for Joel**
- **Primary button colour.** The spec follows rulebook default 1 (Forest). The brand kit (p.15, per the saved brand notes) says primary actions are chalk or charcoal. Switching back is one token, `--ae-primary`.
- **Starter credit for Try it.** The amount is undecided.
- **Pricing currency.** AUD-first or global.
- **First-screen h1.** The wording needs your approval.
- **Brand name.** UI copy uses "aecon" only, and the legal entity's name appears on legal pages only.

---
Notes for the caller (not part of the spec):
- **Read-only run.** Nothing was written to `docs/design-system/spec.md`.
- **Word count.** The spec is 2,315 words not counting table pipes, or 2,369 counting every token except pipes. A raw `wc -w`, which counts each pipe, gives 2,719; the same count gives 2,544 for the previous draft.
- **Scratch copies.** `/private/tmp/claude-501/-Users-joelchan-Documents-Coding-App-Dev-live-01--Pre-Implementation-Agentic-Economy/f5f7123e-e2af-4469-8b1b-9930508c1636/scratchpad/spec-final.txt` and `decisions-log.txt` hold an earlier wording of the text above. Save the text above, not those files.
