---
phase: 03c-hosted-paid-operation-product-trial
plan: 01
status: complete
date: 2026-07-20
---

# Phase 3C Plan 01 summary

## Decision and observable outcome

ADR-021 source-proves and freezes the hosted trial boundary. The current
application-service command publicly exposes reconciliation evidence, so hosted
transport must split the external intent-only command from the existing
internal trusted-evidence resolution command before routes exist.

The selected authentication bridge is authenticated public Convex functions
using `ctx.auth.getUserIdentity()`. Human and agent transports may establish and
forward authenticated identity, but caller owner/principal fields are forbidden
and identity or evaluator admission never grants consequence authority.

Nineteen exact RED contracts and a strict structured-output classifier were
written and executed. The classifier accepts all 19 exact absent-contract
failures, rejects unrelated failure classes, and no longer mistakes Vitest's
incidental `runWithTimeout` stack frame for a real timeout. The clean ownership
boundary also passes.

## Expanded handoff

```json
{
  "plan": "03C-01",
  "runtime": "Codex desktop isolated worktree; zsh; locally wired node_modules; Vitest 4.1.9; offline npx",
  "baseRevision": "2debf4b9f65ce228491f7d3d17ed1654a23bb496",
  "baseTree": "1b92b650e3e821b87619ba46a416b78c8e15ba76",
  "parentSha": "2debf4b9f65ce228491f7d3d17ed1654a23bb496",
  "custodyManifestHash": "720f83e5b683002ab97fb54664678829b1435aca03df21b003d303946f933430",
  "parentCustodyManifestHash": "8672eeb5f3f333840cfd33ec93f23411dcb1179b3ce80de320e8f6ba275d3202",
  "ownedPaths": [
    ".planning/adr/ADR-021-hosted-paid-operation-trial-boundaries.md",
    "tests/unit/action-invocation/hosted-paid-operation-contract-red.test.ts",
    "tests/unit/server/hosted-paid-operation-auth-contract-red.test.ts",
    "tests/imports/hosted-paid-operation-boundaries.test.ts",
    "tests/unit/action-invocation/hosted-paid-operation-red-harness.test.ts",
    "tools/dev/verify-phase-3c-red-contract.ts",
    ".planning/phases/03c-hosted-paid-operation-product-trial/03C-RED-REPORT.json",
    ".planning/phases/03c-hosted-paid-operation-product-trial/03C-01-SUMMARY.md"
  ],
  "changedPaths": [
    ".planning/adr/ADR-021-hosted-paid-operation-trial-boundaries.md",
    ".planning/phases/03c-hosted-paid-operation-product-trial/03C-01-SUMMARY.md",
    ".planning/phases/03c-hosted-paid-operation-product-trial/03C-RED-REPORT.json",
    "tests/imports/hosted-paid-operation-boundaries.test.ts",
    "tests/unit/action-invocation/hosted-paid-operation-contract-red.test.ts",
    "tests/unit/action-invocation/hosted-paid-operation-red-harness.test.ts",
    "tests/unit/server/hosted-paid-operation-auth-contract-red.test.ts",
    "tools/dev/verify-phase-3c-red-contract.ts"
  ],
  "forbiddenPathsChecked": "No production, Convex, route, component, provider fixture, package, workflow, generated, inherited, Customer Request, or other plan path changed.",
  "commands": [
    "npm run test -- tests/unit/action-invocation/hosted-paid-operation-red-harness.test.ts",
    "npx --offline tsx tools/dev/verify-phase-3c-red-contract.ts --report .planning/phases/03c-hosted-paid-operation-product-trial/03C-RED-REPORT.json",
    "AE_SCAN_MODE=clean npx --offline vitest run tests/imports/hosted-paid-operation-boundaries.test.ts"
  ],
  "exitCodes": [0, 0, 0],
  "results": [
    "RED classifier self-test passed: 1 file, 10 tests.",
    "Verifier passed: outer exit 0; inner structured Vitest exit 1; all 19 allowlisted tests failed for their exact declared absent-contract reason.",
    "Clean ownership boundary passed: 1 file, 4 tests."
  ],
  "observableOutcome": "ADR boundary, 19 executable classified RED specifications, strict failure classifier, and clean import boundary are complete.",
  "redDisposition": "EXPECTED_RED",
  "counters": {
    "expectedRedContracts": 19,
    "classifiedExpectedReds": 19,
    "classifierTestsPassed": 10,
    "importBoundaryTestsPassed": 4,
    "externalEffects": 0
  },
  "structuredEventRefs": [],
  "evidenceClass": "source inspection plus classified executable failing fixtures",
  "claimCeiling": "Contract-gap evidence only; no production implementation, hosted reachability, provider/payment/settlement, production safety, demand, comprehension, or customer-value claim.",
  "remainingFailure": "The 19 named Phase 3C production contracts are intentionally absent and classified RED; Plan 02 owns the next implementation wave.",
  "stopReason": null,
  "nextDecision": "Parent integrator may accept Plan 01 and separately dispatch Plan 02.",
  "commitCandidate": "Plan 01 chain through 7cc2c0db plus the final resume commit recorded in this handoff.",
  "resumptionCommand": null
}
```

## Evidence and ceiling

Source inspection proves the current public/internal reconciliation-type
collision and the availability of a trustworthy `ctx.auth` identity bridge.
The focused executable fixtures prove that all 19 declared contracts are absent
for their named reasons, the classifier rejects non-contract failure classes,
and the current clean import ownership boundary passes.

This does not prove any Phase 3C production behavior, hosted reachability,
provider operation, payment, settlement, production safety, comprehension,
demand, or customer value.

## Commit references

- `16fde295` — ADR-021 boundary decision.
- `001cd197` — RED tests, classifier, import gate, and infrastructure-failure
  report.
- `9bae1cd7` — initial runtime checkpoint handoff.
- `7cc2c0db` — manual checkpoint-report provenance.
- The final resume commit updates the classifier regression guard, executable
  report, and this completed handoff.
