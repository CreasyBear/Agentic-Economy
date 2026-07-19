# Agentic Economy operating instructions

Read this before acting. `PRODUCT.md` owns the product promise and maturity
boundary. `DESIGN.md` owns human-interface decisions. Live source and executable
behavior decide what is implemented now.

## Work forward

Start from the decision or customer outcome being supported. Establish the
relevant source owner and blast radius with one focused initial trace, implement
a coherent vertical change, then re-trace every changed boundary during
verification. Re-open the trace when the revision or source owner changes.

Every work loop ends in one of three things:

1. working source plus an executable demonstration;
2. a source-linked decision that narrows or changes the implementation; or
3. the earliest reproducible blocker and the smallest decision needed.

Planning, issue commentary, test inventories, and repeated source audits are not
progress by themselves. Open research and broad red suites may limit claims;
they do not automatically veto authorized development work.

Use focused tests and evals to steer the transition being changed. Fix failures
caused by the change. Record unrelated failures without turning the task into
repository-wide cleanup.

When work has independent vertical slices, isolate them with explicit revision,
ownership, observable outcome, evidence ceiling, and stop conditions. Use child
tasks when isolation reduces risk, context pressure, or elapsed time. Require a
scoped commit only in an isolated worktree; otherwise require a
revision-addressed handoff and exact changed paths. One integrator owns
conflicts and completion claims.

## Truth and evidence

Keep these evidence classes distinct:

- source inspection;
- unit or integration fixtures;
- labelled local, mock, or sandbox execution;
- hosted readback from an exact revision;
- independently operated provider evidence;
- real customer and operating evidence.

One class never silently upgrades another. A fixture can prove contract
behavior. It cannot prove deployment, useful supply, provider fulfilment,
customer value, accessibility in use, or production safety.

`PRODUCT.md` separates the current evidenced state from the target contract.
Implement toward the target without describing it as currently available.
When source, runtime, tests, plans, ADRs, or docs disagree, report the
contradiction and follow the authority appropriate to the decision:

- live source and intended-surface execution for current implementation;
- `PRODUCT.md` for product meaning and claim limits;
- `DESIGN.md` for human-interface direction;
- accepted ADRs for durable architectural decisions;
- proposed ADRs and plans as constraints under evaluation, not permanent cages.

Change or supersede an ADR when evidence invalidates it. Do not distort source
to preserve a stale plan.

## Product boundary

AE is building the trust, discovery, decision, and bounded-action layer for
agentic commerce. Customer Request remains the canonical broader-outcome
aggregate. Independently useful actions may enter without a synthetic Request
when their lineage and trust meaning remain exact.

Public claims must remain narrower than internal capability:

- published business information is supplied discovery inventory;
- routeable supply requires current admitted business, contract, offering,
  binding, eligibility/publication, credentials, and readiness evidence;
- a qualified inquiry is a human first-contact communication, not booking,
  payment, dispatch, availability, acceptance, or fulfilment;
- a receipt proves the recorded event it names, not a later external outcome;
- use `verified` only with a named current standard and matching evidence.

Assistants and authenticated agents may use only the operations and
continuations exposed by the live intended surface. Discover surface inventory
from current routes, `ActionSurface`, action registration, descriptors, and
tests—never from a hard-coded list in this file.

## Architecture invariants

Prefer deep modules with one source owner and thin adapters.

- New operations use the registered-action seam when that seam truthfully owns
  their shared contract. Registration alone does not create a route.
- Hosts own transport, authentication, conversation, navigation, and
  rendering. Business rules stay in domain/application modules.
- Conversation about a broader customer outcome compiles into and resumes
  Customer Request. A supported standalone task may remain standalone. No host
  may create a competing intent compiler, recommendation history, authority,
  attempt, evidence, or recovery lifecycle.
- Domain variation belongs in registered contracts and adapters. A conformant
  provider swap must not require a new neutral compiler or host workflow.
- Identity attributes a caller. Exact bounded authority permits a consequence.
  Possession of a Request, action, invocation, receipt, signature, or prior
  approval is not ambient authority.
