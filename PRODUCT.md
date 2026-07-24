# Agentic Economy product authority

This document defines where AE is going and the evidence required to say where
it is now. The destination is not hedged by current gaps. Current claims are not
inflated by the destination.

## Product promise

**Your agent knows who to call—and can get the work done.**

Agentic Economy is the execution layer between a person's agent and real
businesses. It makes supply understandable and turns intent into viable action.

AE carries authorized work through booking, payment, dispatch, fulfilment,
recovery, and other registered operations.

AE is not an inquiry product, directory, lead marketplace, generic tool
registry, or chat wrapper. Discovery and qualified inquiry are useful entry
points. They are not the category or the ceiling.

## Target experience

A person states an objective and chooses how much authority to delegate. Their
agent can discover candidates, compare evidence, choose within the mandate,
book or transact, and adapt to refusal or change.

The work leaves a durable record of what happened.

The recurring movements are:

1. **Ask** — state an objective, immediate task, or continuation.
2. **Understand** — resolve only the unknowns material to a valid action.
3. **Choose** — compare viable options against the person's priorities.
4. **Authorize** — select an operating mode and its explicit limits.
5. **Act** — execute registered actions, directly or as a composed route.
6. **Follow** — inspect progress, exceptions, evidence, and recovery choices.

This is not a mandatory funnel. A provider-supported task can start and finish
as one standalone action.

A larger outcome can compile into Customer Request and coordinate several
actions. Neither path invents history or authority to fit the architecture.

## Horizontal capabilities and vertical outcomes

AE decomposes an objective into independently useful tasks, then composes the
tasks needed to complete the outcome.

A customer can ask for one task, continue from prior work, or delegate the whole
outcome.

Horizontal capabilities recur across domains: discover supply, gather evidence,
compare options, recommend, communicate, negotiate, authorize, execute, pay,
monitor, reconcile, cancel, recover, and prove what happened.

Vertical outcomes apply those capabilities to a real domain. The domain owns its
language, providers, constraints, risks, evidence standards, and action
contracts. It does not own a separate authority or execution system.

In travel, this means finding routes, comparing complete trip options, booking
transport and accommodation, paying, monitoring changes, and recovering from
disruption.

The same horizontal capabilities must support other commercial outcomes.

Tasks are not interchangeable. Research, prediction, recommendation, provider
communication, reservation, payment, cancellation, and fulfilment cause and
prove different things. Composition preserves those distinctions.

A vertical proves that AE can finish a real customer outcome. Horizontal reuse
proves that AE is a platform rather than a collection of bespoke workflows.
Neither proof substitutes for the other.

Do not build empty horizontal scaffolding in anticipation of reuse. Do not make
a vertical's nouns or workflow the neutral kernel. Earn shared capability from
real operations while keeping domain contracts explicit.

## Operating modes

| Mode | Product behavior |
| --- | --- |
| `inspect_only` | Research, compare, simulate, and prepare. No external consequence. |
| `approve_each` | Stop for approval before every consequential action. |
| `bounded_mandate` | Execute autonomously within explicit standing limits. |
| `full_yolo` | Pursue the objective end to end within the broad explicit mandate, including supported choices, retries, fallbacks, bookings, and transactions. |

Full-autonomy mode is a product capability, not a euphemism for unlimited
access.

The principal grants a revocable mandate covering the objective, actions,
recipients, purposes, disclosed data, spend, currency, count, time, concurrency,
fallback, and risk ceilings.

The agent does not ask again for permission already granted. It steps up when it
must widen the mandate, encounters irreducible ambiguity, or reaches an excluded
decision.

The customer can inspect the current mode and mandate, see material work in
progress, pause new work, and revoke future authority. Revocation cannot rewrite
effects already released to an external provider.

## Product model

**Customer Request** is the canonical aggregate for a broader desired outcome.
It owns intent, constraints, task decomposition, comparison history,
composition, and continuation.

**Registered Action** describes one supported operation and its input, output,
authority, provider, refusal, uncertainty, reconciliation, and evidence
contract.

Read-only, advisory, communicative, and consequential operations use the same
registration seam without pretending they have the same effect.

**Action Invocation** joins an action to its origin, current mandate, idempotency
meaning, attempts, and result.

Its origin is discriminated: a Customer Request or a supported standalone task.
Standalone does not mean unattributed.

**Action Attempt** records a concrete provider interaction and its effect
generation. An uncertain attempt remains uncertain until reconciled; it is not
silently retried or converted into failure.

**Business records** remain authoritative for the business fact produced by an
action. Shared control records preserve execution continuity, not a competing
copy of the business domain.

**RoutePlan** composes registered actions when coordination adds value. It is
not required for a simple action and is never shown as protocol theatre.

A customer sees understandable tasks, choices, cost, timing, disclosures,
fallbacks, and progress.

## Supply

AE owns the useful local layer above global infrastructure: participating
business relationships, current descriptions of supply, local eligibility and
conditions, comparable evidence, supported actions, and continuity across
handoffs.

