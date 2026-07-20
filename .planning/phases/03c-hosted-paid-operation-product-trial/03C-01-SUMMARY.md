---
phase: 03c-hosted-paid-operation-product-trial
plan: 01
status: checkpoint_reached
date: 2026-07-20
---

# Phase 3C Plan 01 checkpoint

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
written. Execution stopped before classification because the required local
Vitest runtime is unavailable.

## Expanded handoff

```json
{
  "plan": "03C-01",
  "runtime": "Codex desktop isolated worktree; zsh; Node package script attempted; vitest executable unavailable",
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
    "npm run test -- tests/unit/action-invocation/hosted-paid-operation-red-harness.test.ts"
  ],
  "exitCodes": [127],
  "results": [
    "Infrastructure failure: sh: vitest: command not found. Command sequence stopped; classifier and clean import gate were not run."
  ],
  "observableOutcome": "ADR boundary and 19 allowlisted RED specifications exist; executable classification is blocked by missing runtime.",
  "redDisposition": "REJECTED_INFRASTRUCTURE_NOT_EXPECTED_RED",
  "counters": {
    "expectedRedContracts": 19,
    "classifiedExpectedReds": 0,
    "externalEffects": 0
  },
  "structuredEventRefs": [],
  "evidenceClass": "source inspection plus reproducible missing-runtime evidence",
  "claimCeiling": "Source-proven contract decision and infrastructure blocker only; no executable contract-gap, implementation, hosted, provider, payment, settlement, safety, demand, or value claim.",
  "remainingFailure": "Vitest is not installed or otherwise callable in this worktree runtime, so the classifier contract, 19 intended REDs, and clean import gate remain unexecuted.",
  "stopReason": "03C-AGENT-RUNBOOK missing-runtime stop condition and 03C-VALIDATION first-failure rule.",
  "nextDecision": "Restore the repository's declared local dependency runtime without changing Plan 01 scope, then resume at the exact first failed command.",
  "commitCandidate": "16fde295 (ADR-021), 001cd197 (RED harness and blocked report); this summary is the final handoff commit",
  "resumptionCommand": "npm run test -- tests/unit/action-invocation/hosted-paid-operation-red-harness.test.ts"
}
```

## Evidence and ceiling

Source inspection proves the current public/internal reconciliation-type
collision and the availability of a trustworthy `ctx.auth` identity bridge.
The failed command proves only that the local test executable is missing.

This checkpoint does not prove that the classifier works, that any intended RED
is correctly classified, that the import boundary passes, or that any Phase 3C
production behavior exists.

## Commit references

- `16fde295` — ADR-021 boundary decision.
- `001cd197` — RED tests, classifier, import gate, and infrastructure-failure
  report.
- The commit containing this file is the final Plan 01 checkpoint handoff.
