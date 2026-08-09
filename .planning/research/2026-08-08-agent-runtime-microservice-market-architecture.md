# Agent Runtime Microservice Market — Architecture

**Date:** 2026-08-08  
**Status:** design decision; source-bound and intentionally implementable in slices  
**Companion evidence:** [Agent Runtime Microservice Market — Literature Review](./2026-08-08-agent-runtime-microservice-market-literature-review.md)

This document defines a market for hosted agent-runtime infrastructure, not a directory of every skill, repository, install, or vertical business service. It compares **Hosted Exchange**, **Protocol Index**, and **Managed Router**, then selects the smallest architecture consistent with the existing Agentic Economy (AE) source-of-truth and execution seams.

## 1. Decision in one page

### 1.1 Market boundary

**[DESIGN DECISION]** The market supply unit is an **Agent Runtime Microservice**: a remotely callable, typed, admitted operation that accepts bounded input, performs bounded work, and returns a typed result/evidence. The canonical competitive subject is one **Market Operation**, identified by the existing content-derived `operationRef`; a **Supplier**/business is a portfolio rollup, not the operation identity.

**[DESIGN DECISION]** Static skills, repositories, local CLIs, SDKs, README instructions, GitHub stars/forks, and skills-directory installs are not metered supply. They remain acquisition, lineage, and distribution signals. They become market supply only after a Supplier exposes a real hosted operation with an admitted contract, a remotely callable binding, and an evidence path.

**[DESIGN DECISION]** V1 is measurement/discovery, not managed allocation. Discovery, execution, settlement, reputation, ranking, and allocation are separate rails:

| Rail | Question | Authority |
|---|---|---|
| Discovery | Which admitted operations match a query? | Existing operation registry/search projection |
| Execution | What happened when one operation was invoked? | Existing answer/action/route execution seams |
| Settlement | Was an exact amount finally reconciled? | Existing money/x402 settlement evidence |
| Reputation | What independently attributable evidence exists? | Derived, labelled evidence views |
| Ranking | How do operations sort for one disclosed metric/window? | Derived `Leaderboard View`; never execution authority |
| Allocation | Which candidate should receive traffic for a request? | Deterministic plan/mandate/action kernel; deferred optimization |

### 1.2 Selected architecture

**[DESIGN DECISION]** Adopt a **Protocol Index with a bounded Hosted Exchange slice**:

1. Reuse capability-supply publication, admission, lifecycle, operation identity, and registry discovery as supply authority.
2. Reuse the existing keyless execution seam for one safe hosted lane (Flow A): a DB-described, keyless, HTTPS `http-json:v1` `GET` operation, with input/output validation and bounded request/response.
3. Keep provider-direct x402 execution (Flow B) and its payment/receipt path separate. Do not force every provider through AE, and do not call a challenge, authorization, provider assertion, or possibly-submitted payment “settled.”
4. Add only a source-bound, rebuildable `Market Observation` projection and operation-level query views. Do not add a second invocation ledger, payment ledger, router, or opaque quality score.
5. Permit provider-direct receipt ingestion only when an authoritative receipt can bind one invocation to one `operationRef`, contract revision, exact atomic amount, and evidence. Until that seam exists, settled metrics are absent rather than estimated.
6. Defer Managed Router allocation. A public list is not a traffic mandate; a future allocation experiment requires randomized exposure and outcome evidence first.

**[OBSERVED FACT]** `createPublicOperationRef` derives `operation:v1:<64 hex>` from operation ID, publication reference/revision, and contract reference (`src/modules/capability-supply/public.ts:createPublicOperationRef`, 59–79). The public descriptor carries input/output schemas, commercial terms, provenance, effects, evidence, recovery, and availability (`src/modules/capability-supply/operation-projection.ts:90–114,339–352`).

**[OBSERVED FACT]** Registry search is deterministic lexical matching/scoring, not usage or reputation ranking: `searchCapabilityOperations` filters current records, then `score` gives exact/starts-with/contains token weights and uses `operationRef` as a tie-break (`src/modules/capability-supply/operation-projection.ts:268–288,949–964`).

**[OBSERVED FACT]** The current keyless reader emits only current, active, published, admitted, conformant, keyless, non-x402, `http-json:v1` `GET` operations (`convex/capabilitySupplyOperations.ts:482–570,573–650`). `executeOperation` re-reads the DB descriptor, validates input/output, rejects caller-supplied hosts, makes one bounded HTTPS request, and returns `ok`, `refused`, or `error` with an evidence hash (`src/modules/capability-execution/operation-execute.functions.ts:7–24,40–78,80–233`).

