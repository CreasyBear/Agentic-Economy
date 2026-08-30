# Feature Research

**Domain:** Safe, operated, multi-principal capability discovery and invocation platform
**Project:** Agentic Economy Maturity Rebaseline
**Researched:** 2026-08-26
**Confidence:** MEDIUM overall — HIGH for locked project scope; MEDIUM for current external comparisons

## Research Boundary

This is a brownfield maturity feature map, not a greenfield marketplace wish list. The accepted Principal/Account foundation and existing Operation discovery/invocation product are givens. “Table stakes” below means required to substantiate the locked claim of a safe, operated platform; it does not mean every mature platform in the market uses AE's domain model.

Evidence labels distinguish fact from synthesis:

- **LOCKED — HIGH:** explicitly required or excluded by `.planning/PROJECT.md` and the supplied accepted/forensic evidence.
- **PRIMARY — MEDIUM:** behavior documented by current official specifications or mature platform documentation, cross-checked where material. The GSD confidence seam classifies verified `websearch` findings as MEDIUM.
- **COMPARATIVE — MEDIUM:** current provider behavior that is useful precedent but is not imported as an AE requirement.
- **INFERENCE — MEDIUM:** roadmap recommendation derived from the locked brief plus primary/comparative evidence. These are identified as inference, not sourced product facts.

## Feature Landscape

### Table Stakes (Users Expect These)

Missing any of these prevents the maturity milestone from claiming the Core Value. All rows are auto-included because the locked brief requires them; comparative sources only sharpen observable behavior.

