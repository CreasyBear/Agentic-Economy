# Project Research Summary

**Project:** Agentic Economy Maturity Rebaseline  
**Domain:** Safe, operated, multi-principal capability discovery and invocation  
**Researched:** 2026-08-26  
**Confidence:** MEDIUM overall — HIGH for locked project intent and local forensic findings; MEDIUM for the proposed composition and current official external behavior; LOW for registry-only currency observations

## Evidence Vocabulary

- **LOCKED — HIGH:** accepted constraint or requirement from [`PROJECT.md`](../PROJECT.md) and preserved project evidence.
- **FACT — HIGH/MEDIUM:** repository fact or behavior supported by a primary/official source. Local exact-version and forensic findings are HIGH; externally retrieved current documentation is MEDIUM under the research confidence seam.
- **RESEARCH INFERENCE — MEDIUM:** roadmap or implementation recommendation derived from locked constraints and sourced facts. It requires phase design and acceptance.
- **COMPARATIVE — MEDIUM:** a mature platform or protocol pattern that informs AE but does not create an AE requirement.
- **CURRENCY OBSERVATION — LOW:** registry-latest information used only to identify later upgrade candidates.

These labels are not interchangeable. In particular, Whop, Bazaar/x402, Stripe, AWS, MCP, AgentMux/AgentMuxter, and MasterKey material is comparative evidence only. AgentMuxter and MasterKey were not authoritatively resolved and contribute no requirements. Where research recommendations conflict with [`PROJECT.md`](../PROJECT.md), the locked project default controls.

## Executive Summary

Agentic Economy is a brownfield Australian B2B reseller platform in which human and autonomous-agent Principals discover and invoke canonical Operations under an explicit Account, bounded authority, budgets, provider/payment rules, and operated recovery. **LOCKED — HIGH:** the accepted Principal/Account foundation and existing Operation product remain; this is not a greenfield marketplace redesign. Experts build this class of system around explicit trust transitions, durable intent before external effects, current authorization at the consequence boundary, stable idempotency, explicit unknown outcomes, reconciliation, immutable attribution, and operator workflows that ship with the underlying capability.

The recommended approach is to retain the existing TypeScript/Convex modular monolith and prove maturity through real registered-endpoint vertical slices. **RESEARCH INFERENCE — MEDIUM:** begin with a planning-only architecture gate, then one direct-authority provider consequence through the exact production registration, one canonical Principal/Account adapter, least-privilege Convex wrappers, a durable invocation/effect state machine, consequence-time revalidation, provider-neutral adapters, operator controls, rollback, and independent evidence. Extend that executable pattern to delegation, secret generations, paid and ambiguous outcomes, commercial recovery, remaining entry families, and finally measured operations. Do not perform a repository-wide registrar migration or recreate the historical Phase 3+ decomposition.

The dominant risks are unauthorized or cross-Account effects, stale authority in delayed work, duplicate irreversible effects after ambiguous timeouts, secret leakage or unsafe rotation, incorrect payment/commercial truth, and another interface-first program that appears green without production composition. Mitigate them with exactly one canonical adapter, explicit Account selection, runtime rather than analyzer-based authority, atomic intent/reservation/audit/scheduling, no blind retry of unknown effects, JIT memory-only secrets, immutable commercial adjustments, actual-reference hostile tests, exact evidence classes, paired operator paths, and mandatory repair/rebaseline stop conditions.

## Key Findings

### Recommended Stack

[`STACK.md`](./STACK.md) recommends no baseline dependency change. **LOCKED — HIGH:** Convex remains the sole writable system of record and AE remains a modular monolith. **RESEARCH INFERENCE — MEDIUM:** mature the current system by composing one canonical authority adapter into explicit `convex-helpers` custom functions, keeping registered functions thin, and retaining the existing scheduler, Workpool, and AE-owned durable journals. External identity, payment, vault, provider, and observability systems remain adapters or evidence sources, never canonical AE truth.

**Core technologies:**

