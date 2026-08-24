# Gates: Independent architecture challenge

Scope: Challenge the integrated architecture plan for missed logical gaps, overcomplexity, feasibility risk, sequencing errors, and product regression.

- [x] G1: The reviewer reads the complete current PLAN.md and states the load-bearing architecture claim it is challenging.
  CHECK: rg -n '^## Load-bearing claim' research/architecture/outside-voice.md
  EXPECT: Load-bearing claim
  EVIDENCE: 7:## Load-bearing claim

- [x] G2: The report tests whether a materially simpler architecture would solve the verified defects.
  CHECK: rg -n '^## Simpler alternative test' research/architecture/outside-voice.md
  EXPECT: Simpler alternative test
  EVIDENCE: 13:## Simpler alternative test

- [x] G3: The report identifies feasibility and sequencing failures with current file/line evidence and confidence scores.
  CHECK: rg -n '^## Findings|confidence:|:[0-9]+' research/architecture/outside-voice.md
  EXPECT: Findings
  EVIDENCE: 53:`[P2] (confidence: 7/10) PLAN.md:338` - migration gates mix architecture proof with market-proof instrumentation. | 61:`[P2] (confidence: 8/10) PLAN.md:450` - rollback is operationally thin outside

- [x] G4: The report checks the plan against PRODUCT.md and explicitly refuses retired product spines.
  CHECK: rg -n '^## Product-boundary check|Orders|Customer Requests|WorkTrees|Agent Engine' research/architecture/outside-voice.md
  EXPECT: Product-boundary check
  EVIDENCE: 78:Agent Engine: correctly rejected. The plan should not introduce an Operation Engine or Agent Engine abstraction to justify cleanup. | 89:| Replace the plan with package-per-domain, Orders, Customer

- [x] G5: Every recommendation is classified as adopt, reject, or investigate with a concrete rationale.
  CHECK: rg -n '^## Recommendation ledger|Adopt|Reject|Investigate' research/architecture/outside-voice.md
  EXPECT: Recommendation ledger
  EVIDENCE: 88:| Add live rollback/canary rules for non-read-model seam changes. | Adopt | Commit reverts are not enough operational rollback detail. | | 89:| Replace the plan with package-per-domain, Orders, Cus