**[OBSERVED FACT]** Current x402 transport distinguishes payment submission, provider assertion, and final settlement: `RouteTransportObservation` has separate payment-submission and settlement states; a payment response produces `settlementStatus: 'provider_asserted'`, while network ambiguity produces `possibly_submitted`/`unknown` (`src/modules/capability-supply/route-transport-runtime.ts:147–164,722–775`). Paid-operation projection calls payment settled only with a settled amount and non-empty evidence references (`src/modules/action-invocation/paid-operation-semantics.ts:289–306`). This is the current provider-direct settlement gap.

## 2. Hosted Exchange, Protocol Index, Managed Router

### Hosted Exchange

**Shape:** AE is the mandatory data plane. It admits a Supplier operation, invokes it, records every attempt/result, and—if AE charges internally—owns customer charge and reconciliation.

**[DESIGN DECISION]** It gives complete AE-mediated telemetry and one place for schema, authority, rate, idempotency, and evidence gates. The existing keyless executor is a positive narrow example.

**[DESIGN DECISION]** Do not make this the whole market. Mandatory proxying imposes credentials and operational coupling and invites duplicate `HostedExecution`/`MarketLedger` tables. Provider-direct x402 is intentionally separate, and the current executor refuses x402 (`src/modules/capability-execution/operation-execute.functions.ts:90–102`). Use Hosted Exchange only for the bounded Flow A lane and its evidence.

**[OBSERVED FACT]** AE-internal per-call charging reaches `moneyPort.authorizeInvocationCharge`; the same source says route-transport x402 is an external provider-credential path and must not also charge that invocation (`src/modules/action-invocation/dynamic-published-adapter.ts:361–364,395–431`). `convex/moneyLedger.ts:17–24` inserts `moneyUsageEvents` idempotently. These rails must not be joined.

### Protocol Index

**Shape:** AE is the canonical descriptor/admission/index and evidence projector. Suppliers may execute provider-direct over HTTP, MCP, or x402. AE may run bounded probes or receive signed/facilitator/chain receipts, but provider-direct traffic is not silently represented as AE-observed traffic.

**[DESIGN DECISION]** This preserves low-friction provider-direct supply, stable provenance and operation identity, catalog-only/observed/provider-attested/payment-verified/settled-verified evidence tiers, and one source-of-truth model. Its cost is incomplete visibility: dashboards, aggregate counters, successful HTTP responses, x402 challenges, and provider signatures cannot establish independent usage/reliability/settlement. Return absent/unknown instead of guesses.

**[OBSERVED FACT]** Current capability-supply storage persists publication identity/revision, `operationRef`, source kind/digest, authority mode, offering/binding references, disposition, credential/health state, readiness evidence, and lifecycle fields (`src/modules/capability-supply/internal/convex-schema.ts:106–205`). This is the index substrate, not a reason to add `MarketListing`.

**Chosen use:** the V1 architecture.

### Managed Router

**Shape:** AE selects among candidate operations and routes customer traffic, potentially optimizing cost, latency, reliability, or settlement. Its selection is an **Allocation Decision**, not a leaderboard fact.

**[DESIGN DECISION]** It could provide complete telemetry for traffic AE controls and enforce authority, budgets, idempotency, fallback, and route evidence through existing customer-request machinery.

**[DESIGN DECISION]** Defer public-market automatic allocation. A route choice creates selection bias; selected-only outcomes cannot establish counterfactual quality. Popularity routing amplifies cold-start/rich-get-richer effects, and a composite reward is gameable. Allocation requires a candidate set, context, randomized exposure/propensity logging, terminal outcomes, and a declared objective.

**[OBSERVED FACT]** Customer-request route records distinguish run/attempt/dispatch identity and terminal `completed`, `failed`, `cancelled`, and `outcome_unknown` (`convex/customerRequestRouteExecutionJournalPorts.ts:82–95,387–399`; `convex/customerRequestRouteExecution.ts:120–151`). This is execution/authority machinery, not a market recommender.

### Decision matrix

| Criterion | Hosted Exchange | Protocol Index | Managed Router |
|---|---|---|---|
| Provider-direct interoperability | Low | High | Low/medium |
| AE-mediated telemetry | High for hosted lane | Low outside probes/receipts | High for routed lane |
| Duplicate truth-model risk | High if new tables | Low when projection-only | High if router invents telemetry |
| Current keyless seam | Yes | Yes, bounded lane | Yes, not required |
| Honest current x402 | Only with custody/reconciliation | Catalog/observed/provider-attested until receipts | Only with route/payment authority |
| V1 fit | Partial | **Selected** | Deferred |
| Automatic allocation | No by itself | No | **Explicitly deferred** |

## 3. Proposed vocabulary and invariants