- **Node.js 22.x and TypeScript 5.9.3:** retained runtime and strict domain typing; runtime validators remain mandatory at every trust boundary. **LOCKED — HIGH.**
- **Convex 1.45.0:** functions, transactions, scheduler, authentication verification, components, and the sole writable canonical record. **FACT/LOCKED — HIGH.**
- **`convex-helpers` 0.1.123:** explicit custom query/mutation/action seams. Its context merge does not itself prove raw-capability removal, so handler-visible capabilities must be narrowed and tested. **FACT/RESEARCH INFERENCE — MEDIUM.**
- **Convex scheduler plus `@convex-dev/workpool` 0.4.10:** atomic durable handoff and bounded asynchronous execution; AE-owned invocation/effect rows, not component TTL/status, remain product truth. **FACT — MEDIUM; locked version HIGH.**
- **Clerk 1.4.9:** human authentication only. Server-verified external identity is an input to the canonical adapter, not Account, ownership, membership, or delegation authority. **LOCKED — HIGH.**
- **Zod 4.4.3 plus Convex `v`:** runtime validation at HTTP/MCP/provider/domain and registered Convex boundaries. **FACT/LOCKED — HIGH.**
- **x402 2.23.0, Coinbase CDP 1.55.0, Viem 2.55.2, and guarded Undici 7.29.0:** retained behind provider/payment ports. For supported synchronous calls, exact 402/verify/settle observations are transaction evidence, not AE's entire authority or commercial model. **LOCKED — HIGH; protocol mapping MEDIUM.**
- **Replaceable AE `SecretStore`:** stable secret boundary. Infisical Cloud and its SDK are candidates only after hosted OIDC, plan, audit, availability, rotation, and recovery gates. **LOCKED — HIGH; candidate suitability MEDIUM.**
- **Sentry/PostHog/Convex operational tooling:** sanitized telemetry projections; durable audit and recovery truth stays in AE-owned Convex tables. **FACT/RESEARCH INFERENCE — MEDIUM.**
- **Vitest, `convex-test`, Playwright, and existing lint/parity tools:** retained, but acceptance shifts to exact registered references and complete vertical effects. Static lint may enforce locally decidable imports/categories; it may not prove semantic authority. **RESEARCH INFERENCE — MEDIUM.**

**Version posture:** retain the lockfile. Separate Clerk, Vercel OIDC, Sentry, and PostHog upgrades from authority migration. Do not add `@convex-dev/workflow`, an external authorization engine, Redis/queue infrastructure, another database, or the Infisical SDK during the foundation unless a consuming phase ADR proves the need.

### Expected Features

[`FEATURES.md`](./FEATURES.md) defines table stakes for the maturity claim, not a generic marketplace checklist. **LOCKED — HIGH:** all TS items are P1 for the milestone even when delivered across several vertical roadmap phases.

**Must have (table stakes):**

- Canonical Operation discovery, inspection, supplier publication, validation, suspension, and retirement across consistent HTTP/MCP/CLI/UI projections (**TS-01, TS-13, TS-14**).
- Explicit Principal and Account authority on every interactive, machine, callback, scheduled, worker, cron, and reconciliation path; no Credential-as-owner or implicit Account selection (**TS-02**).
- Multi-hop delegation with monotonic narrowing, cycle/depth control, generation revocation, consequence-time server checks, and complete actor attribution (**TS-03**).
- Durable invocation/effect identities, replay-safe admission, budget reservation, explicit `unknown` outcomes, observation-before-retry, reconciliation, safe cancellation, and compensation (**TS-04, TS-05, TS-07, TS-10**).
- Provider-neutral resolution with exact protocol-specific evidence for supported x402 and non-x402 calls (**TS-06**).
- Connection and secret lifecycle with JIT memory-only use, validated generation rotation, fail-closed vault behavior, and operated recovery (**TS-08**).
- An attributable reseller commercial journal covering buyer charge, provider cost/payable, AE fee/margin, GST/tax evidence, settlement, refund, credit/adjustment, dispute, and variance without stored value (**TS-09**).
- Canonical inspect/change/recover/escalate workflows for humans and staff, plus safe structured machine surfaces over the same domain mutations (**TS-11, TS-14**).
- Durable audit, observability, exact-ref evidence, hosted proof, rollback, on-call/support, and measured reliability gates in every slice (**TS-12, TS-15**).

**Should have only after a measured trigger or explicit authorization:**

