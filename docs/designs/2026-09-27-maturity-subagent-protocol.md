# AE maturity delivery protocol

**Status:** revised working protocol, 27 September 2026  
**Authority:** [PRODUCT.md](../../PRODUCT.md), [START_LINE.md](../../START_LINE.md), [IMPLEMENTATION_ROADMAP.md](../../IMPLEMENTATION_ROADMAP.md)  
**Input:** [papercut register](../reviews/2026-09-26-papercut-register.md)

## Principle

Implement a coherent customer outcome in source, prove it locally, then spend one preview build to revalidate the whole milestone on a pinned revision. A papercut is evidence of friction, not a unit of deployment. The work serves the six buyer and Provider journeys in PRODUCT.md; managed x402 supply is the entry release.

The old per-case investigation and preview loop caused checkout proliferation, repeated configuration work and build spend before the source change was complete. Retire that loop. Do not create a worktree, PR, preview deployment, fixture or three-agent wave for each register row.

## Value gate

AE is roughly 85% mature. The remaining work rounds out application behaviour so Joel has a maintainable system to sell. A change ships only when it makes AE measurably **safer, more performant, more ergonomic, more intuitive or more maintainable**, and the design names which one with evidence. A change that improves none of these is dropped, however tidy. Deleting a surface, path or option is a valid and often preferred outcome.

**Be mature before unique; be familiar before unique.** The default behaviour is the pattern mature products converge on. AE deviates only for a written reason rooted in AUD money, authority, the Tool/Quote/Call contract or x402 settlement. The status quo gets no presumption of correctness: a working behaviour that a mature product would not ship is a finding.

**Confident product.** AEcon presents as a confident application. No hedging copy or speculative edge-case states; add a warning, state or refusal only when it protects money, authority, data or a truthful outcome the user acts on. Joel's product decisions for the cycle live in `docs/reviews/maturity/00-decisions.md` and bind every design.

## The group cycle

Work proceeds by **register group** (G1–G8), never by single papercut. A group's findings are traced, referenced, questioned, designed and implemented as one coherent change; small papercuts on the same source path join it. Each phase has one output file under `docs/reviews/maturity/` and a named owner.

| Phase | Owner | Output | Exit condition |
|---|---|---|---|
| 1. Behaviour census | worker, read-only on source | `Gn-census.md` | Every PC in the group traced on current `main` across every affected surface (web, chat, HTTP, MCP, CLI) with `path:line`, tests and a root class. Stale register claims marked. Cross-group shared boundaries listed. |
| 2. Reference study | worker, web + local donors | `Gn-reference.md` | For each behaviour, how 3–5 named mature products do it, cited to official docs. The familiar pattern stated, plus the AE-specific reason to differ, if any. |
| 3. Hard questions | root | decisions from Joel, recorded in `Gn-design.md` | Every product decision that source and references cannot settle is put to Joel, including challenges to current behaviour. Nothing is assumed. |
| 4. Design | root, optionally one design worker | `Gn-design.md` | Per PC disposition: **fix**, **redesign**, **delete**, **accept as designed** (with reason) or **blocked on fixture**. Contract for consequential logic, value-gate line per change, deletions, disjoint implementation slices with owners and verification. |
| 5. Implement | workers on disjoint slices | source + code-adjacent tests | Slice verification passes; no slice edits another's files. |
| 6. Integrate and verify | root + one read-only reviewer | register rows updated | Combined diff reviewed for duplicate logic, contract drift, speculative abstraction, accessibility, performance, security. Local probes on a real admitted x402 Tool; `npm run gate` once. Then preview acceptance below. |

Rules:

1. **Census before reference, reference before design.** Phases 1 and 2 may run in parallel; design never starts without both.
2. **Root classes** for every finding: absent supply, ranking, uncallable supply, presentation, contract gap, authority, money record, external configuration, documentation. Two PCs with the same class and source owner are designed together.
3. **Hard questions are surfaced, not answered by workers.** A worker that meets a product decision records it as a question with the options and the reference evidence, then continues.
4. **Workers never redesign the product**, alter the register, create branches, worktrees, deployments or credentials, or touch files outside their slice. Only the root updates the register.
5. **One isolated checkout per active implementation group** when the shared checkout is dirty or another session owns overlapping files. Census and reference phases are read-only and need no checkout.
6. **Tests follow the repository's forward-implementation rule:** behavioural tests that catch plausible consumer-visible regressions, colocated where the pattern exists. No new verify scripts, receipts or gates.
7. **Worktree hygiene for workers.** In the omp harness, `read`/`edit`/`write` relative paths resolve to the main checkout regardless of bash `cwd`; every worker brief must require absolute worktree paths. Symlink `node_modules`, `.env.local` and `.convex` from the main checkout into each worktree. Convex codegen needs the local backend and is only required when a `convex/*.ts` root module is added, removed or renamed; the root runs it once at integration.
8. **Local verification only until 1 October 2026.** GitHub Actions minutes are exhausted; push-triggered workflows (Kernel release gate, React Doctor) are disabled. Acceptance is the local `npm run gate` plus a local live stack. Push only to merge finished groups, never to obtain CI.