| ID | Feature | Why Expected | Observable Behavior | Complexity | Dependencies | Evidence |
|---|---|---|---|---|---|---|
| TS-01 | Canonical Operation discovery and inspectable contract | Buyers and agents need to find a capability and know its inputs, outputs, price basis, authority needs, and consequence class before invoking it. | Search/detail/compare/inspect-plan return stable Operation references, schemas, provider/source labels, commercial terms, and effect/retry semantics. HTTP, MCP, CLI, and UI projections identify the same canonical Operation. | MEDIUM | Accepted Operation catalogue and contracts | LOCKED — HIGH; Bazaar exposes descriptions, schemas, price and quality metadata as comparative precedent. |
| TS-02 | Explicit Principal and Account authority on every entry path | A multi-principal platform cannot infer ownership from a credential or silently select a tenant. Interactive and background work must act in a named commercial/isolation context. | Every consequential HTTP, MCP, CLI, UI, callback, cron, job, worker, and reconciliation entry resolves a canonical Principal and Account or fails closed before effect. Ambiguous Account access requires explicit selection. Credentials authenticate but never own resources. | HIGH | Accepted Phase 1 registries; canonical integration adapter | LOCKED — HIGH; MCP resource-bound token validation is PRIMARY — MEDIUM precedent. |
| TS-03 | Multi-hop delegation with monotonic narrowing and revocation | Autonomous agents and workloads need bounded authority that remains attributable to an owner across hops. | A caller can inspect delegation ancestry and effective scope/budget. Each hop can only narrow. Cycles are rejected. Generation revocation invalidates descendants. Server time and current authority are rechecked immediately before consequences. Audit records preserve original Principal, each delegate, Account, Credential/workload context, and decision. | HIGH | TS-02; durable audit (TS-12) | LOCKED — HIGH; AWS source identity persistence through role chaining is PRIMARY — MEDIUM comparative evidence. |
| TS-04 | Durable invocation lifecycle and replay-safe mutation | Consequential calls outlive one transport request and may be duplicated by clients, proxies, webhooks, or workers. | A client supplies or receives an invocation/effect identity and can inspect state, cancel when still safe, and reconcile. Same key plus same intent returns the existing invocation; key reuse with different intent is rejected. Duplicate/out-of-order callbacks do not duplicate effects. | HIGH | TS-02, TS-07; Convex durable record | LOCKED — HIGH; Stripe idempotency and webhook delivery behavior is PRIMARY — MEDIUM precedent. |
| TS-05 | Effect journal, unknown-outcome handling, and reconciliation | A timeout does not prove an external effect failed. Operators need transaction truth separate from transport truth. | Attempt, dispatch, provider acknowledgement, observed consequence, settlement, and reconciliation facts are durably correlated. Unknown additive or irreversible effects remain `unknown`; the system does not blindly retry. A reconciler can converge or escalate, and every manual resolution records actor, evidence, and reason. | HIGH | TS-04, TS-12; provider adapters (TS-06) | LOCKED — HIGH; Stripe webhook/idempotency behavior and OpenTelemetry async correlation are PRIMARY — MEDIUM support. |
| TS-06 | Provider-neutral resolution with protocol-specific transactional truth | AE cannot depend on one registry, provider, facilitator, or settlement rail, yet supported x402 calls must respect the provider's 402/verify/settle facts. | Resolution selects a registered endpoint through a labelled adapter. For x402, payment-required, verification, settlement response, and payment identifier are recorded without inventing a parallel Quote/Order/Offer lifecycle. Non-x402 providers implement the same AE invocation/effect contract. Provider/facilitator outages fail explicitly and reconcile safely. | HIGH | TS-01, TS-04, TS-05 | LOCKED — HIGH; x402 core and Bazaar are PRIMARY/COMPARATIVE — MEDIUM. |
| TS-07 | Account-scoped policy, budgets, and consequence-time admission | B2B buyers need autonomous operation without unbounded spend or stale authorization. | Inspect-plan reports applicable scope, budget, pricing, approvals, and denial reasons without leaking sensitive policy. Admission checks Account, Operation, amount, currency/asset, time, delegation, prior consumption, rate/concurrency quota, and bounded payload. Reservations/consumption are durable and revalidated at the consequence boundary. Policy changes and freezes stop new work deterministically. | HIGH | TS-02, TS-03; durable budget-consumption facts | LOCKED — HIGH. |
| TS-08 | Connection and secret control plane | Provider access is an operated lifecycle, not an environment-variable convention. | Authorized users/services can create, validate, share/lease where allowed, rotate, revoke, reconcile, and delete Connections. Secret material is fetched just in time, stays memory-only, and is never returned through UI/API/logs. Vault failure blocks new consequential work. Rotation validates a new generation before pointer advance; old generations cannot resume work. | HIGH | TS-02, TS-12; operator path co-delivered through TS-11 | LOCKED — HIGH. |
| TS-09 | B2B reseller commercial ledger and documents | AE's locked posture requires attributable buyer charging and provider payment without becoming a stored-value product. | Each invocation links buyer charge, provider cost/payable, AE margin/fee, GST/tax treatment, payment/settlement references, refund/credit/adjustment, and reconciliation status. Operators can produce tax invoices/adjustment evidence and export Account-scoped records. No deposit, withdrawal, transferable balance, or reusable stored value is exposed. | HIGH | TS-04, TS-05, TS-06, TS-07 | LOCKED — HIGH; ATO invoice, GST record, and adjustment guidance is PRIMARY — MEDIUM. Legal/tax validation remains a separate gate. |
| TS-10 | Refund, dispute, cancellation, recovery, and break-glass workflows | Consequential commerce inevitably produces failures and contested outcomes; an operated platform needs bounded recovery rather than database edits. | Buyer/operator can request eligible cancellation, refund, or dispute with state and reason. Staff can freeze/isolate an Account, Credential, delegation generation, Connection, provider, or Operation. Break-glass is time-bound, least-privilege, dual-controlled where policy requires, separately audited, and followed by review. Recovery never converts an unknown irreversible effect into a silent retry. | HIGH | TS-04, TS-05, TS-09, TS-11, TS-12 | LOCKED — HIGH; NIST incident response and Whop/Stripe refund-dispute workflows are PRIMARY/COMPARATIVE — MEDIUM. |
| TS-11 | Canonical human/operator control plane | Backend facts are not operable until owners and support staff can inspect, change, recover, and escalate them safely. | Account-aware UI plus equivalent CLI/API/MCP operations cover Principal continuity, Account selection, ownership/membership, external bindings, Credential generations, agent/workload ownership, delegation ancestry, Connections, secret lifecycle status, policy/budget, invocation/recovery, and audit. Each action is classified self-service, approval/dual-control, staff-only, or machine-only. Dangerous actions use explicit typed confirmation and show effect scope. | HIGH | TS-02; domain projections added with TS-03–TS-10 | LOCKED/FORENSIC — HIGH. Current source lacks this coherent projection. |
| TS-12 | Attributable audit, observability, and evidence ownership | Operators must answer who acted, under which Account/policy/delegation, what effect occurred, and which deployment produced the claim. | Searchable Account-scoped timelines correlate request, invocation, attempt, callback/job, external effect, payment, recovery, and operator action. Records carry stable business correlation IDs plus Principal/delegation ancestry. Sensitive values are redacted. Release/evidence claims name exact ref, digest, deployment, tool, timestamp/freshness, and evidence class. Audit-log failure alerts an owner and fails closed where loss would erase consequential attribution. | HIGH | TS-02; coverage added incrementally with TS-03–TS-10 | LOCKED — HIGH; AWS CloudTrail, NIST audit controls, and OpenTelemetry conventions are PRIMARY — MEDIUM. |
| TS-13 | Supplier capability publication and lifecycle | Discovery is trustworthy only when a supplier can register, validate, update, suspend, and retire the real endpoint behind an Operation. | Authorized supplier principals publish versioned Operations with schemas, price basis, consequence/retry classification, Connection requirements, and endpoint ownership. Validation includes SSRF/network controls and real conformance checks. Suspension/retirement removes new selection without erasing historical invocation evidence. Health and compatibility state are visible to supplier and staff operators. | HIGH | TS-02, TS-08, TS-12 | LOCKED — HIGH from existing supply surface and active provider-call requirements; INFERENCE — MEDIUM for explicit lifecycle observables. |
| TS-14 | Surface parity for human, agent-native, and operator workflows | Autonomous agents are first-class owners, while humans need oversight and support; neither can be a second-class adapter. | Consequential state transitions have one domain contract exposed through the appropriate HTTP/MCP/CLI/UI/staff surface. MCP/API responses are structured and bounded; CLI supports non-interactive status and correlation output; UI is accessible and Account-aware. Thin website chat remains limited to the five canonical tools and cannot gain arbitrary payment, recovery, supply, or URL powers. | HIGH | All domain features; canonical registered endpoints | LOCKED — HIGH. |
| TS-15 | Production release, rollback, support, and measured reliability gates | Source-green is not production evidence; external identity, provider delivery, payment, and recovery can drift. | Each vertical slice proves an actual registered endpoint, production adapter, durable/external effect, denial/no-effect behavior, telemetry, rollback, and operator path. Hosted smoke names exact deployment/revision and uses separately authorized credentials/spend. Runbooks define alerts, ownership, escalation, rollback, reconciliation, retention/disposal, and measurable extraction/scaling triggers. | HIGH | TS-01–TS-14 | LOCKED/FORENSIC — HIGH; NIST recovery guidance is PRIMARY — MEDIUM support. |

