# Requirements: Agent-First Platform Maturity

**Defined:** 2026-08-31  
**Product authority:** [`PRODUCT.md`](../PRODUCT.md)  
**Design contract:** [`docs/designs/agent-operating-contract.md`](../docs/designs/agent-operating-contract.md)  
**Core value:** An owner-authorized agent can understand, select, invoke,
consume, recover, and improve the Operation market with minimum money, latency,
calls, and context.

These requirements rebaseline the prior authority-heavy candidate. They preserve
accepted implementation evidence but do not treat historical phase completion,
branch refs, mocks, or interface counts as platform proof.

## Milestone Requirements

### Agent Experience and Contract

- [ ] **AGEX-01**: One read-only orientation call returns API/MCP versions,
  environment, server time, authenticated Principal, active owner Account,
  Credential kind, effective grant summary, budget exposure, limits, service
  health, and machine-readable contract links without mutation or provider work.
- [ ] **AGEX-02**: HTTP, MCP, CLI, UI, and bounded chat project one versioned
  semantic envelope for facts, unknowns, warnings, cost, expiry, correlation,
  state references, problems, and next actions.
- [ ] **AGEX-03**: Every non-terminal response provides durable state references
  and executable next actions with arguments/schema, preconditions, consequence,
  expiry, and retry class; prose is never the only continuation mechanism.
- [ ] **AGEX-04**: Search defaults to one-to-three compact candidates; detail,
  compare, and inspect progressively reveal only requested or safety-critical
  fields, schemas, and evidence.
- [ ] **AGEX-05**: Callers can set explicit ceilings for price, committed spend,
  latency, candidate count, result size, and evidence freshness and receive a
  structured denial before exceeding one.
- [ ] **AGEX-06**: Machine lists use stable cursor pagination and bounded page
  sizes; conditional/delta reads avoid repeated full-state transfer.
- [ ] **AGEX-07**: A fresh process can resume any accepted invocation, handoff,
  approval, cancellation, or reconciliation using only durable references and
  current authentication.
- [ ] **AGEX-08**: Known, unknown, stale, supplier-claimed, AE-observed,
  buyer-reported, and AE-derived facts remain machine-distinguishable.
- [ ] **AGEX-09**: Deterministic parsing, validation, matching, policy, state
  transitions, and response formatting do not require a model call; any language
  normalization model is bounded, observable, optional, and has a deterministic
  fallback.
- [ ] **AGEX-10**: Closed problem/reason codes map to safe remediation actions and
  stable correlation refs without leaking secrets, unrelated Account facts, or
  resource-existence oracles.

### Market Intent, Resolution, and Allocation

- [ ] **MARK-01**: A caller can create or inline a bounded market intent containing
  the missing contribution and hard constraints without sending its wider task,
  files, conversation, plan, memory, or chain of thought.
- [ ] **MARK-02**: Every resolution records intent, source/freshness, considered
  Operation revisions, viability, exclusions, ordering evidence, and allocation
  policy version under one immutable `resolutionRef`.
- [ ] **MARK-03**: Candidate viability is caller-specific and exactly one of
  `executable_now`, `setup_required`, or `unavailable`, with reason and next
  action based on knowable balance, grant, Connection, geography, price, effect,
  readiness, and lifecycle facts.
- [ ] **MARK-04**: Search and comparison perform no supplier fan-out, authority
  acquisition, reservation, charge, secret read, or provider effect; readiness
  comes from bounded background probes with freshness.
- [ ] **MARK-05**: Comparison exposes material differences and unknowns without
  false equivalence, hidden weighting, or opaque composite reputation.
- [ ] **MARK-06**: Ranking is deterministic and inspectable for equivalent inputs;
  every feature names provenance, sample size, recency, and policy version.
- [ ] **MARK-07**: Only qualified AE-observed or explicitly buyer-reported evidence
  can change allocation; provider completion is not usefulness and replay is not
  repeat demand.
- [ ] **MARK-08**: Intent, exposure, selection, invocation, qualified use, repeat,
  switching, bypass where observable, supplier earnings, and recovery join by
  stable refs without storing project context.
- [ ] **MARK-09**: Supplier-facing demand intelligence is aggregated, privacy-
  thresholded, and cannot reveal a buyer, private intent, or workload.
