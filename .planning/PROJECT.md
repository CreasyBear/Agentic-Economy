# Agentic Economy — Product Conversion Charter

**Status:** active implementation authority
**Decision owner:** Founder
**Rebaselined:** 2026-08-08

## Product

Agentic Economy lets developers turn agent capabilities into discoverable, metered services that agents can buy.

**Canonical category sentence:** “Agentic Economy is the market and controlled transaction layer where authorized agents discover, buy and invoke admitted third-party Market Operations, and suppliers are paid after contract-valid delivery.”

**Principal and delegated agent:** A human or organization is the **Principal**: it owns authority and budget. The agent is the Principal’s delegated shopper and distribution interface: it discovers, compares, buys and invokes within that authority. A **Supplier** hosts the implementation and offers a callable `Operation`; AE admits it, projects it as a `Market Operation`, and owns the invocation identity, policy boundary, evidence, Qualified Use, metering and reconciliation. AE does not host supplier runtimes.

**Platform meaning:** Developers build and host agent capabilities wherever they choose. AE admits each callable `Operation`, projects it as a `Market Operation`, distributes it to agents, and meters verified usage and payment through AE’s invocation/evidence boundary. `Supplier` is the portfolio rollup; `Provider` remains the registered Business that can fulfil an `Operation`.

**Category shorthand:** OpenRouter for agent services: one agent-facing market and invocation interface over many supplier-hosted Operations. AE provides a Vercel-style self-serve publishing and operating experience without owning the runtime. The consuming agent is the app store: discovery, comparison, purchase and invocation happen at runtime rather than through a human installation flow.

**Category guardrail:** Trades, Australian small businesses, BAS and human-service coordination may be future suppliers/use cases; they are not the category, ICP, wedge or default product frame.

This sentence names the destination; the current evidence section does not claim that production settlement, independent supply or customer value is already proven.

AE hosts the market and transaction boundary, not supplier runtimes. Skills, SDKs and repositories remain acquisition, lineage and distribution inputs; they become market supply only through an admitted callable `Operation` with an evidence path.

**Creator/UGC supplier-economy model (destination):** Mature Instagram/YouTube-style creator/UGC publishing and algorithmic distribution is an operating-model analogy, not a category rename: eligible businesses/developers publish supplier-generated Operations with supplier-hosted implementations and bespoke datasets; AE admits/indexes/recommends/distributes them into agents' normal workflows for low-commitment one-use consumption, not bilateral relationships or AE-hosted content/runtimes. Admission/publication/eligibility evaluate the exact contract, provenance, authorization/ownership, license/derivation rights and immutable lineage; readiness is a later independent routeability gate, and Principal/execution authority is a later independent invocation gate. Passive views, impressions and exposure are distribution observations, not invocations; active use is an invocation. Qualified Use is only a non-owner, contract-valid production invocation with required evidence and exclusions, independent of payment settlement. Supplier accrual/creator earnings require Qualified Use plus separately authoritative reconciled economic settlement. Authorized licensed or materially derived supply is allowed and distinguished from unauthorized copy/republication; provenance/validity never proves semantic truth, and anti-copy/unauthorized-republication controls do not ban authorized source use. The loop is publish → admit → distribute → invoke → validate → settle → learn → revise/withdraw; ordering uses contract fit, price, freshness, readiness, non-owner Qualified Use, reliability/latency and bounded exploration, never gross calls, owner traffic, popularity alone or one opaque score. Agent runtimes consume/distribute supply and are not Principals. This is not proof of independent supply, production settlement, recommendation quality or a functioning flywheel, and it is not influencer/brand procurement, creator-hiring marketplace work, briefs/applications or collaborations.


**First-party demand application:** AE retains the person-facing execution loop as a subordinate demand-side application and proving ground for the platform. A Principal’s agent can discover admitted Market Operations, decide within granted authority and carry registered invocations through external effects, evidence and recovery. This application is not the platform category.

`UBIQUITOUS_LANGUAGE.md` owns domain vocabulary. Live source and executable
behavior decide what exists now. This charter owns the destination; the former
`PRODUCT.md` and `DESIGN.md` were removed on 2026-07-25 and are no longer
authority.

## Current program — Atomic Operation Market Reset

The active program is the reset contracted in
[`reset/OPERATING-MODEL.md`](reset/OPERATING-MODEL.md). It narrows AE to one market
kernel with thin MCP/CLI/chat adapters and removes AE-owned workflow orchestration.

