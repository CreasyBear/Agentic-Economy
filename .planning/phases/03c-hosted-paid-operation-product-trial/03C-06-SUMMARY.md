# Phase 03C Plan06 Task1 — frozen comprehension instrument and scorer

## Decision

The ten-question instrument is frozen before answers at:

`sha256:526b009ddbf476758a06abf5768fe8459a1a5c29411c98ebfd5d131084452719`

The empty result is valid `not_run` / `unproven`. No human or automated-model
participant has answered a question, and no PASS is claimed.

## Source contradiction resolved

The accepted UI spec listed twelve comprehension prompts while the Plan06
execution contract and delegated Task1 require exactly ten. Three
source-compatible resolutions were evaluated:

1. retain twelve questions — rejected because it violates the exact Plan06
   instrument count;
2. delete two UI-spec concepts — rejected because it weakens the accepted
   comprehension boundary;
3. consolidate adjacent concepts into ten ordinary-language questions —
   selected because it preserves every required meaning while following the
   later, narrower Plan06 execution contract.

The selected consolidation joins provider location with the new-invocation
boundary, keeps payment/payment-outcome/result truth in one question, and
tests visible stop through safe-continuation questions. Mandatory
all-participant gates are exactly Q3, Q5, Q7, Q8, Q9 and Q10.

## Bounded handoff

