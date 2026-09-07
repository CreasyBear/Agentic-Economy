# Agent operating contract

**Status:** active design contract  
**Revised:** 2026-09-02  
**Product authority:** [`PRODUCT.md`](../../PRODUCT.md)  
**Benchmark inputs:** [Locus maturity map](../../research/LOCUS-AE-MATURITY.md), [Whop maturity map](../../research/WHOP-AE-MATURITY.md), and [platform priorities](../../research/AE-PLATFORM-MATURITY-PRIORITIES.md)

## Decision

Agentic Economy will be designed as one agent-legible market system, not as a
collection of catalogue, identity, payment, Call, and support features.
Every surface projects the same canonical lifecycle:

> capability gap → service request/comparison → Quote → Call → delivery or uncertainty → remedy if required → Purchase resolution → Outcome records → agent continues

Each transition has one durable owner, one stable reference, explicit
preconditions, explicit uncertainty, and a machine-executable next action. The
Tool remains the only unit of supply. The supporting artifacts below exist
only to preserve decision continuity and make the market controllable.

An Agent Principal is the durable technical identity acting for a Business
Principal. It may use replaceable credentials and a bounded spending policy, but a
credential does not own a balance, reset a budget, or become an economic
principal. AE does not acquire the agent's project, plan, prompt history,
memory, or orchestration.

## The driver's-seat test

If I were the caller, I should be able to answer these questions without prose
interpretation, hidden dashboard state, or support intervention:

1. What does AE know, and what is unknown or stale?
2. Which Tools are actually executable by me now?
3. Why were these candidates included, excluded, and ordered?
4. What exact inputs, authority, money, data use, and effects will this call use?
5. Has anything changed since I inspected it?
6. Is the effect safe to retry, definitely completed, definitely absent, or
   genuinely uncertain?
7. What is the cheapest safe action that moves the state forward?
8. Can a fresh process continue using only durable references?
9. What did AE directly observe, what did the buyer report, and what did AE infer?
10. Did this interaction make the next allocation better without capturing the
    caller's private project context?

If the system cannot answer one of these questions, it must return `unknown` and
the exact way to resolve it. It must not manufacture confidence.

## Tower of linked abstractions

The tower deliberately has few layers. Each layer consumes references from the
layer below and adds one kind of meaning.

| Layer | Canonical artifact | Question it answers | Durable identity |
|---|---|---|---|
| 0 | Fact | What is known, by which source, as of when? | `factRef` or inline provenance |
| 1 | Tool version | What exact bounded contribution does one Provider offer? | `toolRef` + version |
| 2 | Service request | What missing contribution and hard constraints did the caller state? | `requestRef` |
| 3 | Service comparison | Which versions were considered, viable, excluded, and why? | `resolutionRef` |
| 4 | Quote | What exact viable choice did AE and the caller inspect before effect? | `quoteRef` + digest + expiry |
| 5 | Spending policy | Who may do what, for which customer, within what budget and time? | policy version |
| 6 | Call | What single command/effect identity is progressing? | `callRef` + idempotency identity |
| 7 | Result and continuation | What literal output or durable state can the caller consume next? | `resultRef` or `callRef` |
| 8 | Outcome evidence | What use, repeat, switch, failure, and economic facts accumulated? | `outcomeRef` + provenance |
| 9 | Projection | What does a buyer, Provider, or operator need to see or do now? | derived; never a second state owner |

### Layer 0 — Fact

A fact contains a value, source, observation time, freshness/expiry, and
provenance class. Missing is different from false. Provider-claimed,
AE-observed, buyer-reported, and AE-derived facts never collapse into one
unqualified score.

### Layer 1 — Tool version

A Tool version is an immutable callable contract: Provider, inputs,
outputs, price basis, material terms, effects, data use, access requirements,
readiness, evidence, and runtime route. Imported registry metadata is only a
candidate source fact until admission and publication create a revision.

