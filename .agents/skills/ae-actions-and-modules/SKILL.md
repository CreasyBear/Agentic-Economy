---
name: ae-actions-and-modules
description: "Implement or review an AE operation through the registered-action seam. Use when adding an action, changing action schemas or surfaces, connecting UI/HTTP/agent hosts to an action, or reviewing action boundaries and module ownership."
---

# AE actions and modules

Use a **tracer**: follow one operation from its registered definition through the
real source owner and one intended surface before editing. The action registry is
the shared contract seam; it is not proof that every declared surface is
customer-reachable.

AE works on two axes. Horizontal capabilities recur across domains: discovery,
comparison, recommendation, communication, authority, execution, payment,
monitoring, reconciliation, cancellation, recovery, and proof. Vertical
outcomes compose them around a customer's goal.

The domain owns its language, providers, constraints, risks, evidence, and
action contracts. It never owns a parallel authority, attempt, or recovery
system.

## 1. Establish current truth

Read `AGENTS.md`, the current-state and target sections of `PRODUCT.md`, then:

1. Inspect `src/modules/common/action.ts` for the live `ActionDefinition` and
   `ActionSurface` types.
2. Inspect `src/modules/actions/index.ts` for the registered set.
3. Trace the selected action's `run` function into its `*ThroughSource`
   implementation and intended route or host.
4. Search focused tests for that action ID and source function.

Do this trace once. If a planned path has moved, use the live owner. Completion:
the action ID, source-owned transition, reachable surfaces, and evidence level
are named from current source.

## 2. Preserve module ownership

Domain code belongs under `src/modules/<domain>/`:

```text
<domain>.actions.ts      registered contracts
<domain>.functions.ts    server/source adapter
public.ts                supported module exports
internal/                module-private implementation
```

Outside code imports the module's supported seam, never `internal/*`.
`tests/imports/private-imports.test.ts` enforces the boundary. Do not create a
second lifecycle in a route, component, host adapter, or harness.

For Customer Request operations, preserve the canonical Customer Request
application and persistence seams. The older Answer Thread may consume
read-only actions, but it does not gain new customer intent, authority,
execution, or recovery meaning.

## 3. Define one exact contract

Use `defineAction` and supply every live `ActionDefinition` field:

- stable, globally unique `id` and plain-language `name`;
- honest `summary` and non-empty `boundaries`;
- strict input and output Zod schemas;
- parameter descriptors;
- `readOnly`;
- only the surfaces that have a real adapter;
- a `run` function delegating to the shared source implementation.

Current surface vocabulary comes only from `ActionSurface` in
`src/modules/common/action.ts`. Do not resurrect retired names from plans or old
skills. Registration is explicit in `src/modules/actions/index.ts`; module
evaluation is not registration.

For consequential work, `readOnly: false` is only the coarse migration
classification. ADR-009/010 require the action contract to earn exact
consequence, preparation, material-input, authority, retry/reconciliation,
evidence, and continuation semantics. Add those through the shared action seam,
not as host-owned rules.

Completion: every supported host invokes the same source-owned transition, and
unsupported surfaces are absent rather than aspirational.

Target scope and current reachability are separate. ADR-019 permits registered
booking, payment, dispatch, cancellation, and later high-autonomy operations as
implementation targets. It does not make them current surfaces. Trace the live
adapter before a reachability claim.

## 4. Keep the trust boundary exact

Identity attributes a caller; it does not authorize a verb. Possession of an
action or invocation reference is not authority.

For a consequential transition:

- bind authority to the exact principal, action/version, prepared-input digest,
  target, consequences, limits, and expiry;
- invalidate authority after a material change;
- preserve attributable attempts and stable idempotency meaning;
- represent uncertain external effects explicitly and reconcile before retry;
- keep cancellation honest after provider release;
- preserve existing Request-owned lineage while standalone lineage is added.

A provider-supported operation remains one registered action and Action
Invocation; do not fabricate a Customer Request or RoutePlan. Compose operations
only when the customer outcome has real dependencies.

Authority mode is `inspect_only`, `approve_each`, `bounded_mandate`, or
`full_yolo`. Every effect still consumes one exact authority use. `full_yolo`
is a broad explicit standing mandate with ceilings, expiry, revocation,
generation fencing, reservation/settlement, and step-up—not ambient authority.

An Action Invocation is a narrow continuity/control identity for one registered
action version. It does not replace the action-specific business result,
Action Attempt, evidence, or Customer Request. Persist shared control meaning
only after both Request-owned and standalone callers demonstrate the same
semantics.

## 5. Write capable, boundary-honest contract text

Start with the observable result, then state what remains unresolved and the
safe continuation. Use `PRODUCT.md` and `AGENTS.md` for claim limits.

Lead with the useful action and name who owns the next commitment. State a
limitation once where it changes the decision. Do not repeat “does not book,”
“cannot pay,” or similar slogans across every projection.

- A receipt proves receipt, not fulfilment.
- A published listing proves published supplied information, not availability.
- Use “verified” only against a named checked standard.
- Do not imply booking, charging, dispatch, or fulfilment unless production
  source and intended-surface evidence prove it.
- Keep public/human copy free of internal architecture vocabulary listed in
  `AGENTS.md`.

Completion: summaries and boundaries remain true for success, refusal,
interruption, timeout, and uncertain effect.

## 6. Close the implementation loop

Make the smallest coherent source change, then run focused checks selected from:

- the action/domain unit test;
- `npm run typecheck` for contract/type changes;
- `npm run test:imports` for module-boundary changes;
- `npm run test:copy` for assistant- or human-visible text;
- a focused integration or development smoke for the changed surface.

Use clearly labelled mock/sandbox data to expose the state being built. Tests
and evals steer the transition; unrelated broad-suite failures are recorded,
not adopted as a cleanup project.

Every loop ends with working source plus an executable demonstration, or the
earliest reproducible failed transition. Local and mock evidence proves only
development contract behavior.

For a vertical outcome, prove the end-to-end customer loop. For a horizontal
capability, prove that another conformant domain can use the same host and
control plane. Do not accept empty shared scaffolding as horizontal proof.

## Stop conditions

Return for an architecture decision if the next change would duplicate
authority/recovery, weaken historical Request lineage, put business rules in a
host, make an external effect generically retryable, or persist a shared object
before both caller origins share its meaning.