### Differentiators (Competitive Advantage — Deferred by Default)

These are not auto-included. They require explicit product evidence or a measured trigger after the table-stakes maturity slices are accepted.

| ID | Feature | Value Proposition | Observable Behavior if Authorized | Complexity | Dependency/Trigger | Evidence |
|---|---|---|---|---|---|---|
| D-01 | Portable consequence evidence packet | Lets a buyer, supplier, or support team verify authority, price, settlement, and observed effect without reading AE internals. | Export contains signed/digest-bound references to the Operation version, effective authority, payment/settlement, external observation, and reconciliation outcome, with selective disclosure. It is a receipt/evidence projection, not an Offer, Quote, or Order resource. | HIGH | TS-03, TS-05, TS-09, TS-12; require customer/support demand | INFERENCE — MEDIUM; x402 receipt extensions are comparative only. |
| D-02 | Federated provider discovery with explicit provenance | Broadens supply without surrendering AE catalogue authority. | Search can merge AE-registered Operations with Bazaar or other feeds while labelling source, freshness, verification status, and limitations. External delisting or drift cannot rewrite AE history or identity. | HIGH | TS-01, TS-06, TS-13; require supply-gap evidence | INFERENCE — MEDIUM; Bazaar is COMPARATIVE — MEDIUM. |
| D-03 | Account policy simulation and safe “why denied” | Reduces failed automation and support burden before money or external effects are attempted. | Given an Operation and proposed context, preview returns allowed/denied, effective limits, required approval, and non-sensitive reason codes without reserving budget or granting authority. Simulation is explicitly non-binding; consequence-time admission remains authoritative. | MEDIUM | TS-02, TS-03, TS-07, TS-12; require denial/support telemetry | INFERENCE — MEDIUM. |
| D-04 | Evidence-qualified provider selection | Can improve reliability/cost when multiple providers implement one Operation contract. | A buyer opts into a deterministic policy over verified compatibility, current price, health, and Account restrictions. Selection is recorded and inspectable. Failover is disabled for unknown/non-idempotent consequences unless reconciliation proves no effect. | HIGH | TS-05, TS-06, TS-12, TS-13; require multi-provider inventory and measured failures | INFERENCE — MEDIUM. Composite reputation remains excluded. |
| D-05 | External conformance kit for suppliers | Shortens onboarding while keeping production proof tied to real endpoints. | Supplier can run contract, denial, idempotency, callback, and reconciliation probes locally/staging and submit digest-bound results; AE still performs independent registered-endpoint verification before activation. | MEDIUM | TS-13, TS-15; require onboarding volume | INFERENCE — MEDIUM. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative / Preserved Boundary |
|---|---|---|---|
| Deposits, withdrawals, transferable balances, wallets-as-ledgers, or reusable stored value | Simplifies “agent spending” demos | Conflicts with the locked Australian B2B reseller posture and expands custody, reconciliation, safeguarding, and regulatory obligations. | Charge/pay per attributable reseller transaction; record liabilities and settlement references without a customer balance product. |
| Speculative Quote, Order, or Offer hierarchy for synchronous x402 calls | Familiar commerce nouns appear comprehensive | Duplicates the current 402 → signed payment → verify/settle lifecycle and creates state with no independent business lifetime. | Record Operation version, inspect-plan, payment requirements, payment identifier, settlement, and evidence. Add a noun only when a proven protocol gap gives it an independent lifecycle. |
| External identity, registry, catalogue, or settlement provider as canonical truth | Fast integration and fewer local entities | Couples authority and history to one vendor/feed and violates locked AE ownership boundaries. | Use provider-neutral labelled adapters; AE retains canonical Principal, Account, Operation, policy, invocation history, and reconciliation. |
| Credential-as-owner, payer-as-owner, or one “user” identity for every role | Simplifies schemas | Destroys attribution among beneficial owner, legal payer, operator, supplier, beneficiary, tax subject, technical Principal, and Credential. | Preserve canonical Principal/Account and explicit role relations. |
| Implicit Account selection or global cross-Account budgets/connections | Fewer prompts and arguments | Makes multi-Account access ambiguous and can leak authority, spend, or secrets across tenants. | Require explicit Account context; allow remembered UI selection only as a user convenience that the server revalidates. |
| Blind automatic retry or transparent provider failover for unknown effects | Improves apparent success rate | Can duplicate irreversible or additive external consequences. | Idempotency where the provider guarantees it; otherwise journal `unknown`, reconcile, and escalate before another attempt. |
| Claiming universal exactly-once external effects | Attractive reliability promise | AE cannot control every provider, network, callback, or timeout boundary. | Promise replay-safe AE admission, durable effect identity, explicit outcome states, and reconciliation. |
| Arbitrary URL/generic tool execution, especially through chat | Maximum agent flexibility | Bypasses the Operation contract, SSRF controls, pricing/policy inspection, and bounded chat safety surface. | Invoke only registered Operations through reviewed adapters. Keep chat to the five canonical tools. |
| Blanket human approval for every consequential call | Feels safest | Negates autonomous agents as first-class principals and does not scale; habituated approvals can reduce safety. | Account policy, scoped delegation, budgets, consequence classes, thresholds, and dual control only where risk requires it. |
| Permanent break-glass or shared staff super-credential | Easy incident access | Removes least privilege and weakens independent attribution. | Time-bound, purpose-bound, approval-controlled elevation with freeze scope, complete audit, and post-event review. |
| Secrets in durable rows, logs, traces, MCP payloads, or agent-visible environment | Easy debugging/integration | Turns telemetry and transcripts into credential exfiltration paths and breaks the JIT memory-only boundary. | Replaceable SecretStore, redacted status/correlation data, short-lived material, generation-safe rotation. |
| Composite reputation score | Simple ranking signal | Locked out pending defensible samples/manipulation thresholds; hides incompatible dimensions and invites gaming. | Show source-labelled facts such as conformance, freshness, price, health, call count, and dispute/reconciliation history where lawful. |
| SAML, SCIM, nested organizations, customer-managed keys, dedicated tenants, self-hosted vault, or active-active writes now | Familiar enterprise checklist | No current evidence justifies the large identity/operations surface. | Build Account/membership/Credential/Connection foundations with extension seams; add only on measured demand. |
| Microservices or another writable system of record | Perceived scale/readiness | Adds distributed consistency and makes authority/effect truth harder to prove before an extraction threshold exists. | Convex modular monolith and sole writable record until measured triggers are breached. |
| Hosted app runtime/app store, cards, ads, BNPL, company formation, tax remittance, or dynamic model marketplace | Expands monetization | Unrelated platform expansion obscures the invocation/reseller core and adds regulatory/operational domains. | Keep the product boundary at registered Operation discovery/invocation and its operated control/commercial planes. |
| Static inventories, horizontal interfaces, gate counts, or the old Phase 3+ decomposition as proof of maturity | Makes progress easy to count and parallelize | Historical evidence shows these can be green without production composition, real authority, external effects, or operator workflows. | Re-derive vertical endpoint slices and accept only actual registered-reference behavior with denial, effect, recovery, rollback, and operator proof. |