An entity may expose an action through its own endpoint, an onboarded adapter,
or an AE-hosted implementation.

Routeable supply requires a current admitted business, registered operation,
offering and binding, required publication or eligibility, credentials,
readiness evidence, and a reachable intended surface.

Published pages without those conditions are discovery inventory. Known but
unintegrated businesses can be researched or contacted with their unknowns
clear; they are not silently presented as immediately executable supply.

Global platforms may host agents, expose tools, move money, or complete standard
checkout.

AE can use those rails without outsourcing business meaning, comparison,
authority, local supply relationships, coordination, or continuity.

## Execution contract

Consequential execution has these non-negotiable properties:

- the caller is identified and the current mandate is explicit;
- each attempt is attributable to the exact authority use and stable
  idempotency meaning;
- spend, count, concurrency, expiry, recipient, purpose, and data limits are
  enforced at the point of effect;
- one effect generation is current and stale workers cannot overwrite it;
- provider release, uncertainty, reconciliation, retry, and cancellation are
  represented honestly;
- the complete safe continuation is reconstructable from durable records;
- receipts prove only the event they name;
- human and machine surfaces expose the same action semantics.

These controls enable high autonomy. They do not exist to force approval
theatre or reduce every operation to inquiry.

## Current evidenced state — 2026-07-19

Customer-reachable evidence currently supports published business discovery,
public business search and detail operations, and qualified-inquiry handoff for
eligible listings.

It also supports a narrow hosted sandbox Customer Request journey through
creation, clarification, preparation, authority stops, and resume.

The repository also contains committed substrate for neutral business,
contract, offering, binding, publication, eligibility, readiness,
natural-language interpretation constrained by registered contracts.

It also contains multi-action route compilation and persistence.

Source presence and fixtures do not make that customer product.

Current evidence does not establish customer-reachable booking, payment,
dispatch, composite execution, provider fulfilment, or production-safe full
autonomy.

That is an implementation and proof gap against the target. It does not redefine
the target.

The public surfaces remain split across the older Answer Thread and search
journey, the authenticated Customer Request workspace, the external-agent
Request API, and registry discovery.

This is migration state. New product semantics belong in the canonical action
and Customer Request model, not a competing intent or execution lifecycle.

Update this section only from live source plus the relevant intended-surface
execution. Record the evidence class and exact revision.

A closed issue, persisted object, local fixture, or labelled sandbox does not
prove hosted availability, useful supply, external fulfilment, customer value,
or production safety.

## Target surfaces

- `/` is the canonical human surface for an objective, standalone task, or
  continuation.
- `/registry` projects admitted businesses, published supply, and supported
  actions without owning intent or execution.
- machine-readable HTTP and agent protocols expose the same discovery, action,
  mandate, invocation, inspection, reconciliation, and cancellation contracts.
- protected operations surfaces expose attempts, evidence, incidents, provider
  readiness, and intervention controls.
- migration surfaces redirect or retire after the canonical journey reaches
  equivalent evidence.

The interface is a projection of these contracts, not a second product.

## Decision and recommendation

AE recommends only when the principal's stated objective and current comparable
evidence support a defensible ordering. Otherwise it presents the material
tradeoffs or chooses only if the active mandate explicitly delegates that
choice.

In full-autonomy mode, ordinary delegated choices do not trigger approval stops.
The activity record explains what was chosen and why. Unsupported assumptions,
scope expansion, missing authority, and materially changed risk do.

## Product rules

1. Build the execution product. Do not preserve inquiry-only or approval-only
   behavior as strategy.
2. Keep current evidence and target capability visibly separate.
3. Decompose objectives into independently useful tasks and compose the tasks
   required to finish the outcome.
4. Build vertical completion on reusable horizontal capabilities without moving
   domain language or policy into the neutral kernel.
5. Make useful standalone actions first-class; compose routes only where
   coordination adds value.
6. Treat identity, authority, action, attempt, business result, and evidence as
   distinct concepts.
7. Data disclosure is authority and is bounded like spend.
8. Registration is necessary, never sufficient, for routeable supply.
9. Unknown external effect requires reconciliation before retry.
10. Cancellation stops what can still be stopped; it never claims reversal
   without provider evidence.
11. Conversation is an adapter, not a competing intent, authority, or recovery
   domain.
12. Public language names the customer's objective and action. Protocol
    vocabulary belongs in builder and diagnostic surfaces.

## Brand and claim boundary

**Promise:** Your agent knows who to call—and can get the work done.

**Position:** People already ask AI what to do. AE lets their agents work with
real businesses under the level of authority they choose.

**Voice:** direct, capable, and exact. State the target confidently. State
today's proof honestly. Do not turn safeguards into the headline, or aspiration
into a current availability claim.

Never claim AE validated a physical-world outcome without matching independent
evidence. Never call discovery inventory routeable supply.

Never use a receipt for one event to imply a later event.
