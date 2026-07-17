# AE Product Foundry and Primitive Refinery

This evaluation package converts real workflow evidence into two separate
management proofs:

1. a customer can complete valuable work with less burden and retained control;
2. later workflow products can be expressed with lower marginal orchestration
   cost without introducing a parallel lifecycle.

The package does not make field evidence. The starting portfolio in
`portfolio.ts` is explicitly simulated and must remain evidence-pending until
its observations and scorecards are replaced with measured cases.

## Public seam

`public.ts` evaluates three artifacts:

- a `WedgeExecutionPack`, including observations, primitive coverage, replay
  traces, customer/provider/operator scorecards, and agent conformance;
- a `PrimitivePromotionCandidate`, using the cross-wedge kernel-promotion gate;
- a `FoundryPortfolio`, producing the management posture.

Run the current portfolio with:

```bash
node --import tsx eval/product-foundry/run-portfolio.ts
```

The expected initial posture is `evidence_pending`. The simulated portfolio
declares the scenarios that must be replayed, but it proves neither replay nor
customer value, provider value, operational leverage, or production
reachability. Replay requires linked input, expected-output, actual-output,
runner-version, and assertion evidence.

## Evidence loop

For each real case, replace the simulated observation with an observed case and
retain its source outside public fixtures when it contains private information.
Preregister the improvement threshold only after measuring the incumbent
baseline. Then replay successful, failed, cancelled, and uncertain paths through
the same pack.

A workflow requirement begins in a wedge contract or adapter. It may become a
reusable module after two materially different workflow families exhibit the
same stable semantics. It may enter the kernel only after the complete
three-family, composition, invariant, negative-control, parity, replay,
compatibility, threat-review, and ADR gate passes.
