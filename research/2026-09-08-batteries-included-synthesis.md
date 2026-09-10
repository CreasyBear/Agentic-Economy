# Make the short Call loop a complete product

Date: 2026-09-08. Consolidation of two parallel research assignments, current source inspection, local browser use and additional boundary tests. This is a proposed product direction with observed defects; it does not claim those defects are fixed or million-Tool capacity is proven.

## Decision

Build around a simple promise: **find the right contribution, buy within permission, and always know how to continue.** The short Agent interface remains `search → Quote → Call → result`. The surrounding product absorbs setup, comparison, spending controls, interruptions, evidence and support.

The catalogue should adopt Airbnb's clarity of choice: descriptive service cards, useful output examples where available, contextual filters, comparable prices and a persistent shortlist. The Account should feel equally mature: named Agents, available and committed money, remaining permission, Calls and an attention view. Every interruption returns to the same authoritative purchase record.

This is a refinement proposal. No new service, dependency, public contract, schema or production deployment was introduced in this research wave. Earlier fixes and uncommitted work remain intact.

## The roast, with evidence

| Finding | Evidence and practical consequence | Corrective direction |
| --- | --- | --- |
| The catalogue exposes inventory more readily than it helps choose. | Live `/market` showed roughly 14.5k Tools, with the first 20 dominated by one Provider's crypto endpoints. URL headings, transport badges and atomic payment values carry too much of the explanation. | Lead with the bounded job, returned output, Provider, comparable price basis and important known/unknown facts. Put protocol detail inside inspection. |
| A plausible search result can be the wrong service. | The live query **weather forecast for Perth** returned nine results, including US-only NOAA and fixed Seattle, Portland and Chicago endpoints. No coverage/output/price refinement was available. | Use declared service coverage as a real constraint. Keep unknown coverage visible as unknown. Provider location and payment network cannot stand in for coverage. |
| More filter controls would currently create false confidence. | Web source search exposes query/limit over a bounded upstream candidate set. Several machine facets are applied after retrieval; location can match Business name, and a positive effect match does not exclude forbidden effects. | Apply filters to the defined search universe through maintained search infrastructure. Give web, CLI and MCP the same semantics and honest coverage/count precision. |
| Connection health does not establish purchase readiness. | The prior local stress exercise authenticated but stopped at `commercial_policy_unavailable`; balance was unavailable and release identity was unconfigured. | Make environment readiness distinguish browse, Quote and purchase. Route configuration blockers to the operator, without asking customers to reconnect or top up. |
| Replacing a credential can hide the Agent's earlier purchases. | Replacement preserves the Agent principal but changes credential ID; Call recovery and history require the old exact credential. Owner recovery remains available. This is source-confirmed, not a live paid reproduction. | Authorise the current Agent against durable ownership and recovery permission, retain original effect evidence, and test the real replacement lifecycle across status, history, cancellation and reconciliation. |
| “Try again” is incomplete unless the purchase identity survives. | The earlier stress review found a generated CLI idempotency identity held in memory despite recovery wording suggesting retention. | Persist bounded recovery material before submission; resume from a fresh process. A transport timeout must never silently create a new purchase. |
| A reliable kernel is buried under fragmented operating surfaces. | Call, authority, money, lifecycle and recovery machinery exist. Support currently leads mainly to Calls or email; a joined operator attention queue was not established. | Make the Call the entry point for support, with current delivery/money state, responsible actor, age and one safe next action. |

The browser also showed wrapping and navigation crowding in the narrow embedded view. Detail spent substantial space on zero-use charts and duplicated indicative prices before giving a practical path to use the Tool. These are observed design problems, not conclusions drawn from component tests.

## What batteries included means across the product

