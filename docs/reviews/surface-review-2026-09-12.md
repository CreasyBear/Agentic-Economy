# Surface review register, 2026-09-12

Scope: five lens reviews run 2026-09-12 against production `https://app.aecon.ai` and the local operator console (customer, operator, agent, interaction, data). This register consolidates all five into one list of findings with ids `SR-001` onward. Duplicates found across lenses are merged into one row, with both lenses named.

Disposition values:

- `fix now (batch 1)`: assigned to one of three agents working this week.
- `fix next`: real, queued, not blocking launch.
- `distillation decision`: belongs to the catalogue eligibility lane (Lane 1).
- `index completion`: resolves once the x402 directory index finishes its first generation.
- `discuss`: needs a product or scope call before it becomes a fix.

## Register

| id | lens | surface | severity | finding | demand | effort | disposition |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SR-001 | Customer | Market home | P1 | Default browse is 100% Ethereum RPC primitives on the first screen (02-market-desktop.png); no business-relevant default or curated view | High | High | future ICP |
| SR-002 | Customer | Tool page | P1 | Tool page blocks roughly 10.9s behind "Checking the current capability..." before rendering; should render cached metadata and run the check asynchronously | High | Medium | fix now (batch 1) |
| SR-003 | Customer | Tool page CTA | P1 | Tool CTA only copies raw `operation:v1` hex plus "Settlement: eip155:8453"; no "Connect your agent" step, no human labels, dev ids not behind disclosure | High | Medium | fix now (batch 1) |
| SR-004 | Customer + Operator | /for-agents, /agent-access | P1 | Both the customer-facing /for-agents page and the operator /agent-access page are 100% terminal commands (for example `codex mcp add`); no non-developer path is offered first | High | High | future ICP |
| SR-005 | Customer + Data | Market network filter; AeToolEconomics.tsx:37; tool-inspector-model.ts:72; AeToolContractSections.tsx:199 | P1 | Network shown as raw CAIP ids in the market filter (`eip155:8453 (14,298)`, `cosmos:noble-1`, `algorand:...`) and inconsistently on the tool page (two raw, one via `formatPaymentNetwork`); should always use the existing formatter and display names | High | Low | fix now (batch 1) |
| SR-006 | Customer | Search | P2 | Typo "balnce" returns no results and no suggestion | Medium | Medium | fix next |
| SR-007 | Customer | Market pagination | P2 | Next-page URL is a roughly 400-character hex cursor; Back was observed to restore scroll in this flow | Low | Medium | fix next |
| SR-008 | Customer | Sign-in | P2 | Sign-in copy "you'll return to your account settings" is shown when arriving from Market; should be context-aware | Medium | Low | fix now (batch 1) |
| SR-009 | Customer | Market, mobile | P2 | Saved tab missing on mobile | Medium | Medium | fix next |
| SR-010 | Customer | Tool card | P2 | Card trust line "Used recently by other agents" shows while the detail page shows Completed calls 0, Unrated; suppress the line when the count is zero | Medium | Low | fix now (batch 1) |
| SR-011 | Customer | Market header | P3 | "14,541 Tools in the catalogue" headline stays fixed during search; should distinguish catalogue total from matching count | Low | Low | fix next |
| SR-012 | Customer | Tool page | P3 | H1 "Chain Erc20 Balance" does not match card title "ERC20 token balance for any Ethereum wallet"; needs one title | Low | Low | fix now (batch 1) |
| SR-013 | Customer | Market sort | P3 | Only three sort options are available; broader sorting depends on how the catalogue is distilled | Low | Medium | distillation decision |
| SR-014 | Operator | Mobile sidebar, all pages | P1 | Mobile sidebar toggle overlaps page headings, for example "Operations" reads as "rations" (mobile-offerings.png) | High | Low | fix now (batch 1) |
| SR-015 | Operator | Global search; Add Tool; owner console copy | P1 | Two buttons both read "Find Tools" (global search and the Add Tool submit), and "Discover capabilities" is used elsewhere for the same action; needs one label | High | Low | fix now (batch 1) |
| SR-016 | Operator | /owner/offerings | P2 | "Create provider workspace" failed; the retry copy said "before repeating a Call" (wrong context) and no local-preview banner was shown | High | Medium | fix now (batch 1) |
| SR-017 | Operator | /owner/offerings/new | P2 | Visiting before a provider exists dead-ends with prose only; no CTA to create a provider first | Medium | Low | fix now (batch 1) |
| SR-018 | Operator + Data | Owner credit; exact-amount.ts:180; AeOwnerCredit.tsx:121 | P1 | Credit balance shows "AUD 0.000000" directly above an input showing "10.00"; needs the one money formatter used everywhere | High | Medium | fix now (batch 1) |
| SR-019 | Operator | Owner console source tabs | P2 | Source type tabs (OpenAPI/MCP/Agent Plugin/x402) are unexplained | Medium | Low | fix next |
| SR-020 | Operator | Owner console under bypass | P3 | "Sign in" is shown while already inside the owner console under the dev bypass | Low | Low | discuss |
| SR-021 | Operator | Owner credit empty state | P3 | Credit empty state carries roughly 2250px of padding | Low | Low | fix now (batch 1) |
| SR-022 | Operator | Owner settings | P3 | Settings page is mostly "Review at source" links rather than native settings | Low | Medium | discuss |
| SR-023 | Operator | Security history | P3 | Shows raw `prn_`/`crd_`/`sha256` ids and ms-epoch timestamps | Low | Medium | fix next |
| SR-024 | Agent | SKILL.md, MCP instructions | P1 | Point to docs/glossary.md, which 404s | High | Low | fix now (batch 1) |
| SR-025 | Agent | llms.txt worked example | P1 | `ae search "weather forecast"` returns `no_candidates`; depends on catalogue coverage for that query | High | Low | index completion |
| SR-026 | Agent | llms.txt step 3 | P1 | Lacks method and URL for `tool.quote` | High | Low | fix now (batch 1) |
| SR-027 | Agent | MCP refusals | P2 | Bare prose (for example "MCP error -32602") with no code or next action | Medium | Medium | fix next |
| SR-028 | Agent | Input validation | P2 | Empty, missing and wrong-type query all return the identical `{"code":"invalid_body","detail":"Invalid input"}` | Medium | Medium | fix next |
| SR-029 | Agent | `ae compare` | P2 | Aborts the whole call on one unknown ref rather than reporting partial results | Medium | Medium | fix next |
| SR-030 | Agent | Freshness headers | P2 | `freshness.staleAfterMs` is 3h but `Cache-Control` is `no-store`; the two should agree | Medium | Low | fix now (batch 1) |
| SR-031 | Agent | Rate limiting | P2 | No rate-limit headers are returned | Medium | High | fix next |
| SR-032 | Agent | MCP schemas | P2 | Schemas lack examples; the malformed toolRef error omits the expected pattern | Medium | Medium | fix next |
| SR-033 | Agent | tools/list | P3 | Response is 5.7KB with repeated Boundaries text | Low | Low | fix now (batch 1) |
| SR-034 | Agent | CLI vs docs vocabulary | P3 | CLI says "job", docs say "capability phrase" | Low | Low | discuss |
| SR-035 | Agent | Error codes | P3 | Casing is inconsistent: `tool-ref-invalid` vs `query_invalid` | Low | Low | fix next |
| SR-036 | Interaction | Buttons, button-variants.ts:8 | P1 | `buttonVariants` sets `outline-none` with no `focus-visible` outline; plain Buttons show no visible focus ring | High | Low | fix now (batch 1) |
| SR-037 | Interaction | /owner/offerings, AeProviderWorkspace.tsx:382 | P1 | ProviderOffboardingCard calls `useReverification` unconditionally outside ClerkProvider under bypass, crashing the page locally; needs the same guard already used on /owner/settings | High | Medium | fix now (batch 1) |
| SR-038 | Interaction | Route navigation | P2 | Back does not restore scroll (y=1028 to 51) despite `scrollRestoration` being set | Medium | Medium | fix next |
| SR-039 | Interaction | Route navigation | P2 | No focus move or live-region announcement on route change; `activeElement` stays `body` | Medium | Medium | fix next |
| SR-040 | Interaction | Category filter | P2 | Resets scroll to 0 with a full skeleton on every change | Medium | Medium | fix next |
| SR-041 | Interaction | Loading states | P3 | Generic skeleton runs 1.5-2.5s and the old h1 lingers | Low | Low | fix next |
| SR-042 | Interaction | Tab swap | P3 | Transient duplicate id `main-content` appears during tab swap | Low | Low | fix now (batch 1) |
| SR-043 | Interaction | Search input | P3 | No clear button on the search input | Low | Low | fix next |
| SR-044 | Data | Tool page price, display-price.ts:13-17 | P1 | Price "About A$0.006943" shown to 6dp; the formatter never caps decimals; should show 2dp or "<A$0.01" | High | Low | fix now (batch 1) |
| SR-045 | Data | Card vs tool page price | P1 | Card shows "0.005 USDC", page shows "About A$0.006943"; the two are unlinked and should be shown together | High | Medium | fix now (batch 1) |
| SR-046 | Data | Activity, activity.tsx:147,196,293,302 | P1 | Builds `AUD ${formatExactAmount}` ad hoc in four places instead of using one formatter | High | Medium | fix now (batch 1) |
| SR-047 | Data | Tool ref display, AeToolIdentity.tsx:26; AeToolContractSections.tsx:184; AeToolPosition.tsx:42 | P2 | toolRef shown three ways (bare, "reference", "Tool reference"); needs one label with copy | Medium | Medium | fix now (batch 1) |
| SR-048 | Data | Timestamps | P2 | Three conventions in use (UTC suffix, `toLocaleString`, time-only); needs one absolute format with timezone | Medium | Medium | fix next |
| SR-049 | Data | Activity tiles | P3 | Tiles show "—" beside "No calls yet"; redundant empty-state signal | Low | Low | fix next |
| SR-050 | Data | Token amounts | P3 | Token order is inconsistent, amount-first vs symbol-first | Low | Low | fix next |

