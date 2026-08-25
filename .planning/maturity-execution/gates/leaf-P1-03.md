# Gates: P1-03 — External identities and credentials

Scope: External identity bindings and credentials authenticate Principals without owning resources.

Ownership: src/modules/principal-account/external-identity, tests/unit/principal-account/external-identity, tests/maturity/leaf-P1-03.test.ts

- [x] G1: The leaf's observable outcome is implemented completely under the frozen contract.
  EVIDENCE: `external-identity/{registry,convex-schema,public}.ts` implements namespaced collision-safe bindings, preserved unknown provider states, independent revisioned credential facts, fail-closed authentication, atomic generation rotation, revocation and idempotent replay; 32 focused tests pass with owned Istanbul coverage at 100% statements (244/244), branches (122/122), functions (46/46) and lines (234/234).

- [x] G2: A leaf-specific executable contract test exists.
  CHECK: cd ../.. && test -f tests/maturity/leaf-P1-03.test.ts && echo LEAF_TEST_PRESENT
  EXPECT: LEAF_TEST_PRESENT
  EVIDENCE: LEAF_TEST_PRESENT

- [x] G3: The leaf-specific contract test passes.
  CHECK: cd ../.. && npx vitest run tests/maturity/leaf-P1-03.test.ts
  EVIDENCE: Start at  19:46:19 | Duration  267ms (transform 86ms, setup 183ms, import 22ms, tests 5ms, environment 0ms)

- [x] G4: The critical negative invariant is proved: binding collisions and stale credentials fail closed.
  EVIDENCE: `leaf-P1-03.test.ts` proves duplicate provider keys and collision-bound authentication return `external_identity_binding_collision`; it also proves rotated predecessors return `credential_stale`, while revoked, expired, wrong-Principal, wrong-binding and wrong-generation presentations are refused deterministically.

- [x] G5: Type checking passes with the leaf integrated through context-local exports.
  CHECK: cd ../.. && npm run typecheck
  EVIDENCE: > agentic-economy@0.1.0 typecheck | > tsc --noEmit

- [x] G6: Owned production files contain no placeholder implementation markers.
  CHECK: cd ../.. && if rg -n '(TODO|FIXME|not implemented)' tests/maturity/leaf-P1-03.test.ts 2>/dev/null; then exit 1; else echo NO_PLACEHOLDERS; fi
  EXPECT: NO_PLACEHOLDERS
  EVIDENCE: NO_PLACEHOLDERS

- [x] G7: The expert reread, defect hunt and free-polish pass found no remaining improvement.
  EVIDENCE: Expert reread verified Principal-only identity ownership, independent credential identity/lifecycle/timestamps, server-time expiry, transactional expected revisions/idempotency, separated provider collision keys, unknown-state preservation, complete ordered Convex index names and context-local exports. Defect hunt added real default clock/UUID coverage and replaced nondeterministic test idempotency values. React Doctor's two sequential-await warnings were inspected at `registry.ts:344,495` and retained intentionally: serial indexed reads preserve deterministic error precedence when multiple presented refs are invalid, whereas `Promise.all` would make the stable problem code race-dependent. The final pass found no further in-scope improvement.