Reference work is targeted. When desired behavior is unsettled, read current official product, protocol and SDK documentation, then maintained examples and a safe live task. Do not run a broad competitor study when the existing contract answers the question. Starting references: [OpenRouter server tools](https://openrouter.ai/docs/guides/features/server-tools/overview), [Locus](https://docs.paywithlocus.com/wrapped-apis/for-agents), [Nevermined MCP](https://nevermined.ai/docs/integrations/mcp), [MCP](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization), and the group reference sets below.

### Group reference sets

| Group | Mature references to mine first |
|---|---|
| G1 Find | Algolia search and no-results guidance, GitHub search, npm search, OpenRouter models API, Smithery / MCP registry, Stripe API list/expand payload shaping |
| G2 Truthful choice | OpenRouter model pages (provider, price, data policy), AWS Marketplace listings, RapidAPI endpoint docs, Apple App Store privacy labels, Stripe pricing display |
| G3 Agent governance | GitHub fine-grained tokens, Stripe restricted keys, OpenAI project keys and limits, Ramp/Brex spend limits, Vercel/Linear team invites |
| G4 Price, resolve, explain | Stripe balance transactions and receipts, Stripe Dashboard support with object IDs, OpenAI/AWS usage precision, Twilio usage records |
| G5 Publish and earn | Stripe Connect Express dashboard, App Store Connect payments, RapidAPI provider dashboard, Shopify partner payouts |
| G6 Retain and repeat | eBay saved-search alerts, Amazon notify-when-available, GitHub saved filters, account-synced favourites (npm stars, Chrome sync) |
| G7 Fresh developer | Stripe CLI and GitHub CLI install docs, Vercel CLI, Stripe API reference runnable examples |
| G8 Operate | Stripe Radar review queues, Zendesk views, GitHub review queues, scheduled expiry sweeps |

## Preview is milestone acceptance

Prepare the preview environment before building: correct Vercel and Convex project, configured auth and model keys, known served revision, actor accounts, admitted x402 supply, and controlled GET/POST or refusal fixtures as applicable. Check configuration without a build. Do not use Vercel to discover a missing secret or wrong account. A sandbox Tool is not product proof.

When source and local gate are green, push the completed branch once. Let ordinary CI and Vercel preview build run; do not manually redeploy the same revision. On that exact revision, replay the predetermined milestone matrix through applicable web/chat, HTTP, MCP and CLI paths. Observe the user-facing result and durable Tool, Quote, Call, Charge and recovery facts, not only HTTP success. Include impossible need and refusal; include duplicate, concurrency or uncertain dispatch when effects are touched. Record concise evidence in the existing register.

If preview fails, collect the full failure set before changing source. Repair related defects locally as one corrective batch, rerun affected local checks and the integrated gate, then push one corrective revision. Fix preview-only configuration in place when it does not require a build. A second failed preview means the diagnosis or fixture needs review before spending another build. Do not run a series of one-line patches and redeploys.

Mark linked rows **source fixed**, **preview verified**, or **open with observed blocker**. Close on the supported release revision only when the normal task and relevant failure states work. CI green or a screenshot alone does not close a journey. Merge the well only after protected-main checks and preview acceptance; no per-papercut merge or production deployment.

## First milestone and dependency order

The first source milestone is **find an admitted x402 capability or receive an honest, actionable no-match** across chat, Market, HTTP, MCP and CLI. Start from PC-02's false no-match and irrelevant degraded choices. PC-05, PC-22, PC-23, PC-36 and PC-41 are candidates only where source tracing confirms a shared boundary or necessary dependency; the register does not establish one root cause. Review the archived PC-02 source diff as candidate work and port only understood changes. Carry the PC-01 answer fix from draft PR #243 into this integrated cut instead of paying for another isolated PC-01 preview. PC-39's retained-demand action joins only if it fits the same no-match boundary without a new storage or authorization design; otherwise it follows as its own outcome milestone. Acceptance includes a known admitted x402 match, an impossible need, a relevant but uncallable Tool, cross-channel response size and next-action parity, and a saved chat answer after reload.

### Group sequence

Census and reference run for **all eight groups at once** so shared source boundaries are found before any design, not discovered mid-implementation. Implementation then runs in lanes whose files do not overlap:

- **Buyer lane:** G1 Find, absorbing PC-41's no-match output parity (in flight as `well-16/discovery-truth`) → G2 Truthful choice → G3 Agent governance → G4 Price, resolve, explain → G6 Retain and repeat. Census (27 Sep) showed PC-39 retained demand depends on G1's credible exhausted search, G2's definition of callable supply and G3's owner/Agent write authority, so G6 runs last.
- **Supply lane:** G5 Publish and earn, which holds the open P1 PC-26. Runs in parallel with the buyer lane.
- **Enablement lane:** G7 Fresh developer and G8 Operate. Absorbed into a buyer or supply group when on the same path; otherwise run as a small group between milestones.

The root may reorder the sequence only when the census shows a dependency the order ignores. A later group can absorb small documentation or UI papercuts on its path. Do not pre-commit to a large mixed change merely to reduce preview builds.

## Launch gate

The supported release passes when a fresh buyer and Agent can find a suitable admitted Tool or honest no-match, compare material facts, obtain an AUD Quote, Call once and continue; controlled GET and POST x402 purchases preserve one Call and correct money/effect facts under replay and uncertainty; a Provider can publish, reach demand and inspect earnings; return and retained-demand paths work; public installation and support paths complete; and responsive/keyboard routes preserve consequential facts. The exact release revision must pass `npm run gate`, relevant release suites, protected-main CI and controlled live acceptance. All known P0/P1 and task-affecting P2 rows must be closed or their unsupported entry point removed and accurately documented. No paid production claim follows from preview alone.