- Account policy simulation and safe non-binding “why denied” results (**D-03**) when denial/support telemetry demonstrates need.
- Supplier conformance kit (**D-05**) when onboarding volume makes manual conformance a bottleneck.
- Portable consequence evidence packet (**D-01**) when buyers, suppliers, or support need proof beyond canonical audit/export views.

**Defer to later validation or v2+:**

- Federated provider discovery (**D-02**) until AE catalogue provenance is mature and a supply gap is measured.
- Evidence-qualified automated provider selection (**D-04**) until multiple compatible providers and safe non-effect/failover evidence exist.
- Any enterprise, custody, marketplace-runtime, microservice, reputation, or broader financial-product expansion excluded by [`PROJECT.md`](../PROJECT.md).

### Explicit Anti-Features

- No deposits, withdrawals, transferable/reusable balances, wallets-as-ledgers, custody, exchange, cards, BNPL, or tax-remittance expansion.
- No speculative Quote/Order/Offer hierarchy merely to wrap synchronous x402.
- No external identity, registry, catalogue, provider, vault, facilitator, or settlement rail as canonical AE truth.
- No Credential-as-owner, payer-as-owner, collapsed “user” identity, implicit Account selection, or cross-Account budgets/connections.
- No blind irreversible retry, transparent provider failover for unknown effects, or universal exactly-once claim.
- No arbitrary URL/generic tool execution and no expansion of website chat beyond its five canonical tools.
- No blanket human approval for all consequences and no permanent/shared break-glass credential.
- No durable or agent-visible secret material.
- No composite reputation, SAML/SCIM/nested organizations/CMK/dedicated tenancy/self-hosted vault without measured demand and rebaseline.
- No microservices or second writable system of record without a measured extraction trigger and a new accepted architecture.
- No static inventory, generated matrix, horizontal interface leaf, or historical Phase 3+ decomposition as maturity proof.

### Architecture Approach

[`ARCHITECTURE.md`](./ARCHITECTURE.md) proposes a Convex-native durable-intent pipeline. **FACT — MEDIUM:** a Convex mutation can atomically commit canonical intent, reservation, audit, and scheduling, while actions can call external systems but do not inherit caller authentication and are not transactional. **RESEARCH INFERENCE — MEDIUM:** therefore each consequence should flow from a bounded transport to an actual registered wrapper, the sole canonical adapter, authority/delegation/budget decision, atomic intent, internal action, one transaction that revalidates current authority and grants a short lease, JIT secret retrieval, provider call, observation finalization, and reconciliation/operator recovery. Trust decreases at every asynchronous or external hop.

**Major components:**

1. **Transport adapters and actual registered wrappers** — bound and authenticate immediate input, validate exact contracts, select a visible authority mode, and expose only the capabilities the handler needs.
2. **CanonicalAuthorityAdapter** — the only integration-owned Convex seam resolving Principal, Account, ownership, membership, Credential, workload, and external-binding provenance.
3. **AuthorityKernel and DelegationService** — enforce exact resource intent, role separation, current Account policy, monotonic delegation, generation revocation, budgets, and complete attribution.
4. **InvocationLedger / effect state machine** — own idempotent intent, reservation, attempts, monotonic outcomes, provider observations, reconciliation, commercial adjustments, and durable audit.
5. **ConsequenceCoordinator** — revalidate current authority immediately before effect, lease an attempt, bind digests/generations, and commit validated observations.
6. **ConnectionLifecycle / SecretPlane** — own Connection metadata and generation pointers while a replaceable vault adapter supplies JIT memory-only material.
7. **Provider/payment adapters** — perform bounded x402 or non-x402 calls, preserve provider-native truth, expose idempotency/lookup/compensation capabilities, and never write canonical AE state.
8. **Reconciliation kernel** — authenticate callbacks or poll bounded due work, preserve unknown outcomes, and converge or escalate without blind replay.
9. **Operator/control plane** — provide inspect, change, recover, compensate, freeze, break-glass, and escalation through the same canonical domain commands.
10. **Observability/evidence projection** — correlate exact registrations, revisions, invocations, attempts, providers, and reconciliations while keeping durable facts in Convex and secrets out of telemetry.

