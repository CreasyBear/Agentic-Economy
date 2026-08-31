# Agentic Economy — Agent-First Platform Rebaseline

## What This Is

Agentic Economy (AE) is a cross-harness Operation market where agents acting for
people and organizations discover, compare, and buy bounded outside services
while continuing work owned by their existing harness.

This rebaseline turns the Operation MVP into a real two-sided platform. It is
organized around one canonical agent lifecycle—gap, resolution, commitment,
invocation, result, outcome—rather than separate feature programmes for
identity, payments, supply, invocation, and support.

The design authority for that lifecycle is
[`docs/designs/agent-operating-contract.md`](../docs/designs/agent-operating-contract.md).
The benchmark gap analysis is
[`research/AE-PLATFORM-MATURITY-PRIORITIES.md`](../research/AE-PLATFORM-MATURITY-PRIORITIES.md).

## Core Value

An owner-authorized agent can cheaply understand the live market, choose a
caller-viable Operation, know exactly what will happen and cost, invoke it
safely, consume or recover the result from durable references, and make future
allocation better without surrendering its project context.

## Business Context

- **Buyer:** an agent acting for a person or organization under bounded
  authority and budget.
- **Supplier:** a business, specialist, data owner, machine operator, or agent
  publishing an exact callable contribution.
- **Revenue model:** B2B reseller posture; buyer charge, supplier payable, AE fee,
  refund/dispute, and payout remain separately attributable. No customer stored
  value is introduced by this milestone.
- **Market proof:** one dense category, at least two independent paid suppliers,
  at least two external harnesses, immediate usable results, and retained repeat
  or switching behavior.
- **Platform proof:** buyer, supplier, agent, and operator journeys complete
  without founder or database intervention.

## Active Outcomes

- [ ] One response language and durable reference chain are identical in meaning
  across HTTP, MCP, CLI, UI, and bounded chat projections.
- [ ] An agent can orient once, receive compact caller-viable candidates, inspect
  evidence and exclusions, and control money/latency/context expenditure.
- [ ] An expiring caller-bound commitment seals inspect-to-invoke continuity.
- [ ] Durable owner-bound machine identity and direct bounded grants support
  activation, inspection, revocation, rotation, and recovery without founder
  intervention.
- [ ] Invocation separates command, execution, payment, and observation state;
  unknown effects reconcile rather than retry blindly.
- [ ] A fresh agent process can resume from references and machine-executable next
  actions without conversation or dashboard state.
- [ ] Suppliers can import/author, validate, test, publish, version, suspend,
  withdraw, remedy, and receive payouts through self-serve platform paths.
- [ ] Buyers and suppliers receive signed, replayable, observable outbound events
  without AE owning webhook delivery infrastructure.
- [ ] Every market interaction accumulates provenance-tagged allocation evidence;
  only qualified, inspectable evidence changes ranking.
- [ ] Operators can diagnose and act from one correlation reference across
  authority, invocation, provider, payment, event, payout, and support state.
- [ ] Release, SLO, capacity, isolation, retention, restore, rollback, incident,
  and deprecation proof are operated rather than described.

## Product Boundary

### AE owns

- canonical Operations and source admission;
- market intents, resolutions, commitments, and allocation policy;
- owner-bound authority, budgets, consequence admission, and attribution;
- invocation identity, observations, results, cancellation, and reconciliation;
- commercial correlation, supplier payable, refund/dispute, and payout state;
- market-relevant outcome evidence and buyer/supplier/operator projections.

### The caller and harness own

- the project, user relationship, planning, reasoning, prompts, memory, files,
  orchestration, and downstream definition of success;
- when to use AE and how to consume the returned contribution.

### Infrastructure partners own behind AE ports

- authentication and token machinery;
- durable queue/workflow and rate-limit mechanics;
- protocol framing and schema parsing;
- KYC, payout-account collection, and payment-rail primitives;
- webhook delivery, signing, retries, replay, and consumer endpoint portal;
- telemetry storage and secret custody.

AE remains responsible for the bounded contract, source event identity,
attribution, recovery, and user-visible outcome even when machinery is bought.

## Constraints

- **Product authority:** `PRODUCT.md` overrides planning and design documents.
- **Market unit:** Operation remains the only unit of supply.
- **Owner-bound agency:** agents and workloads are durable technical Principals
  bound to a person- or organization-owned Account. A Credential never owns.
- **Delegation:** implement direct one-hop bounded grants first. Multi-hop
  delegation requires later demonstrated demand and a separate threat decision.
- **No project capture:** AE retains bounded market intent and outcome evidence,
  never arbitrary project state or chain of thought.