## Feature Dependencies

```text
Accepted Principal/Account foundation + existing Operation product
    ├──> TS-02 explicit runtime authority
    │       ├──> TS-03 delegation
    │       ├──> TS-07 policy/budgets
    │       ├──> TS-08 Connections/secrets
    │       └──> TS-11 operator control plane
    ├──> TS-01 canonical discovery ──> TS-13 supplier lifecycle
    └──> TS-12 audit/evidence (begins in first slice; deepens throughout)

TS-02 + TS-07 ──> TS-04 invocation lifecycle
TS-04 + TS-06 ──> TS-05 external-effect journal/reconciliation
TS-04 + TS-05 + TS-06 + TS-07 ──> TS-09 reseller ledger
TS-05 + TS-09 + TS-11 + TS-12 ──> TS-10 recovery/refunds/disputes/break-glass
TS-01..TS-13 ──> TS-14 surface parity ──> TS-15 production acceptance/operations

TS-03 + TS-05 + TS-09 + TS-12 ──enhances──> D-01 evidence packet
TS-01 + TS-06 + TS-13 ──enhances──> D-02 federated discovery
TS-02 + TS-03 + TS-07 ──enhances──> D-03 policy simulation
TS-05 + TS-06 + TS-13 ──enhances──> D-04 provider selection
TS-13 + TS-15 ──enhances──> D-05 supplier conformance kit
```

