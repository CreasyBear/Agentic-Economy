# Agentic Economy operating instructions

Read this before acting. `PRODUCT.md` owns the product destination and maturity
boundary. `DESIGN.md` owns human-interface direction. Live source and executable
behavior decide what exists now.

## Product direction

AE is an execution product for agentic commerce. It helps agents discover real
businesses and decide between viable options.

It carries authorized work through booking, payment, dispatch, fulfilment,
recovery, and other registered actions.

Qualified inquiry is one action, not the product category or the ceiling.

Build toward the target contract even when current surfaces expose less. Never
turn a present implementation gap into a permanent product prohibition.

Customer Request is the canonical aggregate for a broader outcome. A useful
standalone action remains standalone.

Do not require a synthetic Request or RoutePlan to satisfy architectural
ceremony. Both paths use the same action, authority, attempt, evidence, and
recovery system.

AE works horizontally and vertically. Horizontal capabilities recur across
domains.

They include discovery, evidence gathering, comparison, recommendation,
communication, negotiation, authority, execution, payment, monitoring,
reconciliation, cancellation, recovery, and proof.

Vertical outcomes compose those capabilities around a customer's real goal.
Each domain owns its providers, language, constraints, risks, evidence standards,
and action contracts. It never owns a parallel control plane.

Decompose an objective into independently useful tasks. Preserve the difference
between read-only, advisory, communicative, and consequential work. Compose only
the tasks needed to finish the outcome.

AE supports four operating modes:

| Mode | Agent may do |
| --- | --- |
| `inspect_only` | Discover, compare, and prepare without causing an external effect. |
| `approve_each` | Prepare work and obtain approval for each consequential action. |
| `bounded_mandate` | Act without repeated approval inside an explicit standing mandate. |
| `full_yolo` | Pursue the stated objective autonomously inside a broad, explicit, revocable mandate. |

`full_yolo` is not ambient or unlimited authority. It is the widest deliberate
mandate the principal grants.

Its objective, actions, recipients, purposes, data, spend, currency, count, time,
parallelism, fallback, and risk ceilings remain attributable and inspectable.

Widening those limits requires a new mandate or step-up.

## Work forward

Start from the customer outcome or decision being supported. Trace the live
source owner and blast radius once, implement the smallest coherent vertical
slice, and demonstrate it with labelled real, sandbox, mock, or fixture data.

Retrace every changed boundary.

Each vertical slice must exercise a real customer loop and identify the
horizontal capability it proves. Reuse an existing capability when its contract
fits. Add domain policy to the registered contract or adapter, not the kernel.

Do not build horizontal scaffolding without a real operation and acceptance
eval. Do not duplicate shared control machinery to make one vertical move
faster. A vertical is complete only when its customer outcome is observable.

Every loop ends in one of three outcomes:

1. working source plus an executable demonstration;
2. a source-linked decision that changes or narrows implementation; or
3. the earliest reproducible blocker and the smallest decision needed.

Plans, issue commentary, inventories, and repeated audits are inputs, not
progress.

Follow a plan only while it serves the live product direction and current
source. Supersede stale plans and ADRs instead of bending the product around
them.

Use focused tests and evals to steer the changed transition. Do not gate useful
implementation on unrelated broad suites or endless test loops. Fix regressions
caused by the change and record unrelated failures without absorbing them.

Evaluate both axes. A vertical eval proves the end-to-end outcome, including its
failure and recovery path. A horizontal eval proves the same capability can
serve another conformant domain without a new host workflow or control plane.

When independent vertical slices can proceed safely, isolate each by revision,
ownership, observable outcome, evidence ceiling, and stop condition. One
integrator owns conflicts and completion claims.

## Truth and claims

Keep these evidence classes distinct:

- source inspection;
- unit or integration fixtures;
- labelled local, mock, or sandbox execution;
- hosted readback from an exact revision;
- independently operated provider evidence;
- real customer and operating evidence.

One class never silently upgrades another. Fixtures can prove contracts, not
deployment, supply quality, provider fulfilment, customer value, accessibility
in use, or production safety.

