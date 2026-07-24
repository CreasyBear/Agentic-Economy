---
name: ae-agentic-routing-and-discovery
description: "Implement or review AE discovery, candidate selection, Customer Request routing, partial-entry composition, or route/action projections. Use when changing registry, discovery files, capability supply, Request compilation, RoutePlans, harness/Answer Thread routing, or ADR-009/010 action-plane work."
---

# AE routing and discovery

AE currently has several reachable seams and one target architecture. Keep them
separate. Registry discovery and qualified inquiry are current public behavior;
the authenticated Customer Request API has a narrow evidenced journey; the
complete neutral route lifecycle and partial-entry Action Invocation plane
remain target contracts.

The target decomposes an objective into independently useful tasks and composes
the tasks required to finish the outcome. Discovery, comparison, execution, and
recovery are horizontal capabilities. Domain routes provide vertical meaning
without creating a new compiler or control plane.

## 1. Trace the customer job once

Read `AGENTS.md`, `PRODUCT.md`, and `UBIQUITOUS_LANGUAGE.md`. For the requested
change, trace one real journey from intended surface to authoritative source:

- public listings/search: `src/modules/registry/`;
- discovery documents: `src/modules/discovery/`;
- supplied/admitted routeable capability: business, capability-contract,
  capability-supply, offering, and binding source records;
- authenticated Request lifecycle:
  `src/routes/api.v1.requests*` →
  `src/lib/server/customer-request-*-api.ts` →
  `src/modules/customer-request/application/**`;
- older conversational search: `src/modules/answer/` and
  `src/modules/harness/`.

The older Answer Thread and harness are migration inventory, not the canonical
place for new Request meaning. The public V1 routing kernel endpoints and MCP
runtime are retired; `src/modules/routing-kernel/retirement.ts` returns callers
to `/api/v1/requests`.

Completion: the customer-recognizable job, live source owner, intended surface,
and current evidence level are explicit.

## 2. Preserve routing truth

Routeable supply requires the current admitted business, exact capability
contract, offering, binding, eligibility/publication state, credentials, and
readiness evidence. A listing, model suggestion, caller-supplied candidate, or
persisted RoutePlan cannot substitute for that chain.

Keep these facts separate:

- discovery inventory versus routeable supply;
- recommendation versus observation;
- eligibility versus provider acceptance;
- authority versus identity;
- dispatch attempt versus external outcome;
- unresolved or stale evidence versus failure;
- technical completion versus customer value.

The neutral compiler and shared action plane consume domain contracts and
adapters. A conformant business swap must not require changes to customer
projection, Request API, or host business rules.

## 3. Extend the canonical seam

Choose the existing owner:

- Customer outcome, task decomposition, facts, revisions, route proposals,
  decisions, and durable resume belong to Customer Request.
- One independently useful consequential operation is declared in the action
  registry and, when continuity requires it, controlled through Action
  Invocation.
- A Bundle or Customer Request may reference completed invocation/result
  identities and declare dependencies; it does not copy authority, attempts,
  evidence, or recovery state.
- A host renders and transports authoritative state. It does not recompute
  candidates, preparation, authority, resolution, or continuations.

For partial entry, preserve discriminated lineage:
`request_owned`, `standalone`, and later `bundle_owned`. Existing
Request-owned fields stay valid; standalone work must not fabricate a Request.

Completion: the change adds no parallel compiler, customer history,
recommendation model, authority path, attempt lifecycle, or recovery state
machine.

Do not force every useful task into a Request. Do not let a standalone task hide
its origin. Do not encode a seed vertical's nouns or sequence in the neutral
compiler.

## 4. Make failure and continuation observable

For routing or consequential-action changes, exercise a labelled development
scenario that includes the relevant non-happy state:

- no eligible or comparable candidates;
- material information missing;
- preparation awaiting bounded authority;
- stale option or invalidated approval;
- provider refusal or timeout;
- interruption before or after release;
- unknown effect and reconcile-before-retry;
- cancellation that cannot reverse released work;
- cold resume from authoritative records.

Each human, embedded-agent, and external-agent projection may differ in form but
must preserve the same facts, material consequences, authority, evidence, and
safe continuations. A transcript is not the work record.

Completion: a cold caller can distinguish what AE wants, what AE observed, how
fresh that observation is, who controls the next step, and what continuation is
safe.

## 5. Close the implementation loop

Make the bounded source change, run focused unit/integration tests for the
changed transition, and use the relevant development smoke when available:

- `npm run smoke:customer-request:development`
- `npm run smoke:customer-request:development:surface-parity`

Run `npm run test:imports` for ownership-boundary changes and
`npm run typecheck` for contract changes. Tests and evals steer implementation;
unrelated broad failures are recorded without becoming a repository cleanup
gate.

Every loop ends with working source plus an executable labelled demonstration,
or the earliest reproducible failed transition. Mock/sandbox evidence proves
development semantics only. It does not prove production fulfilment,
independent supply, reduced customer effort, or customer value.

Evaluate both axes when the change claims both. A vertical eval proves the
customer outcome and recovery path. A horizontal eval proves reuse by another
conformant domain without a new host workflow or control plane.

## Stop conditions

Return for an architecture decision if progress requires a second routing
runtime, host-owned business rules, synthetic Request history, inherited
authority, generic retry after uncertain effect, or a claim broader than the
intended-surface evidence.