### Dependency Notes

- **Runtime authority precedes consequential invocation:** a real registered endpoint must establish Principal/Account context before budget reservation, provider selection, payment, or external dispatch.
- **Audit begins with the first slice:** TS-12 is not a late observability phase; every later feature depends on attributable evidence.
- **Invocation state precedes reconciliation:** recovery cannot be correct until AE has stable invocation/effect identities and explicit outcome states.
- **Commercial records follow transactional truth:** the reseller ledger must link to provider/payment/effect facts rather than inventing a parallel speculative commerce lifecycle.
- **Operator workflows ship with their domain slice:** “backend first, console later” already failed the operability test. Each feature needs its human/support path at acceptance time.
- **Surface parity follows one domain implementation:** HTTP/MCP/CLI/UI are adapters over one contract, not independently evolving business logic.

## MVP Definition

Here “MVP” means the minimum independently acceptable operated-platform maturity baseline, not the existing product's first launch. Implementation should be vertical slices; horizontal interfaces or static inventories do not close a feature.

### Launch With (Maturity Baseline)

- [ ] **One canonical authority slice (TS-02/TS-03/TS-12)** — real registered endpoint, current Principal/Account/delegation check, denial/no effect, full attribution.
- [ ] **One consequential invocation slice (TS-04/TS-05/TS-06/TS-07)** — real provider call, replay safety, budget, durable/external effect, unknown-outcome reconciliation.
- [ ] **Connection/secret operation (TS-08)** — JIT secret use, fail-closed vault behavior, generation-safe rotation, operator status/recovery.
- [ ] **Reseller/refund slice (TS-09/TS-10)** — buyer charge, provider payable/cost, GST/document evidence, refund or dispute path, reconciliation.
- [ ] **Supplier publication slice (TS-01/TS-13)** — real endpoint validation, discoverability, suspension/retirement, preserved history.
- [ ] **Human and machine operability (TS-11/TS-14)** — Account-aware UI plus CLI/API/MCP status/control over the same canonical facts.
- [ ] **Production proof (TS-15)** — exact deployed revision, authorized external smoke, alerts, rollback, support runbook, independent acceptance.