### Layer 2 — Service request

A service request is a bounded description of the missing next contribution plus
hard constraints such as budget, deadline, geography, data policy, and effect
class. It contains only the context required to allocate supply. It is not a
task, conversation, workflow, tender, or Provider message.

### Layer 3 — Service comparison

A service comparison is an immutable snapshot of considered Tool versions,
caller-specific viability, exclusions, ranking evidence, and the policy version
used. Search results must say `executable_now`, `setup_required`, or
`unavailable`, with closed reason codes and exact remediation. Search must not
fan out to Providers; readiness is maintained by bounded background probes.

### Layer 4 — Quote

A Quote is the bridge between detail and effect. It binds the caller, owner
Account, authority generation, Tool version, normalized arguments, total price
or hard ceiling, material terms, data use, effects, readiness evidence, and
expiry. Call rejects any drift before reservation, Charge, secret read, or
Provider effect. A Quote is not a generic order.

### Layer 5 — Spending policy

A Business Principal issues a bounded spending policy for a durable Agent
Principal. It states Account, Tool scope, environment, per-Call and aggregate spend,
rate/concurrency bounds, effect classes, approval requirements, validity, and
generation. Aggregate limits follow the Agent Principal across credential
rotation. The first platform milestone supports direct one-hop delegation;
general delegation chains wait for a demonstrated use case.

### Layer 6 — Call

A Call owns one accepted intent and all of its monotonic observations.
Execution state and payment state remain separate correlated axes. Transport
success is never business success. Retrying is automatic only when the system
can prove no effect occurred; ambiguity becomes `reconciliation_required`.

### Layer 7 — Result and continuation

The terminal response contains literal output when available. Otherwise it
contains a durable reference, current state, freshness, and the exact safe next
actions: status, cancel, supply input, reconnect, approve, reconcile, or escalate.
A fresh process can continue from these references without conversation history.

### Layer 8 — Outcome records

AE records only market-relevant evidence: candidate exposure, exclusion,
selection, Call, delivery, qualified use, buyer-reported acceptance, repeat,
switch, bypass when observable, Provider earnings, and recovery. Replay
is not repeat demand. Provider completion is not usefulness. Allocation changes
must be attributable to versioned policy and inspectable evidence.

### Layer 9 — Projections

Buyer, Provider, operator, API, MCP, CLI, and UI views are projections over the
same facts and allowed transitions. A projection may redact or compress; it may
not invent a parallel lifecycle or hidden source of truth.

## Action-specific response language

Machine surfaces share action contracts and domain semantics, not one universal
response envelope. Search, Quote, Call and status each use one
versioned tagged result containing only the facts required for that decision.
Ordinary reads do not carry empty money, warning, state or continuation fields.
`correlationRef` appears only when accepted asynchronous work, refusal,
uncertainty or support requires it; `callRef` owns the Call lifecycle.

A non-terminal response contains at most one executable machine continuation:

```json
{
  "action": "call.status|tool.quote|call.cancel|call.reconcile",
  "arguments": {},
  "notBefore": null,
  "retry": "safe|never_resubmit"
}
```

An optional owner handoff is separate and identifies the required actor, bounded
reason and durable status reference. The response does not repeat
manifest-owned schemas, preconditions, consequence descriptions or effect
metadata. Possible dispatch never exposes `tool.call` as a continuation.
Exact money is always a decimal string plus currency and scale; a machine
response never asks the caller to infer a balance from events.

## Agent ergonomics

### Orient from the existing contract

Do not create a new generic orientation protocol. The generated agent manifest
describes supported actions and versions. `agentAccess.whoami` and
`agentAccess.balance` remain explicit setup, diagnostic and accounting reads;
they are not mandatory steps before each Call. Authentication resolves the
Business Principal, Agent Principal, Account, credential, environment and
spending policy server-side, and `tool.quote` includes only the balance and limit
facts material to the selected Call. The caller never supplies an `accountRef`.