```text
Phase 0 — Preserve the current baseline                complete (tag baseline/pre-atomic-market-reset)
Phase 1 — Close the category additively                open
Phase 2 — Decouple without changing behavior           pending
Phase 3 — Port proof before quarantine                 pending
Phase 4 — Replace chat orchestration                   pending
Phase 5 — Quarantine and deprecate                     pending
Phase 6 — Retire data separately                       pending
```

**What AE owns after the reset:** operation identity and contract, authorization,
exactly-once durable invocation, delivery evidence, and brokered money. Consuming agents
own planning and orchestration. The core loop is
`publish → admit → search/get/compare → execute-or-invoke → validate → receipt → settle`.

**What leaves the core:** deterministic chat intent routing, Customer Request workflow
handoff, WorkTree, and Study. These are quarantined — writes frozen, evidence preserved,
no data dropped — not deleted.

**V1 money is AE-brokered only.** The organization/account owns funds and aggregate
budget; API keys receive narrower grants. x402 remains import/discovery metadata and is
refused as a live payment lane.

### Prior program (historical)

```text
Phase 1 — Action Invocation foundation                 complete
Phase 2 — One action plane across human/agent hosts    accepted_narrowed
Phase 3 — Paid-operation product conversion            complete in declared evidence classes
Phase 4 — Business Account and routeable supply        source complete; hosted proof uncertified
Phase 5 — Public Offering decision loop                source landed on main
Phase 6 — Single-Key Capability Gateway                converged into the reset baseline
```

## Single-Key Capability Gateway — folded into the reset baseline

**Status:** remediation campaign open; seven workstreams focused-verified; automatic daily supplier-settlement policy decided in ADR-034 but source implementation remains open; Node 22 post-codegen source gate green; production policy values, manifest, and hosted certification blocked  
**ADR:** [`ADR-035`](adr/ADR-035-single-key-capability-gateway.md)  
**Plan:** [`2026-08-09 implementation plan`](research/2026-08-09-single-key-capability-gateway-implementation-plan.md)
**Historical closeout:** [`2026-08-11 goblin source remediation outcome`](research/2026-08-11-goblin-source-remediation-plan.md)

The 2026-08-11 remediation closeout and its source/local gate claims are
historical evidence for that dated snapshot, superseded for current status by
the 2026-08-12 post-remediation re-audit recorded in `PAPERCUTS.md`.

The approved gateway gives one Clerk-issued AE bearer key access to many
admitted Market Operations while keeping supplier credentials server-side.
Clerk remains credential issuer/revocation authority; AE owns the
`AgentAccessPrincipal`, grant, operation policy, invocation, money, evidence,
and recovery. The canonical protected action is `operation.invoke:v1`, the
canonical HTTP contract is `POST /api/v1/operations/execute`, and MCP, CLI,
and Answer are adapters over the same application service. Existing
`operation.execute:v1` remains public/keyless/read-only.

The work is sequenced W0→W8:

- **W0 — architecture freeze:** record the split, canonical route/action,
  source owners, no-handroll commitments, and proof ceiling.
- **W1 — generalized access:** move the Customer Request verifier,
  principal, OAuth/device-code, and grant contracts into
  `src/modules/agent-access/` with a clean caller cutover.
- **W2 — policy admission:** add server-owned per-key grant, budget, rate,
  concurrency, and standing-mandate admission over existing money/rate seams.
- **W3 — protected contract:** expose `operation.invoke:v1` through the HTTP
  route and registered MCP action with shared identity/idempotency semantics.
- **W4 — invocation service:** bind operation/publication/binding/provider/
  authority/money/evidence identity to the existing durable Action Invocation
  and transport kernels.
- **W5 — provider authority:** add generation-bound provider connection leases,
  final authority checks, and server-only credential custody.
- **W6 — recovery/evidence:** add bounded read/cancel/reconcile, correlation,
  redacted observability, and durable unknown-outcome handling.
- **W7 — first use/settings:** ask only the authority question and separate
  consumer-key settings from supplier connection management.
- **W8 — release proof:** publish one HTTP and one MCP contract, make CLI and
  Answer clients of the application service, and run exact-revision hosted
  proof with two real operations before claiming production capability.