**Vertical acceptance contract:** no phase closes on interfaces or unit fixtures alone. Each implementation phase must name and drive a production registration through production composition, current authority, a durable/external effect, hostile denial/no-effect, unknown/reconciliation, telemetry, operator action, rollback/recovery, exact-revision evidence, and independent acceptance.

### Critical Pitfalls

[`PITFALLS.md`](./PITFALLS.md) records 25 failure modes. The following are the roadmap-shaping risks:

1. **Credential or external identity becomes authority** — resolve every admitted identity through the sole canonical adapter to current Principal, explicit Account, and resource relationship; independently vary each identity dimension in actual-reference denial tests.
2. **Partial entry coverage or raw-capability escape** — treat internal/scheduled/callback paths as untrusted continuations, expose narrow handler capabilities, and test exact generated references rather than inventories, substitute registrations, or inferred dataflow.
3. **Stale or confused-deputy consequence** — bind actor chain, Account, operation/version, request digest, budget, Connection/secret generation, provider target/payee, and effect class; re-resolve current authority in one transaction immediately before secrets or provider access.
4. **Ambiguous effect is retried or flattened to failure** — persist intent before dispatch, use stable provider-scoped idempotency where proven, retain `outcome_unknown`, reconcile by lookup/callback/poll, and make compensation a new attributable command.
5. **Secret rotation or outage fails open** — validate a candidate against the same target before pointer advance, fetch material JIT into memory only, block new secret-dependent effects on vault failure, and preserve operated rollback/reconciliation.
6. **x402 or provider response is mistaken for full commercial truth** — record exact protocol flow and external observations, then maintain distinct buyer/provider/fee/tax/refund/dispute facts and immutable adjustments inside AE.
7. **Backend facts lack an operator path or trustworthy evidence** — co-deliver inspect/change/recover/escalate workflows, redacted support projections, durable attribution, and evidence bound to exact ref/digest/environment/freshness/class/owner.
8. **Horizontal leaves and repair churn recreate Phase 2** — only real vertical consumers can go green; stop at two repair passes or two `CHANGES_REQUIRED` verdicts, and immediately rebaseline on repeated trust defects, a third consecutive critical-file repair, or any proof/runtime-seam change.

## Implications for Roadmap

The phases below are **RESEARCH INFERENCE — MEDIUM** and are a dependency-ordered starting point for the roadmapper. They are newly derived from current requirements; they do not preserve or renumber the historical Phase 3+ decomposition. Every implementation phase inherits the full vertical acceptance contract, even where only a subset of table stakes is emphasized.

### Phase 1: Architecture, Threat, and Acceptance Contract

**Rationale:** every later slice depends on one accepted authority/effect spine. Product source, generated registrations, package/config, and tests encoding the design must wait until this gate is accepted.  
**Delivers:** an ADR at an exact ref; exact first endpoint and effect-path map; canonical adapter contract; least-privilege wrapper shapes; invocation/effect state machine; threat and failure diagrams; operability matrix; rollback meanings; evidence taxonomy/owners; installed-version review; exact file ownership; repair counters and stop rules.  
**Addresses:** TS-02, TS-04, TS-05, TS-11, TS-12, TS-15 as acceptance contracts, not claimed implementation.  
**Avoids:** late architecture, bespoke analyzer proof, duplicate canonical facts, evidence substitution, non-canonical lifecycle, and open-ended repair loops.  
**Early warning gate:** no product edit before independent architecture and adversarial acceptance; any material trust-source, proof-property, or effect-boundary change returns here.

### Phase 2: Direct-Authority Reference Consequence

**Rationale:** prove the smallest complete production composition before broad migration. Prefer the least ambiguous existing canonical Operation call, such as the real `POST /api/v1/operations/call`, with one production provider adapter.  
**Delivers:** the sole canonical adapter; one explicit wrapper; runtime Principal/Account authorization; Account-scoped idempotent intent, budget reservation, audit, and atomic schedule; consequence-time revalidation; durable effect states; one provider consequence; unknown/reconciliation; operator inspect/cancel/reconcile; stop-new-work and rollback; actual-reference and hosted evidence.  
**Addresses:** TS-02, TS-04, TS-05, TS-06, TS-07, TS-11, TS-12, TS-15.  
**Avoids:** Credential-as-owner, implicit Account selection, raw-context bypass, stale scheduled authority, confused deputy, blind retries, and synthetic test acceptance.  
**Early warning gate:** valid wrong-Account or revoked authority must produce no reservation, schedule, secret read, provider call, or success audit; a second production resolver is a hard failure.

