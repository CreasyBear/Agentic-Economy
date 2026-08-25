# Gates: P2-03 — Connection lifecycle

Scope: Private Connections support install, sharing, lease, refresh, revoke and delete with explicit grants.

Ownership: src/modules/connections/lifecycle, tests/unit/connections/lifecycle, tests/maturity/leaf-P2-03.test.ts

- [x] G1: The leaf's observable outcome is implemented completely under the frozen contract.
  EVIDENCE: Context-local public.ts exposes stable Connection/share/lease/effect refs and transactional install, explicit share, lease, refresh, revoke, delete and begin-effect admission; ownership and actor/Grant attribution come only from the trusted callback authority port.

- [x] G2: A leaf-specific executable contract test exists.
  CHECK: cd ../.. && test -f tests/maturity/leaf-P2-03.test.ts && echo LEAF_TEST_PRESENT
  EXPECT: LEAF_TEST_PRESENT
  EVIDENCE: LEAF_TEST_PRESENT (fresh Node v22.22.0 check).

- [x] G3: The leaf-specific contract test passes.
  CHECK: cd ../.. && npx vitest run tests/maturity/leaf-P2-03.test.ts
  EVIDENCE: Node v22.22.0 Vitest: tests/maturity/leaf-P2-03.test.ts, 1 file and 6 tests passed in 246ms.

- [x] G4: The critical negative invariant is proved: revoked or stale-generation Connections cannot start new effects.
  EVIDENCE: Retained public-seam tests reject old leases after refresh, revoke, delete and Grant-generation advance; they also reject strict-expiry races, wrong Account, forged share/lease proof, replay duplication and unknown external state. Owned run: 22/22 tests passed with exact 100% statements/branches/functions/lines (236/168/47/202).

- [x] G5: Type checking passes with the leaf integrated through context-local exports.
  CHECK: cd ../.. && npm run typecheck
  EVIDENCE: Node v22.22.0 `npm run typecheck` completed successfully; tests import only src/modules/connections/lifecycle/public.ts.

- [x] G6: Owned production files contain no placeholder implementation markers.
  CHECK: cd ../.. && if rg -n '(TODO|FIXME|not implemented)' tests/maturity/leaf-P2-03.test.ts 2>/dev/null; then exit 1; else echo NO_PLACEHOLDERS; fi
  EXPECT: NO_PLACEHOLDERS
  EVIDENCE: NO_PLACEHOLDERS across all owned production and test paths; scoped oxlint also passed with zero warnings.

- [x] G7: The expert reread, defect hunt and free-polish pass found no remaining improvement.
  EVIDENCE: Four passes complete: full implementation; expert reread kept shares live across refresh while leases stale; defect hunt bound every replay to actor+Grant generation; free polish removed an unauthorised read seam. Final Node 22 tests, exact coverage, typecheck, placeholder scan and scoped lint are green with zero remaining findings.