All TS rows remain P1 for the maturity milestone even if delivered across multiple roadmap phases.

### Add After Validation (v1.x)

- [ ] **D-03 policy simulation** — add when denial/support telemetry shows users cannot predict policy outcomes.
- [ ] **D-05 supplier conformance kit** — add when supplier onboarding volume makes manual conformance the bottleneck.
- [ ] **D-01 portable evidence packet** — add when buyers/suppliers need externally portable proof beyond current audit/export views.

### Future Consideration (v2+)

- [ ] **D-02 federated discovery** — only after AE catalogue truth and provenance are mature and a supply gap is measured.
- [ ] **D-04 evidence-qualified provider selection** — only with multiple compatible providers, reliable health/cost evidence, and safe non-effect proof for failover.
- [ ] **Explicitly excluded enterprise/platform expansion** — reconsider only when PROJECT.md is deliberately amended with measured need and separate legal/architecture research.

## Feature Prioritization Matrix

| Feature Group | User Value | Implementation Cost | Priority |
|---|---|---|---|
| Account authority and delegation (TS-02/03) | HIGH | HIGH | P1 |
| Invocation, effect truth, provider adapters, policy (TS-04/05/06/07) | HIGH | HIGH | P1 |
| Connections and secrets (TS-08) | HIGH | HIGH | P1 |
| Reseller records and recovery (TS-09/10) | HIGH | HIGH | P1 |
| Operator control plane and surface parity (TS-11/14) | HIGH | HIGH | P1 |
| Audit/evidence and production operations (TS-12/15) | HIGH | HIGH | P1 |
| Canonical discovery and supplier lifecycle (TS-01/13) | HIGH | MEDIUM/HIGH | P1 |
| Policy simulation and conformance kit (D-03/05) | MEDIUM | MEDIUM | P2 — measured trigger |
| Portable evidence and federated discovery (D-01/02) | MEDIUM | HIGH | P2 — explicit authorization |
| Automated provider selection (D-04) | MEDIUM | HIGH | P3 — defer |

