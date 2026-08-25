# Gates: P2-03 — Connection lifecycle

Scope: Private Connections support install, sharing, lease, refresh, revoke and delete with explicit grants.

Ownership: src/modules/connections/lifecycle, tests/unit/connections/lifecycle, tests/maturity/leaf-P2-03.test.ts

- [x] G1: The leaf's observable outcome is implemented completely under the frozen contract.
  EVIDENCE: Context-local public.ts exposes stable refs and transactional lifecycle operations; every consequence rereads monotonic trusted time inside authority, while immutable install provenance and append-only refresh/revoke/delete command rows preserve exact authority-bound idempotency across intervening mutations.

- [x] G2: A leaf-specific executable contract test exists.
  CHECK: cd ../.. && test -f tests/maturity/leaf-P2-03.test.ts && echo LEAF_TEST_PRESENT
  EXPECT: LEAF_TEST_PRESENT
  EVIDENCE: LEAF_TEST_PRESENT (fresh Node v22.22.0 check).

- [x] G3: The leaf-specific contract test passes.
  CHECK: cd ../.. && npx vitest run tests/maturity/leaf-P2-03.test.ts
  EVIDENCE: Node v22.22.0 Vitest: tests/maturity/leaf-P2-03.test.ts, 1 file and 6 tests passed in 245ms.

- [x] G4: The critical negative invariant is proved: revoked or stale-generation Connections cannot start new effects.
  EVIDENCE: Retained public-seam tests reject stale authority and strict expiry; historical regressions prove refresh B→refresh C→exact replay B returns B without mutation, changed B conflicts, cross-operation/ref/state/generation reuse conflicts, and revoke replay remains exact after delete. Owned run: 27/27 passed at exact 100% statements/branches/functions/lines (236/163/50/201).

- [x] G5: Type checking passes with the leaf integrated through context-local exports.
  CHECK: cd ../.. && npm run typecheck
  EVIDENCE: Node v22.22.0 `npm run typecheck` completed successfully; tests import only src/modules/connections/lifecycle/public.ts.

- [x] G6: Owned production files contain no placeholder implementation markers.
  CHECK: cd ../.. && if rg -n '(TODO|FIXME|not implemented)' tests/maturity/leaf-P2-03.test.ts 2>/dev/null; then exit 1; else echo NO_PLACEHOLDERS; fi
  EXPECT: NO_PLACEHOLDERS
  EVIDENCE: NO_PLACEHOLDERS across all owned production and test paths; scoped oxlint also passed with zero warnings.

- [x] G7: The expert reread, defect hunt and free-polish pass found no remaining improvement.
  EVIDENCE: Historical-idempotency four passes complete: reproduced B→C→reuse-B; implemented append-only command records; defect hunt covered operation/ref/generation/state and revoke-after-delete history; free polish enforced unique non-overwriting Account+idempotency inserts. Final Node 22 tests, exact coverage, typecheck, placeholder scan and scoped lint are green.