| Term | Definition |
|---|---|
| **Agent Runtime Microservice** | Hosted, remotely callable, typed runtime primitive: bounded input → bounded work → typed result/evidence. A static skill/repository is not one until it has a real admitted runtime binding. |
| **Market Operation** | One admitted operation contract + publication revision + transport binding. Its only market identity is valid `operationRef`; never a readable capability ID, URL, slug, or business ID. |
| **Supplier** | Provider/owner identity publishing one or more Market Operations. Supplier numbers are derived portfolio views and never replace operation attribution. |
| **Invocation Fact** | Immutable, source-bound fact about one logical production invocation: operationRef, logical invocation/attempt refs, principal class, time/duration, terminal disposition, validated result/evidence refs, environment, and settlement refs when present. An un-attributed row cannot enter operation metrics. |
| **Qualified Use** | One logical production invocation with validated terminal success. Retries, tests, local/development/sandbox, owner/self, refused/failed/unknown, and duplicate attempts are excluded. Listing, popularity, 2xx, and provider assertion are insufficient. |
| **Settled Use** | Qualified Use with authoritative reconciled settlement evidence bound to the same operation/invocation, revision, exact amount, currency/asset, network, exponent, pay-to/invoice, and receipt. Challenge, authorization, provider_asserted, possibly_submitted, and unknown are not settled. |
| **Active Runtime** | Current admitted publication whose lifecycle, offering, binding, conformance, health/readiness, and availability gates are active at observation time. Active means eligible now, not universally reliable. |
| **Market Observation** | Rebuildable projection of Invocation Facts/settlement facts including metric, window, numerator/denominator or exact amount, evidence tier, exclusions, source refs, freshness, and as-of. Never source truth. |
| **Leaderboard View** | Operation-first, metric-specific, windowed read sorted by one disclosed metric. It is comparison/discovery, never execution mandate, payment authority, or quality score. |
| **Allocation Decision** | Deterministic, authority-bound selection/route/mandate for one request. It is not inferred from a leaderboard; future optimization needs randomized evaluation and separate evidence. |

**[DESIGN DECISION] Invariants:** operationRef is the only operation identity; revision changes create new refs; admission, execution, settlement, and projection keep separate authorities; missing is `no_data`/`insufficient_evidence`/`unknown`, never zero/success; one logical invocation counts at most once; Supplier totals name member operations; no metric combines calls/tokens/stars/installs/latency/reliability/revenue/ratings/rank; a public view grants no routeability, authority, credentials, spending permission, or provider selection.

## 4. Source-of-truth diagram

```text
Static skill / repository / SDK / CLI
   │ acquisition + lineage only (never metered supply)
   ▼
Provider hosted descriptor (OpenAPI / MCP / x402 / AE envelope)
   │ source bytes + digest; metadata alone is not execution
   ▼
Existing normalize → admit → publish seams
   │
   ├─ Convex capabilityPublications / Offerings / Bindings /
   │  lifecycle + readiness [SUPPLY AUTHORITY]
   │       └─ createPublicOperationRef [Market Operation identity]
   │                    ▼
   │             registry search/detail [DISCOVERY ONLY]
   │                    │
   │       ┌────────────┴───────────────────────┐
   │       │                                    │
   │ Flow A keyless answer tools          Flow B customer-request/x402
   │ readKeylessExecutable                route runs/attempts/outbox
   │ → executeOperation                   → RouteTransportObservation
   │ → validated result/evidence           → payment attempt/reconciliation
   │ → answerToolCalls                     → route outcome/evidence
   │       │                                    │
   │       └────────────┬───────────────────────┘
   │                    │
   │ Development-only dynamic-published money rail
   │ → moneyLedger / moneyUsageEvents (not joined to x402)
   │                    │
   │ Provider-direct receipts (later, optional)
   │ → receipt-binding adapter → existing evidence/settlement authority
   │                    ▼
   │ Invocation Facts + authoritative settlement facts
   │                    ▼
   │ Market Observation projection (rebuildable/source-bound)
   │   ├─ operation Leaderboard Views
   │   └─ Supplier Service.endpoints[] rollup
```

**[OBSERVED FACT]** `answerToolCalls` stores tool ID, input/result JSON or summary, result hash, status, sequence, and timestamp (`src/modules/answer-thread/internal/convex-schema.ts:41–54`); the answer agent routes operationRef to the executor (`src/modules/answer/internal/answer-tool-use-agent.ts:523–552`). Explicit operation attribution is required before this is an operation-level market source; tool name/prose must not be guessed.

**[OBSERVED FACT]** Dynamic execution records liquidity observations with business/offering/task/environment, `filled`/`zero`, success time, duration, and evidence refs (`src/modules/action-invocation/dynamic-published-execution.ts:141–159`). Current `capabilityCallEvents` has business/offering/publication/task/outcome/time/evidence/environment but no operationRef (`src/modules/capability-supply/internal/convex-schema.ts:220–247`). Operation ranking therefore needs an additive attribution field at a schema cutover; never guess a backfill from offering.

