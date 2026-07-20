# Phase 03C Plan 05 — paid Action Detail and labelled browser mechanics

## Browser mapping decision

Three source-compatible browser mappings were evaluated before the local proof
was finalized:

1. **Actual protected TanStack route in a local browser — rejected for this
   cut.** The live route obtains Clerk and Convex-backed runtime state. Keeping
   that boundary in-browser would require a production bypass, auth/runtime
   stubs, or files outside the allowlist. Any of those would make a local
   harness look like protected-route proof without proving real admission or
   durable hosted state.
2. **Dedicated paid-operation harness plus authenticated route fixtures —
   selected.** The browser uses the real paid-operation semantics, human and
   agent projections, client-safe card contract, card renderer and structured
   local host. The Plan04 route/server fixtures separately exercise the real
   route guard, non-enumeration, exact command body, stale relation and
   ambiguity behavior. The evidence label is
   `local browser mechanics + authenticated route fixtures`; it is not a
   protected-route browser E2E.
3. **Defer all browser work to Plan07 — rejected.** Hosted route readback still
   belongs to Plan07, but card mechanics, accessibility mechanics,
   version/digest parity and local recovery behavior are available honestly in
   this cut.

## Bounded handoff

```json
{
  "plan": "03C-05",
  "artifactState": "one child-authored local candidate; not integrated, deployed, hosted-read-back, or a Phase3C completion claim",
  "baseRevision": "71de61fa7fd04c3ed90472d8a2597a8341b9da5f",
  "baseTree": "6dc9a7308636b0ca937fd82851c6c2f81c1eca43",
  "baseParent": "190c929c48304ea408daf80193b83ce3f895c4e0",
  "branchSource": "codex/phase3c-execution",
  "integrationAuthority": "Parent alone audits and integrates.",
  "parentCustody": {
    "path": "/tmp/ae-phase3c-parent-custody-71de61fa.json",
    "rawSha256": "178859c3549724725de8ab091e4daf863d3db5b746fadff11660ef2456210d32",
    "canonicalSha256": "4545cdaccf6ca0acddf21ef3f482452d5d23a3260cdfc5bca830b6233c799297",
    "entries": 66,
    "candidateIntersection": 0
  },
  "authorityReadback": {
    "AGENTS.md": "aa7452da000316280704627326fbdbb089a56da7c13470a276416fbc5a06b067",
    "PRODUCT.md": "909b28837430522726bf827020c4abe7ed63c0b69bbfcd4cfdba12a363f51073",
    "DESIGN.md": "3adb8ff25f793a4bbd0aa1048ce4a17db14623b3d9422a92ec8814ca8c04dcfb",
    "disposition": "Read-only parent authority; none copied, edited, or staged."
  },
  "changedPaths": [
    ".planning/phases/03c-hosted-paid-operation-product-trial/03C-05-SUMMARY.md",
    "playwright.paid-operation-hosted.config.ts",
    "src/components/ae/action-invocation/AePaidOperationCard.tsx",
    "src/lib/server/hosted-paid-operation-human-api.ts",
    "src/modules/action-invocation/paid-operation-card-contract.ts",
    "src/routes/actions.paid.$invocationRef.tsx",
    "tests/e2e/paid-operation-development-surface.spec.ts",
    "tests/e2e/paid-operation-hosted-sandbox.spec.ts",
    "tests/imports/hosted-paid-operation-boundaries.test.ts",
    "tests/ui-contract/hosted-paid-operation-contract.test.tsx",
    "tests/unit/action-invocation/paid-operation-card.test.tsx",
    "tests/unit/action-invocation/paid-operation-development-surface.test.tsx",
    "tests/unit/server/hosted-paid-operation-api.test.ts",
    "tools/dev/paid-operation-browser/main.tsx",
    "tools/dev/paid-operation-browser/paid-operation-browser-fixture.ts",
    "tools/dev/paid-operation-surface-host.tsx"
  ],
  "forbiddenPathDisposition": "Zero changed paths outside the exact Plan05 allowlist. No setup route, root, route tree, Convex, schema, runtime/gateway, lifecycle/persistence, PRODUCT, DESIGN, AGENTS, package, workflow, CSS, credential, provider or Plan06/07 path changed.",
  "redBefore": [
    {
      "command": "npx --no-install vitest run tests/ui-contract/hosted-paid-operation-contract.test.tsx",
      "result": "Semantic RED: 3 failed and 1 passed. The detail route still rendered raw JSON, the locked truth/order and pre-authority boundary were absent, and an unsafe HTML block rendered. The non-BTC paid fixture already passed."
    },
    {
      "command": "npx --no-install playwright test --config=playwright.paid-operation.config.ts tests/e2e/paid-operation-development-surface.spec.ts",
      "result": "Browser RED after the first source transition: 3 failed and 4 passed. The old Prepared label, hidden data-sharing truth, and caller-required reconciliation evidence descriptor contradicted the new contract."
    },
    {
      "command": "npm run test:copy",
      "result": "Changed-source RED: the public Settlement label triggered the money-rail overclaim guard. It was translated to Payment outcome while preserving the separate source settlement truth."
    }
  ],
  "observableOutcome": "The protected paid Action Detail consumes only the source-issued human semantics and frozen card input. It renders one host h1, one card h2, the locked h3 reading order, separate payment/payment-outcome/result facts, closed operation/result blocks, exact runtime evidence and technical disclosure. It sends only the selected server descriptor, a fresh commandId, expected invocation version and the authority accept decision where applicable. Pending preserves the last durable card, disables and concurrency-fences controls, and never invents payment or result state. Stale responses follow only a validated returned inspect relation. Ambiguous transport exposes only read-only reload and never replays.",
  "legacyDriftRepair": "The local structured reconciliation contract now accepts reconcile intent only. Exact provider and payment observer evidence is resolved only inside the local host composition and never appears in the caller descriptor or template.",
  "cohesionAudit": {
    "cardBeforeLines": 789,
    "cardAfterLines": 567,
    "cardReasonToChange": "Rendering only: ordered sections, semantic facts, closed block rendering, icons and accessible controls.",
    "clientContractLines": 472,
    "clientContractReasonToChange": "Client-safe source/card DTO validation plus pure projection, presentation language and command-label derivation; no React, server, route, transport or lifecycle import.",
    "detailRouteLines": 427,
    "detailRouteReasonToChange": "TanStack loader/POST transport, exact descriptor dispatch, pending fence, safe inspect relation, focus and route-local read recovery; no business lifecycle or persistence.",
    "humanApiLines": 414,
    "humanApiReasonToChange": "Authentication/transport projection owner; the frozen card shape is imported and projected through the client-safe contract rather than duplicated.",
    "disposition": "Truth derivation, host transport/focus and rendering no longer coalesce. Further splitting would fragment one cohesive responsibility without an allowed clearer owner."
  },
  "goldenCounters": [
    {
      "state": "ready_for_permission",
      "version": 3,
      "invocationCreations": 1,
      "effectGenerations": 0,
      "releaseAttempts": 0,
      "commandAttempts": 0
    },
    {
      "state": "payment_prepared",
      "version": 4,
      "invocationCreations": 1,
      "effectGenerations": 0,
      "releaseAttempts": 0,
      "commandAttempts": 1
    },
    {
      "state": "result_received",
      "version": 5,
      "invocationCreations": 1,
      "effectGenerations": 1,
      "releaseAttempts": 1,
      "commandAttempts": 2
    },
    {
      "state": "reload_and_new_page_local_restore",
      "version": 5,
      "counterDelta": {
        "invocationCreations": 0,
        "effectGenerations": 0,
        "releaseAttempts": 0,
        "commandAttempts": 0
      }
    }
  ],
  "goldenTruth": "Ready for permission exposes authorize/refuse descriptors. Authorize produces Permission recorded. Nothing has been submitted yet and Payment prepared before execute becomes available. Execute occurs once, then payment request, payment outcome and validated result remain separate. Pending assertions prove the previous durable label remains visible until each source response.",
  "goblinMatrix": [
    {
      "branch": "unauthenticated, cross-owner, missing",
      "evidence": "Authenticated route fixtures",
      "rejoinOrStop": "Exact sign-in return or one non-enumerating Operation unavailable stop."
    },
    {
      "branch": "invalid selector and authority refusal",
      "evidence": "Local typed card state plus existing setup/creation route fixture",
      "rejoinOrStop": "Visible Not sent stop; refusal may inspect only."
    },
    {
      "branch": "duplicate, stale, disallowed",
      "evidence": "Plan04 application/route fixtures plus local typed card state",
      "rejoinOrStop": "Only the returned validated inspect relation or Review details; command count remains one."
    },
    {
      "branch": "admission",
      "evidence": "Plan04 creation/persistence fixtures",
      "rejoinOrStop": "Source refusal remains outside the card; no invented browser admission state."
    },
    {
      "branch": "update not confirmed",
      "evidence": "Route fixture and local browser card mechanics",
      "rejoinOrStop": "Reload operation only; zero command, effect or release replay."
    },
    {
      "branch": "possibly submitted and settlement unknown",
      "evidence": "Local typed semantics/projection/card",
      "rejoinOrStop": "Check existing payment only; retry and provider change absent."
    },
    {
      "branch": "invalid result",
      "evidence": "Local typed semantics/projection/card",
      "rejoinOrStop": "Check existing payment only; result is not treated as usable."
    },
    {
      "branch": "reconciliation in progress",
      "evidence": "Local typed semantics/projection/card",
      "rejoinOrStop": "Read-only Review details while the existing check completes."
    },
    {
      "branch": "reconciled not settled",
      "evidence": "Local typed semantics/projection/card",
      "rejoinOrStop": "Review details; a new result requires a new operation and permission."
    },
    {
      "branch": "settled but unusable result",
      "evidence": "Local typed semantics/projection/card",
      "rejoinOrStop": "Review details; no assumption that another result is free."
    },
    {
      "branch": "read unavailable",
      "evidence": "Route and local browser fixtures",
      "rejoinOrStop": "Visible read stop with reload only and no command descriptor."
    }
  ],
  "parity": "At every golden transition and every browser goblin accepted state, human semantic digest equals agent semantic digest and the structured digest; human, agent and fixture expected versions are identical. Reload and local new-page restore preserve the version, digest and all effect/release/invocation counters.",
  "verification": [
    {
      "command": "npm run test:ui-contract",
      "exit": 0,
      "result": "2 files, 5 tests passed."
    },
    {
      "command": "npm test -- tests/unit/action-invocation/paid-operation-card.test.tsx tests/unit/action-invocation/paid-operation-projection.test.ts tests/unit/action-invocation/paid-operation-development-surface.test.tsx tests/unit/server/hosted-paid-operation-api.test.ts tests/imports/hosted-paid-operation-boundaries.test.ts",
      "exit": 0,
      "result": "5 files, 35 tests passed."
    },
    {
      "command": "npm test -- tests/unit/server/hosted-paid-operation-creation-api.test.ts tests/unit/server/hosted-paid-operation-api.test.ts tests/imports/hosted-paid-operation-boundaries.test.ts",
      "exit": 0,
      "result": "3 files, 20 tests passed."
    },
    {
      "command": "npm test -- tests/unit/action-invocation/hosted-paid-operation-persistence.test.ts tests/unit/action-invocation/hosted-paid-operation-creation.test.ts",
      "exit": 0,
      "result": "2 files, 12 tests passed, including atomic admission and release behavior."
    },
    {
      "command": "npm test -- tests/unit/action-invocation/paid-operation-application-service.test.ts",
      "exit": 0,
      "result": "1 file, 3 tests passed."
    },
    {
      "command": "npx playwright test --config=playwright.paid-operation-hosted.config.ts tests/e2e/paid-operation-hosted-sandbox.spec.ts",
      "exit": 0,
      "result": "5 Chromium tests passed: golden/persistence counters, named goblins, ambiguity, keyboard/reflow/reduced-motion mechanics and evidence ceiling."
    },
    {
      "command": "npx playwright test --config=playwright.paid-operation.config.ts tests/e2e/paid-operation-development-surface.spec.ts",
      "exit": 0,
      "result": "7 Chromium tests passed."
    },
    {
      "command": "npx --no-install oxlint --deny-warnings <15 changed TypeScript/test/config paths>",
      "exit": 0,
      "result": "Zero warnings."
    },
    {
      "command": "npx --no-install react-doctor . --scope changed --base 71de61fa7fd04c3ed90472d8a2597a8341b9da5f --include-untracked --verbose --no-supply-chain --no-telemetry --blocking warning --max-duration 120",
      "exit": 0,
      "result": "No issues found; score/telemetry and supply-chain scan disabled."
    },
    {
      "command": "npm run test:copy",
      "exit": 1,
      "result": "89 of 91 tests passed. All changed-source copy findings are cleared. Two inherited tests fail because .planning/GTM-READINESS.md is absent at the exact clean base."
    },
    {
      "command": "npx --no-install tsc --noEmit --pretty false",
      "exit": 2,
      "result": "Inherited repository-wide capability-supply, Customer Request and unrelated test diagnostics remain. A changed-path filter returns zero diagnostics."
    },
    {
      "command": "git diff --check; route-tree SHA; exact allowlist and parent-custody intersection",
      "exit": 0,
      "result": "Diff check passes. src/routeTree.gen.ts remains SHA-256 95b15655c07de7d722959a60db846d1bcc2725d8f525047d2ae96cf644ab78a4. Exactly 16 allowed candidate paths change; raw/canonical/66-entry parent custody identities match and intersection is zero."
    }
  ],
  "adverseFindings": [
    "The installed Astryx Button emits its own polite live region even when idle. Two command buttons plus the host status would create three live regions, so this bounded card/route uses native semantic buttons with Astryx tokens, visible focus and 44px targets. Card, Badge and Text remain Astryx; no competing design system was introduced.",
    "The public Settlement label failed the repository money-rail copy gate. Payment outcome now communicates the same source-issued settlement truth without presenting a rail claim.",
    "The dedicated new golden/goblin spec passed its first execution after the preceding UI and existing-browser REDs drove the harness; it is confirmation evidence, not a separate protected-route RED.",
    "The temporary ignored node_modules symlink reused the authorized existing dependency tree and is moved to Trash before commit. No install or network dependency action occurred."
  ],
  "evidenceClass": "source inspection, UI fixtures, authenticated route/server fixtures, Plan04 application/persistence fixtures, and labelled local Chromium browser mechanics",
  "claimCeiling": "A local Plan05 candidate proving paid-operation-class presentation, exact browser command construction, route-fixture recovery, semantic digest/version parity and declared automated accessibility mechanics.",
  "explicitNonclaims": "No actual protected-route browser E2E, hosted reachability, exact served revision, independent provider operation, real credential/payment/submission/settlement/fulfilment, production safety, screen-reader pass, human comprehension, 400 percent human browser audit, customer demand/value, onboarding, or non-paid Action compatibility.",
  "remainingFailure": "Repository-wide typecheck remains red outside changed paths; two copy tests require the absent inherited .planning/GTM-READINESS.md. Plan07 still owns exact hosted protected-route readback. No changed-source P0/P1 remains.",
  "stopReason": "PLAN05_LOCAL_EVIDENCE_COMPLETE_AT_DECLARED_CLAIM_CEILING",
  "nextDecision": "Parent audits this single scoped candidate against the exact base/tree and custody manifest. If accepted, parent integrates it into codex/phase3c-execution. Do not deploy, start Plan06, or upgrade the evidence claim.",
  "candidateRevision": "Set by the one scoped child commit and returned to the parent outside this self-referential artifact.",
  "resumptionCommand": "git show --stat --oneline HEAD && npm run test:ui-contract && npm test -- tests/unit/action-invocation/paid-operation-card.test.tsx tests/unit/action-invocation/paid-operation-projection.test.ts tests/unit/action-invocation/paid-operation-development-surface.test.tsx tests/unit/server/hosted-paid-operation-api.test.ts tests/imports/hosted-paid-operation-boundaries.test.ts && npx playwright test --config=playwright.paid-operation-hosted.config.ts tests/e2e/paid-operation-hosted-sandbox.spec.ts"
}
```
