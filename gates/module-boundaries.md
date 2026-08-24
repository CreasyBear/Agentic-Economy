# Gates: Current module boundaries

Scope: Establish fresh, quoted source evidence for current module ownership, dependency direction, and legacy contamination.

- [x] G1: The report maps every current source module by responsibility and public surface.
  CHECK: rg -n '^## Module inventory|^## Public surfaces' research/architecture/current-module-boundaries.md
  EXPECT: /Module inventory.*Public surfaces/s
  EVIDENCE: Report lines 15-55 map all 22 modules, 357 TS/TSX files, current imports and actual entry surfaces; CHECK passed (`15:## Module inventory | 44:## Public surfaces`).

- [x] G2: The report identifies dependency cycles and deep-import boundary bypasses with file and line citations.
  CHECK: rg -n '^## Dependency direction|^### Cycles|^### Boundary bypasses' research/architecture/current-module-boundaries.md
  EXPECT: /Dependency direction.*Cycles.*Boundary bypasses/s
  EVIDENCE: Report lines 88-152 identify the 16-module SCC, cited two-way cycles, runtime and test-only bypasses; CHECK passed (`105:### Cycles | 136:### Boundary bypasses`).

- [x] G3: Each promoted finding quotes its motivating source and gives a confidence score.
  CHECK: rg -n '\(confidence: [7-9]|confidence: 10' research/architecture/current-module-boundaries.md
  EXPECT: confidence:
  EVIDENCE: Eight promoted findings at report lines 57-219 carry 9/10 or 10/10 confidence and exact quoted code/test evidence; CHECK passed.

- [x] G4: The report separates retained compatibility obligations from retired product concepts and does not recommend restoring retired spines.
  CHECK: rg -n '^## Compatibility versus retired concepts|Orders|Customer Requests|WorkTrees|Agent Engine' research/architecture/current-module-boundaries.md
  EXPECT: Compatibility versus retired concepts
  EVIDENCE: Report lines 154-178 separate retained business/services and old-URL compatibility from retired Orders, Customer Requests, WorkTrees, Agent Engine and harness/project ownership; CHECK passed.

- [x] G5: The report ties structural weaknesses to the current Operation-market golden journey.
  CHECK: rg -n '^## Golden journey impact' research/architecture/current-module-boundaries.md
  EXPECT: Golden journey impact
  EVIDENCE: Report lines 180-233 map search, compare/inspect, controlled call, result/receipt/recovery, supplier publication and settlement to behaviour-preserving boundary actions; CHECK passed (`180:## Golden journey impact`).