**[OBSERVED FACT]** Canonical public business projection is one `Service` per business with flat `endpoints[]`; operation linkage is injected only when capability-supply proves a unique origin link, otherwise absent (`src/modules/registry/internal/service-projection.ts:4–20,32–90`; `src/modules/registry/internal/services-api-projection.ts:23–32,160–210`). Use it as Supplier portfolio display, not operation truth.

## 5. Minimal deep module/interface

**[DESIGN DECISION]** Add one projection module at the market seam, tentatively `MarketObservationIndex`. It is deep: callers learn one small read interface while implementation owns source joins, attribution checks, qualification, evidence tiers, windows, dedupe, exact amounts, rollups, freshness, and ordering. It does not own publication, discovery, transport, execution, custody, or settlement.

```ts
type MarketObservationIndex = Readonly<{
  project(input: {
    scope: 'operation' | 'supplier'
    operationRef?: PublicOperationRef
    supplierRef?: string
    metric: 'qualified_uses' | 'eligible_attempts' | 'reliability'
      | 'latency' | 'distinct_consumers' | 'settled_uses'
      | 'settled_volume' | 'growth' | 'freshness'
    window: { kind: 'rolling'; duration: '24h' | '7d' | '30d' }
    limit: number
    cursor?: string
  }): Promise<MarketProjectionResult>
}>
```

**[DESIGN DECISION]** Read ports for existing source rows stay internal. `@convex-dev/aggregate` may accelerate reads, but aggregate rows are not authority. Return `no_data`/`insufficient_evidence`, never synthesize. A later receipt adapter writes through an existing validated evidence/settlement port; it is not a second ledger and does not enlarge this public interface. Do not add `publish`, `discover`, or `execute`: existing seams already own those behaviors.

## 6. Source-bound projection schema

This is a proposed projection shape, not a replacement source table:

```ts
type MarketObservation = Readonly<{
  observationRef: string // digest of source refs + metric + window + evidence tier
  scope: 'operation' | 'supplier'
  operationRef: PublicOperationRef
  supplierRef?: string
  metric: 'qualified_uses' | 'eligible_attempts' | 'reliability'
    | 'latency' | 'distinct_consumers' | 'settled_uses'
    | 'settled_volume' | 'growth' | 'freshness'
  window: { kind: 'rolling'; start: number; endExclusive: number; duration: '24h' | '7d' | '30d' }
  status: 'observed' | 'no_data' | 'insufficient_evidence' | 'stale'
  numerator?: string
  denominator?: string
  value?: { kind: 'count' | 'ratio' | 'duration_ms' | 'growth_delta'; value: string }
  amount?: { currency: string; asset?: string; network: string; exponent: number; units: string }
  evidenceTier: 'ae_observed' | 'payment_verified' | 'settled_verified' | 'provider_attested'
  sourceRefs: readonly string[]
  invocationRefs: readonly string[]
  exclusions: readonly string[]
  observedAt: number
  generatedAt: number
  freshUntil?: number
  sourceDigest: string
  memberOperationRefs?: readonly PublicOperationRef[] // Supplier only
}>
```

**[DESIGN DECISION]** Atomic `amount.units` is an exact integer string with explicit currency/asset/network/exponent. Catalog decimals are never settlement truth; currencies/networks are never combined; sub-cent catalog prices stay catalog-only until exact settlement exists. Observations rebuild from canonical source rows at a known commit/snapshot; source refs/digest, times, window, denominator, exclusions, and evidence tier are mandatory for observed results.

## 7. Exact metrics and windows

### Qualification predicate

1. Valid operationRef resolves to admitted contract/publication revision.
2. Runtime was active/routeable at invocation, or a provider-direct receipt binds operation/revision.
3. Production environment only; local/dev/sandbox/test/probe/owner/self excluded.
4. Stable logical invocation identity; one logical invocation, not each retry/attempt.
5. Input passed authority/contract; success has validated result/evidence.
6. Bounded non-future time/duration and evidence refs for the claimed tier.

Failure of attribution/integrity is excluded/quarantined, not zero. `outcome_unknown` is operationally retained but not success or eligible terminal quality evidence.