## Batch 1

23 items, split across three agents.

**Agent A: UI chrome** (SR-008, SR-010, SR-014, SR-021, SR-036, SR-042)
Sidebar overlap on mobile, focus ring on plain Buttons, duplicate `main-content` id on tab swap, sign-in copy, trust-line suppression, credit empty-state padding.

**Agent B: money, refs, tool page** (SR-002, SR-003, SR-005, SR-012, SR-018, SR-044, SR-045, SR-046, SR-047)
One money formatter everywhere (price 2dp cap, card/page price linkage, credit zero display, activity string building), one network-name formatter, one toolRef label, the tool page loading block and title mismatch.

**Agent C: agent surfaces and operator forms** (SR-015, SR-016, SR-017, SR-024, SR-026, SR-030, SR-033, SR-037)
"Find Tools" label collision, provider workspace creation failure and copy, offerings/new dead end, glossary 404, llms.txt step 3, freshness/cache header mismatch, tools/list bloat, and the /owner/offerings crash under bypass.

## What a PM would insist on before launch

- One money formatter, used everywhere: price precision, card/page price linkage, credit display and activity strings currently disagree in at least five places.
- A non-developer path to connect an agent, before the CLI-only pages ship: /for-agents, /agent-access and the Tool CTA are all terminal-command-only today.
- The Tool page must not block behind an 11-second spinner, and must lead with human labels, not raw hex ids and CAIP network strings.
- Baseline interaction correctness across the whole app: a visible focus ring, no local crash on /owner/offerings, and a mobile sidebar that does not overlap headings.
- Agent-facing docs and endpoints must be internally consistent: no dead links, no identical error bodies for different bad inputs, and worked examples that actually return results.