| Surface | The customer's simple question | Capability carried behind it |
| --- | --- | --- |
| Connect | Which Agent can use this Account? | Harness-native connection, scoped permission, expiry, replacement, revocation and clear Account binding. |
| Discover | Which Tool fits this contribution? | Full-universe facets, attributable facts, contextual categories, bounded results, comparison and source freshness. |
| Quote | What will this request cost, and may it proceed? | Exact all-in AUD consideration, input/version binding, expiry, balance, pending exposure, spending permission and revalidation. |
| Call | Did it work, and how do I continue? | One purchase identity across response loss, process death, upstream uncertainty and recovery; useful delivery remains distinct from payment success. |
| Account and Agents | Who can spend, how much remains, and what needs me? | Shared funds, durable Agent budgets, policy periods, committed exposure, connection state and isolated histories. |
| Calls, Usage and Spend | What happened and what does it mean for the business? | Joined records, bounded pagination, reconciled totals, evidence provenance and appropriate document/export support. |
| Support and operations | What can resolve this purchase now? | Permission-scoped attention queue, safe recovery/refund actions, audit, dependency diagnosis and escalation ownership. |
| Provider and offboarding | How do I operate or leave cleanly? | Optional managed Provider setup, version changes, paused supply, outstanding obligations, hosted payout remediation and drain-before-closure. Open x402 browsing remains independent. |

The most useful surprise is **continuity everywhere**: filters survive opening a Tool; selection survives connecting; the purchase survives a client restart; history survives credential replacement; the owner can resolve an exception without reconstructing a technical incident.

## Reuse decisions

1. **Use the existing Coinbase SDK capabilities now.** Its native filters are a useful bounded improvement. They do not supply an exhaustive, faceted million-Tool catalogue by themselves.
2. **Benchmark Algolia + React InstantSearch against Typesense Cloud + its maintained InstantSearch adapter.** Algolia is the first candidate for the shortest product path; Typesense deserves equal workload evidence because many autonomous searchers change the cost equation. Select using judged relevance, selective facets, freshness, serving geography, operational work and cost per successful selection. Do not choose on a one-million-record marketing claim.
3. **Keep commercial authority in the existing system.** Discovery is a rebuildable observation used to shortlist candidates. Quote and Call revalidate actual input, current authority, price and execution support. Never copy each Account's live balance into a public search index.
4. **Use installed Convex Workpool, Workflow, Rate Limiter and aggregates.** Current dispatch uses a bounded pool with retry and persisted release controls. Do not add a queue or financial ledger to solve an unmeasured capacity concern.
5. **Keep existing hosted identity/funding/payout handoffs.** Study the full Locus, Nevermined and Whop journeys; transfer their useful behavior through current supported SDKs. A new helpdesk or outbound event service is a separate decision only when a concrete consumer requires it.

Filter semantics must be explicit: AND across dimensions, appropriate OR within ordinary facets, exclusion rules for forbidden effects, distinct unknown buckets, comparable price units, and counts over the actual search universe. “No retention” cannot mean “no retention information.” A source outage cannot look like zero matching Tools. Hard constraints cannot disappear when semantic search broadens an intent.

## Scale is four separate problems

| Boundary | Current useful foundation | Remaining proof |
| --- | --- | --- |
| Catalogue cardinality and search traffic | Official source SDK, current Convex indexes, paginated reads, existing UI components. | Bounded ingestion/sync, maintained facets, deduplication, deletion, freshness, pagination semantics and search economics at 1k/100k/1m records. Browsing should not perform repeated per-result reconciliation for each user. |
| Many Agents sharing money | Formance atomically reserves Account AUD, durable Agent budget and legal-customer exposure; budget addressing uses Agent principal and generation. | Concurrent acceptance near limits, policy changes, monthly rollover, credential replacement and owner-wide policy behavior across real routes. Do not call existing atomic budgets absent. |
| Noisy neighbours and failing Providers | Current dispatch pool is bounded; per-credential rate and concurrency admission exist; release fences are persisted. | Per-Agent/Account fairness, queue age, admission backpressure, Provider isolation and protected recovery capacity. Current credential-keyed rate limits must not be mistaken for fleet-level fairness. |
| Uncertain external effects | Durable Calls, reservation states, status/reconcile/cancel and payment evidence exist. | Crash after release, timeout after upstream success, duplicate job/event delivery, late settlement and delayed refunds must converge without duplicate effect or charge. A maintained retry mechanism still needs AE's effect-safety rules. |