```json
{
  "plan": "03C-06 Task1",
  "runtime": {
    "environment": "Codex desktop local worktree",
    "node": "/Users/joelchan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node v24.14.0",
    "npm": "11.7.0",
    "dependencies": "Existing ignored shared node_modules only; no install or network",
    "externalCalls": 0,
    "credentialAccesses": 0,
    "participantRuns": 0
  },
  "baseRevision": "7a7ecbfdfcb04920e38ba79a168f8eac720224e8",
  "baseTree": "d2c838e3243535a65da53e7542906b0ea8dc58a0",
  "parentSha": "7a7ecbfdfcb04920e38ba79a168f8eac720224e8",
  "branchSource": "codex/phase3c-execution",
  "checkout": "detached child worktree; parent alone integrates",
  "custodyManifestHash": {
    "path": "/tmp/ae-phase3c-parent-custody-7a7ecbfd.json",
    "rawSha256": "76226f3b5ad3dc39a9ff95b02e5e938f4562e3dd5cde5087cf2aa4e4f8718593",
    "canonicalSha256": "a9d84408c1b44adda3216ac3d8790705f764ff0c328cd03c8f284c02a0cad483",
    "entries": 66,
    "changedPathIntersection": 0,
    "parentVerification": "official custody_manifest.py --verify passed in the parent checkout"
  },
  "authorityReadback": {
    "AGENTS.md": "aa7452da000316280704627326fbdbb089a56da7c13470a276416fbc5a06b067",
    "PRODUCT.md": "909b28837430522726bf827020c4abe7ed63c0b69bbfcd4cfdba12a363f51073",
    "DESIGN.md": "3adb8ff25f793a4bbd0aa1048ce4a17db14623b3d9422a92ec8814ca8c04dcfb",
    "disposition": "Read-only parent authority; none copied, edited or staged"
  },
  "ownedPaths": [
    ".planning/phases/03c-hosted-paid-operation-product-trial/03C-COMPREHENSION-EVAL.md",
    "docs/hosted-paid-operation-trial.md",
    "tools/dev/score-paid-operation-comprehension.ts",
    ".planning/phases/03c-hosted-paid-operation-product-trial/03C-COMPREHENSION-RESULTS.json",
    ".planning/phases/03c-hosted-paid-operation-product-trial/03C-06-SUMMARY.md"
  ],
  "changedPaths": [
    ".planning/phases/03c-hosted-paid-operation-product-trial/03C-COMPREHENSION-EVAL.md",
    ".planning/phases/03c-hosted-paid-operation-product-trial/03C-COMPREHENSION-RESULTS.json",
    ".planning/phases/03c-hosted-paid-operation-product-trial/03C-06-SUMMARY.md",
    "docs/hosted-paid-operation-trial.md",
    "tools/dev/score-paid-operation-comprehension.ts"
  ],
  "forbiddenPathsChecked": {
    "result": "zero changed paths outside the exact five-file allowlist",
    "untouched": "source, UI, tests, package, workflows, Convex, routes, fixtures, Plan07, PRODUCT, DESIGN, AGENTS and all 66 parent-custody paths"
  },
  "instrument": {
    "schema": "ae-paid-operation-comprehension-instrument:v1",
    "digest": "sha256:526b009ddbf476758a06abf5768fe8459a1a5c29411c98ebfd5d131084452719",
    "canonicalization": "UTF-8 canonical JSON; recursively lexicographic object keys; preserved array order; JSON scalar encoding; no whitespace; remove only top-level displayedDigest and answerStorage; SHA-256 lowercase hexadecimal",
    "questionCount": 10,
    "mandatoryQuestionIds": [
      "Q3",
      "Q5",
      "Q7",
      "Q8",
      "Q9",
      "Q10"
    ],
    "minimumAccuracy": 0.9,
    "minimumEligibleHumanSessionsForPass": 3,
    "automatedFreshAgentSessionsForAdjunctPass": 3,
    "goldenIncompleteIsNonPass": true,
    "uncertaintyRetryOrProviderSwitchIsHardFail": true
  },
  "redDisposition": {
    "fixtureClass": "synthetic in-memory local scorer falsifiers; no committed participant data",
    "initialOrderingFinding": "After counterbalance enforcement was added, the two-human falsifier refused for counterbalance_invalid before the more decisive minimum-session reason.",
    "targetedCorrection": "Moved the human/automated minimum-session gate ahead of counterbalance validation. No instrument, digest, threshold, answer key or evidence claim changed. The full matrix then passed.",
    "refusedAsExpected": [
      "drifted instrument with stale display -> instrument_digest_mismatch",
      "drifted instrument with recomputed display -> instrument_drift",
      "fewer than three humans -> insufficient_human_sessions_for_pass",
      "missing sessions -> missing_sessions",
      "mandatory miss -> mandatory_question_failed",
      "below 90 percent -> accuracy_below_threshold",
      "uncertainty retry -> uncertainty_hard_fail",
      "uncertainty provider switch -> uncertainty_hard_fail",
      "incomplete golden journey -> incomplete_golden_journey",
      "answer-key or coaching exposure -> answer_key_or_coaching_exposure",
      "ineligible cohort member -> ineligible_cohort",
      "automated response mislabeled human -> cohort_class_mismatch",
      "duplicate participant ID -> participant_id_duplicate",
      "malformed participant ID -> participant_id_malformed",
      "fabricated PASS or result mismatch -> scorer_result_disagreement"
    ],
    "acceptedControl": "valid empty not-run envelope"
  },
  "commands": [
    {
      "command": "tsx tools/dev/score-paid-operation-comprehension.ts --instrument .../03C-COMPREHENSION-EVAL.md --results .../03C-COMPREHENSION-RESULTS.json",
      "exitCode": 0,
      "result": "Frozen digest accepted; human NOT_RUN/unproven; automated NOT_RUN/unproven; overall not_run"
    },
    {
      "command": "same scorer command with --self-test",
      "exitCode": 0,
      "result": "15 semantic falsifiers refused for their predeclared reason; valid empty control accepted"
    },
    {
      "command": "npm run test:ui-contract",
      "exitCode": 0,
      "result": "2 files and 5 tests passed"
    },
    {
      "command": "npx --no-install oxlint --deny-warnings tools/dev/score-paid-operation-comprehension.ts",
      "exitCode": 0,
      "result": "zero warnings"
    },
    {
      "command": "npx --no-install tsc --ignoreConfig --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --types node --skipLibCheck tools/dev/score-paid-operation-comprehension.ts",
      "exitCode": 0,
      "result": "focused scorer typecheck passed"
    },
    {
      "command": "npx --no-install tsc --noEmit --pretty false",
      "exitCode": 2,
      "result": "inherited repository-wide capability-supply and Customer Request diagnostics remain; changed-path filter returned zero scorer diagnostics"
    },
    {
      "command": "git diff --check; exact allowlist/custody intersection; parent custody verify",
      "exitCode": 0,
      "result": "diff check clean; five allowed paths only; raw/canonical/66-entry parent custody verified; intersection zero"
    }
  ],
  "results": {
    "schema": "ae-paid-operation-comprehension-results:v1",
    "human": "not_run/unproven, zero sessions",
    "automatedModel": "not_run/unproven, zero sessions",
    "overall": "not_run",
    "p3cR8HumanComprehensionSatisfied": false
  },
  "observableOutcome": "A source-linked participant-safe golden/goblin tape, ten-question frozen instrument, independent deterministic scorer, no-PII runbook, class-separated empty envelope and exactly-three-agent A/B/C counterbalance packet now exist.",
  "counters": {
    "readyForPermission": "version 3; invocation 1; effect 0; release 0; command 0",
    "paymentPrepared": "version 4; invocation 1; effect 0; release 0; command 1",
    "resultReceived": "version 5; invocation 1; effect 1; release 1; command 2",
    "restoreDelta": "invocation 0; effect 0; release 0; command 0"
  },
  "structuredEventRefs": [
    "instrument:sha256:526b009ddbf476758a06abf5768fe8459a1a5c29411c98ebfd5d131084452719",
    "results:ae-paid-operation-comprehension-results:v1:not_run",
    "plan05:tests/e2e/paid-operation-hosted-sandbox.spec.ts",
    "plan05:tests/unit/server/hosted-paid-operation-api.test.ts"
  ],
  "evidenceClass": "predeclared instrument and scorer source, source inspection, Plan05 UI/browser fixtures, authenticated route fixtures and labelled local browser mechanics",
  "claimCeiling": "Predeclared instrument, scorer, source inspection, and source-linked local fixture evidence only. Human comprehension, automated-model comprehension, hosted reachability, accessibility in use, provider fulfilment, payment, settlement, production safety, customer value, and non-paid compatibility remain unproven.",
  "explicitNonclaims": "No declared human comprehension, automated-model comprehension, protected hosted browser session, served revision, accessibility-in-use, independent provider, credential, payment, settlement, fulfilment, production safety, customer value, demand or non-paid Action compatibility evidence.",
  "remainingFailure": "Real-human comprehension is not run and P3C-R8 remains unsatisfied. Automated-model adjunct is also not run. Plan07 alone owns served-revision deployment/readback. Repository-wide inherited typecheck remains red outside the scorer.",
  "founderOverride": "Real-human comprehension may remain unproven without blocking the already-authorized Plan07 source/deploy work, but that does not satisfy P3C-R8’s human-comprehension evidence or upgrade the claim.",
  "stopReason": "TASK1_FROZEN_BEFORE_ANSWERS",
  "nextDecision": "Parent audits and integrates this exact five-file candidate, dispatches exactly three independent read-only fresh-agent evaluators with participant IDs agent-00000001/A, agent-00000002/B and agent-00000003/C, then resumes this same child with raw anonymous response JSON. Do not start a new scorer owner.",
  "commitCandidate": "Returned by the child handoff outside this self-referential summary after the scoped commit.",
  "resultTree": "Returned by the child handoff outside this self-referential summary after the scoped commit.",
  "resumptionCommand": "npx --no-install tsx tools/dev/score-paid-operation-comprehension.ts --instrument .planning/phases/03c-hosted-paid-operation-product-trial/03C-COMPREHENSION-EVAL.md --results .planning/phases/03c-hosted-paid-operation-product-trial/03C-COMPREHENSION-RESULTS.json"
}
```

## Evaluator handoff boundary

The parent may give evaluators only the participant-safe evidence notice,
stimulus frames, ten prompts with option IDs/labels, their assigned A/B/C order
and the response JSON skeleton from
`docs/hosted-paid-operation-trial.md`. The parent must not provide this summary,
the instrument’s answer-key fields, scorer, repository, files, tools, source
trace, prior answers or rubric.

Task1 stops here. No participant answer is authored, inferred or scored in this
candidate.