| Metric | Definition | Exclusions |
|---|---|---|
| `qualified_uses` | Distinct logical production IDs with validated terminal success, grouped by operationRef. | Retries/duplicates, tests/probes, owner/self, local/dev/sandbox, invalid input, refusal/failure/unknown, unbound result. |
| `eligible_attempts` | Distinct first logical production attempts that passed admission/input/authority and reached provider/runtime terminal success or known failure/refusal. | Retries; preflight/admission/rate/input refusal before provider contact; owner/self/test; unknown/reconciliation-required. |
| `reliability` | `qualified_uses / eligible_attempts`, only with source-complete numerator/denominator and denominator > 0; return both counts. | Successes-only/provider aggregate claims; fabricated denominators. |
| `latency` | p50/p95/count of bounded duration for qualified validated production uses. | Retries, probes, unknown, invalid/refused-before-call, missing duration, owner/self/test, unproven provider percentiles. |
| `distinct_consumers` | Unique privacy-preserving principal/runtime IDs bound to qualified production invocations. | Missing/unstable/provider-invented anonymous IDs; owner/self/test. Omit when identity cannot be proved. |
| `settled_uses` | Distinct Qualified Uses with authoritative reconciled settlement bound to same operation/invocation and exact terms. | `not_evidenced`, `provider_asserted`, `possibly_submitted`, `unknown`, unbound receipts, unreconciled refunds/reversals. |
| `settled_volume` | Sum exact atomic units of Settled Uses partitioned by currency/asset/network/exponent; partial refunds use authoritative net only. | Catalog decimals, estimates, dashboards, challenges, authorization, provider assertions, unbound payments, silent rounding, unreconciled refunds. |
| `growth` | Current trailing 7d vs preceding 7d, or current 30d vs preceding 30d; return delta/rate only when baseline > 0, else `no_data`/`new_baseline`. | Mixed tiers/windows/definitions; infinite zero-baseline growth. |
| `freshness` | Active/readiness state as of observation with last evidence and `freshUntil`. | Lack of observation is not failure; stale does not erase history. |

**[DESIGN DECISION] Windows:** UTC rolling `[start,endExclusive)` presets are 24h, 7d, 30d. Invocation metrics use terminal invocation time; settled-volume uses authoritative settlement time and exposes invocation references. `generatedAt` is projection time. Sort ties by operationRef ascending after the one selected metric. Supplier reliability recomputes from summed attempts, never averages percentages; distinct consumers roll up only with a shared identity namespace.

## 8. Leaderboard queries

**[DESIGN DECISION]** A `Leaderboard View` is one metric/window:

```json
{
  "scope": "operation",
  "metric": "qualified_uses",
  "window": { "kind": "rolling", "duration": "7d" },
  "evidenceTier": "ae_observed",
  "limit": 25,
  "cursor": "..."
}
```

Results include registry descriptor plus observation status/value/counts, source/evidence tier, observed/fresh times, exclusions, and source disclosure. `no_data` is not ranked as zero. Supplier results expose member operation refs and aggregation rule. V1 may expose separate lists for qualified uses, reliability, latency, distinct consumers, settled uses/volume, growth, and freshness. It must not expose `qualityScore`, `marketScore`, weighted sums, or popularity sorting inside lexical registry discovery. Paid placement, if later introduced, is labelled and cannot alter evidence or routeability.

**[OBSERVED FACT — PRIMARY PRECEDENT]** CDP Bazaar search exposes individual usage/recency/quality fields such as `l30DaysTotalCalls`, `l30DaysUniquePayers`, and `lastCalledAt`, but its documented `quality` is not a disclosed AE metric contract (`https://docs.cdp.coinbase.com/api-reference/v2/rest-api/x402-facilitator/search-x402-resources`). AE borrows the operation-level shape, not an opaque score.

**[OBSERVED FACT — PRIMARY PRECEDENT]** Agentic Market presents a business with flat `endpoints[]` and shallow URL/method/parameter/network/pricing/quality fields (`https://agentic.market/SKILL.md`; `https://api.agentic.market/v1/services?limit=5`). AE’s `Service.endpoints[]` mirrors portfolio shape, but full admitted contract/evidence remain source-bound (`src/modules/registry/internal/service-projection.ts:4–20`).

## 9. Provider conversion lifecycle

**[DESIGN DECISION]**

1. **Acquisition:** builder finds a skill, repo, SDK, or local CLI; store lineage/source/stars/installs as discovery metadata only.
2. **Hosted runtime:** Supplier wraps the useful primitive in HTTPS, MCP, x402, or AE-envelope operation with bounded typed input/output, effects/data-use/evidence declarations where applicable, and explicit price/network/asset terms.
3. **Descriptor:** immutable descriptor bytes/digest; listing/resource/challenge is catalog evidence, not execution evidence.
4. **Normalization/admission:** reuse existing import/schema/admission/lifecycle gates; named refusal beats weakened admission.
5. **Publication:** persist existing publication/offering/binding rows; derive operationRef from operation/publication/revision/contract. Meaning/price/endpoint/revision changes create new identity.
6. **Activation:** active requires lifecycle/admission/conformance/health/readiness; observed/catalog-only can be listed but inert until existing promotion evidence (`src/modules/capability-supply/internal/publication/lifecycle.ts:8–16,59–128`).
7. **Consumption:** Flow A uses keyless reader/executor; Flow B uses customer-request/x402 authority/payment/reconciliation. Provider-direct calls remain provider/facilitator data-plane calls.
8. **Evidence:** record Invocation Facts through answer/action/route seams. Optional receipts must bind one operation/revision/invocation; aggregate usage imports are not authoritative.
9. **Projection:** rebuild Market Observations and separate Leaderboard Views; never promote skills/installs/stars/catalog signals into uses/settlement.
10. **Revision/withdrawal:** stale/unhealthy/withdrawn/incompatible publications stop new eligibility while history stays on old operationRef.

