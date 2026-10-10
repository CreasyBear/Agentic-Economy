# aecon design system run

This is a living file. It records the ideal outcome, the benchmarks we measure against, how we work, what changed, and the questions we still owe ourselves. It was started on 2026-10-10.

## Ideal outcome
A person, or their agent, arrives wanting to know what they can use. Within seconds they see real tools with names, prices and examples. They find one for their task, compare it with others, try it, and put it into their agent. Nothing on the way asks them to learn aecon's vocabulary, do aecon's bookkeeping, or guess what happens next. Every page follows the same rulebook, so the product feels like one calm tool. Money is always stated once and stated plainly. When a step fails, aecon says what happened, says whether you were charged, and gives one next step.

## Benchmarks
Each benchmark gets a baseline before anything is changed. Every change is re-measured against it. A blank baseline means it is not measured yet.

| # | Benchmark | Ideal | Baseline (date, source) | Now |
|---|---|---|---|---|
| D1 | Real tools visible on the landing page with no scrolling | 6 or more, with price | 0 (2026-10-10, live /market) | |
| D2 | Clicks from landing to a tool page with a price | 1 | 2 (2026-10-10) | |
| D3 | Common-task searches that return a tool you can quote and call now | 90% or more | 0% (second opinion, ae CLI); 25% of tasks show a ref, but every one is setup_required (first opinion, API); web UI (third opinion): 0 of 10. Web search errors on every query with "Search is unavailable", while the public API search answers. Three methods agree that nothing is callable now (2026-10-10) | |
| D5 | Search requests failing on first try | 0% | 3 of 20 returned 503 source_unavailable, then succeeded on retry (2026-10-10) | |
| D6 | Top result actually matches the task | 95% or more | 75% (2026-10-10, second opinion) | |
| D4 | Searches with zero callable results | under 5% | 100% callable-now (second opinion) | |
| A1 | Sign-ups reaching a first receipt within 7 days | 40% or more | not measured (journey branch adds the event) | |
| A2 | Median time from sign-up to first receipt | under 10 min | | |
| S1 | Public navigation, click to content, p50 | under 100 ms | 20 to 30 ms static; 480 to 560 ms /status and tools view (2026-10-10) | |
| S2 | Workspace navigation, click to content | under 300 ms, with no full-screen loader | about 1.8 to 3 s, full-screen "Loading workspace" (2026-10-10, coarse) | |
| S3 | JS shipped on first public load (compressed) | under 500 KB | About 1.11 MB in 163 scripts, 3.4 MB decoded (browser trace, agreed by two methods). Only 387 KB is referenced by the HTML; the rest loads at runtime: Clerk about 350 KB from clerk.aecon.ai, Sentry 144 KB, plus the motion-tokens and module chunks. On a public page with no sign-in, Clerk and Sentry are 45% of the weight (2026-10-10) | |
| S5 | Public LCP / CLS (median, cold) | under 1.2 s / under 0.1 | LCP 404 to 1,040 ms, CLS 0.015 or less; two methods agree (2026-10-10) | |
| S4 | Paid call to result, p95 | under 10 s | 86.8 s, one sample (2026-10-09) | |
| R1 | Rulebook violations per route (/aecon-audit) | 0 | 576 on main across 13 surfaces in the first pass. Per surface: agent surfaces 149 (second opinion 125, third about 69, because R17 is overcounted), /activity 73 (58 to 86), /tools 66 (third opinion agrees), /chat 45, /owner/credit 40, /admin 40, /providers 37, /calls 28, browse 26, settings 26, /agent-access 19, /market 18, /for-agents 9. Treat the total as about 450 to 580; the opinions disagree on R17 scope (2026-10-10) | |
| R2 | Banned words in user-facing copy (admitted, assessed, Routeable, readback, AE, raw enums) | 0 | Visible strings (AST, second opinion): admitted 15, assessed 9, Routeable 0, readback 2, "AE" 26, raw enums rendered 19. Grep line counts (first opinion) were inflated by identifiers. Rendered public pages (third opinion): Routeable, readback and assessed 0; "AE" 6 and "admitted" 3 across 11 pages; /developers/api shows 49 snake_case tokens and 41 em dashes. All three agree the banned copy is concentrated in tool pages, search states and signed-in surfaces (2026-10-10) | |
| R3 | Money and time formatted outside the two formatters | 0 | 80 in 45 files (2026-10-10) | |
| R4 | Audit findings open (papercut audit) | 0 high | 318 (2026-10-10) | |
| R5 | Accessibility violations (axe) on public pages | 0 serious | not measurable: @axe-core/playwright is not installed (2026-10-10) | |
| G1 | MCP context loaded before the first call | under 6 KB | 37,858 bytes for 3 tools (2026-10-10) | |
| C1 | Catalog listings with a human-readable title, specific description and example output | 100% | 70% titles, 80% descriptions, 70% examples (no callable tool has an example) (2026-10-10, first opinion, 20 items) | |
| G2 | Agent tool calls from task to result | 4 or fewer | | |

| R6 | Motion over 150 ms, bounce springs, shadows outside overlays | 0 | CSS durations 19; Arc motion tokens 0.16 to 0.48 s with bounce 0.12 and 0.16; box-shadow 33 files; shadow-* 24 (2026-10-10) | |
| R7 | Distinct font sizes in components | 2 per screen | 62 distinct CSS values from parsing; grep found 124 (2026-10-10) | |
| R8 | Table primitives in use | 1 | 4: AeRecordTable, Arc Sortable, ReUI DataGrid, raw table (2026-10-10) | |

