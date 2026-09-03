# Nevermined opportunity map and structural implications for Agentic Economy

**Research cut:** 2026-09-02
**Purpose:** understand Nevermined's complete current product, public API and SDK
structure, application behavior, operating maturity, and the opportunities it
opens for Agentic Economy (AE).
**Posture:** `PRODUCT.md` describes AE's current accepted direction. It is a
starting position, not a ceiling on the opportunity map in this report.

## Executive judgement

Nevermined is a credible **late-beta / early-production agent-payments
platform**, not merely an x402 facilitator. It now spans four connected
businesses:

1. seller monetization through registered services, Plans, payment middleware,
   metering and payout;
2. buyer-side delegated spending over card and stablecoin rails;
3. a public Catalog and Router for buying external x402 and MPP services; and
4. organizations, budgets, customers, analytics, widgets and white-label
   platform distribution.

The live public Catalog returned **149 services** at this research cut: 111 MPP
and 38 x402 records, with 141 marked operational and eight unverified. The
machine-readable ARD feed also returned 149 entries. These are observable live
surfaces, not brochure inventory. [Catalog](https://nevermined.ai/docs/products/catalog/overview)
· [live ARD feed](https://api.live.nevermined.app/.well-known/agent-services-catalog.json)

Nevermined's strongest qualities are breadth, distribution and payment
operability: two active SDKs, HTTP/MCP/A2A/MPP adapters, card and crypto
delegation, reusable commercial Plans, organization controls, public machine
discovery, explicit Router payment states and a fast release cadence.

Its main weakness is the boundary around payment. Public evidence does not show
one canonical record joining the principal's authority, exact selected service,
request and price commitment, seller/provider roles, delivery, settlement,
uncertainty, remedy and commercial closure. Different SDK adapters handle
settlement failure and streamed delivery differently, and the private backend
prevents independent verification of several critical invariants.

The strategic posture for AE should therefore be:

> Use Nevermined as a serious supply, payment and distribution partner through a
> replaceable adapter. Let AE own the portable commercial truth around every
> rail: roles, Operation, Commitment, Invocation, delivery, uncertainty, remedy,
> closure and outcome evidence.

This is not a recommendation to keep AE narrow. Nevermined's complete surface is
an expansion map. The architecture should make cards, wallets, subscriptions,
organizations, embedded checkout, generic routing, outcome pricing and agent
identity available as modules without letting any one module or vendor redefine
the core transaction.

## Evidence base

The decision-atomic authority for this research is the
[120-item Nevermined Scavenge Papercuts ledger](../.planning/nevermined-docs/NEVERMINED-SCAVENGE-PAPERCUTS.md),
with an explicit [corpus coverage and proof-boundary map](../.planning/nevermined-docs/NEVERMINED-CORPUS-COVERAGE.md).
It exceeds the current Whop and Locus inventories by item count and adds exact
AE opportunity class, current maturity, gap, acceptance test, priority,
disposition and evidence semantics to every stable `NVM-NNN` decision. This
document remains the executive synthesis; the ledger is the working backlog.

Five parallel research tracks mined current first-party documentation, the live
website and application surfaces, public GitHub source, OpenAPI contracts,
releases, CI, tests, examples, package metadata, live Catalog/ARD endpoints,
status configuration and public legal/security claims:

- [Product and application](../.planning/nevermined-docs/01-PRODUCT-AND-APP.md)
- [API and protocol](../.planning/nevermined-docs/02-API-AND-PROTOCOL.md)
- [TypeScript SDK](../.planning/nevermined-docs/03-TYPESCRIPT-SDK.md)
- [Python SDK and integrations](../.planning/nevermined-docs/04-PYTHON-AND-INTEGRATIONS.md)
- [Maturity and opportunities](../.planning/nevermined-docs/05-MATURITY-AND-OPPORTUNITIES.md)

The canonical public docs index contained **274 entries** across product,
integration, solution, API, SDK, CLI and specification material. The active docs
repository contained 214 Markdown/MDX source files plus three OpenAPI documents.
[Docs index](https://nevermined.ai/docs/llms.txt) ·
[docs repository](https://github.com/nevermined-io/docs)

Claims use four evidence classes:

| Mark | Meaning |
|---|---|
| `OBSERVED` | Direct live output, current source, tests, release or status evidence |
| `PUBLISHED` | A current first-party statement not independently proved here |
| `INFERRED` | A bounded conclusion drawn from several observed facts |
| `UNKNOWN` | Material evidence is private, gated or absent |

## What Nevermined actually is

### Product topology

Nevermined has two transaction lanes that share payment machinery but have
different commercial semantics.

| Dimension | Native seller lane | External Catalog/Router lane |
|---|---|---|
| Supply | Registered `Agent`/service plus linked Plans | Curated external x402 or MPP service |
| Integrator | Seller gates its own endpoint | Buyer integrates once with Router |
| Price | Nevermined Plan and credit configuration | Merchant's live payment challenge |
| Execution | Verify, execute, settle at seller | Router mints a credential or proxies the call |
| Record | Plan purchase, balance, credit burn, analytics | Router payment and separate fee state |
| Economic model | Seller fees and organization subscription | Buyer-side routing fee |

The current [overview](https://nevermined.ai/docs/getting-started/overview),
[Catalog](https://nevermined.ai/docs/products/catalog/overview) and
[Router](https://nevermined.ai/docs/products/catalog/router/how-it-works) make
this distinction visible, although product language sometimes blurs the lanes.

### Core object graph

```text
User / account
  -> personal workspace or organization membership
  -> API keys
  -> payment methods
  -> Delegations

Seller lane
  Agent/service <-> Plan
  Plan -> price + access/credit rules
  Delegation -> x402 permission
  permission -> verify -> work -> settle -> receipt

External buyer lane
  Catalog Service -> Router request
  Router request + Delegation -> credential/proxy
  credential/proxy -> merchant -> Router payment record

Organization platform
  Organization -> members, groups, budgets, wallets, customers
               -> agents, plans, keys, analytics, events, webhooks
               -> widgets, white-label onboarding, commissions
```

The most important nomenclature warning is that a Nevermined `Agent` is often a
seller-side monetized service record. It is not equivalent to AE's buyer-side
Agent Principal. A Plan defines price and entitlement. A Delegation controls a
funding method. An x402 permission is a bearer spending credential. None of
these alone establishes the Business Principal's authority, seller role,
provider obligation or delivery condition.

### Commercial flexibility

Nevermined supports more than per-call credit burning:

- prepaid fixed credit bundles;
- time-limited access and subscriptions;
- free trials;
- pay-as-you-go;
- fixed, ranged and dynamic credit redemption;
- fiat/card, native token and ERC-20 pricing;
- cost-plus and stated outcome-oriented patterns;
- multiple Plans per service and multiple services per Plan; and
- platform fee splits and organization commissions.

This is a meaningful opportunity signal. If AE pursues multiple tariffs for the
same callable contribution, its architecture needs a clean seam between the
versioned Operation contract and its commercial offer/entitlement. The current
single Operation price can remain the simple projection until a second real
pricing mode requires a separate Offer or Plan object.

## Public API structure

The committed OpenAPI corpus exposes three APIs:

| Contract | Operations | Main domains |
|---|---:|---|
| Payments/protocol | 42 | Agents, Plans, access, credits, x402 permissions, Delegations, payment methods, Router |
| Organizations | 82 | Members, groups, budgets, billing, customers, analytics, wallets, webhooks, realtime |
| OAuth | 12 | Authorization/device ceremonies, connections, revocation and discovery |

The main API is structured around hosted economic resources rather than one
purchase aggregate:

- nine Agent operations;
- eight Plan operations;
- three access/request operations;
- three credit operations;
- six x402 permission operations;
- five Delegation operations;
- three payment-method operations; and
- five Router operations.

Several documented live routes are absent from the committed OpenAPI, including
Router proxying, MPP seller endpoints, the version-discovery endpoint and some
card/widget routes. That is a material contract-lifecycle warning for AE: API,
SDK, docs, CLI, MCP, skills and examples should be generated or conformance-
tested from one canonical action and schema registry.

Useful API patterns to scavenge:

- environment-prefixed keys and hard sandbox/live separation;
- OAuth 2.1 Authorization Code + PKCE and RFC 8628 device flow;
- durable consent/connection records;
- explicit Delegation selection and refusal when selection is ambiguous;
- idempotent Router `requestId` with duplicate recovery;
- separate merchant-payment and platform-fee states;
- structured error codes, hints and correlation identifiers;
- version pinning independent of SDK package version;
- signed webhook delivery history and manual replay; and
- public machine discovery alongside authenticated consequence APIs.

## SDK and integration structure

### TypeScript

`@nevermined-io/payments` v1.11.2 is an ESM-first facade over hosted Nevermined
services. It exposes Plans, Agents, x402, Delegation, Facilitator, Requests,
Organizations, Observability, Contracts, A2A, MCP, MPP and generic query
surfaces. [Repository](https://github.com/nevermined-io/payments)

At the pinned release, its local unit suite passed **570 tests across 43 suites,
with one skipped**. The package is production-shaped, but adapter maturity
varies:

- Express is the cleanest on-ramp, yet protected output can still be returned
  when post-execution settlement fails.
- Managed MCP has a confirmed concurrent transport ownership problem.
- A2A has durable-task concepts, but token/client cache keys do not fully bind
  delegation and expiry.
- LangChain returns tool output when settlement fails and stores the last
  settlement in process-global state.
- MPP has stronger body binding and uncertainty semantics but remains
  experimental and uses process-local replay guards.

The current HTTP and MCP tutorials failed clean-install TypeScript compilation
in the research track, even though the core unit suite passed. This distinguishes
library maturity from end-to-end developer-experience maturity.

### Python

`payments-py` v1.16.1 is a broad integration kit for Plans, Agents,
Organizations, x402, Delegations, Facilitator, MCP, A2A, MPP, FastAPI,
LangChain/LangGraph/Deep Agents, Strands, AgentCore and telemetry.
[Repository](https://github.com/nevermined-io/payments-py)

Its public source contained roughly 25k source lines, 25k test lines, 66 test
files and about 978 test functions at the evidence pin. It is actively released
and unusually integration-rich. It also has material last-mile differences:

- synchronous hosted calls can block async framework adapters;
- FastAPI buffers responses and can release successful output after settlement
  failure;
- output-based dynamic pricing can settle more than the amount verified before
  execution;
- MCP non-streaming result suppression is stronger, but streaming cannot retract
  delivered chunks;
- A2A server semantics are ahead of the first-party buyer client;
- some token, task and replay stores are process-local; and
- receipts, retryability and outcome certainty are not normalized across
  adapters.

The opportunity is not merely to integrate every framework. AE should put every
adapter over one durable Invocation and commercial state machine, so HTTP, MCP,
A2A, MPP and framework differences cannot silently change financial truth.

## Maturity assessment

| Dimension | Score | Judgement |
|---|---:|---|
| Product breadth | 4.0/5 | Coherent early-production suite |
| Protocol/payment engineering | 4.0/5 | Strong multi-rail and state design |
| Developer experience | 4.0/5 | Broad and active, with moving contracts |
| Operational maturity | 3.0/5 | Serviceable but shallow public proof |
| Security/compliance | 3.5/5 | Serious claims; reports and controls gated |
| Ecosystem | 3.0/5 | Live supply and integrations; emerging adoption |
| Commercial maturity | 3.0/5 | Monetizable; role/legal model incomplete |
| Market maturity | 2.5/5 | Live supply; demand and repeat allocation unproved |

**Overall inference: 3.4/5 — credible early-production infrastructure for a
controlled integration, not yet an institutional-grade commercial operating
system.**

Positive evidence includes live supply, active SDK releases, broad tests,
structured payment states, sandbox/live separation, organization capabilities,
public pricing, claimed ISO 27001/SOC 2 Type II/PCI SAQ-D controls and explicit
failure documentation. [Pricing](https://nevermined.ai/pricing/) ·
[Security](https://nevermined.ai/security/)

Material limits:

1. The production backend is private, so server-side atomicity, ledger,
   authorization and recovery invariants cannot be independently audited.
2. Some live card/crypto E2E suites are skipped or non-blocking in CI.
3. Open issues and current source show delivery/settlement divergence across
   adapters.
4. Catalog health is real but uneven; eight live listings were unverified and
   latency evidence covered only part of supply.
5. Public status checks broad roots rather than rail-level purchasing and
   settlement synthetics.
6. Current public legal terms appear to describe an older product generation
   and conflict with autonomous use, custody and current fee claims.
7. Public security claims are serious, but the underlying reports are
   NDA-gated and were not inspected.
8. Public evidence does not establish GMV, repeat purchase, active buyer count,
   supplier retention, loss/refund rates or useful outcomes.

These are diligence gates and architecture inputs, not reasons to ignore the
opportunity.

## How AE should be structured

AE should be an **expandable opportunity stack around one canonical event
spine**, not a feature box and not a payment-rail wrapper.

```text
External ecosystems
  Nevermined | Locus | Whop | provider APIs | registries | x402 | MPP
  MCP | A2A | cards | bank rails | stablecoins | human/physical providers
                              |
                    replaceable adapters
                              |
Canonical AE event spine
  gap -> resolution -> commitment -> invocation -> delivery/uncertainty
      -> remedy -> commercial closure -> outcome evidence
                              |
Expandable modules
  organizations | groups | budgets | wallets | plans | subscriptions
  provider monetization | payouts | CRM | widgets | analytics | risk
  identity/reputation | generic routing | outcome pricing | treasury
                              |
Role-safe projections
  web app | API | TypeScript/Python SDKs | CLI | MCP | A2A | agent skills
```

This is a logical ownership model, not a requirement to deploy eight services.
It allows the product to expand without confusing different kinds of truth.

### 1. Institutional identity and roles

Canonical objects:

- Business Principal;
- Agent Principal;
- Account;
- Credential and consent/connection;
- Provider;
- Seller; and
- payment recipient.

Nevermined account, user, organization, API key, service `Agent`, merchant and
wallet identifiers should attach as external identities. They must not replace
AE's roles. This makes future Nevermined, Locus, Whop, bank, card and direct
provider relationships composable.

### 2. Authority and funding

Keep separate:

- Mandate: authority to make a class of purchase;
- Commitment: authority consumed for one exact decision;
- Credential: access and attribution evidence;
- Funding source: card, bank, balance, wallet or credit line;
- Payment Delegation: limited authority over one funding source;
- Budget/exposure policy: aggregate limits across agents, groups and routes.

Nevermined Delegations are valuable funding instruments. They are not complete
AE Mandates. This separation also leaves room for organization budgets, shared
cards, custodial wallets and future credit products.

### 3. Market and supply

Use three layers:

1. source observations from Nevermined ARD, Locus, registries and providers;
2. admitted, versioned Operations with exact provider, contract, effects,
   readiness and evidence; and
3. caller-specific Resolution/viability facts and allocation evidence.

This supports broad federation without allowing a listing or payment challenge
to become callable truth by accident.

### 4. Commercial offer and commitment

Preserve Operation as the bounded contribution. Add a commercial configuration
seam that can support, when demanded:

- one-off fixed price;
- prepaid bundles;
- pay-as-you-go;
- subscription/time access;
- dynamic or cost-plus pricing;
- outcome-contingent pricing; and
- negotiated or organization-specific terms.

The Commitment must bind the selected Operation revision, normalized input,
authority version, Seller, Provider, payment recipient, buyer gross ceiling,
provider obligation, pricing rule/version, terms, effects, data use, evidence,
expiry and retry rule. A Nevermined Plan or x402 permission can implement part
of this, but cannot substitute for it.

### 5. Invocation, delivery and transport

One Invocation should own provider execution across all transports. Transport
adapters map into a common vocabulary:

```text
not_dispatched
accepted
delivery_partial
delivered
provider_failed
payment_pending
settlement_failed
outcome_unknown
reconciliation_required
remedied
commercially_closed
```

HTTP, MCP, A2A, MPP, streaming, async jobs and human/physical providers may
produce different evidence, but they must not create different commercial
meanings for the same state.

### 6. Money, obligation and closure

Represent independent legs and facts:

- buyer Charge/consideration;
- Provider obligation;
- platform fee/margin;
- authorization and held exposure;
- payment attempts and settlement;
- provider earnings, maturity and payout;
- refunds, disputes, losses and adjustments;
- delivery evidence and remedy; and
- derived commercial closure.

Nevermined's separate merchant-payment and Router-fee states validate this
direction. AE can extend it by keeping payment, delivery and closure distinct
and joining them under the Invocation.

### 7. Business platform modules

Treat Nevermined's organization surface as a genuine opportunity portfolio:

- workspaces and tenancy;
- members, roles and fresh human control;
- groups and shared budgets;
- customer records and lifecycle;
- provider onboarding and payout readiness;
- embedded card/delegation/checkout widgets;
- organization wallets and treasury;
- billing tiers and commissions;
- analytics, activity and events;
- webhooks, realtime and support operations; and
- risk/fraud policy.

These modules should consume the same canonical event and role model. This is
what keeps their expansion from creating a second, incompatible commerce stack.

### 8. Intelligence and distribution

Build market intelligence from attributed facts:

- gap provenance and considered supply;
- caller-specific viability;
- selection rationale;
- price, latency, delivery and recovery;
- immediate usefulness;
- repeat purchase and switching;
- bypass and incremental supplier demand;
- route economics and failure concentration.

Expose one canonical action inventory through web, API, generated TypeScript
and Python clients, CLI, MCP, A2A, `llms.txt`, agent skills and embedded widgets.
Nevermined's distribution breadth is worth copying; its docs/SDK/wire drift is
the warning to generate and continuously conformance-test those surfaces.

## Opportunity portfolio

Nothing below is rejected by the current boundary. Sequence reflects evidence,
dependency and consequence—not a permanent product exclusion.

| Opportunity | Posture | Upside | Main prerequisite | Blast radius |
|---|---|---|---|---|
| Nevermined ARD/Catalog ingestion | Core + leverage | Immediate live supply and coverage | Provenance, admission, health evidence | Medium |
| Nevermined x402/MPP/card/crypto adapter | Partner + core | Faster paid execution and rail reach | Contract, SLA, reconciliation, exit path | High |
| Consequence-bound Commitment | Core | Governable autonomous spend | Exact role, input, price and effect binding | High |
| Protocol-neutral uncertainty/remedy journal | Core | Safe retry and commercial closure | Durable Invocation and evidence | High |
| Caller-specific viable discovery | Core | Better allocation than a raw directory | Principal, authority, funds and readiness projection | Medium |
| MCP Operation gateway | Core + leverage | Native agent discovery and purchase | Concurrency, durable sessions, stream policy | Medium-high |
| A2A Operation gateway | Expansion + leverage | Cross-agent tasks and procurement | In-band buyer, persistent task/payment join | High |
| Framework adapters | Expansion | Reach LangChain, Strands, AgentCore and others | One durable adapter contract | Medium |
| Multi-rail funding and shared budgets | Expansion | Mainstream business adoption | Legal, treasury, FX and aggregate controls | Very high |
| Provider Plans, bundles and subscriptions | Expansion | More conversion and recurring revenue | Offer semantics, cancellation, entitlement | High |
| Dynamic/cost-plus/outcome pricing | Expansion | Better margins and new categories | Inspectable maximum, metering and disputes | High to very high |
| Provider earnings and payouts | Expansion + partner | Scalable supply activation | KYB, obligation, maturity and recovery | Very high |
| Organization workspaces/RBAC/groups | Platform leverage | Enterprise ACV and multi-agent control | Tenant isolation and role-safe authority | High |
| Widgets and white-label onboarding | Platform leverage | Embedded distribution | Origin/session security and consent | High |
| Webhooks/realtime/support control plane | Core + leverage | Operable autonomous commerce | Signed attempts, retention, replay and audit | Medium |
| Analytics, CRM and outcome evidence | Platform leverage | Retention and data/network advantage | Complete events and privacy rules | Medium |
| Generic compatible-endpoint Router | Long-range option | Very broad addressable supply | SSRF, exact quotes, liability and admission | Very high |
| Custodial organization treasury | Long-range + partner | Lock-in and seamless agent budgets | Licensing, segregation, AML/CTF and recovery | Extreme |
| Smart-account/agent identity evidence | Leverage + partner | Portable credentials and reputation inputs | Recovery, privacy and role separation | Medium-high |
| Human, physical and asynchronous supply | Expansion | Vast non-API economy | Bounded obligation, delivery SLA and remedy | Very high |

## Forward sequence

### Immediate structural work

1. Define the adapter boundary: Nevermined objects remain external evidence;
   AE remains the canonical commercial record.
2. Finish the Commitment and independent buyer/provider financial legs.
3. Define one delivery, settlement, uncertainty, reconciliation and remedy state
   machine for every transport.
4. Ingest the Nevermined ARD feed as source observations and admit one low-risk
   Operation.
5. Pin SDK/API versions and run AE-owned contract tests, including concurrency,
   settlement failure and interrupted response cases.

### First live proof

1. Execute one sandbox and one live Nevermined-backed purchase.
2. Reconcile exact buyer gross, Nevermined/rail fee, Provider net and delivery.
3. Prove cap refusal, duplicate identity, dropped response, downstream failure,
   unknown settlement, refund/remedy and recovery.
4. Capture caller continuation and a later repeat or supplier switch.
5. Add a second payment adapter to prove the AE contract is portable.

### Platform expansion

Grow the proved loop into provider onboarding/payout, organizations, groups,
shared budgets, widgets, customer records, analytics, webhooks, risk controls,
subscriptions, generic routing, custody and outcome pricing. Each expansion
should reuse the same principals, Commitments, Invocations, money legs, evidence
and closure state rather than creating a parallel product core.

## Partner diligence gates

Before AE treats Nevermined as a production money dependency, obtain or prove:

- the actual contracting entity and Seller/Provider/PSP/custody roles;
- current terms for autonomous use, bot access, fees, liability and termination;
- geography, supported rails, currencies, chains, providers and feature flags;
- exact delegation and x402 binding to Plan, agent/service, payee, amount,
  request body, expiry and caller;
- idempotency and outcome-unknown behavior at the private backend;
- refund, chargeback, dispute, reversal and settlement-reconciliation APIs;
- signed webhook retry, ordering, retention and replay contracts;
- transaction and rail-level SLOs, incidents and escalation ownership;
- SOC 2, ISO 27001 and PCI report scope for the services AE would use;
- data processing, residency, deletion and export obligations;
- supplier payout/KYB and reserve/hold behavior; and
- an operational exit/export path if Nevermined is replaced.

## Bottom line

Nevermined is mature enough to accelerate AE now and broad enough to influence
its long-term platform structure. It supplies live machine-readable inventory,
delegated spending, multi-rail payment, seller monetization, organization
controls and distribution adapters that would be expensive to recreate.

The opportunity is larger than integration. Nevermined shows the modules an
agent-commerce platform can grow into. AE should preserve every one of those
options by anchoring them to a vendor-neutral commercial event spine. That makes
cards, wallets, subscriptions, routing, organizations, CRM, embedded commerce,
human supply and outcome pricing additive businesses rather than forces that
fragment the product.

AE's potential moat is the layer Nevermined, Locus and Whop each leave partial:
the portable, attributable relationship between a capability gap, the chosen
contribution, delegated authority, commercial parties, execution, payment,
delivery, uncertainty, remedy, closure and the evidence that improves the next
choice.