### Progressive disclosure

- `registry.tools.search` returns one to three compact candidate packets by
  default. A candidate contains no full schema, repeated navigation or
  caller-specific money state.
- `registry.tools.describe` and comparison remain optional public reads for
  browsing or explicit comparison; they are not part of the recommended
  authenticated Call path.
- `tool.quote` is the one caller-specific detail and viability action.
  It combines the selected Tool's material contract with exact or maximum
  all-in AUD price, effects, data use, authority fit, Agent Principal budget
  impact, permitted shared-balance viability, current evidence and material
  unknowns. It produces the expiring Quote used by `tool.call`.
- Package 4 v1 has one bounded, decision-safe response shape per action. It has
  no selectable detail level or arbitrary field group. Larger evidence remains
  behind stable references.
- Pagination, cursors, conditional reads and version-aware status prevent
  repeated full-state downloads.

### Bounded action surface

The recommended managed-Call path is:

```text
registry.tools.search -> tool.quote -> tool.call -> result
```

`call.status`, `call.cancel` and `call.reconcile` appear only
when the Call state permits them. Public detail, compare, whoami and
balance remain lazy actions. Outcome reporting is deferred until a
real repeat-selection consumer justifies the action and its aggregates.
Provider and operator verbs live in separate namespaces. MCP, API and CLI
project the same contracts without transport-specific business behavior.

### One deep managed-Call interface

The buyer-facing Call module is a deep module: a small interface hides the
coordinated market, authority, execution, economic, x402 and evidence work.
The Agent Principal chooses a Tool and supplies literal input plus its
constraints to `tool.quote`. It then calls the returned `quoteRef` through
`tool.call` with an idempotency key and follows safe continuations. It does
not choose a treasury pool, provide a wallet or `accountRef`, calculate foreign exchange,
reserve balances, interpret settlement finality, construct ledger entries, or
decide whether an unknown effect is safe to retry.

Internally, market choice, spending-policy use, Call, AUD reservation, corporate
USDC commitment, x402 payment, Provider obligation, delivery evidence and
recovery remain separate modules and state owners joined by stable references.
They must not be flattened into a mutable Call mega-record merely to simplify a
response.

### Make cost a first-class control input

`tool.quote` returns expected monetary cost, the Agent Principal's remaining
budget, whether permitted shared Account funds can support the Call, latency
class, expiry and whether a Provider/network/model call is required. The caller
supplies literal input and only the bounded constraints supported by the action
contract. It does not choose response verbosity or internal evidence groups.
Deterministic validation, matching, policy, and state transitions never invoke a
model. A model may normalize ambiguous natural language only behind a bounded,
observable adapter with a deterministic fallback.

### Never make the caller reconstruct truth

Commands return authoritative post-command state or a durable accepted-state
reference. Status returns valid transitions. Idempotency applies to every
consequential command. Same identity plus different material intent fails. Safe
automatic retry, unsafe retry, and reconciliation are distinct machine states.
Status accepts an optional previously observed state version. An unchanged read
returns only the Call reference, current version and recommended next
observation time; a changed read returns the current bounded delta. Credential
rotation cannot reset an Agent Principal's budget or detach its prior Calls.

## Coherent system boundaries

The system has five control planes, joined by references rather than shared
mutable objects:

1. **Market plane:** Tools, service requests, comparisons, Quotes, allocation.
2. **Authority plane:** Business Principals, Accounts, Agent Principals, credentials, spending policies,
   budgets, approvals, Connections.
3. **Execution plane:** Call admission, dispatch, observation, results,
   cancellation, reconciliation.
4. **Economic plane:** price, reservation, buyer charge, Provider payable,
   platform fee, refund/dispute, payout.
5. **Evidence plane:** events, outcome provenance, operator queues, SLOs,
   release/restore proof, market learning.

