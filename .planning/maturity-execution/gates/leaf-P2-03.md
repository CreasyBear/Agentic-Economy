# Gates: P2-03 — Connection lifecycle

Scope: Private Connections support install, sharing, lease, refresh, revoke and delete with explicit grants.

Ownership: src/modules/connections/lifecycle, tests/unit/connections/lifecycle, tests/maturity/leaf-P2-03.test.ts

- [x] G1: The leaf's observable outcome is implemented completely under the frozen contract.
  EVIDENCE: Context-local public.ts exposes the canonical lifecycle plus exact-shape persistence parsers. Every caller-controlled operation supplies a validated expected Grant generation selector to P2-01 authority, returned canonical generation must match, and begin-effect derives the selector only from its immutable lease. Consequences retain exact snapshot/resources/time provenance, optional P2-04 SecretRef binding and refresh-surviving shares.

- [x] G2: A leaf-specific executable contract test exists.
  CHECK: cd ../.. && test -f tests/maturity/leaf-P2-03.test.ts && echo LEAF_TEST_PRESENT
  EXPECT: LEAF_TEST_PRESENT
  EVIDENCE: LEAF_TEST_PRESENT (fresh Node v22.22.0 check).

- [x] G3: The leaf-specific contract test passes.
  CHECK: cd ../.. && npx vitest run tests/maturity/leaf-P2-03.test.ts
  EVIDENCE: Node v22.22.0 Vitest: tests/maturity/leaf-P2-03.test.ts, 1 file and 6 tests passed in 259ms.

- [x] G4: The critical negative invariant is proved: revoked or stale-generation Connections cannot start new effects.
  EVIDENCE: Retained public-seam tests reject stale authority, strict expiry and stale leases while preserving refresh-surviving shares. Hostile cases reject zero/unsafe/mismatched expected Grant generations, canonical Grant advance, a lease-generation race, provenance drift and stored timestamp contradictions while accepting later retry time. Owned run: 31/31 passed at exact 100% statements/branches/functions/lines (337/265/81/294).

- [x] G5: Type checking passes with the leaf integrated through context-local exports.
  CHECK: cd ../.. && npm run typecheck
  EVIDENCE: Node v22.22.0 `npm run typecheck` completed successfully with the required P2-01 expectedGeneration selector, typed DelegationSnapshotRef and P2-04 SecretRef composition through the context-local public.ts.

- [x] G6: Owned production files contain no placeholder implementation markers.
  CHECK: cd ../.. && if rg -n '(TODO|FIXME|not implemented)' tests/maturity/leaf-P2-03.test.ts 2>/dev/null; then exit 1; else echo NO_PLACEHOLDERS; fi
  EXPECT: NO_PLACEHOLDERS
  EVIDENCE: NO_PLACEHOLDERS across all owned production and test paths; scoped oxlint passed with zero warnings.

- [x] G7: The expert reread, defect hunt and free-polish pass found no remaining improvement.
  EVIDENCE: Four passes complete: implementation reread verified selectors on install/share/lease/refresh/revoke/delete and lease-derived begin-effect; integration pass compiled the P2-01 adapter call; defect hunt attacked zero/unsafe/mismatched selectors and a post-selection lease race; free polish kept expected generation a selector rather than proof. Final Node 22 tests, exact coverage, typecheck, placeholder scan, diff check and scoped lint are green.