When sources disagree, use live source and intended-surface execution for
current implementation, `PRODUCT.md` for product meaning, `DESIGN.md` for
interface direction, and accepted ADRs for durable architecture.

Proposed ADRs, plans, issues, mocks, and tests are evidence under evaluation,
not cages.

Public claims remain narrower than internal capability. Published business
information is discovery inventory.

Routeable supply requires current admission, binding, eligibility, credentials,
and readiness evidence.

A receipt proves the event it names, not later fulfilment. Use `verified` only
with a named current standard and matching evidence.

## Execution invariants

Prefer deep source-owned modules and thin transport, conversation, and rendering
adapters.

- New operations use the registered-action seam when it truthfully owns their
  contract. Registration alone does not create a reachable route.
- Identity attributes a caller. A current mandate authorizes consequences.
  Possession of a Request, invocation, receipt, signature, or prior approval is
  not authority.
- Every consequential attempt records the mandate and limit reservation it
  consumed, its stable idempotency meaning, provider target, and effect
  generation.
- Reserve and settle spend, count, and concurrency limits atomically where
  oversubscription would violate the mandate.
- One effect generation is current. Fence stale workers and observations so
  cancellation, retry, or late completion cannot overwrite newer truth.
- After a possible external release, uncertainty remains visible.
  Reconciliation precedes retry. Cancellation never claims reversal without
  provider evidence.
- Durable records must reconstruct authority, attempts, uncertainty,
  cancellation, and safe continuations without transcript, component, or
  process memory.
- Business records own business facts. Shared control projections own
  continuity only and must be removable without erasing action-specific results.
- Domain variation belongs in registered contracts and adapters. A conformant
  provider swap must not require a new host workflow or neutral compiler.
- Preserve exact historical Request lineage. Standalone lineage is
  discriminated, not achieved by making all existing Request references vague.

For ADR-009/010 work, evaluate standalone lineage, separated control state,
reference-only composition, and persistence through both caller origins.

Keep implementation choices reversible until their acceptance evals pass. Do
not keep the product direction reversible.

No god files. Split contracts, transitions, persistence, transport, projections,
and host behavior when they acquire different reasons to change. Do not create
ceremonial wrappers around cohesive behavior.

## Implementation quality

Preserve unrelated dirty work. Never permanently delete files or use destructive
Git cleanup, bulk restore, or hard reset.

Use typed contracts and discriminated ordinary outcomes. Reserve thrown
exceptions for unexpected faults. Bound growing reads, scheduling, retries, and
fan-out.

Use clearly labelled mock or sandbox data while building. Demonstrate success,
refusal, exhausted authority, duplicate delivery, provider uncertainty, and
cancellation when relevant.

A work result states changed paths, commands and results, observable behavior,
remaining failure, evidence class, and claim ceiling.

## Human interface

Read `DESIGN.md` completely before visual work. Use Astryx with the neutral
theme and the semantic-token bridge. Do not introduce a competing system,
route-local palette, retired Daylight assets, or generic AI styling.

The interface makes autonomy legible without turning it into approval theatre.
Show the current mode, mandate boundary, material work, consumed limits,
uncertainty, and a durable way to pause or revoke future work.

In `bounded_mandate` and `full_yolo`, do not ask again for authorized actions.
Step up only to widen the mandate or resolve a decision left to the principal.

Preserve keyboard access, persistent labels, visible focus, non-colour cues,
responsive behavior, practical touch targets, and complete interaction states.

Public copy uses customer language. Protocol and implementation vocabulary
belongs in builder or diagnostic surfaces.

## Records and Convex

Research supports a concrete decision and uses `.planning/records/README.md`.
Create or supersede an ADR when changing a public contract, authority boundary,
canonical data model, interoperability posture, or neutrality constraint.

Preserve prior decisions as provenance.

Before editing Convex, read `convex/_generated/ai/guidelines.md` completely.
Keep schema fragments with their owners, bound growing work, and isolate
Node-dependent actions in dedicated `"use node";` files.

During a suspected cost incident, begin with static/local inspection. Do not
probe, seed, deploy, or repeatedly call the control plane without explicit
authorization.