- **No hidden state:** every non-terminal interaction has a durable reference,
  explicit unknowns, and executable next actions.
- **No silent drift:** invocation must match an unexpired commitment over exact
  caller, authority generation, Operation revision, input digest, price/ceiling,
  terms, effects, data use, and readiness.
- **No blind retry:** uncertain irreversible effects reconcile.
- **No model tax:** deterministic validation, matching, policy, state transition,
  and formatting do not require a model call.
- **One source of truth:** Convex remains the sole writable application record;
  projections and infrastructure partners do not become domain authority.
- **No handrolling:** mature maintained infrastructure is the default for
  identity, queues/workflows, rate limiting, protocol SDKs, payments/KYC/payouts,
  outbound events, observability, and secrets. Every exception requires an ADR.
- **Vertical proof:** each phase closes an externally usable lifecycle segment,
  including denial/no-effect, recovery, observability, and operator paths.
- **Evidence honesty:** source tests, hosted/external proof, operations, legal,
  commercial, and market behavior are separate evidence classes.

## Default Infrastructure Decisions

| Concern | Default |
|---|---|
| Human and owner-delegated machine auth | Clerk sessions, OAuth access tokens, and user/org API keys |
| Application state | Convex transactions and indexed queries |
| Queued/durable work | Convex Workpool; Workflow only for genuine multistep durability |
| Rate/aggregate limits | Convex Rate Limiter and Aggregate components |
| Contracts | Official MCP SDK, Zod, JSON Schema/OpenAPI tooling |
| Supplier onboarding/payouts | Stripe Connect hosted or embedded flows |
| Payment adapters | Official Stripe, Coinbase CDP, and x402 SDKs |
| Outbound events | Svix behind an `EventDelivery` port |
| Observability/evidence analytics | Sentry and PostHog with safe dimensions |
| Secrets | Managed `SecretStore` provider and short-lived workload identity |
| Verification | Vitest, Playwright, official sandboxes, exact-revision evidence |

## Out of Scope

- General agent runtime, planning, memory, workflow, or multi-agent system.
- Ownerless autonomous-agent Accounts or legal/economic personhood.
- General delegation graph or policy DSL.
- Tender board, procurement messaging, or project/task marketplace.
- Custody, deposits, withdrawals, transferable balances, or reusable stored value.
- Composite opaque reputation or model-only allocation.
- Automatic irreversible provider failover.
- Microservices without a measured modular-monolith extraction trigger.
- Enterprise SAML/SCIM, regional active-active writes, or dedicated tenants absent
  demonstrated demand.
- Hosted app store, cards, advertising, BNPL, company formation, or tax remittance.

## Key Decisions

| Decision | Rationale | Outcome |
|---|---|---|
| Use one canonical lifecycle | Agents should not integrate separate catalogue, auth, payment, invocation, and support mental models | Gap-to-outcome references become the planning spine |
| Keep Operation as the only supply unit | New Quote/Order/Task abstractions would add translation cost without market value | Resolution and commitment remain supporting artifacts |
| Bind agents to owner Accounts | Matches `PRODUCT.md`, buyer authority, legal payer reality, and recoverable control | Autonomous ownership language is removed from active plans |
| Start with direct delegation | Multi-hop adds security and operating complexity before proven demand | One-hop grants are the milestone requirement |
| Make compactness and cost contractual | Agent tokens, calls, time, and money are product resources | Progressive disclosure and resource ceilings apply to every surface |
| Make state and next actions explicit | Fresh-process recovery is the strongest test of agent ergonomics | Hidden session/dashboard dependencies are defects |
| Accrete market evidence only | Allocation improves without becoming a project-memory product | Provenance and privacy boundaries are mandatory |
| Buy commodity machinery | Hand-built infrastructure creates risk and consumes effort outside AE's moat | Exceptions require a buy-vs-build ADR |
| Prove a live market cell before breadth | Platform machinery is not evidence of allocation or demand | Two suppliers, two harnesses, paid use, and repeat/switch are milestone gates |
| Keep candidate plans reviewable | Planning history contains unaccepted authority-heavy work | Current roadmap is a candidate until independently challenged |

## Planning Authority

- `.planning/maturity-execution/**` and old branch/ref ledgers are historical
  evidence only.
- The active planning set is `PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md`, and
  `STATE.md`, interpreted under `PRODUCT.md` and the agent operating contract.
- Existing accepted source and tests remain implementation evidence; this
  rebaseline does not claim deployed or hosted proof.

---
*Last updated: 2026-08-31 after agent-first platform rebaseline.*