### Phase 3: Delegated Autonomous Invocation

**Rationale:** delegation is meaningful only when it governs a real consequence and can reuse the accepted direct-authority spine.  
**Delivers:** one real MCP or CLI-over-HTTP invocation by an autonomous-agent/workload Principal; multi-hop delegation ancestry; monotonic scope/budget/time narrowing; depth/cycle rejection; generation revocation; full initiating/effective actor attribution; consequence-time revoke-before-effect proof; paired operator inspect/revoke/recovery.  
**Addresses:** TS-03, TS-07, TS-11, TS-12, TS-14.  
**Avoids:** delegation as impersonation, widening/loops, lost root actor, stale grants, Account switching, and platform-credential confused deputy.  
**Early warning gate:** revoke or narrow any ancestor after admission and before execution; the exact registered worker path must deny with zero secret/provider effect.

### Phase 4: Connection and Secret Generation Under Use

**Rationale:** a standalone SecretStore interface is not maturity. The lifecycle must be created or rotated through a real control-plane registration and consumed by the accepted consequence path.  
**Delivers:** replaceable SecretStore port; one hosted adapter if accepted; Connection ownership/sharing; candidate validation; atomic active-generation pointer advance; prior-generation retirement; JIT memory-only fetch; outage fail-closed behavior; partial-failure reconciliation; redacted observability; operator health/rotate/revoke/recover and rollback.  
**Addresses:** TS-08, TS-11, TS-12, TS-15.  
**Avoids:** secret persistence, vendor types in domain contracts, wrong-target rotation, unverified pointer advance, stale-generation work, environment fallback, and silent vault/audit outage.  
**Early warning gate:** automated scans find zero secret material in Convex, jobs, logs, errors, evidence, or ordinary CI output; vault failure starts no new consequential work.

### Phase 5: Paid Provider Truth and Commercial Recovery

**Rationale:** paid and ambiguous provider consequences depend on stable authority, durable state, and generation-safe secrets. They are the hardest irreversible boundary and must close technical, operational, and commercial truth together.  
**Delivers:** one real paid endpoint; version-pinned x402 flow where supported or a provider-native non-x402 contract; exact payment/effect observations; post-send timeout retained as unknown; callback/poll/reconciliation registration; immutable buyer charge/provider payable/cost/AE fee/GST records; refund, cancellation, dispute, variance, and compensation commands; operator queues, deadlines, evidence, and hosted smoke.  
**Addresses:** TS-04, TS-05, TS-06, TS-07, TS-09, TS-10, TS-11, TS-12, TS-15.  
**Avoids:** `paid: true` flattening, 402/verify as settlement, blind retry, mutable payment status, webhook order dependence, unsafe money arithmetic, custody/stored-value drift, and unowned disputes.  
**Early warning gate:** a fault injected after provider acceptance but before response produces exactly one irreversible request and an owned unknown/reconciliation record; any proposed reusable balance or changed fund flow stops for legal/commercial rebaseline.

### Phase 6: Canonical Supply and Entry-Family Breadth

**Rationale:** broad endpoint migration becomes safe only after multiple complete patterns survive independent acceptance. Add breadth as repeated micro-slices, not as a horizontal registrar program.  
**Delivers:** supplier publication/validation/update/suspension/retirement; coherent canonical Operation discovery; endpoint-by-endpoint completion across required HTTP, MCP, CLI, UI/chat, callback, cron, scheduled job, worker, and reconciliation families; paired operator/support paths; a scope inventory used only to identify remaining work.  
**Addresses:** TS-01, TS-11, TS-13, TS-14 and remaining coverage of TS-02–TS-12.  
**Avoids:** registry-as-truth, SSRF and credential exfiltration, business-logic forks between surfaces, arbitrary chat/tool powers, static-inventory proof, representative-handler substitution, and another 298-registration migration.  
**Early warning gate:** every green registration has a production consumer and exact effect-path test; endpoint changes are versioned control-plane events and pass use-time SSRF/credential-audience checks.