- [ ] **MARK-10**: One live category proves two independent comparable paid
  suppliers, two external harnesses, usable results, supplier earnings, and a
  later repeat or justified switch through AE.

### Owner-Bound Identity and Authority

- [ ] **AUTH-01**: Humans, organizations, agents, and internal workloads have
  durable technical Principal refs independent of replaceable Credentials and
  harnesses; every agent/workload Principal is bound to a person- or
  organization-owned Account.
- [ ] **AUTH-02**: Credentials authenticate but never own Accounts, Operations,
  Connections, invocations, budgets, balances, or commercial facts.
- [ ] **AUTH-03**: An owner can self-serve create, inspect, narrow, revoke, rotate,
  and recover a direct agent grant and Credential without founder/database work.
- [ ] **AUTH-04**: A direct grant explicitly bounds Account, Operation or capability
  scope, environment, actions, effect classes, per-call and aggregate committed
  spend, rate/concurrency, approval, validity, purpose, and generation.
- [ ] **AUTH-05**: Grant or Credential rotation preserves Principal identity and
  history; generation changes invalidate stale consequence admission while
  allowing bounded overlap/cutover where explicitly configured.
- [ ] **AUTH-06**: Every consequential surface resolves server-derived Principal,
  owner Account, Credential, grant, payer, supplier, beneficiary, and operator
  roles and revalidates current authority immediately before effect.
- [ ] **AUTH-07**: Missing, ambiguous, expired, revoked, stale, widened,
  wrong-Account, over-budget, or unapproved authority fails before reservation,
  schedule, secret read, provider call, charge, or success evidence.
- [ ] **AUTH-08**: Authority enlargement, funding controls, payout destination,
  root Credential rotation, and break-glass action require fresh human authority
  appropriate to consequence.
- [ ] **AUTH-09**: General multi-hop delegation and ownerless autonomous economic
  Accounts are absent from the milestone and cannot enter through compatibility
  fields or historical planning artifacts.

### Commitment and Decision Continuity

- [ ] **CMIT-01**: Inspect creates an expiring, immutable commitment bound to
  caller Principal, owner Account, grant generation, Operation revision,
  normalized input digest, total price or hard maximum, terms, data use, effects,
  readiness evidence, and intended consequence.
- [ ] **CMIT-02**: Commitment creation is read-only with respect to provider effect,
  secret access, payment, and budget reservation, and reports every currently
  knowable setup requirement.
- [ ] **CMIT-03**: Invoke requires a valid commitment for every authenticated,
  paid, or consequential Operation and rejects caller, Account, grant, input,
  revision, price, term, effect, readiness, or expiry drift before consequence.
- [ ] **CMIT-04**: Re-inspection creates a new commitment; prior commitments remain
  immutable evidence and cannot be silently refreshed or mutated.
- [ ] **CMIT-05**: Keyless non-consequential execution may use an atomic
  inspect-and-invoke projection only when the same binding and no-drift
  invariants are preserved internally.
- [ ] **CMIT-06**: Commitment responses expose exact monetary, latency, authority,
  Connection, data-use, effect, cancellation, retry, and remedy implications in
  machine-readable form.

### Invocation, Result, and Recovery

- [ ] **INVK-01**: One invocation/effect identity remains stable across transport,
  registered endpoint, admission, queued work, provider dispatch, callback,
  payment, result, events, reconciliation, and operator recovery.
- [ ] **INVK-02**: Same idempotency identity plus identical material intent returns
  the existing state; reuse with different Account, commitment, revision, input,
  authority, provider target, amount, or consequence fails.
- [ ] **INVK-03**: Admission atomically records intent, commitment, current
  authority, budget reservation, commercial basis, audit, and durable work
  handoff before acknowledging consequential work.
- [ ] **INVK-04**: Command, execution, provider observation, payment, settlement,
  result, cancellation, and reconciliation are distinct correlated monotonic
  facts; transport success never implies business success.
- [ ] **INVK-05**: Completed responses contain literal schema-valid output or an
  artifact reference the caller can consume immediately, with provenance and
  size/content metadata.
- [ ] **INVK-06**: Pending, input-required, approval-required, connection-required,
  or reconciliation-required responses contain current state, expiry/freshness,
  and exact safe next actions.
- [ ] **INVK-07**: Cancellation succeeds only when current effect evidence proves
  it safe; repeated cancellation is idempotent and returns authoritative state.