**Priority key:** P1 is required for the maturity claim; P2 requires a measured trigger and explicit scope; P3 is deferred research.

## Comparative Platform and Protocol Analysis

| Area | Current External Fact | What It Supports for AE | What It Does Not Require |
|---|---|---|---|
| MCP authorization | Current MCP guidance binds tokens to the intended resource, forbids token passthrough, and hardens issuer/credential/scope handling. | Resource-specific authentication at the MCP edge and separate downstream provider credentials. | MCP transport auth does not replace canonical Account membership, delegation, budget, or consequence-time authorization. |
| x402 core | x402 represents payment requirements in a 402 response, client-signed payment on retry, facilitator verification/settlement, and settlement response; extensions are optional. | Record protocol-native payment/settlement truth and payment identifiers inside AE invocation history. | No parallel Quote/Order/Offer hierarchy; no assumption that x402 supplies refunds, disputes, Account authority, or the reseller ledger. |
| Coinbase Bazaar | Bazaar search/MCP returns resource descriptions, schemas, pricing and quality metadata and can proxy x402 invocation. | Optional labelled discovery source and evidence for schema/price visibility. | Bazaar is not AE identity, sole catalogue, sole inventory, reputation authority, or settlement rail. |
| Stripe | Idempotency keys support safe mutation retry; webhooks may duplicate and arrive out of order; refund/dispute workflows are explicit. | Stable invocation/effect identities, duplicate suppression, asynchronous reconciliation, refund/dispute operator states. | Stripe object hierarchy is not copied wholesale and does not define AE's reseller policy. |
| AWS IAM/CloudTrail | Temporary credentials and immutable source identity can preserve attribution through role chaining into audit logs. | Short-lived Credential/delegation patterns and complete original-actor attribution. | AWS roles/accounts are comparative; AE retains its accepted Principal/Account model. |
| Whop | Official APIs expose permission-scoped payment management, refunds, signed webhooks, disputes, and operator dispute evidence. | Comparative evidence that operated commerce needs explicit refund/dispute/access workflows. | Whop's product/membership model is not an AE requirement. |
| AgentMuxter | No authoritative source for the exact referenced name was found. AgentMux appeared instead and labels itself early alpha. | None. The similarly named product is not treated as the requested evidence. | No requirement or feature claim is derived from AgentMux/AgentMuxter. |
| MasterKey | No uniquely identifiable authoritative agent-platform documentation was found in this research. | None; unresolved comparative lead only. | No requirement or negative capability claim is derived from absence of search results. |

## Sourced Facts vs. AE Inference

### Sourced Facts

- MCP's current authorization model requires intended-resource token validation and prohibits passing the received MCP token through to downstream APIs.
- Stripe documents idempotent mutation replay and warns that webhook events can duplicate and arrive out of order.
- x402 and Coinbase document 402 requirements, signed payment retry, verify/settle, settlement response, optional extensions, and Bazaar discovery.
- AWS documents temporary credentials and source identity that persists through role chaining into CloudTrail attribution.
- NIST SP 800-61 Rev. 3 treats preparation, detection, response, and recovery as integrated cybersecurity risk-management activities.
- OpenTelemetry defines correlated HTTP/messaging traces and warns against trusting forged incoming context or propagating secrets/PII in baggage.
- ATO guidance requires GST-registered businesses to issue tax invoices and retain GST transaction, adjustment, decision, and calculation records; current GST error guidance distinguishes later adjustments from original errors.
- Whop documents scoped refund APIs, signed webhooks, duplicate/order caveats, and dispute operator workflows.

### AE Inferences