Each canonical table/state machine has one owning module. Cross-plane joins use
stable refs and immutable snapshots. Adapters translate transport and provider
protocols; they do not decide domain policy. No new service is introduced merely
to mirror Convex state.

## Accretive without becoming invasive

An interaction is accretive when it improves future market allocation from
facts AE is entitled to know. AE may retain:

- normalized market intent and hard constraints;
- candidate exposure, exclusions, selection, and policy version;
- Call, payment, delivery, recovery, and Provider evidence;
- later repeat/switch links when directly observed; and
- aggregate demand that satisfies privacy and sample thresholds.

Package 4 retains operational evidence AE already observes: price, latency,
delivery, payment, failure and recovery. Buyer-reported use is not required to
prove the first managed Call and is deferred until a demonstrated allocation or
evaluation consumer justifies collecting it. Free-form project context is
neither required nor accepted.

Future Resolution uses these observations as labelled inputs: hard constraints
first, then fit and evidence adequacy, then the caller's stated preference among
price, latency and recovery risk. It does not hide alternatives behind one
universal quality score. Every aggregate exposes scope, sample size, window,
freshness and provenance so the agent can decide how much weight to give it.

AE must not retain arbitrary prompts, plans, files, conversations, chain of
thought, or wider project state. Private intent is not exposed to Providers.
Provider-facing demand intelligence is aggregated, delayed where necessary, and
cannot reveal a buyer or private workload.

## Buy before build

“No handrolling” is a design constraint, not a preference. AE owns market
semantics and buys commodity platform machinery behind narrow ports.

| Concern | Default | AE still owns | Do not hand-roll |
|---|---|---|---|
| Human and owner-bound machine authentication | Clerk sessions, OAuth access tokens, and user/org API keys | Principal binding, Account context, grants, consequence-time policy | Passwords, token formats, OAuth server, API-key hashing/management UI |
| Runtime state and atomicity | Convex transactions and indexed queries | Domain state machines and invariants | Distributed lock service or shadow database |
| Queued/durable work | Convex Workpool; Convex Workflow only for genuine multistep durability | Call/effect semantics and reconciliation | Queue, scheduler, backoff engine, workflow runtime |
| Rate and aggregate limits | Convex Rate Limiter and Aggregate components | Budget meaning and consequence admission | Home-grown token bucket or hot-path full scans |
| Machine contracts | Official MCP SDK, Zod, JSON Schema/OpenAPI tools | Tool/Call semantics and cross-surface parity | Protocol framing, schema parser, generated protocol types |
| Provider onboarding and payouts | Stripe Connect hosted or embedded onboarding and payout surfaces | Provider admission, payable truth, margin, remedy, payout correlation | KYC, bank-detail collection, payout dashboard |
| Payment protocols | Official Stripe, Coinbase CDP, and x402 SDKs behind adapters | Provider-neutral price/effect/economic truth | Signing primitives or protocol clients already supplied by SDKs |
| Outbound events | Svix sending, signatures, retries, replay, and consumer portal | Event vocabulary, payload schemas, Account mapping, source event IDs | Webhook retry scheduler, signing, replay UI, endpoint health |
| Observability and product evidence | Sentry and PostHog | Safe dimensions, market semantics, SLO ownership | Bespoke trace store or analytics pipeline |
| Secrets | Managed secret provider behind `SecretStore`; Vercel OIDC for workload access where applicable | Connection lifecycle, generation, redaction, fail-closed policy | Secret vault or long-lived shared workload keys |
| Tests | Vitest, Playwright, contract fixtures, official sandboxes | Adversarial invariants and exact-revision evidence | Custom test runner or fake provider protocol |

Dependency adoption requires a short decision record covering maintained status,
installed-version fit, required semantics, failure mode, data ownership,
exportability, and fallback. A provider must not become AE's authority or
canonical market history merely because it supplies infrastructure.

