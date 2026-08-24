# Gates: Rationalised module and package architecture

Scope: Produce an implementation-ready engineering plan for rationalising the current Operation-market codebase before launch, without implementing the refactor or restoring retired product spines.

- [x] G1: The plan explains the current architecture from fresh source evidence and identifies the ownership failures that matter to the golden journey.
  CHECK: rg -n '^## Current source diagnosis|^### Verified findings|^## Golden journey ownership' PLAN.md
  EXPECT: /Current source diagnosis.*Verified findings.*Golden journey ownership/s
  EVIDENCE: 49:### Verified findings | 121:## Golden journey ownership

- [x] G2: The target architecture assigns one accountable owner to each durable responsibility and defines an acyclic dependency direction.
  CHECK: rg -n '^## Target module architecture|^### Ownership contract|^### Allowed dependency direction' PLAN.md
  EXPECT: /Target module architecture.*Ownership contract.*Allowed dependency direction/s
  EVIDENCE: 149:### Ownership contract | 169:### Allowed dependency direction

- [x] G3: The package policy distinguishes internal modules from independently built and released artifacts, including the existing CLI release path.
  CHECK: sh -c "rg -q '^## Package policy' PLAN.md && rg -q '^### Package extraction rule' PLAN.md && rg -q '^### CLI distribution' PLAN.md && echo 'package policy complete'"
  EXPECT: package policy complete
  EVIDENCE: package policy complete

- [x] G4: The implementation sequence is incremental, testable, reversible, and does not mix structural and behavioural changes.
  CHECK: rg -n '^## Migration sequence|^### Rollback and compatibility|^## Implementation Tasks' PLAN.md
  EXPECT: /Migration sequence.*Rollback and compatibility.*Implementation Tasks/s
  EVIDENCE: 448:### Rollback and compatibility | 490:## Implementation Tasks

- [x] G5: Architecture, code quality, tests, and performance have each been reviewed with failure modes and a test coverage diagram.
  CHECK: sh -c "rg -q '^## Architecture review' PLAN.md && rg -q '^## Code quality review' PLAN.md && rg -q '^## Test review' PLAN.md && rg -q '^## Performance review' PLAN.md && rg -q '^### Test coverage diagram' PLAN.md && rg -q '^## Failure modes' PLAN.md && sed -n '/^### Test coverage diagram/,/^COVERAGE:/p' PLAN.md | rg -F -o '[GAP]' | wc -l | tr -d ' ' | rg -q '^9$' && echo 'four reviews plus 9 test gaps'"
  EXPECT: four reviews plus 9 test gaps
  EVIDENCE: four reviews plus 9 test gaps

- [x] G6: The plan records what already exists, what is explicitly out of scope, and the parallel implementation lanes.
  CHECK: sh -c "rg -q '^## What already exists' PLAN.md && rg -q '^## NOT in scope' PLAN.md && rg -q '^## Worktree parallelization strategy' PLAN.md && echo 'existing scope and lanes complete'"
  EXPECT: existing scope and lanes complete
  EVIDENCE: existing scope and lanes complete

- [x] G7: Every leaf review and the integration review are fully evidenced.
  CHECK: node /Users/joelchan/.agents/skills/unlazy/scripts/gate-check.mjs --status gates/module-boundaries.md gates/package-distribution.md gates/test-performance.md gates/outside-voice.md gates/review-integration.md
  EXPECT: ALL MET
  EVIDENCE: gates/review-integration.md: 5 gates | ALL MET (25 met)

- [x] G8: The gstack review report is the final plan section and closes with no unresolved decisions.
  CHECK: sh -c "test \"$(rg '^## ' PLAN.md | tail -1)\" = '## GSTACK REVIEW REPORT' && test \"$(awk 'NF{line=$0} END{print line}' PLAN.md)\" = 'NO UNRESOLVED DECISIONS' && echo 'terminal review report valid'"
  EXPECT: terminal review report valid
  EVIDENCE: terminal review report valid
