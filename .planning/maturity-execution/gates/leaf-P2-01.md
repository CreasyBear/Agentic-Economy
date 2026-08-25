# Gates: P2-01 — Membership and delegation

Scope: Memberships and arbitrary multi-hop grants narrow monotonically, reject cycles and bind generations.

Ownership: src/modules/authority/delegation, tests/unit/authority/delegation, tests/maturity/leaf-P2-01.test.ts

- [x] G1: The leaf's observable outcome is implemented completely under the frozen contract.
  EVIDENCE: Context-local transactional service issues root authority only through a trusted Membership/Account port, delegates multi-hop grants within exported persistence limits (64 scopes, 64 resources, 32 ancestry grants) with strict monotonic narrowing, validates every persisted grant, parent-child edge and replayed admission snapshot before use, atomically admits consequences, advances revocation generations and returns reconstructed deep-frozen attributed snapshots; 40 owned assertions pass with exact 100% statements/branches/functions/lines coverage (286/286, 312/312, 52/52, 258/258).

- [x] G2: A leaf-specific executable contract test exists.
  CHECK: cd ../.. && test -f tests/maturity/leaf-P2-01.test.ts && echo LEAF_TEST_PRESENT
  EXPECT: LEAF_TEST_PRESENT
  EVIDENCE: LEAF_TEST_PRESENT

- [x] G3: The leaf-specific contract test passes.
  CHECK: cd ../.. && npx vitest run tests/maturity/leaf-P2-01.test.ts
  EVIDENCE: 1 test passed; Start at 02:04:50 | Duration 233ms (transform 81ms, setup 152ms, import 30ms, tests 3ms, environment 0ms).

- [x] G4: The critical negative invariant is proved: child authority can never exceed its ancestor intersection.
  EVIDENCE: Retained hostile tests reject wider child scope/resources/budget/expiry, forged persisted child actors, replay ancestry whose child expands parent scopes/resources, forged snapshots with stranger subjects/empty ancestry/reversed time/false correlation, undefined/null/symbolic/malformed creation and revocation provenance, corrupted authority intersections, cycles, stale/revoked ancestry, expiry-at-boundary, active strangers, caller-shaped proof fields and shared-ancestor budget races. Exact 64-item and 32-grant boundaries are admitted; new requests, persisted grants, pinned snapshots and persisted 33-link traversal fail closed just above their exported bounds with stable DelegationError. Generated valid chains at depths 1-8 and the depth-32 boundary remain inside every ancestor intersection.

- [x] G5: Type checking passes with the leaf integrated through context-local exports.
  CHECK: cd ../.. && npm run typecheck
  EVIDENCE: > agentic-economy@0.1.0 typecheck | > tsc --noEmit

- [x] G6: Owned production files contain no placeholder implementation markers.
  CHECK: cd ../.. && if rg -n '(TODO|FIXME|not implemented)' tests/maturity/leaf-P2-01.test.ts 2>/dev/null; then exit 1; else echo NO_PLACEHOLDERS; fi
  EXPECT: NO_PLACEHOLDERS
  EVIDENCE: NO_PLACEHOLDERS

- [x] G7: The expert reread, defect hunt and free-polish pass found no remaining improvement.
  EVIDENCE: Four final repair passes complete. Complete pass added exported production-safe bounds and narrowly scoped grant/snapshot integrity reconstructors; domain-expert reread applied the limits before every persisted traversal/use and retained live-service-only authority admission; hostile pass added exact 64/65, 32/33, malformed row and symbolic provenance attacks; free polish deep-copies/freezes canonical facts and preserves valid pinned replay after later generation advance/revocation. Final owned oxlint, 40 tests and exact 100% coverage are green.