Current documentation supports these choices: Clerk exposes owner-delegated API
keys and OAuth machine authentication; Stripe recommends hosted or embedded
Connect onboarding; Convex provides isolated Components, Workpool, Workflow,
rate limiting, scheduling, and usage controls; and Svix provides delivery,
signing, retries, replay, idempotency, and a consumer portal. Version and plan
availability must be rechecked during each implementation phase.

## Invariants

1. One Tool version is the exact unit quoted and called.
2. One mutable lifecycle has one authoritative owner.
3. Missing facts remain explicit unknowns.
4. A read-only stage cannot reserve, charge, read secrets, or create effects.
5. `tool.call` cannot drift from its unexpired caller-bound Quote.
6. An Agent Principal acts under a Business Principal-issued spending policy; a
   credential is not a principal and rotation does not reset limits.
7. Consequential work is idempotent and revalidates current authority.
8. Unknown irreversible effects reconcile; they do not retry blindly.
9. Every response is resumable from durable references.
10. Every implemented allocation claim names evidence, provenance, freshness,
    and policy.
11. All surfaces expose the same facts and transitions.
12. AE learns market behavior without taking ownership of project context.
13. Commodity infrastructure is bought unless an explicit decision proves it
    cannot satisfy the required invariant.

## Deliberate non-goals

- General agent runtime, planning, memory, workflow, or multi-agent coordination.
- Ownerless autonomous economic Accounts.
- A general multi-hop delegation graph in the first platform milestone.
- Provider fan-out at search time.
- Opaque composite reputation or model-only allocation.
- Automatic irreversible failover.
- New Order, Offer, or Task market units where Quote and Call already express
  the required lifecycle.
- Transport-specific domain implementations.

## Acceptance contract

The system is agent-intuitive only when an external agent in a fresh process can:

1. search and receive one to three compact candidates without full schemas or
   repeated navigation;
2. inspect one selected Tool and receive caller-specific material detail,
   authority, budget, shared-balance viability and an expiring Quote;
3. call exactly that Quote under narrow authority and idempotency;
4. consume a literal result or resume/cancel/reconcile from one durable next
   action without a dashboard; and
5. use optional whoami, balance, public detail or comparison reads only when its
   own task requires them.

The four required Package 4 journeys are: cheapest successful Call,
insufficient balance or authority, material terms drift before effect, and
unknown payment or delivery after submission. Their response budgets, excluding
literal output and the generated manifest, are: three-candidate search at most
3 KB JSON, Quote at most 4 KB, unchanged status at most 512 bytes, and
refusal or uncertain result at most 1 KB. Contract tests also record round trips,
serialized bytes, caller-supplied fields and stale-state windows for each
journey.

The platform is mature only when the same chain works with two independent paid
Providers, two external harnesses, no founder/database intervention, Provider
payout, managed outbound event recovery, and an operator who can diagnose every
state from a correlation reference.

## Official implementation references

- [Clerk machine authentication](https://clerk.com/docs/guides/development/machine-auth/overview)
- [Clerk API keys](https://clerk.com/docs/guides/development/machine-auth/api-keys)
- [Clerk OAuth applications](https://clerk.com/docs/guides/configure/auth-strategies/oauth/how-clerk-implements-oauth)
- [Stripe Connect onboarding](https://docs.stripe.com/connect/onboarding)
- [Stripe Connect platform model](https://docs.stripe.com/connect/how-connect-works)
- [Convex Components](https://docs.convex.dev/components/overview)
- [Convex durable workflows](https://docs.convex.dev/agents/workflows)
- [Convex rate limiting](https://docs.convex.dev/agents/rate-limiting)
- [Svix webhook delivery](https://docs.svix.com/introduction)
- [Svix retries and replay](https://docs.svix.com/retries)
- [Svix consumer portal](https://docs.svix.com/app-portal)
- [Context-efficient source design](../research/agentic-economy-context-efficient-source.md)
