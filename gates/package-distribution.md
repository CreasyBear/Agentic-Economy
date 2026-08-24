# Gates: Package and distribution policy

Scope: Determine which current boundaries deserve packages, how the CLI should be built and released, and which abstractions must remain internal.

- [x] G1: The report inventories current package manifests, build inputs, output artifacts, and release command ordering.
  CHECK: rg -n '^## Current package inventory|^## Build and release flow' research/architecture/package-distribution.md
  EXPECT: /Current package inventory.*Build and release flow/s
  EVIDENCE: 13:## Current package inventory | 43:## Build and release flow

- [x] G2: The existing clean-checkout CLI import-test failure is reproduced or refuted with exact command output.
  CHECK: rg -n '^## Clean-checkout release defect|28/29|29/29' research/architecture/package-distribution.md
  EXPECT: Clean-checkout release defect
  EVIDENCE: 253:npm run test:imports                    # current defect: 28/29 | 258:npm run test:imports                    # 29/29

- [x] G3: The report states an explicit package extraction rule based on independent consumers and lifecycle.
  CHECK: rg -n '^## Package extraction rule' research/architecture/package-distribution.md
  EXPECT: Package extraction rule
  EVIDENCE: 146:## Package extraction rule

- [x] G4: The recommendation covers package exports, workspace/build ordering, publication, versioning, and consumer contract tests.
  CHECK: rg -n '^## Recommended distribution architecture|exports|workspace|publish|version|contract test' research/architecture/package-distribution.md
  EXPECT: Recommended distribution architecture
  EVIDENCE: 270:read-only review. No current checkout evidence proves that a CLI version has | 271:been published; the recommendation makes publication conditional on the

- [x] G5: The report rejects package-per-domain and names what should stay app-local.
  CHECK: rg -n '^## Keep internal' research/architecture/package-distribution.md
  EXPECT: Keep internal
  EVIDENCE: 224:## Keep internal