The implementation reuses the existing Clerk auth/OAuth, action registry and
MCP, keyless operation executor, capability-supply admission/readiness and
provider-connection, Action Invocation, route transport, money, rate limiter,
canonical digest/stable serialization, RFC 9457, and Convex transaction seams.
No second token verifier, registry, billing ledger, transport, or execution
state machine is permitted. `RULES.MD` gates remain absolute: no weakened
validators, proof-class inflation, fixture/mock/refusal-as-live claims,
hard-coded demo paths, tautological tests, dependency smuggling, or
refusal-only close.


ADR-009 and ADR-010 establish the control plane. ADR-019 establishes the
authority-mode destination. ADR-020 narrows the first product projection to one
standalone approve-each BTC/USD operation through one mock provider.

Customer Request remains the aggregate for a broader outcome. Phase 3 proved
the standalone paid-operation path and a human/agent handoff seam. Phase 4 now
turns those source mechanics into a mature Business Account and routeable-
supply operating loop without treating the evaluator-only paid host as the
account or supply platform.

ADR-024 owns Business Account/customer-management meaning. ADR-025 owns the
separation of AE account Commercial truth, operation payment, Usage, telemetry
and future payouts. ADR-026 owns the one-business supply graph.

Phase 5 was accepted as a public, no-login, entirely `inspect_only` Offering
decision loop, superseding the earlier quote-to-close wording. On 2026-07-25
that narrowing was deliberately widened: catalog supply can now express a
callable, priced capability, and `/api/sandbox/$slug/checkup-quote` serves it
to agents and people against labelled sandbox supply (`b342afa7`, `c6f871fd`).
Real-customer operating proof, independently operated supply and close/start
remain deferred.

## Current evidence

The revision-bound baseline is `baseline/pre-atomic-market-reset` on `main`
(`9d7aaef6`), pushed 2026-08-16 with a clean working tree. It carries the gateway
convergence, the structured answer effect policy, and machine-readable CLI failure exits.
Typecheck and lint pass at that revision; the outer production release gate still fails
closed at deployment-manifest validation for missing operator-owned production
configuration. Measured gate results are in
[`reset/RECEIPTS.md`](reset/RECEIPTS.md).

### Historical evidence

The 2026-08-11 source closeout record is historical
source/local evidence: it passed Node 22 typecheck, Convex codegen dry-run, lint,
production build, the 45-file/312-test integration release suite, and the
13-case/15-turn Answer evaluation, plus focused gateway, recovery, money,
receipt, and UI-contract checks. No strict hosted gateway receipt exists in
`output/release/`; production proof still requires the validated exact-revision
receipt and approved live-money block.

Current status is not source-remediation complete: seven workstreams are
focused-verified and ADR-034 now selects automatic daily full-balance supplier
settlement, but PRA-003 source implementation remains open. The complete Node
22 post-codegen source gate passed on 2026-08-12.
The outer production release gate fails closed at deployment-manifest validation
because operator-owned production configuration is absent or malformed. Hosted
certification remains blocked.

On 2026-07-25 the owner removed the public-claim ceiling: the `contract-scans`
banned-copy register, the `claims-register`, `phase1-banned-copy`,
`pm05-trust-language-gate` and `discovery-overclaim` suites, and the answer
standing-caveat and overclaim gates are deleted (`cfebb919`, `2cb10448`,
`97b978b3`). Public copy is now an owner judgement, not a machine-enforced
ceiling. Evidence classes still apply to internal claims: current proof is
source plus focused local tests. No hosted autonomous execution, independently
operated provider fulfilment, customer value or production-safety claim
follows.

Phase 4 planning is mapped against Phase 3D source revision
`63a451f43edea453d0a1a8d8502504433acf76fb`. That revision supplies the
human/agent paid-action handoff seam; it does not contain the planned
Business Account, Commercial, Usage or routeable-supply operating loop.

Historical marketplace/bootstrap planning, field-study material and the Phase
1/2 execution ledger are preserved under
`.planning/archive/pre-product-conversion-rebaseline-20260720/`.

## Operating rule

Every phase ends in working source plus an executable demonstration, a
source-linked decision that narrows implementation, or the earliest
reproducible blocker. Plans, issues and repeated audits are inputs, not
progress.

Do not reopen completed kernel work merely to make UI implementation easier.
Product projections consume source-owned truth; they do not reconstruct
authority from component, transcript or browser state.