Revised 2026-09-12: the immediate ICP is agent builders and developers; CLI and MCP first is the intended experience, so non-developer-path items are parked.

## Passing

- Pinned header holds position correctly.
- Reduced motion is respected.
- Contrast meets AA (5.61:1 and 6.20:1 measured).
- Tabs support arrow-key navigation.
- Drawer traps focus correctly.
- Sidebar state persists (cookie-backed).
- Search relevance is sound for well-formed queries.

## Platform completion audit (2026-09-12)

Scope: six lens audits (architecture, Convex, security, frontend, code quality, contracts) plus three source traces, run today across the whole platform, not just the surfaces above. This section is a register of the verdicts, what was fixed today, and what remains open.

### Verdict by lens

| lens | verdict |
| --- | --- |
| Architecture | Boundary law real, 0 exceptions. Rot was concentrated: storefront dead module, legacy routes, vocabulary leak ("offering" occurs 3,654 times). |
| Convex | 364 functions, 90 tables, mechanically clean: no unbounded scans, validators in place, batching used. Semantic gaps were schema-only tables, a dead aggregate, untyped env reads, missing return validators, uncalled public functions. |
| Security | No exploitable findings; hardening only. |
| Frontend | Solid bones, accreted skin: two market trees, 14 components over 300 lines, thin route boundaries, no code splitting. |
| Code quality | Strict TS, zero real `any`/`ts-ignore`, 18 `.mjs` files, 12 unused deps, Convex tsconfig weaker than the app's. |
| Contracts | "One registry, three surfaces" holds for 36 of 40 actions. |