**[OBSERVED FACT — PRIMARY PRECEDENT]** Firecrawl, Browserbase/Stagehand, and E2B each expose both an open-source repository and hosted pricing/service surface (`https://github.com/firecrawl/firecrawl` + `https://www.firecrawl.dev/pricing`; `https://github.com/browserbase/stagehand` + `https://www.browserbase.com/pricing`; `https://github.com/e2b-dev/e2b` + `https://e2b.dev/pricing`). These show artifacts crossing into hosted offerings, not AE usage/quality/settlement.

**[OBSERVED FACT — PRIMARY PRECEDENT]** skills.sh documents a directory/API distribution surface (`https://skills.sh/docs/api`). Install/trending signals can help acquisition, but do not make static artifacts remotely callable, typed, admitted production operations.

## 10. Anti-manipulation rules

**[DESIGN DECISION]**

- Recompute operationRef from publication/contract material; never accept caller URL/host/recipient/alias as identity.
- Pin revisions; no retroactive identity merge.
- Deduplicate by logical invocation; retries/replayed receipts are idempotent, not extra uses.
- Exclude local/dev/sandbox/test/probe/owner/self traffic.
- Require contract-valid output/evidence; 200, provider header, x402 challenge, or authorization is not success/settlement.
- Use only source-complete denominators; publish unknown/reconciliation counts separately.
- Count distinct consumers only from stable privacy-preserving principal evidence; omit absent identity.
- Require exact atomic amount, explicit exponent/currency/asset/network/pay-to, operation/invocation binding, authoritative facilitator/chain evidence; provider signatures prove origin, not independent truth.
- Reject future timestamps, impossible durations, duplicate receipt digests, conflicting bindings; preserve source/observed times.
- Keep stars, installs, calls, ratings, and rank as separate discovery signals; no popularity-driven route allocation.
- Disclose numerator/denominator/window/tier/exclusions/freshness/tie-break; label paid placement.
- Expose sample/no-data for cold start; never use prior popularity as universal quality.

**[OBSERVED FACT — PRIMARY PRECEDENT]** Resnick et al. tie useful reputation systems to durable identities and feedback while noting collusion and limits of simple numerical ratings (`https://presnick.people.si.umich.edu/papers/cacm00/reputations.pdf`, pp.45–47); Dellarocas documents unfair/collusive ratings degrading predictive value (`https://aisel.aisnet.org/icis2000/52/`).

**[OBSERVED FACT — PRIMARY PRECEDENT]** Muchnik et al.’s randomized experiment found injected positive ratings raised later positive-rating probability 32% and final ratings 25% (`https://snap.stanford.edu/class/cs224w-readings/muchnik13bias.pdf`, pp.647–650). Salganik et al. found social influence increased inequality/unpredictability (`https://www.kostakos.org/courses/socialweb10F/reading_material/2/Salganik06-Inequality%26UnpredictabilityInArtificialCulturalMarket.pdf`, p.854). These support separating verified outcomes from popularity/cold-start; they do not prove a leaderboard causes innovation/revenue.

**[OBSERVED FACT — PRIMARY PRECEDENT]** Campbell’s law warns that decision indicators face corruption pressure (`https://jmde.journals.publicknowledgeproject.org/index.php/jmde_1/article/download/297/292/988`, p.85); Manheim/Garrabrant classify proxy failures under optimization (`https://arxiv.org/pdf/1803.04585`, “Varieties”/§4); Kleinberg/Raghavan show evaluation rules induce strategic investment in metrics (`https://arxiv.org/pdf/1807.05307`, §1). Keep metric views narrow and auditable.

**[OBSERVED FACT — PRIMARY PRECEDENT]** Douceur’s Sybil analysis states that absent trusted authority, many fake identities are generally possible (`https://www.microsoft.com/en-us/research/wp-content/uploads/2002/01/IPTPS2002.pdf`, abstract/§5). Use stable operation/Supplier/consumer bindings and evidence, not anonymous votes.