Relevant official contracts: [Workpool retry and concurrency behavior](https://github.com/get-convex/workpool), [Convex rate limiting](https://stack.convex.dev/rate-limiting), [Formance idempotency](https://docs.formance.com/modules/ledger/working-with/idempotency), and [x402 payment identifiers](https://docs.cdp.coinbase.com/x402/support/faq). These are dependency contracts, not evidence of AE throughput or end-to-end completion.

## Recommended refinement sequence

**1. Complete one recoverable loop.** Make the local environment's dependencies diagnosable and repeatable. Repair CLI recovery persistence and credential-replacement continuity while preserving cross-Agent/Account isolation. Run the existing deterministic Provider/money boundaries through delivery, uncertainty and remedy in supported clients. Real funded proof remains deferred as requested.

**2. Make three real catalogue jobs excellent.** Start with the observed Perth weather case, an on-chain read from current abundant supply, and a document-extraction case only after confirming suitable actual supply. Agree summary, filter and comparison semantics. Use the current SDK where it suffices; benchmark both search finalists on the same corpus for the full experience. The interactive design study accompanying this report uses illustrative data and is not a production search implementation.

**3. Make a fleet operable.** Expose spent, pending, remaining permission and the limiting policy per Account/Agent. Join actionable exceptions into the Call and an operator queue. Exercise revocation, membership removal, replacement and offboarding with unresolved work.

**4. Prove the operating envelope.** Increase records, concurrent callers, traffic skew and dependency faults independently. Measure useful completed work, constraint violations, tail latency, queue age, fairness, freshness, duplicate effects, unresolved age and full operating cost. Publish the measured boundary, including where it fails.

These are implementation packages to refine, not a claim that every item is authorised for immediate infrastructure procurement. The next bounded correctness fixes can use existing machinery; new search services or contract/storage changes need a concrete reviewed choice.

## Verification performed in this wave

- Two research agents reviewed the maturity papers, current implementation and official references. Parent work traced Call release/recovery and fleet admission, and exercised the live development catalogue, selection modal and Tool detail.
- The illustrative catalogue study was rendered in a browser: coverage/unknown/output/price filters, comparison, retained selection and zero-result behavior passed. Layout was checked at 1,024, 736 and 360 pixels in light and dark appearances, with no script errors or horizontal overflow. These checks validate the study's local interactions, not a production search service. The development browser was returned to its original catalogue URL with the test query cleared.
- Additional existing tests: **119 passed; 5 skipped** across five files. The skipped file requires `AE_FORMANCE_INTEGRATION=true`; it did not establish live ledger behavior.
- Command: `NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm exec -- vitest run tests/unit/convex/capability-call-authority-boundary.test.ts tests/unit/convex/authz-actor-isolation.test.ts tests/unit/convex/admin-actor-isolation.test.ts tests/integration/money-formance-boundary.test.ts tests/unit/market-terminal/call.test.ts --no-file-parallelism`.
- The earlier [stress review](../docs/reviews/catalogue-infrastructure-stress.md) separately records four repairs, 109 relevant passing tests, 76 rerun CLI/HTTP checks, repeated discovery and official MCP reads. Those earlier counts are not new tests from this wave and should not be added as unique total coverage.
- No live paid Call, million-record benchmark, 100-Agent money race or production failure drill was performed. Source-confirmed defects remain open; passing tests do not close them.

Detailed inputs: [platform maturity](./2026-09-08-batteries-included-maturity.md) and [catalogue at scale](./2026-09-08-catalogue-at-scale.md), including official sources, source locations, filter semantics, vendor economics and proposed acceptance experiments.
