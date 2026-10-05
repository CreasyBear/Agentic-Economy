---
status: proposed
date: 2026-10-05
title: "ADR 0006: Mercator capability baseline and bounded procurement foundations"
decision_owner: "Joel Chan"
---

# ADR 0006: Mercator capability baseline and bounded procurement foundations

## Outcome and authority

Aecon has a substantial identity, authority, single-Tool purchase and durable Call foundation. It does **not** yet establish Mercator parity for caller-composed dependency graphs, conventional asynchronous provider completion, or selective multi-node results. Preserve the existing foundation, close those gaps in that order, and make the actual contracts usable through customer and developer documentation.

Audience: engineering, product and documentation owners. Status home: [Wayfinder #256](https://github.com/CreasyBear/Agentic-Economy/issues/256) and [TODOS.md](../../TODOS.md). This is its proposed foundation/parity decision attachment, not another delivery register. [PRODUCT.md](../../PRODUCT.md), [CONTEXT.md](../../CONTEXT.md) and current source remain authoritative. The review and initial factual docs are authorised; the proposed runtime changes await direction. No payments, permissions, secrets, subscriptions or deployment are changed.

This proposal complements [ADR 0004](0004-bounded-service-packages.md). That ADR concerns a Provider selling a package as one Tool. A customer asking its agent to combine several independently selected Tools is a different capability. A package implementation alone cannot close caller-composition parity. Neither path makes Aecon the customer's general planner, memory or agent runtime.

## Evidence and claim limits

Inspected checkout: `aecon-consolidation`, branch `codex/chat-recommendations-no-pagination-2026-10-05`, source [6bd8d7697](https://github.com/CreasyBear/Agentic-Economy/commit/6bd8d7697ba5fbc3917f81c2283af7273dd3dc31). Existing dirty paths belonged to Datadog preparation: `TODOS.md`, `docs/README.md`, and ADR 0005. No branch, clone or worktree was created. No `memory_summary.md` was found in the named workspace search; current instructions and source supplied context.

GitHub readback confirms [#357](https://github.com/CreasyBear/Agentic-Economy/pull/357), [#358](https://github.com/CreasyBear/Agentic-Economy/pull/358), and [#359](https://github.com/CreasyBear/Agentic-Economy/pull/359) are merged. Production [release read](https://app.aecon.ai/api/v1/release) returned `81124766527c30f0cf3b6ee941a9ad7f2088e163` (#359); this proves the reported web source, not matching backend deployment or all paid journeys. [Deployment records](../operations/deployments.md) and [recorded mainnet acceptance](../production-readiness-plan.md#twenty-real-mainnet-payments) retain their exact environment and historical claim limits.

Evidence classes used below:

- **Marketing:** a vendor assertion; no implementation or reproduction implied.
- **Contract:** current public prose/schema/metadata. Private implementation is unknown.
- **Source:** inspected Aecon implementation; tests strengthen this but do not prove hosted behaviour.
- **Reproduced:** an explicitly named safe HTTP probe or local fixture in this review.
- **Recorded runtime:** prior first-party receipts read from the existing readiness record, not rerun here.

Public reads and free probes were made on 5 October 2026, principally 13:50–13:54 UTC. Sanitised requests, bodies, hashes and timestamps are in the delegated task's `evidence/public-reads.json`, `evidence/contract-probes.json`, `evidence/source-manifest.json`, `evidence/async-normalizer.json` and `evidence/foundation-tests.log`. These task-local receipts are supporting evidence, not another canonical status home. Retain them with the handoff if the task workspace is archived.

### Mercator primary sources

| Source | What it establishes |
| --- | --- |
| [Human docs](https://mercator.sh/docs), [Markdown docs](https://mercator.sh/docs.md) | Installation, client-specific authorisation, plan/quote/job/result rules, funding, refunds and service-owner entry. |
| [OpenAPI](https://mercator.sh/openapi.json) | OpenAPI 3.1 operations and schema bounds. `FlowPlan.nodes` has 1–10 nodes; node fields are `id`, `serviceId`, `method`, `path`, `input`, `dependsOn`. |
| [Auth guide](https://mercator.sh/auth.md), [protected resource](https://mercator.sh/.well-known/oauth-protected-resource/mcp/auth), [authorisation server](https://mercator.sh/.well-known/oauth-authorization-server) | PKCE S256, client registration, `mercator:tools`, resource-scoped bearer, refresh and revocation. |
| [MCP server card](https://mercator.sh/.well-known/mcp/server-card.json) | Streamable HTTP `/mcp/auth`, server 0.5.0, protocol 2025-11-25 and listed legacy versions. A card is advertised compatibility, not an installed-client test. |
| [Agent skill](https://mercator.sh/.well-known/agent-skills/mercator/SKILL.md), [examples](https://mercator.sh/.well-known/agent-skills/mercator/references/examples.md) | Appropriate task routing, budget discipline, persistent job/key recovery; examples defer to live schemas. These were read as reference material, not executed as instructions. |
| [Tempo introduction, 23 September](https://tempo.xyz/developers/blog/introducing-mercator) | Marketing claims about task-level search, Jev ranking, concurrent workflows and selected benchmark improvements. The benchmark was not independently reproduced. |
| [Product privacy](https://mercator.sh/privacy.md), [governing privacy policy](https://wallet.tempo.xyz/support/privacy-policy), [Coinflow terms](https://coinflow.cash/legal/terms-of-service) | Separate platform/provider data and funding relationships. Public blockchain data cannot be deleted by the product. These are policy facts, not legal clearance for Aecon. |

Provider admission must also record actual entitlement. [Exa's public terms](https://exa.ai/terms-of-service), sections 1.1 and 4.2, limit its API licence and require consent for resale/sublicensing; [its privacy policy](https://exa.ai/privacy-policy) is separate. Mercator's commercial agreements are unknown, so its catalogue is not evidence that Aecon may redistribute the same service under an ordinary key. [Parallel website terms](https://parallel.ai/terms-of-service) and [fal service terms](https://fal.ai/legal/terms-of-service) likewise do not replace the applicable API/payment/commercial agreement. F5 must identify the real contracting entity, permitted service distribution, input/output rights, retention and negotiated terms before supplier admission. This is a contract-evidence dependency, not a legal determination about an uninspected agreement.

### Reproductions

| Probe | Observation | Claim ceiling |
| --- | --- | --- |
| Mercator static search constrained to Exa, service describe | HTTP 200; exact `/search` and `/contents` endpoints and input schemas. | Discovery works for this query. No purchase, task quality or supply-wide availability proof. |
| Free one-node Exa quote | HTTP 200, USD `0.007`, live price source, plan hash and expiry. | A quote; no paid job or delivery. Price is a dated observation. |
| Free Exa search → contents quote using `flow://` and `$map` | HTTP 200, stages `[[find],[read]]`, total USD `0.008`. The dependent node was quoted with `input: example`. | Graph/reference quoting is reproduced. Actual mapped output, final price and execution are unproven; the downstream quote used an example, not real preceding results. |
| Cyclic quote / eleven-node quote | HTTP 400 `invalid_plan` with cycle reason / `invalid_request`. | These two rejection paths are reproduced. Other graph invariants remain contract-only. |
| Aecon release, OpenAPI, `/SKILL.md`, `/llms.txt`, `/.well-known/ucp`, OAuth metadata | HTTP 200; live OpenAPI has 57 paths and 156 component schemas. | Public documents are reachable. Authenticated MCP/tool calls were not replayed. |
| Aecon public `web search`, limit two | HTTP 200; both results `setup_required` / `unverified`, page coverage partial, supply freshness absent, query/candidate release to OpenRouter disclosed. | Discovery works; these results do not establish callable web-search supply or ranking quality. |
| Local existing HTTP normaliser given `{run_id, status: queued}`, HTTP 202, no continuation header | `disposition: succeeded`. | Reproduced adapter behaviour, not a current admitted-Tool exploit. Output validation or expected-status configuration may refuse a specific publication. A generic job handle is not completion evidence. |
| Existing focused foundation suite | 11 files / 145 tests passed with Node 22.22.0, npm 11.5.1, Vitest 4.1.9. | Source proof for tenancy, rotation, isolation, delegation, transport, current MCP, recovery and OpenAPI. Hosted and paid proof remain separate. |
| Existing Call/supply conformance suite and required check | `npm run test:conformance`: 42 files passed, 656 tests passed / 24 existing tests skipped. `npm run check`: passed. | Broader local durable execution, adapter, owner funnel, recovery and source boundary proof; skipped tests remain outside this proof. No release gate, deployment or new paid acceptance was run. |

## Foundation model: actors before features

```text
Human User --Clerk identity--> human Principal
Organisation --verified binding--> organisation Principal
              | owner/membership
              v
            Account (tenant + economic context; lifecycle/revision)
              | issues bounded authority
              v
Agent Principal <--versioned Credential / OAuth connection
              | Spending policy / current DelegationGrant
              v
Tool version -> caller-bound Quote -> idempotent Call -> result / recovery
      ^              |                     |
Provider --Connection/secret lease--> binding | buyer Charge
      | performs upstream                     | separate Provider obligation
      +---------------------- evidence -------+ remedy/refund/payout
```

An ordinary User is a human actor. A Customer is the product role directing work. An organisation is a principal that can own an Account; the workspace is its human interface. Account ownership and membership establish access. Account funds establish capacity. Neither substitutes for delegated spending authority.

An Agent is a persistent actor, not a bearer string or model instance. A credential locates that actor under an owner, environment, generation and scope. Rotation changes credential material while retaining Agent identity, budgets and history. A delegated grant narrows permitted resources, effects, amount and expiry; it never creates permission from funding. A workload identity is distinct from an owner or buyer Agent. Administrative visibility must not confer buyer result access.

A Provider performs the selected Tool. A provider Connection/credential authorises access to that upstream service and remains separate from the buyer Agent credential. Aecon can mediate payment without requiring each buyer to hold each Provider's account, only where supply is admitted with a supported authority/payment adapter. Imported directory metadata establishes neither ownership nor execution permission. Aecon's buyer-facing Seller role, payment recipient and upstream Provider obligation must remain distinct; the complete Australian principal-reseller record is still explicit implementation work in PRODUCT.md.

Mercator documents wallet ownership, OAuth connections with approved spending limits and original-payer access to hosted jobs. Its public API does not establish organisations, team roles, stable Agent principals independent of access keys, or multi-hop delegation. Mark those **unknown for Mercator**, rather than inventing private internals or treating Aecon's richer model as a parity defect. Disconnecting OAuth and revoking an on-chain access key are separate Mercator lifecycle actions; disconnect does not cancel jobs. Direct/Stripe/sponsored job access by private job ID is a different security model from Aecon's authenticated principal-bound reads; do not copy it.

### Invariants and their dependencies

1. **Resolve one current actor and Account before authority.** Fail closed on ambiguous/revoked bindings, ended memberships, suspended Accounts, wrong environments and inactive credentials. See [principal kinds](../../src/modules/principal-account/principal/convex-schema.ts), [Account ownership/membership](../../src/modules/principal-account/account/convex-schema.ts), [canonical Agent resolution](../../convex/lib/authority/canonicalAgent/authority.ts).
2. **Credential replacement preserves attribution.** [Issued/replacement references](../../src/modules/agent-access/issued-agent-binding.ts) keep the Principal stable; [dispatch](../../src/modules/capability-execution/call-authority.ts) and current-grant checks decide whether existing work may continue. Revocation prevents new authority; accepted work, historical access and external cancellation require their own explicit semantics.
3. **Quote exact supply and intent.** Bind Tool version, normalised input, terms, recipient/data use/effects, caller/authority, price ceiling and expiry before consequential work. Discovery/ranking never authorises dispatch. A downstream price based on an example remains uncertain.
4. **Use one durable effect identity.** Same actor/key/material replays; changed material conflicts; rotation must not duplicate work. Persist acceptance before network release. A timeout after possible dispatch means observe/reconcile, never blind paid retry.
5. **Completion requires delivered output.** Accepted provider jobs persist a handle and resume observation. A queue response is not a result, a transport success is not purchase resolution, and cancel acknowledgement is not refund settlement.
6. **Bound composition at admission and each release.** An immutable acyclic graph selects admitted Tool versions and declared mappings, with node/byte/depth/concurrency/deadline and cost bounds. No arbitrary code, URLs, recipients, credentials or runtime graph rewriting. Only permitted dependency output reaches each Provider.
7. **Budgets cover the complete possible spend.** Reserve aggregate capacity atomically against owner, Agent, Account and operational caps, then consume/release once per node. Provider variability must fit a supported ceiling or refuse before payment. Child Calls cannot escape into broader customer authority.
8. **Separate evidence and economic states.** Successful outputs survive sibling failure; failed/skipped/unreleased nodes remain distinguishable. Settlement, delivery, buyer Charge, Provider payable, refund and purchase resolution have separate owners and references.
9. **Project the same contract everywhere.** HTTP, MCP, CLI, chat and docs use action-owned schemas. Private diagnostics redact content, credentials and authority material. Retention for content, financial evidence and idempotency identity is separately specified; expiry must never make old consequential work safe to repeat.

## Capability coverage

`Supported` means source supports the bounded feature shown; runtime evidence is explicitly qualified. `Partial` means a material part exists. `Missing` means the current inspected public/source contract lacks the stated feature. `Unknown` means no adequate evidence. Protocol- or brand-specific implementations can differ while covering the same customer job; literal payment-rail parity is separately identified.

| Capability | Mercator baseline / evidence | Aecon status and evidence | Gap / dependency |
| --- | --- | --- | --- |
| Human account / connection setup | Contract: browser wallet authorisation; client-specific OAuth. | **Supported**: Clerk human/organisation binding, machine key/OAuth; prior staged lifecycle and production owner receipts. | Fresh non-founder persona proof in F1/F5. |
| Organisation/workspace ownership, team roles | **Unknown**: no public organisation/team contract found. | **Supported in source**, broad hosted persona proof **unknown**: [Account schema](../../src/modules/principal-account/account/convex-schema.ts), tenancy tests. | Preserve current membership/owner boundaries; no new IAM. |
| Stable Agent identity and credential rotation | Client/wallet/access-key association documented; stable independent Agent identity **unknown**. | **Supported**: [replacement references](../../src/modules/agent-access/issued-agent-binding.ts), rotation and dispatch tests; recorded two-Agent staged lifecycle. | Document identity versus key; F1. |
| Delegated scope, budget, expiry | Contract: connection spending limits and expiry; full grant graph **unknown**. | **Supported** bounded grants: [contracts](../../src/modules/authority/delegation/contracts.ts), consequence checks and tests. | Full customer multi-hop delegation is not required for this milestone. |
| Revocation, suspension, deletion and isolation | Contract: OAuth removal plus on-chain revocation; hosted original-payer job reads; private IDs for other modes. | **Supported/partial**: source account isolation, decommission, key revoke; recorded lifecycle. All persona/offboarding recovery **unknown**. | F1/F5 proof; do not weaken principal-bound reads to capability IDs. |
| Provider ownership, credentials and admission | Contract: MPP/x402 listing route; client avoids individual provider keys. Private admission internals **unknown**. | **Supported in source**, heterogeneous hosted onboarding **partial**: [provider Connection](../../src/modules/capability-supply/provider-connection.ts), importers and publication funnel. | F5; listing ≠ callable supply. |
| Natural-language search and static/live availability | Contract: static default, constrained/preferred services, bounded live probes; marketing Jev/quality ranking. Static search reproduced. | **Partial**: canonical search/compare, Jev, price/effect filters, freshness and latency. Public probe returned unverified setup-required supply. | F5 task-level relevance + callable heterogeneous supply. |
| Exact endpoint input/output contracts | Contract/live describe: schema-owned endpoint input; observed Exa descriptor lacks `outputSchema`, `execution` is `{}`. | **Supported input/output contracts in source**: [capability contract](../../src/modules/capability-contract/public.ts), OpenAPI/MCP import and admission. | Do not assume Mercator guarantees static output compatibility; F3 validates available evidence and runtime output. |
| One-Tool quote and price ceiling | Contract + free live quote; advisory server price and expiry. | **Supported**: [Quote action](../../src/modules/capability-execution/quote.ts), current Tool/terms binding; mainnet record. | Preserve stricter caller-bound Quote. |
| Immutable DAG, references, array mapping | Contract: ≤10 nodes, `dependsOn`, `flow://` JSON Pointer, `$map`; quote/cycle/bound reproduced. Private compiler/execution uninspected. | **Missing** caller DAG; [single Call input](../../src/modules/capability-execution/call-contracts.ts), proposed ADR 0004 packages only. | F3; distinguish procurement composition from general agent planning. |
| Ready-node parallelism and aggregate budgets | Contract: independent nodes concurrent, ≤3 per service; unexecuted. | **Partial**: Workpool/Workflow, single-Call limits; no public aggregate DAG commitment. | F3; native scheduling, AE atomic admission/ceilings. |
| Durable acceptance, jobs and recovery | Contract: pending/running/terminal, cached durable jobs, disconnect recovery. No paid execution reproduced. | **Supported single Calls**: durable [Call application](../../src/modules/capability-execution/call-authority.ts), Workpool and reconcile; recorded mainnet recovery. | F2/F3 extend rather than new queue or lifecycle. |
| Conventional long-running provider completion | OpenAPI output description recognises completion polling; live Parallel has task start/read endpoints. Internal adapters and actual completion **unknown**. | **Partial**: declared continuation/reconciliation/cancel; ordinary 202 body can normalise as success without a continuation header. | F2 explicit start/status/result adapter. |
| Idempotency, lost response, retries | Contract: payer + key + unchanged plan; up to 3 transient free-call retries, at-most-one paid request after claim; 30-day charged-key retention. | **Supported single Call**: [admission/replay](../../src/modules/capability-execution/call-admit.ts), durable effect identity and uncertainty tests/record. | F3 plan/node namespace; do not equate scheduler retries with safe external retries. |
| Cancellation | Docs say disconnect is not cancel; inspected job operation list has no public cancel operation. | **Supported where adapter allows**: [cancel](../../src/modules/capability-supply/internal/route-transport-cancel.ts), Call API and tests. | F2 capability-aware provider cancel; F3 stop unreleased nodes; never promise rollback. |
| Partial success, selective node reads | Contract: partially_succeeded, successful result IDs, JSON Pointer selection, no rerun. | **Partial** single-Call result/recovery; **missing** aggregate multi-node result access. | F4 depends F3. |
| Binary/large result artifacts | Contract: inline base64 and bounded leaf artifact links; dependency/polling outputs inline-only. | **Partial/unknown**: bounded JSON/schema outputs; no equivalent public node/artifact contract located. | F4 owner-bound content storage and expiry; no public private-result links. |
| History, cached reads, rerun and retention | Contract: wallet history, free cached reads, explicit new paid job, 30 days. | **Supported** Call history/status; current content retention work and metering; DAG history/rerun **missing**. | F4; preserve financial/audit records beyond content purge. |
| Quotas/rate limits and spending readiness | Connection auth/wallet/funding/key readiness documented; service parallelism documented; global/API quota internals **unknown**. | **Supported** HTTP limiter, Convex rate limiter, grants, treasury/custody/per-Call caps; plans **partial**. | F3/F5 provider/account fairness and evidence expiry. |
| Funding, payment rails and receipt | Contract: MACH/Coinflow funding, Tempo MPP/USDC.e/pathUSD, Stripe SPT, upstream Base x402; receipts. | **Supported economic equivalent/partial live scope**: AUD credit, Formance, Base x402, funding handoff; mainnet promotional-credit Admin-only acceptance. **Missing literal MPP/Tempo/MACH/SPT parity**. | Existing #256/#288 commercial gates; choose rail expansion only if literal interoperability is required. |
| Refund boundary | Contract: unused failed capacity to MACH for Tempo, no automatic Stripe refund; successful nodes billable; refund settlement independent. | **Supported single Call remedy/refund** with recorded evidence; aggregate plan allocation **missing**. | F3/F4 finance owner approves allocation before paid implementation. |
| Accounting receipt share | Contract: public accounting card excludes raw inputs/results but can include task title. | **Partial** receipts/history; chat share is not a public accounting-receipt contract. | F4/F5 decide usefulness/privacy; never expose private Call ID or task title by default. |
| Feedback, review rewards and suggested tasks | Contract: suggestions, payer-proven review/reward, product feedback, social MACH grants; not reproduced. | **Partial** suggestions, review/usefulness/ratings and support; **missing** equivalent social grants/rewarded workflow-review system. | F5 roadmap decision; preserve incentive abuse and owner-consent boundaries. |
| REST/MCP/CLI and machine discovery | Contract: operation mapping, SDK clients, OAuth, standalone release artifacts, server card/skills/Markdown. | **Supported** generated actions/OpenAPI/manifest/skill, official MCP 2.3.0; CLI locally/mainnet verified, npm distribution pending. | F1 document supported installation and exact client versions; #358 already delivered protocol changes. |
| MCP App / browser presentation | Contract: user-only launcher with balances/job views; WebMCP public search/describe. | **Partial** normal app/chat; equivalent embedded MCP App/WebMCP **unknown/missing** in inspected public surface. | F5 record as optional interaction gap; no parallel purchase path. |
| Observability, analytics and operational proof | Marketing ranking signals; public health, privacy telemetry, job accounting; internal guarantees **unknown**. | **Supported/partial** correlation, Sentry/PostHog, metering, audit/readiness/restore records; sustained availability and alerts retain limits. | Datadog remains #284 / ADR 0005, separate owner. Reuse Call/node correlation; no bespoke trace store. |
| Customer, admin, integrator and Provider docs | Contract: task/client guides + generated-looking OpenAPI components and semantic Markdown. | **Partial** README, `/for-agents`, `/for-providers`, machine instructions, internal designs/runbooks. No coherent generated customer/developer docs tree. | F1; existing Markdown and action schemas are the source. |

## Proposed implementation sequence

Priority is relative to **claiming capability parity**, not a new P0 production emergency. Owners below are responsible areas, not assigned people or delivery commitments. Every runtime slice gets its own bounded Wayfinder direction and `/plan-eng-review` revision before implementation.

| Slice | Problem / owner / dependency | Recommended supported implementation | Acceptance proof |
| --- | --- | --- | --- |
| **F1 — P2: foundation docs and contract conformance** | Docs + authority + protocol owners. First; reuse #256, surviving intent from #187, current action schemas. | Maintain [foundations guide](../foundations.md); add Fumadocs to existing TanStack app only after dependency/build trial. Generate API reference from current action/OpenAPI builder, MCP tool names from actions, installation from released CLI artifacts. | Four persona walkthroughs; schema-valid examples; no invented capability; auth/scope/expiry/rotation and two-Account negative cases; generation drift/link/build checks. |
| **F2 — P1: one conventional asynchronous Tool** | Capability-supply/execution owners; F1 contract vocabulary. Earliest runtime slice. | Add a declared provider-job completion adapter around start/status/result using existing Workpool or Workflow and durable effect state. Official provider SDK where it fits; protocol-specific code behind one adapter, not provider branches in Call orchestration. | One admitted asynchronous fixture and one separately authorised real provider journey. Persist handle before polling; restart continues same job; queued JSON never completes; malformed/status/output/expired auth/SSRF tests; no second start after unknown; cancellation races preserve truth. |
| **F3 — P1: bounded multi-Tool procurement contract and execution** | Market/contract + authority + execution + finance owners; F2 and direction on commercial scope. Reuse ADR 0004 machinery where compatible, not retired #202/#204 engine. | Inspect-only frozen plan over exact Tool refs, bounded JSON Pointer/map operators, aggregate ceilings; execute through current Call/effect/economic ports and installed Workflow. No arbitrary transforms or runtime planning. | 1–10 node limits, DAG/ref/schema checks, exact quote/plan binding, aggregate concurrency budget race, stable per-node keys, ready-node parallelism, restart, revoked authority, price drift, unknown dispatch. Two-node output-to-input positive proof and adversarial negatives. A validator-only slice cannot close execution parity. |
| **F4 — P1: partial results, artifacts and financial readback** | Execution + content/data + finance owners; F3. | Per-node output refs and statuses, typed pointer reads, bounded inline/binary/artifact retrieval, retention policy, existing Charge/refund/obligation joins. Public accounting share only with a separate disclosed policy. | Sibling failure keeps completed output and charges; dependents skip; selective read does not rerun; wrong Account/Agent denied; retained artifacts survive worker restart; expiry/purge respects legal evidence; refund pending remains independent of terminal execution. |
| **F5 — P1: supply, routing and installed-client acceptance** | Supply/market/DX + product owners; F1–F4, provider entitlement and capped-runtime authorisation. Related #196, #185; existing #279/#288 retain their own launch gates. | Admit heterogeneous real supply through importers, official protocols and current owner funnel; evaluate Jev versus deterministic selection using a preregistered task corpus. Use documented REST, two installed MCP/CLI harnesses and the customer app. | At least two independently owned providers, synchronous and asynchronous work, a mapped graph and partial failure; no founder/database repair. Record relevance, success, turns, latency, cost and repeat-use; one guide-led ordinary-user/admin/provider/integrator journey each. No benchmark or unlimited availability claim from a few runs. |

There are further **explicit literal surface gaps**: MPP/Tempo/SPT rails, social funding grants/review rewards, WebMCP/MCP App, and public accounting share. They are visible in the coverage table, not silently counted as covered. They should be kept as decisions under #256 after the core slices; no custom wallet, rewards engine or parallel UI is proposed now. If “all of it” means exact rail/client/incentive interoperability rather than customer capability equivalence, those need distinct supported adapters and acceptance. Do not certify literal parity without them.

### Contract and dependency design

```text
F1: identity / schemas / docs
            |
F2: Tool start -> provider handle -> status -> validated final result
            |
F3: inspect plan -> frozen terms/ceilings -> authorised aggregate admission
       -> Workflow schedules ready nodes -> existing child effect/Call boundary
            |
F4: completed / failed / skipped nodes -> selected output / artifact
       + separate charge / provider obligation / refund readback
            |
F5: heterogeneous supply + actual persona/client acceptance
```

The Agent may propose a small procurement graph; Aecon validates and executes that bounded graph, without owning the larger goal or reasoning. For generic caller-composed work, default to retaining the existing per-Tool purchases and remedies under an aggregate authorisation and budget. A single charged package with a promised deliverable requires the identified package Provider and the ADR 0004 commercial contract. Do **not** turn multiple supplier purchases into one buyer promise simply to imitate Mercator's pay-once UX. Final commercial allocation is an unresolved owner decision before consequential implementation.

Each plan node references an immutable published Tool version, not a model-supplied URL/method/price. Mapping handles literal input, a declared dependency's whole output, RFC 6901 pointers, and bounded array projection. RFC 6901 parsing/schema validation should use existing maintained utilities; AE owns graph validity, provenance, limits and permission, not an expression language. Validate full resolved input at release; missing output schemas mean uncertain compatibility, not automatic rejection of every useful provider or fabricated static safety.

Pin graph and contract generations at Quote. Dependent dynamic prices require an authoritative per-node maximum or a documented repricing/approval handoff **before** that node's effect. Unbounded prices refuse. New scopes, recipients or expanded effects require a new approval/Quote. Never mutate the approved graph during execution. No automatic irreversible fallback to a different Provider.

The installed `@convex-dev/workflow` 0.4.6 and `@convex-dev/workpool` 0.4.10 already support durable steps, delay, parallel execution and configured retries. [Official Workflow](https://github.com/get-convex/workflow), [Convex guidance](https://docs.convex.dev/agents/workflows) and [Workpool](https://www.convex.dev/components/workpool) support reuse **[Layer 1]**. Workflow mutation replay does not make network effects exactly once: action retries are explicit and must obey the existing durable Call claim/reconcile boundary. Store content once behind refs; Workflow arguments/results should carry IDs to avoid replay bandwidth and memory growth.

## Engineering review: substantive issues and choices

The installed Wayfinder Delivery and `/plan-eng-review` were run for this bounded preparation, including Step 0, architecture, code quality, tests and performance. The dispatch is delegated; the skill's spawned-session rule selects recommended non-destructive planning options and records them below. These are recommendations, not Joel's runtime direction approval. No separate reviewer/subagent ran.

Step 0: reuse the current IAM, action registry, Call state machines, economic ledger and Convex components. This preparation touches four docs/index/queue paths, introduces no runtime service, and leaves all runtime implementation to separately bounded slices. No infrastructure expansion, broad refactor, retired engine restoration or current MCP duplication is needed. Existing #196 is older market-foundation context; #185/#187 preserve unresolved contract/continuation intent. #202/#204 are explicitly retired in #196 and must not be reopened as shipped graph evidence.

### Architecture review

| Issue / evidence / confidence | Recommended choice and alternative | Consequence / proof |
| --- | --- | --- |
| **A1, F1:** wallet, key and actor are different. `principalKindValue` has human/organisation/agent/workload; Account schema has separate membership/ownership. 10/10. | Keep canonical Principal/Account/credential separation **[Layer 1]**. Alternative: model each connection as the customer identity. | Preserves history and isolation; costs a clearer guide. Rotation and cross-Account cases must pass. |
| **A2, F2:** `return continuation === undefined ? ... disposition: 'succeeded'` in [normaliser lines 365–370](../../src/modules/capability-supply/internal/route-transport-http-json.ts); queued 202 fixture reproduced. 10/10. | Explicit supported start/status/result completion adapter **[Layer 1]**. Alternative: treat any 2xx as final or force providers to emit AE headers. | Enables conventional async APIs; adds handle/observation state. Keep acceptance and final result distinct. |
| **A3, F3:** `callInputSchema` accepts only `quoteRef` and `idempotencyKey` in [Call contracts lines 103–106](../../src/modules/capability-execution/call-contracts.ts); ADR 0004 is proposed package supply. 10/10. | Bounded procurement graph over exact Tools, using Workflow **[Layer 1]**. Alternative: only fixed Provider packages. | Closes caller composition while retaining the wider planner outside AE; new aggregate contract must be approved. |
| **A4, F3/F4:** `DelegationGrant` owns budget/generation and `CallDispatchPort` owns one Tool/grant in [authority contracts](../../src/modules/authority/delegation/contracts.ts), [Call application](../../src/modules/capability-execution/call-authority.ts). 9/10. | Atomically reserve aggregate authority then release bounded child effects; preserve separate buyer/provider/refund facts. Alternative: recursively buy with unrestricted owner authority. | Prevents concurrent overspend and hidden responsibility changes; finance must settle aggregate allocation before paid work. |
| **A5, F4:** public Call routes contain status/cancel/reconcile, no node/artifact operation in [Call entry](../../src/modules/capability-execution/call-entry.ts); live OpenAPI agrees. 9/10. | Owner-bound node/result/artifact reads **[Layer 1]**. Alternative: inline all output or make job IDs bearer access. | Cached efficient recovery and isolation; storage/expiry handling needs explicit policy. |

### Code quality review

| Issue / evidence / confidence | Recommended choice and alternative | Consequence / proof |
| --- | --- | --- |
| **C1, F1:** [OpenAPI action operations](../../src/modules/discovery/internal/openapi-agent-routes.ts) use action-owned Zod input/output; [site manifest](../../src/modules/discovery/internal/site-manifest.ts) derives current MCP docs. 10/10. | Generate reference and examples from these sources. Alternative: handwritten parallel OpenAPI/MCP docs. | Avoids drift; prose remains editorial and generation gets a CI check. |
| **C2, F2/F3:** three adapters registered at [transport adapter lines 257–260](../../src/modules/capability-supply/internal/transport-adapters.ts); `HttpJsonTransportConfiguration` has reconciliation/cancel but no completion polling description. 9/10. | Extend adapter-owned contracts; keep provider-specific SDK logic inside adapters. Alternative: provider-name branches in orchestration. | Preserves module boundaries; tests/import fences catch leakage. |
| **C3, F5:** live `web search` returned two setup-required, unverified entries; #357/#359 improve chat discovery, not supply admission. 10/10. | Separate supply, match quality and public claims in one contract/acceptance trail. Alternative: count catalogue size or a working chat as procurement success. | Requires positive provider evidence; eliminates false parity closure. |

### Test review and coverage diagram

Existing framework: Vitest 4.1.9, `convex-test`, Playwright installed-client/browser journeys, and eval tests. AGENTS.md requires affected tests plus `npm run check`; `npm run gate` precedes merge/release. No runtime code changed here. Existing focused tests passed; the future branches below are acceptance requirements, not newly passing tests.

```text
CURRENT CODE / PROOF                          FUTURE USER FLOWS / GAPS
Principal -> Account                         F1 four role guide-led journeys [GAP ->E2E]
  membership / rotation / isolation [tested]    no key / wrong account / stale scope [existing tests + E2E]
Call quote -> admission -> dispatch           F2 conventional async Tool [GAP ->integration/E2E]
  grant / key / replay / recovery [tested]      start accepted -> restart -> poll -> final result
HTTP normalise                               queued 202 != final; schema invalid / TTL [GAP]
  JSON / continuation / cancel [tested]        lost start response -> observe, never duplicate [GAP]
  queued handle -> succeeded [fixture]         cancel vs completion vs refund [GAP]
Action schemas -> HTTP / MCP [tested]         F3 inspect -> quote -> graph admission [GAP]
                                              cycle / bad ref / 11 nodes / excess bytes [GAP]
                                              concurrent cap / grant revoke / price drift [GAP]
                                              map output -> child -> partial failure [GAP ->E2E]
                                             F4 selective output / artifact / refund [GAP]
                                              wrong Agent / expiry / no reexecution [GAP]
                                             F5 relevance/routing quality [GAP ->EVAL]
                                              deterministic vs Jev; two real providers [GAP ->E2E]
```

Auto-selected test decisions: (T1) integration tests plus installed-client proof for asynchronous and financial boundaries, not unit-only closure; (T2) adversarial DAG/budget/replay cases plus a positive mapped-output journey, not validator-only closure; (T3) account/agent content-isolation and retention/artifact tests, not publicly accessible result IDs; (T4) preregistered paired routing/task evals plus measured round trips/bytes/cost, not marketing benchmark inference. Four future coverage groups remain open. No regression from this docs-only change was identified.

### Performance review

| Issue / confidence | Recommended choice and alternative | Consequence / proof |
| --- | --- | --- |
| **P1, F3:** plan cost/graph state could multiply concurrent supplier work; existing installed Workpool provides concurrency control. 8/10. | Bounded ready-node scheduling, service/account limits and atomic budgets **[Layer 1]**. Alternative: unbounded `Promise.all`. | Measure 10-node fan-out, worker pressure and fairness; no invented throughput claim. |
| **P2, F4:** large binary/provider output can multiply workflow journal and repeated polling bandwidth; Mercator itself restricts large artifacts for dependency outputs. 8/10. | Pass content refs, bounded pointer/map reads and selective retrieval. Alternative: copying full output into every step/status. | Test byte/depth/array caps, cached reads and memory; secure storage/download bandwidth has a cost. |
| **P3, F1/F5:** discovery/ranking latency differs from actual completion; current latency requires exact-Tool sample evidence. 9/10. | Measure search, quote, queue, supplier and recovery separately, preserve missing evidence. Alternative: display a single guessed SLA or rank score. | Compare task success/time/turns/cost over a fixed corpus; freshness and insufficient samples stay visible. |

### Failure modes and acceptance handling

| Failure | Existing handling / required addition | User-visible contract and proof |
| --- | --- | --- |
| Membership/grant revoked after quote | Existing authority check; recheck each unreleased graph node. | Explicit refusal; no new effect; retained history access follows current policy. |
| Provider accepted start; response lost | Existing uncertain effect model; add registered handle lookup/status adapter. | Durable uncertainty + reconcile; no second paid start. Integration restart test. |
| Handle returned but output not ready | F2 persists accepted state and schedules bounded observation. | Pending with one next action; queued JSON never masquerades as deliverable. |
| Mapped dependency missing or output schema invalid | F3 bounded mapping and resolved-input validation. | Node failure / dependent skipped; completed siblings remain usable. |
| Dynamic downstream price exceeds ceiling | Refuse/requote before that node's release; aggregate accounting separate. | Material price/authority handoff, no silent budget increase. |
| Cancellation races with irreversible dispatch | Existing cancellation fence; preserve possible effect and per-provider cancellation evidence. | Cancellation requested/unsupported/unknown; no claimed rollback or automatic refund. |
| Artifact expires or caller belongs to another Account | F4 authenticated reads, retention/financial separation. | Expired/denied result without reexecution or leaked existence/content. |
| Retry storms or stale treasury/readiness | Existing fail-closed checks, native limits/backoff; add plan/provider quotas. | Bounded retry-after/unavailable; no hidden restart charge. |

These eight failure families have planned proof and explicit handling requirements. They remain implementation acceptance gaps, not silently accepted production guarantees. The reproduced 202-completion mistake is the first concrete adapter finding; current published exploitability was not established.

## Documentation information architecture

Use the existing `docs/` editorial source; retain ADR/design/operations as internal material. A public guide must not expose internal deployment inventory or treat a proposed design as an available product. Preserve [foundations.md](../foundations.md), the glossary and relevant current guides; revise `/for-agents` and `/for-providers` as entry points rather than duplicate a second complete manual.

| Audience | Must learn and accomplish | Proposed public pages / source |
| --- | --- | --- |
| Ordinary user | Find/compare useful supply; understand data recipient, price, setup and results; resume a pending Call; find help. | Start, choose/use a Tool, results/recovery, spend/receipts, privacy/help. Source: market actions, current UI, Quote/Call result contracts. |
| Organisation admin | Account ownership/membership, Agent scope and budget, rotation/revoke, funding versus authority, history, offboarding. | Account/teams, Agent connections, spending controls, security/lifecycle. Source: Clerk-backed authority, owner settings and lifecycle tests; broad live acceptance remains required. |
| Agent integrator | Install a supported released client, obtain resource-bound OAuth/key, select exact schemas, Quote/Call, retain idempotency/refs and recover. | Quickstart per supported client, auth, generated HTTP reference, generated MCP/CLI action map, error/retry and async recipes. Source: action registry, OpenAPI builder, manifest, CLI help/package. |
| Provider | Import/declare exact contracts, bind authorised credentials, test readiness, publish/version/withdraw, deliver/recover, understand earnings/remedy/offboarding. | Provider start, contract/adapters, test/publish lifecycle, async completion, data/terms, earnings/offboarding. Source: `supply.*` actions and owner funnel; future adapters labelled proposed. |

Recommendation **[Layer 1]: Fumadocs in the existing TanStack Start app**, using maintained MDX/Markdown loading and `fumadocs-openapi` for generated reference. Official [TanStack integration](https://www.fumadocs.dev/docs/manual-installation/tanstack-start) and [OpenAPI generation](https://www.fumadocs.dev/docs/integrations/openapi) were inspected; Node 22, Tailwind 4 and the existing React/TanStack stack align at the platform level. A pinned-version build/SSR trial is still required. Its Vite prebundling guidance and API-description MDX escaping are concrete integration risks. Do not install packages or choose latest versions incidentally in this review.

Alternative: a separate established static docs framework, or Scalar for just the API reference. Scalar-only would leave the four persona guides unorganised; a separate site adds a build/release surface. Start with repository Markdown and the current generator, then adopt the docs layer through one approved slice. No new docs website deployment now.

Generation chain:

```text
Action-owned Zod -> action descriptor -> current OpenAPI builder -> API pages/examples
                 -> MCP tool list / manifest -> client action reference
Versioned CLI help / package -> installation and command reference
Editorial docs -> persona guides + explanations -> public docs content
CI: schema/example + links + generation drift + SSR/build
```

Treat safe GET/discovery/Quote differently from consequential Call, Provider publication, funding and account commands. An interactive API explorer should start with execution disabled; a paid example needs a distinct meaningful user choice. Never embed keys in snippets or advertise `npx @aecon/cli` until npm publication is verified. Separate current, preview, proposed and recorded-runtime capabilities. Future DAG and asynchronous recipes appear only when their contracts/tests exist.

## Implementation Tasks

Estimates are planning ranges, not commitments; runtime proof/access can dominate elapsed time.

- [ ] **F1 (P2, human: 1–2 days / agent: 2–4 hours)** — Docs/contracts: adopt generated persona docs in the current app after pinned build trial. Surfaced by A1/C1. Areas: `docs/`, discovery/actions, existing public guide routes, build checks. Verify four journeys, source-generated examples and schema/link/build drift.
- [ ] **F2 (P1, human: 2–4 days / agent: 4–8 hours)** — Supply/execution: complete one conventional asynchronous Tool from accepted handle to validated result. Surfaced by A2/C2. Areas: capability-supply adapters, capability-execution/effect worker and conformance tests. Verify restart, lost response, queued 202, output/cancel/auth limits and one authorised hosted positive journey.
- [ ] **F3 (P1, human: 1–2 weeks / agent: 1–3 days)** — Contracts/authority/execution: deliver bounded immutable procurement graphs using current Calls and Workflow. Surfaced by A3/A4/P1. Areas: capability-contract, actions, authority, execution, economic ports, discovery; subdivide by an approved execution plan before touching many files. Verify positive mapped-output graph plus full budget/replay/drift/recovery cases.
- [ ] **F4 (P1, human: 3–5 days / agent: 6–12 hours)** — Results/finance/data: expose partial/selected/artifact results and independent refund status. Surfaced by A5/P2. Areas: execution reads, content storage, money views and adapters. Verify no reexecution, two-Account isolation, purge/expiry and sibling failure/refund allocation.
- [ ] **F5 (P1, human: 3–5 days / agent: 1–2 days plus access/settlement)** — Supply/DX: prove the same journey with heterogeneous providers, actual clients and four roles. Surfaced by C3/P3. Areas: supply admission, market/evals, installed harness and browser suites, current runtime receipts. Verify task success, cost/turns/latency/repeat use; preserve #279/#288 limitations.

Sequential implementation, no parallel execution is started here. Later, docs content and adapter code can be independent after schema ownership is fixed; aggregate authority/execution/economic work shares modules and must be coordinated sequentially. F4 depends F3 and F5 depends the earlier slices. No research checkout or detached delivery stream is needed.

## NOT in scope

- Paid tests or new payment rails now: financial authorisation and exact supported economics must precede live effects.
- General agent runtime, project planning, memory, arbitrary code transforms or visual workflow editor: outside the current product ownership boundary.
- Reopening retired RoutePlan/Agent Engine tickets: historical models are not current implementation.
- New identity, token issuer, queue, scheduler, ledger or trace store: current official components already supply commodity machinery.
- Datadog configuration/register amendment: separately owned in #284 / ADR 0005.
- Public invitations, subscriptions, secrets/permission settings and deployment: not authorised by this review.
- A new docs website/repository/deployment: factual Markdown preparation only; framework adoption awaits its supported build trial.

## GSTACK REVIEW REPORT

| Review | Trigger | Runs | Status | Findings |
| --- | --- | --- | --- | --- |
| Engineering | `/plan-eng-review`, explicit delegated foundation goal | 1 | DONE_WITH_CONCERNS: preparation reviewed | Step 0; 5 architecture, 3 code quality, 4 future test groups, 3 performance issues; 145 foundation tests and 656 conformance tests passed (overlap; 24 existing conformance skips); required check passed; free graph quote and 202 fixture reproduced. |
| Wayfinder | Installed Wayfinder Delivery | 1 | scoping/preparation complete; runtime awaiting-direction | Existing #256/TODOS reused; protected concurrent Datadog changes; five ordered slices and exact proof ceilings. |
| Independent outside voice | Not requested for this preparation | 0 | skipped | No independent or cross-model review claimed. |

Five backlog choices retain the complete recommended bounded path; none was silently cut. No current shipped regression or verified production exploit is claimed. A source-only pass is insufficient to close runtime parity. Durable learning: conventional queued JSON without a declared completion adapter can normalise as success; admission must distinguish provider acceptance from final delivery.

**VERDICT:** foundation review and initial docs are ready for direction; capability parity remains open.

**UNRESOLVED DECISIONS:**
- Joel's direction for generic bounded multi-Tool procurement alongside Provider packages, including aggregate authorisation and separate purchase/remedy semantics.
- Exact dynamic-price ceilings, data/result retention and financial allocation for composed work before paid implementation.
- Actual provider entitlements, including permitted resale/distribution and the applicable data terms; catalogue presence and a free Quote are insufficient.
- Literal rail/client/incentive interoperability scope (MPP/Tempo/SPT, rewarded reviews/social grants, embedded MCP App/WebMCP) and supported docs-framework version after build trial.
