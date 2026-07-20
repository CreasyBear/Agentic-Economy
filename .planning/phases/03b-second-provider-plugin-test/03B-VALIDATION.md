# Phase 3B — Validation strategy

## Decision being tested

Does Provider B plug into the Phase 3A paid-operation seam, or did Phase 3A
encode Provider A assumptions above operation ownership?

## Fast loop

Wave 1 begins with provider-conformance tests. Provider A must remain green.
Provider B may be red only for named missing provider-owned artifacts.

Wave 2 runs provider materialization and normalization tests only. Wave 3 runs
the same application-service and projection scenarios for both providers.
Broad Action Invocation and browser suites run once after integration.

## Falsifiers

Phase 3B fails or pauses if:

- a shared host must branch on provider ID;
- `agentic-paid-operation:v1` needs a Provider B field or new lifecycle state;
- Provider A uncertainty creates any Provider B authorization or send;
- a restored snapshot can substitute Provider B for Provider A;
- Provider B raw payload escapes its operation projector;
- switching provider reuses invocation, authority or payment identity;
- a child crosses the frozen-file or change-budget boundary without parent
  authorization.

## Mandatory adversarial cases

- duplicate authority click from one prepared version;
- concurrent A/B preparation with crossed continuations;
- stale expected version after another provider advances;
- operation substitution and payee-only payment-row tampering on restore;
- forced cross-provider payment-identifier collision;
- Provider A reconciliation evidence replayed against Provider B;
- Provider A exact `not_settled`, then explicit Provider B selection;
- Provider A settled with invalid result, then explicit Provider B selection;
- Provider A and B raw schemas crossed into the other projector.

For every refused cross-provider case, assert both provider snapshot digests and
`authorizations`, `signatures` and `sends` counters are unchanged.

## Evidence ladder

1. source inspection;
2. focused table-driven fixtures;
3. labelled local two-provider execution;
4. clean exact-revision conformance packet;
5. independent P0/P1 review.

Nothing in this phase establishes hosted behavior, real payment, independent
settlement, provider fulfilment, production safety or customer value.