### Phase 7: Operated Release, Recovery, and Measured Scale

**Rationale:** source-green and one hosted smoke do not establish a supported service. Scaling decisions must follow accepted flows and measured SLO breaches, not registration or code counts.  
**Delivers:** exact-revision release manifests; Clerk/provider/vault/payment hosted smokes; durable audit plus one owned telemetry sink; alert/runbook/support ownership; backup/restore and rollback drills; scheduler/reconciliation backlog drills; retry budgets, queue limits, load shedding, rate limits, retention/disposal, dispute/support SLAs, and measured extraction thresholds.  
**Addresses:** TS-11, TS-12, TS-14, TS-15 and operational closure of all table stakes.  
**Avoids:** source/deployment evidence substitution, best-effort logs as transaction truth, backup-only recovery, retry storms, destructive cleanup without evidence, stale lifecycle state, and premature microservices.  
**Early warning gate:** every release claim binds artifact, ref, lock/build/deployment digest, environment, tool, time/freshness, owner, and evidence class; no extraction occurs without a documented sustained SLO breach after monolith tuning.

### Phase Ordering Rationale

- The design gate fixes trust, state, operability, ownership, and proof semantics before source, preventing another late-architecture repair program.
- Direct authority comes before delegation because the latter must extend an executable consequence spine rather than close as an isolated policy library.
- Secret generations come after consequence-time authority so material is fetched only after a proven admission lease, and before paid flows that depend on provider credentials.
- Commercial accounting and recovery follow durable provider truth; they must reference actual effect/payment observations rather than invent parallel lifecycle nouns.
- Surface and supplier breadth follows proven patterns; each adapter remains a micro-slice over one domain contract.
- Hosted operations and scaling close the roadmap after representative flows exist, while observability, operator paths, and rollback are also incrementally required in every earlier implementation slice.

### Research Flags

Phases requiring focused `$gsd-plan-phase --research-phase <N>` work:

- **Phase 1:** inspect installed `convex`, `convex-helpers`, and `convex-test` behavior and settle wrapper capability shapes, exact registrations, evidence ownership, and threat/rollback semantics before code.
- **Phase 2:** confirm actual registered route composition, Workpool retry classification, scheduler semantics, provider idempotency/lookup capabilities, and exact denial/no-effect test harness.
- **Phase 3:** determine reusable `DelegationService` code, Convex indexes/transaction boundaries, measured chain-depth limit, generation lineage, and attribution versus consequence-time facts.
- **Phase 4:** obtain current Infisical/Vercel OIDC documentation and hosted tenant proof; decide REST versus SDK; verify plan availability, audit, rate, region, rotation, memory, timeout, and recovery behavior.
- **Phase 5:** pin the x402 2.23.0-compatible specification/provider behavior; research each provider's finality/idempotency/status/refund semantics; obtain Australian legal/accounting review for the exact reseller fund flow, GST, disputes, and regulatory boundary.
- **Phase 7:** verify Convex plan-level backup/log-stream/support limits and derive SLOs, queue/retry budgets, retention, recovery objectives, and extraction thresholds from measured workloads.

Phases where broad research can usually be skipped after their prerequisites are accepted:

- **Phase 6:** endpoint-family expansion, supplier lifecycle, parity, and SSRF checks follow established internal patterns and official security guidance. Planning still needs an exact per-registration inventory, current provider endpoint details, and an amendment if a new trust boundary appears; these do not justify reopening general architecture research.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM | HIGH for repository locks and PROJECT.md constraints; MEDIUM for official behavior used in composition; LOW for registry-latest observations. No hosted compatibility proof was performed. |
| Features | MEDIUM | HIGH for required scope and exclusions; MEDIUM for observable behaviors synthesized from official/comparative sources. Differentiators are inferred and gated, not requirements. |
| Architecture | MEDIUM | Strong convergence across Convex facts, accepted boundaries, and local forensics, but the composition remains a candidate pending an ADR, exact-reference tests, and hosted proof. |
| Pitfalls | MEDIUM | HIGH for Phase 1–2 failure history and locked stop rules; MEDIUM for externally sourced protocol/security/operations claims and AE-specific mitigations. |