## 11. Reuse versus hand-roll

| Need | Existing seam | Decision |
|---|---|---|
| Identity/digest | `createPublicOperationRef`, canonical digest (`src/modules/capability-supply/public.ts`; `src/modules/common/canonical-digest`) | Reuse exactly; no readable-ID/URL dialect. |
| Import/admission/lifecycle | Existing capability-supply normalization/publication/transport admission and `publicationLifecycle`/`observedPromotionLifecycle` (`src/modules/capability-supply/internal/publication/lifecycle.ts`) | Reuse; no MarketListing or second state machine. |
| Discovery | `searchCapabilityOperations`/`detailCapabilityOperation` (`src/modules/capability-supply/operation-projection.ts`) | Reuse; no popularity in lexical search. |
| Safe hosted execution | `readKeylessExecutable` + `executeOperation` (`convex/capabilitySupplyOperations.ts`; `src/modules/capability-execution/operation-execute.functions.ts`) | Reuse; no caller URL/free-form execute. |
| Customer request | Route mandate/run/attempt/dispatch journal + `RouteTransportObservation` (`convex/customerRequestRouteExecution*.ts`; `src/modules/capability-supply/route-transport-runtime.ts`) | Reuse; no market route truth. |
| Answer evidence | `answerToolCalls` and answer tool runner (`src/modules/answer-thread/internal/convex-schema.ts`; `src/modules/answer/internal/answer-tool-use-agent.ts`) | Reuse; add explicit attribution, do not parse prose. |
| Internal money | `moneyLedger`/`moneyUsageEvents` via dynamic adapter (`convex/moneyLedger.ts`; `src/modules/action-invocation/dynamic-published-adapter.ts`) | Reuse its existing internal rail only; never silently join x402. |
| x402 state | Existing x402 adapter/runtime/payment attempts (`src/modules/capability-supply/route-transport-runtime.ts`; `src/modules/action-invocation/x402-payment-attempt.ts`) | Reuse; preserve provider_asserted/unknown/reconciliation. |
| Rate admission | Keyed wrapper/rate-limiter (`src/lib/server/rate-limit.ts`; `convex/lib/rateLimit.ts`) | Reuse; no throttle table. |
| Aggregation | `@convex-dev/aggregate` (`convex/convex.config.ts`; `convex/observability.ts`) | Read optimization only; source rows remain authority. |
| Durable work | Existing Workpool/Workflow (`convex/customerRequestRouteWorkpool.ts`; `convex/projectSpine.ts`) | Existing roles only; queue rows are not usage evidence. |
| Ranking/telemetry dependency | No declared recommender; PostHog is sink (`src/lib/observability/posthog.server.ts`, `posthog.client.ts`) | Add none; deterministic projection only. |
| New market execution/money tables | None | Reject; duplicate truth is non-auditable. |

**[OBSERVED FACT]** Declared aggregate, rate-limiter, workpool, workflow, x402, and AI SDK packages are mounted/available (`package.json`; `convex/convex.config.ts:1–16`); current aggregate use is `TableAggregate` in `convex/observability.ts:40–45,497–522`. Existing seams cover the slice; no new ranking/recommender/telemetry dependency is justified.

## 12. Phases and evidence gates

### Phase 0 — contract freeze

**[DESIGN DECISION]** Freeze vocabulary, operationRef attribution, evidence tiers, qualification, windows, exact money representation, and no-composite policy. Every metric maps to a named source path or is marked `OPEN QUESTION`; stars/installs/provider aggregates never become verified use.

### Phase 1 — smallest viable measurement slice

**[DESIGN DECISION]** Use one fresh current keyless operation from registry search/detail. Add minimal operation attribution to existing execution evidence/call-event projections (including `capabilityCallEvents` at schema cutover), not a parallel invocation table. Execute through the fail-closed executor, exercise valid/refused/error cases, and project qualified uses, eligible attempts, reliability, latency, freshness for 24h/7d/30d.

**Gates:** valid ref recomputation; DB-owned endpoint/config/schema; pre-network input/output validation; retry dedupe; excluded owner/test/local/dev/sandbox/refused/failed/unknown; source refs/tier/window/denominator/exclusions/as-of; explicit no-data; lexical discovery unchanged; leaderboard cannot execute.

### Phase 2 — operation views and Supplier rollup

**[DESIGN DECISION]** Expose metric-specific views and thin Supplier rollup through existing `Service.endpoints[]`. Keep operation attribution; never average reliability or combine currencies; un-attributed legacy rows stay absent.

**Gates:** deterministic sort, rebuildability, sample/denominator, visible membership/refs, no score, no automatic routing.

### Phase 3 — provider-direct evidence (later)

