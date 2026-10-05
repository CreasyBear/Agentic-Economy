> **Archived 5 October 2026.** Dated evidence or proposal; not a current work queue or approval. See the [archive index](../../../README.md) for its successor and remaining limits.

# Maturity decisions — Joel, 27 September 2026

Authoritative product decisions for the group cycle. They override recommendations in `00-decision-brief.md` where they differ. Every `Gn-design.md` must conform.

## Standing directive: confident product

Position AEcon as a confident application. Do not add hedging copy, speculative caveats or edge-case states that box the product in. Add a state, warning or refusal only when it protects money, authority, data or a truthful outcome the user acts on. Prefer the simplest behaviour a mature product ships.

## Standing directive: minimise fragility (28 September 2026, supersedes conflicts)

Joel's remit now that the app is mostly stable: **eliminate fragility and minimise the number of things that can take the app down.** Hedging and defensive states make the app more fragile; remove them. Rules:

1. A core journey depends only on Convex, the signed-in identity where required, and the Provider being called. Everything else (Jev/OpenRouter ranking, FX refresh, directory scans, analytics, model answers) is an enhancement that fails open to deterministic behaviour.
2. Search never returns `unavailable` because a ranker or external index is down; it returns deterministic retrieval results. This replaces the X2 "ranker outage = unavailable" clause. `unavailable` is only for Convex being unreachable.
3. Money: use the last good persisted FX rate within a bounded age rather than refusing a Quote when the live rate fetch fails.
4. One failing query or widget never takes down a page; boot never depends on optional services or seeds.
5. Delete defensive branches, states and copy that exist only to hedge; fewer code paths is the goal.

## Cross-cutting decisions

| ID | Decision | Consequence for design |
|---|---|---|
| X1 Shortlist | **The x402 Bazaar stays in AE search.** It resolves cold start and gives AE its initial credibility. Do not cut it or banish it to a side directory. Make the catalogue **navigable** without dumping everything into one giant response. | Design a rationalised search: bounded, compact results that are navigable (e.g. classification, facets, pagination, compact list → describe on demand). Jev (TypeSafe, `src/modules/decision-engine/jev-client.ts`) may classify, preferably precomputed at index time per the ADR 0003 experiment finding ("favour work replacement or precomputation; reject additive hints"). Callability stays visible per row. Remove the duplicate `groups` dump from canonical results. |
| X2 No-match | **Separate states.** No-match only after an exhaustive assessment; a scoped result says what was assessed and offers continuation; ranker outage is unavailable/retry, never a match or no-match. CLI and MCP plain text render the same `next` as JSON. | |
| X3 Unmet need | **Keep it simple and confident.** No hedgy edge-case machinery. | On an honest no-match, offer one clear "save this need" action where the caller is signed in or connected. No elaborate consent/alert/retention variants unless required for money, authority or data. |
| X4 Money display | **x402 is priced in USDC; the user sees AUD (or their default currency), converted immediately and rounded up.** | Buyer-facing prices and amounts show converted AUD rounded up to the displayed precision (sub-cent shows `A$0.01`, not `<A$0.01`). USDC is source/settlement detail, not the buyer's price. Exact amounts remain in money records, receipts and exports; totals are computed from exact values, then rounded up for display. |
| X5 Data disclosure | **Name recipients at entry.** Disclose the verified ranking recipient at the search box and the Provider/input recipient before Quote. | Keep copy short and factual (confident directive). |
| X6 Release scope | **Public paid purchase at entry release.** Anyone can connect, fund, Quote and Call after eligibility. | Requires a hosted CLI archive with provenance (PC-06), setup docs that match reality (PC-21, PC-32), and paid-path proof before launch. |
| X7 Need mode | **Select + typed continuation.** `kind: need` selects the Tool and returns its missing input fields; the caller supplies exact inputs; a fresh exact-input Quote follows. **No invented inputs, paid or free.** | Remove free-need input invention (timezone, default dates). |
| X8 Authority states | **Explicit states:** known / unset / unavailable / expired, derived on read and rechecked on write. Expired approvals leave the actionable list and stay in audit history. | |
| Per-group | **Adopt the familiar-default recommendations** in `00-decision-brief.md` §2–4, adjusted for the decisions above. Designers flag only items that prove contentious. | |
| G4 Support | **Prefilled email carrying the CallRef.** Fix the broken link; Help opens email with the Call reference. No case table, no admin inbox. | Cut G4 S1/S2 durable support case. |
| G7 CLI release | **Separate public release repository** hosts CLI releases, checksums and attestations built by CI from the private source. Source stays private. | Keep the current deploy archive until the public release is live and verified as an outsider; then cut over in one revision. |
| G1 owner | **This orchestration takes over G1** in the existing `well-16/discovery-truth` worktree, adopting the in-flight diff as baseline. | |
| Design review | Must-fixes and scope cuts in `00-design-review.md` §1–3 are adopted: G8 standalone exact-case Search deferred (paging with row links first); G5 shows accrual/transfer facts and "payout not yet observed", no bank-payout ingestion; G3 public paid-path copy lands only with release proof; G2 A formatter precedes any priced G1 row. | |
| G6 saved data | **No browser-save import.** Pre-launch, no backward compatibility: account-bound Saved Tools replace browser-local storage outright; delete the old localStorage document code. Web Save uses the signed-in owner's session authority, never a synthetic key. Save rechecks the same scope before writing. | Drops G6 design item 5. |
| G7 provenance | **Sigstore cosign keyless signing** from the private repo release workflow (public-good Fulcio/Rekor) plus SHA256SUMS, published to `CreasyBear/aecon-cli` Releases. GitHub private-repo artifact attestations are Enterprise-only and not used. The `aecon` GitHub name belongs to another user, so the release repo is `CreasyBear/aecon-cli` (transferable to an org later). | |