- Combining those patterns with the locked brief makes stable invocation identity, explicit `unknown` outcomes, reconciliation, and operator recovery table stakes; no external protocol supplies the whole safety boundary.
- Because Account is both isolation and commercial context, every control-plane and consequence entry must select it explicitly; a remembered UI choice cannot be server authority.
- A reseller ledger should project transactional and effect truth into buyer/provider/tax records rather than introduce speculative commerce nouns.
- Human/operator workflows must ship inside each vertical slice because historical backend-first work produced canonical facts without an operable product.
- Federated discovery, portable evidence, simulation, and automated provider selection are plausible advantages, but the locked brief does not authorize them without measured triggers.

## Sources

### Locked project evidence (HIGH)

- `.planning/PROJECT.md` — canonical scope, active requirements, constraints, exclusions, and Core Value.
- `.planning/codebase/ARCHITECTURE.md` — existing Operation/chat boundary and production evidence gap.
- `.planning/codebase/CONCERNS.md` — current operational risks and release requirements.
- `.planning/forensics/report-20260826-190606.md` — repair-churn causes and vertical/operability rebaseline rules.
- `.planning/maturity-execution/reviews/phase-2-foundation-checkpoint-assessment.md` — accepted/unaccepted boundary and operator-control-plane gap.
- `.planning/maturity-execution/PROGRAM-PAPERCUTS.md` — preserved evidence, runtime-authority, and operability warnings.

### Current primary and mature-platform documentation (verified websearch = MEDIUM)

- [MCP 2026-07-28 specification release](https://blog.modelcontextprotocol.io/posts/2026-07-28/) and [TypeScript SDK authorization migration](https://ts.sdk.modelcontextprotocol.io/v2/migration/support-2026-07-28)
- [MCP authorization and token audience rules](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization)
- [x402 extensions and lifecycle hooks](https://docs.x402.org/extensions/overview), [HTTP 402](https://docs.x402.org/core-concepts/http-402), and [Coinbase x402 FAQ](https://docs.cdp.coinbase.com/x402/support/faq)
- [Coinbase Bazaar search API](https://docs.cdp.coinbase.com/api-reference/v2/rest-api/x402-facilitator/search-resources) and [Bazaar MCP server](https://docs.cdp.coinbase.com/api-reference/v2/rest-api/x402-facilitator/bazaar-mcp-server)
- [Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests?lang=node), [webhook best practices](https://docs.stripe.com/webhooks), [refunds/cancellations](https://docs.stripe.com/refunds), and [disputes](https://docs.stripe.com/disputes)
- [AWS IAM source identity and role chaining](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_temp_control-access_monitor.html) and [CloudTrail user identity](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-event-reference-user-identity.html)
- [NIST SP 800-61 Rev. 3](https://csrc.nist.gov/pubs/sp/800/61/r3/final) and [NIST SP 800-171 Rev. 3](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/800-171r3/NIST.SP.800-171r3.html)
- [OpenTelemetry trace conventions](https://opentelemetry.io/docs/specs/semconv/general/trace/), [messaging spans](https://opentelemetry.io/docs/specs/semconv/messaging/messaging-spans/), and [context propagation security](https://opentelemetry.io/docs/concepts/context-propagation/)
- [ATO accounting for GST](https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/accounting-for-gst-in-your-business), [GST records](https://www.ato.gov.au/api/public/content/0-9354073c-055a-4d41-bd51-b7d9e6b4e834), and [current GST error/adjustment guidance](https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/in-detail/managing-gst-in-your-business/reporting-paying-and-activity-statements/correcting-gst-errors/what-is-a-gst-error)
- [Whop refund API](https://docs.whop.com/api-reference/payments/refund-payment), [webhooks](https://docs.whop.com/developer/guides/webhooks), and [dispute management](https://docs.whop.com/manage-your-business/manage-payments/manage-disputes)

### Comparative evidence caveat

Whop, Bazaar/x402, AWS, Stripe, and MCP are evidence for patterns only. AgentMuxter and MasterKey could not be authoritatively resolved and contribute no requirements. No external product is treated as AE identity, canonical registry, sole inventory, settlement rail, or source of locked requirements.

---
*Feature research for: Agentic Economy Maturity Rebaseline*
*Researched: 2026-08-26*