**[DESIGN DECISION]** Add optional receipt-binding adapter for provider-direct HTTP/MCP/x402. Accept immutable receipt only when it binds provider, operation/revision, invocation/attempt, request/response or invoice digest, bounded times, and payment fields; write through one validated evidence/settlement port; dedupe receipt/digest.

**Gates:** real direct call, authoritative facilitator/chain receipt, exact amount/network/asset/exponent/pay-to, replay rejection, evidence tier, no aggregate import. Until all pass, settled views absent/unknown.

### Phase 4 — exact settlement views (later)

**[DESIGN DECISION]** Publish settled uses/volume only from settled_verified facts. Keep internal dynamic money and provider-direct x402 separate. No sub-cent rounding or inferred networks/exponents.

**Gates:** durable receipt linkage, exact units, refund/reversal reconciliation, operation attribution, authoritative readback, production smoke path.

### Phase 5 — Managed Router research (not V1)

**[DESIGN DECISION]** Only after independent observations may AE test an Allocation Decision. Log candidate set, context, selected operation, exposure/propensity, authority, terminal outcome, cost; use randomized/defensible exploration; never evaluate from selected-only outcomes.

**[OBSERVED FACT — PRIMARY PRECEDENT]** Auer et al. frame exploration/exploitation as a distinct bandit problem (`https://aima.cs.berkeley.edu/~russell/classes/cs294/s11/readings/Auer%2Bal%3A2002.pdf`, abstract/Theorem 1). Li et al. require randomized/uniform logging assumptions for unbiased offline contextual-bandit evaluation (`https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/p661.pdf`, §§2.1,4). This supports separate Allocation Decisions, not opaque V1 ranking.

## 13. Acceptance checklist

- Every metered operation is an admitted Market Operation with recomputable operationRef.
- Skills/repos/installs/stars remain distribution/acquisition metadata only.
- Discovery, execution, settlement, reputation/evidence, ranking, allocation have distinct authorities/interfaces.
- First slice runs a real current keyless operation through the DB-driven validating bounded executor; refused/error are not success.
- Qualified Use is one logical production invocation with validated terminal success; retries/tests/owner/self/refused/failed/unknown excluded.
- Settled Use requires authoritative reconciled evidence; current x402 provider_asserted/unknown do not qualify.
- Every Market Observation is source-bound, rebuildable, windowed, denominator-aware, tiered, and explicit about exclusions/freshness.
- Leaderboard View sorts one metric/window; no composite score and no popularity-driven routing.
- Supplier totals derive from named operation projections; Service.endpoints[] is a portfolio view.
- No duplicate execution, money, lifecycle, transport, aggregate, recommender, or telemetry dependency.
- External claims point to primary docs; implementation claims point to exact paths/symbols; unknowns are labelled.

## 14. Non-goals and open questions

### Non-goals

- Universal quality/reputation/market/composite score.
- Automatic provider selection, traffic splitting, or popularity routing in V1.
- AE custody, escrow, payout, or mandatory proxy for every provider-direct call.
- Provider dashboards, aggregate counters, tokens, revenue, stars, installs, ratings as verified Invocation Facts.
- Skill/repo/SDK/CLI, MCP `tools/list`, OpenAPI, x402 challenge, or catalog listing as executable/success/settlement fact by itself.
- Second execution model, route journal, invocation ledger, money ledger, or settlement table.
- Silent decimal-to-atomic rounding, inferred currency/network/exponent, cross-currency settled totals.
- Causal claims that a leaderboard causes innovation, revenue, quality, or welfare.
- Provider-wide reliability/usage from a probe or provider assertion.

### Open questions

- **[OPEN QUESTION] Receipt standard:** accepted provider/facilitator/chain format, signature/identity binding, privacy/revocation duty.
- **[OPEN QUESTION] Operation attribution:** additive fields for `answerToolCalls`, `capabilityCallEvents`, and money projections; old rows remain un-attributed without parser backfill.
- **[OPEN QUESTION] Settlement rail:** authoritative facilitator/chain readback per network; delayed redemption, refunds, reversals, disputes.
- **[OPEN QUESTION] Consumer identity:** privacy-preserving namespace for distinct consumers across operations.
- **[OPEN QUESTION] Supplier ownership:** proof binding provider-direct receipt to Supplier for third-party/gateway endpoints.
- **[OPEN QUESTION] Active freshness:** readiness TTL/demotion per protocol/effect class without converting missing probes to failures.
- **[OPEN QUESTION] Evidence appeals:** challenge incorrect attribution/refusal without mutating source history.
- **[OPEN QUESTION] Allocation experiment:** objective, candidate policy, randomization, propensity logging, safety authority.
- **[OPEN QUESTION] Portfolio metrics:** meaningful Supplier rollups when consumer namespaces or settlement currencies differ.