- Consequential work admits one current effect generation. Use explicit
  concurrency ownership and stale-write fencing so a late worker, cancellation,
  or observation cannot overwrite newer state.
- Durable work reconstructs authority, attempts, uncertainty, cancellation, and
  safe continuations from source-owned records. Transcript, component, and
  process memory are never required for recovery.
- Preserve exact historical Request lineage. Never make existing Request
  lineage broadly optional as a migration shortcut.
- For ADR-009/010 implementation, evaluate discriminated standalone lineage,
  separated control state, reference-only composition, and persistence earned
  by both caller origins. Keep these choices narrow and reversible until their
  acceptance evals pass.
- Every consequential attempt is attributable and has stable idempotency
  meaning. After possible release, uncertainty remains visible; reconciliation
  precedes retry; cancellation never claims reversal without provider evidence.
- Business records remain authoritative for business facts. Any shared control
  projection owns continuity only and must be removable without erasing the
  action-specific result.

No god files. Split by responsibility when a file begins to combine contracts,
state transitions, persistence, transport adapters, projections, and host
behavior. Do not split cohesive behavior into ceremonial wrappers; the test is
whether each module has one reason to change and a clear deletion boundary.

## Implementation quality

- Preserve unrelated dirty work. Never use destructive Git cleanup, bulk
  restore, hard reset, or permanent deletion.
- Prefer the smallest coherent vertical slice over horizontal scaffolding.
- Use typed contracts and discriminated outcomes at module boundaries.
- Model ordinary refusal, conflict, stale input, and unknown effect explicitly;
  reserve thrown exceptions for unexpected faults.
- Keep routes and Convex hosts thin enough to reveal the source-owned operation.
- Avoid premature abstraction. Earn shared interfaces through at least two
  semantically matching uses or a required boundary.
- Use clearly labelled mock/sandbox data while building and show the important
  non-happy state, not only the success path.
- A work result must include changed paths, commands and results, observable
  behavior, remaining failure, evidence class, and claim ceiling.

## Human interface and copy

Read `DESIGN.md` completely before visual work. Follow the current system named
there; today that is Astryx with the neutral theme and the existing
semantic-token bridge. Reuse or compose its primitives first. Do not introduce
a competing component system, route-local palette, retired Daylight assets, or
bespoke presentation layer. If the current system cannot meet a product or
accessibility requirement, make the smallest local exception, demonstrate the
gap and resulting behavior, and update `DESIGN.md` when the exception changes
the durable interface direction.

Avoid generic AI styling. Preserve complete interaction states, keyboard
access, persistent labels, visible focus, non-colour cues, responsive behavior,
and practical touch targets.

Public human copy uses ordinary customer language. Keep internal implementation
terms such as `source-owned`, `readback`, `manifest`, `capability`, `gateway`,
`operator`, `MCP`, `OpenAPI`, `callable`, `agent-native`, `DTO`, and `fixture`
inside technical or protected diagnostic surfaces.

`KNOWN`, `UNKNOWN`, `UNAVAILABLE`, and `NEXT_STEP` are machine/diagnostic
vocabulary, not public human labels.

## Research and records

Research supports a concrete decision; it is not an implementation holding
pattern. Before creating research, positioning, competitor, GTM, ecosystem, or
business-model records, read `.planning/records/README.md` and use the existing
records system. Label observation, inference, unknown, hypothesis, owner, and
review date. Update the source register and research queue when their governed
state changes.

Create or supersede an ADR when changing a public contract, authority boundary,
canonical data model, interoperability posture, or neutrality constraint.
Preserve prior decisions as provenance.

## Convex

Before editing Convex code, read
`convex/_generated/ai/guidelines.md` completely. It is the API authority for the
installed Convex version.

Keep schema fragments with their owning modules and compose them in
`convex/schema.ts`. Bound growing reads and scheduled work. Treat self-scheduling
loops, zero-delay retries, and `.collect()` as cost and termination risks that
require explicit limits and stop conditions. Isolate Node-dependent actions in
dedicated `"use node";` files.

During a suspected cost incident, begin with static/local inspection. Do not
probe, seed, deploy, or repeatedly run control-plane commands without explicit
authorization.
