# Gates: Test and performance architecture

Scope: Define the verification and performance controls needed to migrate module boundaries without breaking the golden journey.

- [x] G1: The report detects the actual test frameworks and relevant repository commands from checked-in configuration.
  CHECK: rg -n '^## Test framework and commands' research/architecture/test-performance.md
  EXPECT: Test framework and commands
  EVIDENCE: research/architecture/test-performance.md:9-40 identifies Vitest, convex-test, Playwright, checked-in commands, and the 53/53 focused verification run.

- [x] G2: The report maps the search, inspect, call, receipt, and repeat flow through current source with test coverage evidence.
  CHECK: rg -n '^## Golden journey coverage|search|inspect|call|receipt|repeat' research/architecture/test-performance.md
  EXPECT: Golden journey coverage
  EVIDENCE: research/architecture/test-performance.md:42-85 traces search, compare/detail, inspect-plan, call, status/result/receipt, recovery, replay, and the uncovered repeat-demand loop.

- [x] G3: The report identifies realistic migration regressions and assigns unit, integration, or end-to-end verification to each.
  CHECK: rg -n '^## Migration regression matrix|unit|integration|end-to-end' research/architecture/test-performance.md
  EXPECT: Migration regression matrix
  EVIDENCE: research/architecture/test-performance.md:87-103 assigns unit, integration, integration-performance, end-to-end, and release verification to concrete migration regressions.

- [x] G4: The report evaluates query fan-out, materialized projections, caching, memory, and hot-path risks.
  CHECK: rg -n '^## Performance review|query|projection|cache|memory' research/architecture/test-performance.md
  EXPECT: Performance review
  EVIDENCE: research/architecture/test-performance.md:105-141 analyzes query fan-out, projections, cache freshness, memory/storage growth, baselines, shadow reads, and rollback.

- [x] G5: Every critical silent failure is either covered or explicitly identified as a blocker.
  CHECK: rg -n '^## Critical silent failures' research/architecture/test-performance.md
  EXPECT: Critical silent failures
  EVIDENCE: research/architecture/test-performance.md:143-155 classifies every identified silent failure as covered, a migration blocker, a release blocker, or a product-evidence blocker.