## Rebuild decisions — 29 September 2026 (from `docs/reviews/rebuild/00-quiet-things.md`)

| ID | Decision | Consequence |
|---|---|---|
| R1 Front door | **Chat first.** People don't know x402; AEcon's job is to filter for them. | Chat must be fast and reliable: deterministic retrieval shows suitable, callable Tools immediately; the model explains and narrows; Quote/Call happen inline. Market search stays as browse. |
| R2 Money | **Prepaid purse.** AE never holds user funds as custody; buyers hold a prepaid AUD balance. Providers are paid on-chain from AE's custodial treasury wallet. **GST is charged only at top-up, at 10% of (loaded amount + service fee)**, added on top, as OpenRouter does (A$10 + A$0.80 fee + A$1.08 GST = A$11.88). No GST at Call time. | One tax rule everywhere (Checkout, ledger, receipts, CSV). Delete post-paid invoice logic, Stripe Connect payouts, auto-recharge, second charge lane, payable subledger. |
| R3 Supply | **x402 URL + payee proof only** at alpha. All Bazaar listings stay searchable. | Delete OpenAPI, MCP and Agent Plugin source types and duplicate price/environment choices. |
| R4 Admin | **Keep the admin console.** | |
| R5 Shrink | **Prune in place** along the paid journey. | Replace a component only when it can't be shrunk safely. |
| R6 Data path | **One query path**: `convexQuery` + TanStack Query (Convex TanStack Start template). | Server functions only for non-Convex or secret-only work. |
| R7 Folder rules | **Contracts/view-model files only where earned** (money, authority, shared UI boundaries). | Collapse one-off contracts, view-models and nested component folders that copy query types. |
| R8 Process | **Keep only protective checks**: payment, security, authz, import-boundary, Convex fences and journey behaviour tests. | Delete wording pins, exact count/size pins, duplicate rulebooks and registers. Simple hard limits (e.g. 1,000-line file ceiling) can stay as rules, not exact pins. |
| R9 Vocabulary | **Fewer than 12 public nouns.** Buyers never see Offering, Publication, Contract or Grant. | UI and API copy use the smallest buyer vocabulary; stored IDs unchanged. |
| R10 Agent surfaces | **One action schema behind HTTP; MCP and CLI are thin clients.** | Keep CLI-local connect/doctor and MCP framing; delete duplicate name/admission/envelope maps. |