- [ ] **INVK-08**: Timeout, disconnect, malformed response, or irreversible
  ambiguity remains unknown and cannot cause blind retry or silent failover.
- [ ] **INVK-09**: Reconciliation uses authenticated callback, bounded poll, or
  attributable operator evidence to converge, compensate, or escalate without
  overwriting history.
- [ ] **INVK-10**: Provider and payment adapters implement one domain contract;
  no external registry, provider, facilitator, or rail becomes AE authority or
  canonical invocation history.

### Self-Serve Supply

- [ ] **SUPP-01**: An owner-authorized supplier can import OpenAPI, MCP, x402, or
  AE-native metadata into a draft while source claims remain labelled and
  non-callable until admission/publication.
- [ ] **SUPP-02**: Draft validation reports exact blocking and warning facts for
  identity, endpoint, schema, price, effects, data use, authentication, SSRF,
  retry, remedy, capacity, readiness, and evidence.
- [ ] **SUPP-03**: A supplier can connect provider credentials, run a safe
  contract test, inspect redacted evidence, remedy failures, and request or
  complete admission without staff editing records.
- [ ] **SUPP-04**: A supplier can version, publish, suspend, withdraw, replace,
  deprecate, and retire an Operation while historical commitments, invocations,
  payments, outcomes, and evidence remain bound to their original revision.
- [ ] **SUPP-05**: Live readiness and non-delivery policy can remove an Operation
  from viable allocation without erasing it, with exact remedy and reactivation.
- [ ] **SUPP-06**: Public buyer facts, private supplier economics, provider secrets,
  platform risk, and staff-only evidence are separate projections over canonical
  lifecycle state.
- [ ] **SUPP-07**: Supplier analytics join exposure, selection, qualified use,
  failure, repeat/switch, gross earnings, fees, refunds, payable, payout, and
  demand aggregates with provenance and privacy thresholds.
- [ ] **SUPP-08**: Two suppliers can complete activation, publication, support,
  payable, and payout without founder/database intervention.

### Economic Completion

- [ ] **ECON-01**: Every paid commitment exposes fee-inclusive total price or hard
  maximum, currency/asset, expiry, payer, supplier, platform fee/margin, and
  cancellation/refund/remedy basis before invoke.
- [ ] **ECON-02**: Budget policy accounts for pending reservations and aggregate
  committed exposure, not only completed charges, and is atomic under concurrency.
- [ ] **ECON-03**: Every commercial invocation correlates buyer charge, provider
  cost/settlement, AE fee, tax treatment, supplier accrued/matured/payable/held/
  paid state, effect observation, and Account attribution.
- [ ] **ECON-04**: Refund, credit, cancellation, dispute, reversal, variance, and
  compensation are immutable attributable adjustments with evidence and
  deadlines, never edits to prior truth.
- [ ] **ECON-05**: Stripe Connect hosted or embedded onboarding owns supplier KYC
  and payout-account collection; AE stores only provider refs, requirements,
  status, and correlated payout evidence required by its domain.
- [ ] **ECON-06**: Payout submission, pending, paid, failed, blocked, reversed, and
  ambiguous states have self-serve/operator recovery and do not manufacture
  completion from a transport response.
- [ ] **ECON-07**: Payer funding handoff exposes authoritative constraints, quote,
  fees, expiry, status, and recovery without creating deposits, withdrawals,
  transferable balances, or reusable stored value.
- [ ] **ECON-08**: Buyer, supplier, and operator projections explain unit economics
  and every exception from the same canonical commercial facts.

### Events and Continuations

- [ ] **EVNT-01**: AE publishes a versioned event catalogue for invocation,
  result, reconciliation, Operation lifecycle, grant, commercial, payout, and
  support changes with stable source event IDs and Account scoping.
- [ ] **EVNT-02**: Outbound delivery uses a managed provider behind an
  `EventDelivery` port for signing, endpoint management, retries, throttling,
  attempts, replay, and consumer self-service; AE does not build those mechanics.
- [ ] **EVNT-03**: Delivery is at-least-once, ordered only where explicitly
  guaranteed, and documented with dedupe and out-of-order consumer guidance.
- [ ] **EVNT-04**: Consumers can inspect endpoint health, attempts, failures,
  payload schema/version, retention, and replay through a scoped portal or API.
