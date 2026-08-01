---
name: ae-actions-and-modules
description: "Implement or review an AE operation through the registered-action seam: schemas, surfaces, hosts, boundaries, and module ownership."
---

# AE actions and modules

> **North star:** Tell your AI what you need. It finds the right business, compares real options, gets your approval, and moves the work through to completion. Businesses publish what they do once, then earn whenever agents bring them work.

**Hierarchy:** ambition → customer promise → executable journey → hidden controls → proof.

## Trace the seam

Read `.planning/PROJECT.md`, `UBIQUITOUS_LANGUAGE.md`, relevant ADRs, and live
source. If an optional `AGENTS.md` exists, consult it. Follow one operation
from its `defineAction` and registry entry through the source owner to the
intended surface and focused tests. Registration is not reachability.

Domain code lives under `src/modules/<domain>/`; public exports are the
supported seam and `internal/` is private. Hosts and routes stay thin and do
not create a parallel lifecycle. Customer outcome, intent, authority,
execution, and recovery belong to Customer Request; one independently useful
operation belongs to the action registry and may use Action Invocation.

## Define one exact contract

Use `defineAction` with:

- stable `id`, plain-language `name`, honest `summary`, non-empty `boundaries`;
- strict input/output schemas and parameter descriptors;
- `readOnly`, only surfaces backed by real adapters, and a `run` delegating to
  the source implementation.

Descriptors name actual inputs, outputs, effects, authority, uncertainty,
evidence, replay behavior, and recovery. Target capability and current
reachability are separate: future booking, payment, dispatch, cancellation,
or higher-autonomy operations are valid implementation work, but become
reachable claims only when their intended adapter and evidence exist.

## Protect consequential effects

Identity attributes a caller; it does not authorize a verb. Before a protected
effect, bind authority to the exact principal, action/version, prepared-input
digest, target, consequence, data/spend limits, expiry, attempt, and
idempotency identity. Invalidate it after material change. Preserve attributable
lineage and explicit refusal.

Keep replay behavior explicit. Represent an uncertain external effect as
outcome unknown and reconcile before retry. Keep cancellation honest after
release. Action Invocation is continuity/control identity, not authority or a
business result. Every effect consumes one exact authority use; standing modes
still require ceilings, expiry, revocation, generation fencing, reservation/
settlement, and step-up.

## Boundary-honest language and proof

Lead with the observable customer result and name who owns the next
commitment. Put unresolved state or a limitation at the decision that needs it,
not in repeated public qualification. A receipt proves receipt, not fulfilment;
a published listing proves published facts, not availability; `verified` needs a
named standard. Keep technical vocabulary and private fields out of human
copy while machine descriptors remain exact.

Implement the smallest coherent source change. Run the focused action/route
check and direct readback; add type, import, UI, SEO, or development journey
checks only for boundaries crossed. Use labelled mocks/sandbox data. Tests
assert semantics and effects, including refusal, interruption, uncertainty,
recovery, and module ownership; unrelated broad failures are not a gate.
