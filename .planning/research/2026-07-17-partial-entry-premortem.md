# Partial-entry premortem

**Owner:** Product and Engineering  
**Status:** Active challenge  
**Decision reviewed:** [ADR-009: Allow partial entry without requiring Customer Request ownership](../adr/ADR-009-partial-entry-without-request-ownership.md)  
**Evidence cutoff:** 2026-07-17  
**Review by:** Before ADR-009 acceptance  

## Executive judgement

Partial entry is strategically attractive because it lets AE sell useful pieces
of coordination before the network can fulfil whole customer outcomes. It is
also the most plausible way to let external agents enter, leave and resume work
without forcing AE to pretend it originated the entire lifecycle.

The danger is that “support individual tasks” becomes either a generic execute
API or a second lifecycle beside Customer Request. The former expands authority
and security risk; the latter doubles engineering and creates contradictory
records.

The proposal should survive only in this narrower form:

> Existing business actions may become independently reachable when they can
> preserve the same authority, provenance, attempt, evidence and recovery rules
> outside a Customer Request. Partial entry does not imply a universal task
> schema, arbitrary execution or lifecycle duplication.

## What each perspective likes and rejects

| Perspective | What it likes | What it does not like | What it will insist on |
|---|---|---|---|
| CEO | AE can create value before end-to-end supply exists; individual actions create more entry points, distribution options and sellable bundles | A horizontal platform program with no customer, revenue or provider adoption; building procurement infrastructure because standards contain it | One commercially useful action beyond discovery, one customer cohort, and evidence that the second bundle is cheaper to assemble |
| Product | Customers and agents can start where they actually are: with a need, shortlist, quote, order or problem; bundles can match real work instead of imposing AE's lifecycle | A catalogue of technical tools that transfers coordination burden to the caller; partial entry with no coherent progress, next step or recovery experience | Each action must complete a recognizable human task and return a usable result, an honest unknown, or a clear next owner |
| Engineering | Existing kernel capabilities can be exposed compositionally; Customer Request becomes one coordinator rather than a mandatory wrapper | Two execution engines, synthetic Requests, a universal task object, special paths per bundle, and permanent compatibility code between all of them | One implementation of authority, attempts, evidence and recovery; adapters at the edges; no new common schema until contrasting tasks prove stable common semantics |
| Security | Smaller actions can carry narrower authority than a full route; explicit entry state makes imported claims visible | Generic `execute`, caller-selected providers without admission, replay of consequential effects, confused-deputy authority, and external claims treated as AE truth | Deny by default; exact action and target scope; principal and delegation proof; freshness; idempotency; reconcile-before-retry; immutable attribution; explicit human control for protected actions |
| Schema and data governance | Referenced task records can preserve provenance, revisions and evidence across handoffs | `EconomicOperation` becoming a god object full of nullable fields; one status enum for unrelated work; bundles persisting copies of task state; migrations before semantics stabilize | Separate business-specific inputs and outcomes; common fields only where invariants require them; references rather than copied state; append or supersede rather than silently mutate history |
| Agent experience | A calling agent can ask AE to do one thing, inspect the result, and resume without reconstructing a hidden Request; cold continuation becomes possible | Requiring internal AE concepts, opaque lifecycle status, prose-only errors, hidden human work, or a tool list with dozens of nearly identical actions | Task-oriented descriptions; explicit required information; stable references; structured outcome and unknown states; safe next actions; next owner; retry posture; compact continuation projection |

## If this fails, what happened?

### We built a platform capability without a product

Eighteen months later AE can represent qualification, quotation, commitment and
inspection, but businesses still answer by email and customers still coordinate
the work themselves. The architecture is flexible; the company has not removed
meaningful effort.

The early warning is that evals count supported action shapes rather than
customer minutes, repeated contacts, provider clarification or backstage AE
work. The prevention is commercial: no new task family is promoted unless a
named workflow demonstrates customer or provider value.

### Partial entry became a generic execution door

An agent supplies a provider, imported quote and instruction to proceed. AE
interprets possession of those inputs as authority, calls the provider twice
after a timeout, and cannot prove whether one or both attempts took effect.

The early warning is an API shaped like `execute(type, payload)` or a common
record whose action name determines its security semantics at runtime. The
prevention is action-specific admission and authority. Consequential actions
must reconcile uncertain prior attempts before retry.

### We created two lifecycles

Request-owned runs use RouteMandate and established recovery, while direct tasks
use a lighter path. Their evidence, cancellation and unknown states gradually
diverge. Bundles then need translation between the two.

The early warning is separate retry logic, status enums or receipt formats for
direct invocation. The prevention is parity evals: the same underlying action
must retain the same trust meaning regardless of whether a Request, bundle or
direct caller initiated it.

### The common schema became the product

Engineering introduces a universal task table with optional quote, order,
inspection, payment, provider and recovery fields. Every new action adds another
nullable column or generic payload. No team can state which combinations are
valid.

The early warning is schema design preceding two contrasting executable cases.
The prevention is to keep action-specific contracts and record only proven
cross-cutting invariants. Shared storage is an implementation option, not the
architecture decision.

### Agents can invoke tasks but cannot manage work

The tool call succeeds, but the agent cannot tell whether a provider accepted,
whether it should retry, what evidence is missing, or who must act next. The
agent returns to conversation history and begins guessing.

The early warning is a response containing only `success`, `status` and a
message. The prevention is a portable continuation projection containing the
reference, attributable result, unresolved state, evidence, allowed next
actions, retry posture and next owner.

### Bundles become disguised wedges

The event bundle gains bespoke states, then strata gains another coordinator.
The neutral kernel remains unchanged in name while wedge logic accumulates in
bundle runners.

The early warning is a bundle that owns authority, attempt state, evidence or
recovery rather than referencing the underlying actions. The prevention is a
composition test: each node must be independently invocable and inspectable,
and the bundle may own only dependencies, branches and completion conditions.

## The disagreements we should preserve

The CEO should reject “platform leverage” without commercial proof. Product
should reject technically callable actions that do not remove a recognizable
piece of human work. Security should be permitted to make consequential actions
less convenient than read operations. Engineering should reject a second path
even when it would make the first demo faster. Schema governance should reject
premature unification. Agent experience should reject internal elegance that
produces opaque tools or non-resumable results.

These are healthy tensions. The tie-breaker is not consistency across every
action. It is consistency of trust meaning combined with usefulness of the
individual task.

## Recommended operating rule

Start with three task families that apply different pressure:

1. qualify a caller-supplied shortlist;
2. request comparable quotes from admitted businesses;
3. inspect or reconcile a caller-supplied commitment.

Treat them as separate contracts during evals. Do not introduce a shared
persisted parent. Observe which fields and behaviours actually repeat.

Promote only the invariant residue: attribution, principal, authority,
freshness, attempt identity, evidence, honest unknown, retry posture and next
owner. Even these need not live in one database object.

## Decision gates

ADR-009 should be accepted only if the evals show all of the following:

- at least one independently callable task removes material human coordination;
- a cold agent can invoke and resume it without hidden Request history;
- direct and Request-owned entry retain identical trust semantics;
- uncertain external effects cannot be duplicated through retry;
- the implementation does not require a universal task schema;
- a second task reuses real machinery rather than merely sharing vocabulary;
- a bundle composes the tasks without owning another lifecycle;
- operator work does not erase the customer or provider gain.

If customer value passes but reuse fails, build a product-specific action and
keep the kernel unchanged. If reuse passes but customer value fails, stop the
platform work. If both pass, proceed to the second workflow transfer test.