**Overall confidence:** MEDIUM. The roadmap direction and locked boundaries are clear; several high-consequence integrations require phase-specific hosted, legal/commercial, and version-pinned validation.

### Gaps to Address

- **Exact first production registration:** confirm the chosen Operation endpoint, all generated references, transport composition, effect paths, and rollback boundary in Phase 1.
- **Wrapper least privilege:** inspect installed helper source/types and prove what handler-visible raw Convex capabilities remain; do not infer removal from context injection.
- **Delegation limits:** determine transaction/index design and a measured maximum chain depth; selectively review, do not wholesale re-land, the prior candidate service.
- **Provider retry/finality matrix:** classify every consequential action as idempotent, safely observable-before-retry, or never auto-retry; define per-provider reconciliation and compensation.
- **x402 compatibility:** bind installed packages, reviewed spec revision, provider/facilitator deviations, supported flows, and on-chain/finality checks.
- **Secret provider selection:** establish Infisical Cloud plan, region, OIDC claims, availability, rate limits, audit retention/streaming, rotation, rollback, and vault-outage behavior in a live tenant before adoption.
- **Australian legal/accounting validation:** review exact fund flow, reseller documents, GST, stablecoin/provider-payment role, refunds/disputes, custody/virtual-asset/remittance/consumer implications. Research sources are scoping signals, not legal conclusions.
- **Hosted and operational evidence:** obtain exact-revision Clerk, vault, provider, payment, callback, log-stream, backup/restore, rollback, and support proof; source and mocks cannot close these classes.
- **Measured targets:** derive SLOs, retry/queue budgets, freshness windows, retention/disposal, dispute SLAs, and extraction thresholds from actual accepted flows.
- **Comparative gaps:** AgentMuxter and MasterKey remain unresolved; no roadmap decision should wait on or derive from them absent authoritative, relevant evidence.

## Sources

### Primary project evidence (HIGH confidence)

- [`PROJECT.md`](../PROJECT.md) — locked product, authority, data, commerce, secret, evidence, execution, and exclusion defaults.
- [`STACK.md`](./STACK.md), [`FEATURES.md`](./FEATURES.md), [`ARCHITECTURE.md`](./ARCHITECTURE.md), and [`PITFALLS.md`](./PITFALLS.md) — full research findings and source trails.
- `.planning/forensics/report-20260826-190606.md` — Phase 1–2 failure history, repair churn, and rebaseline rules.
- `.planning/maturity-execution/reviews/phase-2-foundation-checkpoint-assessment.md` — reproduced authority/checker gaps and withheld Phase 2 acceptance.
- `.planning/codebase/ARCHITECTURE.md`, `CONCERNS.md`, `TESTING.md`, and repository package/lockfile/Convex guidance — brownfield boundaries, risks, test seams, and exact local versions.

### Primary and official external sources (MEDIUM through research seam)

- Convex official documentation and primary repositories — transactions, actions, scheduling, internal functions, custom functions, Workpool, testing, logs, backups, and production behavior.
- MCP specification and TypeScript SDK documentation — resource-bound authentication and machine transport guidance.
- x402 v2 specification and Coinbase CDP documentation — 402, verification, settlement, facilitator, and Bazaar behavior.
- OWASP, NIST, IETF, SLSA, AWS, Google SRE, and OpenTelemetry primary guidance — authorization, identity/delegation, SSRF, audit, evidence provenance, idempotency, retries, recovery, and correlation.
- Infisical, Vercel OIDC, and HashiCorp Vault official documentation — workload identity, JIT secret access, rotation, leases, revocation, and audit behavior.
- Stripe and Whop official documentation — idempotency, duplicate/out-of-order callbacks, refunds, disputes, and commercial reconciliation as comparative evidence only.
- ASIC, AUSTRAC, ACCC, and ATO guidance — Australian commercial/regulatory scoping signals; not project-specific legal advice.

### Low-confidence observations

- npm registry version observations dated 2026-08-26 — upgrade-candidate signals only; no upgrade recommendation depends on them without changelog, compatibility, hosted smoke, and rollback evidence.
- Unresolved AgentMuxter and MasterKey search leads — no requirement or capability conclusion derived.

---
*Research completed: 2026-08-26*  
*Ready for roadmap: yes*
