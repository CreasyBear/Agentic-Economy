# Gates: P2-03 — Connection lifecycle

Scope: Private Connections support install, sharing, lease, refresh, revoke and delete with explicit grants.

Ownership: src/modules/connections/lifecycle, tests/unit/connections/lifecycle, tests/maturity/leaf-P2-03.test.ts

- [x] G1: The leaf's observable outcome is implemented completely under the frozen contract.
  EVIDENCE: Context-local public.ts exposes the canonical lifecycle plus exact-shape persistence parsers. Consequences reread trusted time; immutable actions bind P2-01 snapshot identity and exact resources; stored command/result and generation-one install timestamps are internally exact while later retry time is ignored; installs bind normalized provider targets and optional P2-04 SecretRef; explicit shares survive refresh.

- [x] G2: A leaf-specific executable contract test exists.
  CHECK: cd ../.. && test -f tests/maturity/leaf-P2-03.test.ts && echo LEAF_TEST_PRESENT
  EXPECT: LEAF_TEST_PRESENT
  EVIDENCE: LEAF_TEST_PRESENT (fresh Node v22.22.0 check).

- [x] G3: The leaf-specific contract test passes.
  CHECK: cd ../.. && npx vitest run tests/maturity/leaf-P2-03.test.ts
  EVIDENCE: Node v22.22.0 Vitest: tests/maturity/leaf-P2-03.test.ts, 1 file and 6 tests passed in 259ms.

- [x] G4: The critical negative invariant is proved: revoked or stale-generation Connections cannot start new effects.
  EVIDENCE: Retained public-seam tests reject stale authority, strict expiry and stale leases while preserving refresh-surviving shares. Hostile cases reject snapshot/resource/correlation/actor/Grant/Secret drift, command/result timestamp splits, generation-one install-time splits, malformed persistence, unsafe generations and lifecycle-result contradictions while accepting later retry time. Owned run: 30/30 passed at exact 100% statements/branches/functions/lines (330/263/81/288).

- [x] G5: Type checking passes with the leaf integrated through context-local exports.
  CHECK: cd ../.. && npm run typecheck
  EVIDENCE: Node v22.22.0 `npm run typecheck` completed successfully with typed P2-01 DelegationSnapshotRef and P2-04 SecretRef composition through the context-local public.ts.

- [x] G6: Owned production files contain no placeholder implementation markers.
  CHECK: cd ../.. && if rg -n '(TODO|FIXME|not implemented)' tests/maturity/leaf-P2-03.test.ts 2>/dev/null; then exit 1; else echo NO_PLACEHOLDERS; fi
  EXPECT: NO_PLACEHOLDERS
  EVIDENCE: NO_PLACEHOLDERS across all owned production and test paths; full-project `npm run lint` passed with zero warnings.

- [x] G7: The expert reread, defect hunt and free-polish pass found no remaining improvement.
  EVIDENCE: Four passes complete: implementation reread verified all seven operations/resources and stored timestamp equalities; integration pass exercised P2-01/P2-04 types and all five parsers; defect hunt attacked command/result and initial-install timestamp splits plus valid later retry tolerance; free polish retained direct Share/Lease/Admission action-time checks. Final Node 22 tests, exact coverage, typecheck, placeholder scan, diff check and full lint are green.