### Fixed today

| id | area | fix |
| --- | --- | --- |
| PA-01 | Architecture rot | Storefront module deleted; 56 legacy files pruned with deprecated exports and Autumn/Novu remnants; Stripe Connect and MCP OAuth return URLs repointed off the deleted route; dead `#tools` anchor removed (12 sites). |
| PA-02 | Frontend robustness | Shiki lazy-loaded; error/pending boundaries added on funding and landing routes; duplicate formatter removed; AeAgentOperatorConsole split into 7 files (each ≤300 lines); AeSupplySourceNativeStart split into 8 files; AeProviderWorkspace split into sections. |
| PA-03 | Market consolidation | `/market` consolidated onto the directory tree; AeMarketPage, Toolbar, ComparisonView, AeToolCard, AeCompareTray deleted (1,395 lines); Provider listings rail added; card slug fallback added; canonical `/tools/<host>/<slug>` now used in describe output and the CLI `Page:` line. |
| PA-04 | Code quality / deps | `@clerk/backend` made an explicit dependency; 8 unused deps removed; alias exports collapsed; 12 `.mjs` files migrated to `.ts` (hook tested); Convex tsconfig strictness aligned with the app. |
| PA-05 | Convex semantic gaps | Eligibility rule enforced on the admitted registry (Provider-owned exempt, fails open when no directory row); migration ordering enforced in code; missing telemetry set to default-deny; 64-char index names shortened; schema-only tables deleted (Package 7 reintroduces recovery tables when built); dead aggregate unmounted; 13 env reads typed; return validators added; 9 uncalled functions deleted; reason copy type-safe for all refusal unions; Convex bundle break fixed, with a node-only boundary test enforcing that shared modules import `degrade-backend`. |
| PA-06 | Contracts / API consistency | `market-requests` rate-limited with an `mcp-anonymous` scope; `registry.list` and `services` actions registered HTTP-only with common pagination; `NO_DATA` casing fixed; `supply disconnect` fixed; one idempotencyKey schema (min 8, max 200) replacing 13; funding return actions fixed. |
| PA-07 | Auth / UX | Sign in gated by Clerk `Show`; `UserButton` now shown for all roles. |

### Open, owner decision or next sprint

| id | item | status |
| --- | --- | --- |
| PA-08 | "offering/service/capability" rename debt on public surfaces | next sprint |
| PA-09 | Incremental directory upsert: count-equality guard rarely fires on a live directory; weekly cadence is the cost cap | owner decision |
| PA-10 | One read model for the market including Provider-owned Tools (rail is the interim) | owner decision |
| PA-11 | Credit query stubs in `convex/moneyLedger.ts` return a fixed refusal | feature gap |
| PA-12 | AeOwnerProviderConnections container remains 574 lines | next sprint |
| PA-13 | No component-level tests | fact, not a proposal |
| PA-14 | OpenAPI for HTTP v1 from the zod contracts | next sprint |
| PA-15 | The four external readiness items | owner decision |
| PA-16 | `api.v1.services` noun | owner decision |

### Verdict

Is the platform engineered? Foundations, yes: the boundary law holds with zero exceptions, and the mechanical layer (Convex, security) was already clean. Today's work removed the accreted layer (storefront, legacy routes, duplicate market trees, 56 dead files) and turned soft conventions into enforced code (eligibility, migration ordering, telemetry default-deny, the module boundary test). Remaining debt is named and bounded, not hidden: a vocabulary rename, a handful of owner-decision items, and one feature gap in credit queries. Production rollout is gated only by the Convex re-enable and the commit decision, nothing else.