| D7 | Tool pages a visitor opens that work | 100% | 93 of 100 in a census (88 directory listings, 5 operation pages). 2 redirect to "no longer current" because the redirect and the detail read check different things; 5 say "no longer listed" because the providers view links stale rows (2026-10-10) | |
| D8 | Browse can go past the first page | yes | no: view=tools shows 12 items and no next link (2026-10-10) | |
| D9 | Search API results carry a URL to the tool page | 100% | 0% (detailRef is JSON; sourceRouteRef URLs render "invalid") (2026-10-10) | |
| R9 | Price formats seen by visitors | 1 | 4: A$0.01, 0.02 USDC, 0.002000 USDC, "AUD spend" (2026-10-10) | |
| R10 | Font sizes visible on one page | 2 | up to 9, including fractional px values such as 116.64 and 19.44 (2026-10-10) | |

## Method
- **References over taste.** The rulebook is `docs/designs/aecon-rulebook.md`. Every page copies a named archetype (rulebook, Page archetypes). Every fix names its reference.
- **Discovery first.** The core user arrives to see what they or their agent can use. Personas, journeys and competitor patterns come from the discovery research.
- **Skills used:**
  - Arc (composition, checklist)
  - break-ui
  - emil-design-eng
  - cognitive-load-auditor
  - the better-* set
  - number-formatting
  - review-animations
  - Impeccable detect
  - poteto mode for every edit
- **Loop for each route:**
  1. Measure the baseline.
  2. Run /aecon-audit.
  3. Restyle to its archetype.
  4. Prove it by real use on the actual surface.
  5. Re-measure.
  6. Log the change here.
- **Safety.** Use worktrees. Make no commits or deploys without Joel, and no changes to money semantics or who can pay.

## Phases
| Phase | Status | Output |
|---|---|---|
| 1. Papercut and hostility audit | done | docs/strategy/papercut-audit-2026-10-10.md (local, untracked by policy) |
| 2. Rules and references research | done (draft) | docs/designs/aecon-rulebook.md |
| 3. Discovery personas and competitor study | done (first opinion; second and third pending) | docs/designs/design-system-discovery.md |
| 4. Design system spec (rulebook plus discovery IA, archetypes, tokens, language) | done (draft, two poteto opinions, opus reconcile) | docs/designs/design-system-spec.md |
| 5. Baseline measurement | done (each metric has second and third opinions) | the benchmarks table above |
| 6. Enforcement (tokens, lint bans, aecon-rulebook skill) | done on codex/design-foundations: implement, two opinions, fix; typecheck 0 verified by me | branch codex/design-foundations |
| 7. Full-application walkover, one persona journey per agent | done: 7 journeys, each with second and third opinions | docs/designs/design-system-walkover.md |
| 8. Restyle waves, route by route, measured | blocked on merges: 7 branches are uncommitted and level with main | |
| 9. R1 baseline with /aecon-audit on main | done (first pass plus two opinions on the 3 worst) | the R1 row above |

## Change log
- 2026-10-10. **Incident found while baselining:** production web search fails for every query, but the API search works and /status reports discovery as Operational. Root cause: `market-tool-search.functions.ts:14` called `new Request(request, { signal })` on srvx's NodeRequest and threw "reading 'window'". It came in with e17ad5950 on 8 Oct. Two methods confirmed the cause. The hotfix branch `hotfix/server-fn-request-wrap` adds a `withSignal` helper that rebuilds the request from its parts, GET only, at both sites. The test fails before the fix and passes after (84/84), typecheck is clean, the second-opinion review approves, and the third-opinion built-server proof shows 0 window throws, down from 1 and 3. The fix has not been deployed; Joel deploys it. Tool pages showing "Tool unavailable" had a separate cause: the slug route redirected whenever a publication existed, but the detail read applies stricter checks. Fixed on the same hotfix branch by redirecting only when detail returns found, otherwise showing the directory listing. The test fails before the fix and passes after (85/85 across the three files), and review approves. Open cost: found slugs read detail twice, more on hover preload; trim later. Proving the found branch needs a real Convex deployment.
- 2026-10-10. Started the run. The rulebook draft applies four defaults while Joel is away:
  - Forest as the primary colour
  - two type sizes per screen
  - one overlay shadow
  - mono uppercase retired

## Skill fixes found by use
- The rulebook and design-system docs live in docs/designs/, the only tracked docs path for designs; the aecon-rulebook skill points there.
- R17 now carries a scope (visible copy only, never identifiers) in the skill on codex/design-foundations. Fixed 2026-10-10.

## What aren't we asking?
- **Do the 20k listings work?** Discovery is only as good as the catalog. How many are callable today, return a sensible result to a sample input, and have a human-readable title and description? Catalog quality may matter more than page design.
- **What do people actually search for?** We have no query log analysis. Journey events add `search_observed`. Until then, task pages are guesses.
- **Who are the users today?** How many real visitors, sign-ups and agents connected in the last 30 days? Have we watched five real people try to find a tool?
- **Is the web the main discovery surface at all?** Agents may discover through MCP and llms.txt more than people browse /market. Which surface gets the investment first?
- **Do discovery pages get found?** Use-case and tool pages are search-engine landing pages for competitors (treg, Locus). Do aecon tool pages have titles, descriptions and indexable content?
- **What does a provider see?** If a tool listing is wrong or ugly, can its provider fix it, and do they know it is listed?
- **AUD-first or global?** Locus and treg price in USD. Does AUD help or confuse a non-Australian builder?
- **What breaks when the catalog doubles?** Search ranking, category counts and page weight at 40k listings.
- **Which promise is true today?** Every headline claim needs a live check before it ships.
- **What do we stop doing?** Each new archetype should delete a page, a component or a word.