- [ ] **EVNT-05**: Event-delivery failure never changes canonical invocation or
  payment truth; operators can correlate and recover it independently.
- [ ] **EVNT-06**: Event payloads are minimized, redacted, versioned, and contain
  refs rather than secrets or unnecessary Operation inputs/outputs.

### Operability and Reliability

- [ ] **OPER-01**: A buyer, supplier, or operator can begin with any public
  correlation/state ref and inspect the joined authority, commitment, invocation,
  provider, payment, event, payout, and support timeline permitted to that role.
- [ ] **OPER-02**: Canonical self-service paths cover owner/agent identity,
  Credentials, grants, budgets, Connections, Operation lifecycle, invocation,
  refund/dispute, payout, and event endpoints; staff-only actions are explicit.
- [ ] **OPER-03**: Exception queues have one owner, severity, reason, age,
  evidence freshness, safe actions, deadline/SLA, escalation, and immutable
  action history.
- [ ] **OPER-04**: Break-glass is purpose-, Account-, Principal-, scope-, and
  time-bound, never impersonates the original actor, and always triggers review.
- [ ] **OPER-05**: Sentry captures safe errors/traces and PostHog captures bounded
  product/market events; secret or arbitrary project payloads never enter either.
- [ ] **OPER-06**: Each critical flow has declared SLOs and alerts for availability,
  latency, queue age, unknown-effect age, event failure, payout failure, and
  allocation freshness with owned response playbooks.
- [ ] **OPER-07**: Release evidence binds source, lockfile, build, deployment,
  schema, provider sandbox/live probes, rollback, and compatibility results to an
  exact revision.
- [ ] **OPER-08**: Capacity, retry-storm, hot-Account, rate-limit, isolation,
  retention/deletion, backup/restore, rollback, and incident drills have measured
  envelopes and retained evidence.
- [ ] **OPER-09**: API and event compatibility, deprecation, migration, sandbox,
  and end-of-life policies are machine-discoverable and tested before change.

### No-Handrolling and Architecture

- [ ] **NHRL-01**: Every infrastructure concern passes a documented buy-vs-build
  gate covering official support, installed-version fit, semantics, failure/data
  ownership, security, exportability, cost, and fallback.
- [ ] **NHRL-02**: Clerk, Convex components, official protocol/payment SDKs,
  Stripe Connect, managed event delivery, Sentry/PostHog, and a managed secret
  provider are the defaults identified in the agent operating contract.
- [ ] **NHRL-03**: A dependency stays behind a narrow domain port and cannot own AE
  Principal, Account, Operation, commitment, invocation, outcome, or economic
  truth merely because it provides machinery.
- [ ] **NHRL-04**: Each mutable lifecycle has exactly one authoritative module;
  adapters and projections contain no competing policy or transition logic.
- [ ] **NHRL-05**: Convex remains the sole writable application record and modular
  monolith until a measured, predeclared extraction trigger is sustained after
  in-process optimization.
- [ ] **NHRL-06**: New custom auth protocols, schedulers, queues, rate limiters,
  webhook delivery/replay systems, KYC/payout collection, telemetry stores,
  secret vaults, schema parsers, or test runners require an accepted ADR proving
  the maintained default cannot satisfy a named invariant.

## Deferred Until Evidence

- Multi-hop agent-to-agent delegation.
- Opaque or composite reputation.
- Automatic allocation without caller-visible alternatives and rationale.
- Multiple-region active-active writes or microservices.
- Enterprise federation and customer-managed keys.
- Additional market units beyond Operation.

## Requirement Classes

| Class | Requirements |
|---|---|
| `MARKET_CORE` | MARK-01..10, CMIT-01..06, qualified-use parts of INVK-05 and SUPP-07 |
| `PLATFORM_BASELINE` | AGEX-01..10, AUTH-01..09, INVK-01..10, SUPP-01..08, ECON-01..08, EVNT-01..06, OPER-01..09 |
| `PARTNER_CAPABILITY` | Infrastructure mechanisms selected by NHRL-01..06 |
| `ADJACENT_PRODUCT` | Deferred items and `PRODUCT.md` non-goals |

## Coverage

Every milestone requirement maps to exactly one owning roadmap phase. A later
phase may exercise an earlier invariant but cannot claim it again as new scope.

---
*Rebaselined: 2026-08-31. Pending independent engineering and adversarial review.*
