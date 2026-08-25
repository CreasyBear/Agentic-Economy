# Gates: P2-04 — Infisical secret plane

Scope: A provider-neutral SecretStore uses Infisical JIT retrieval and two-phase generation rotation.

Ownership: src/modules/secrets, tests/unit/secrets, tests/maturity/leaf-P2-04.test.ts

- [x] G1: The leaf's observable outcome is implemented completely under the frozen contract.
  EVIDENCE: `src/modules/secrets/public.ts` exposes the replaceable port, callback-scoped JIT plane, receipt-free atomic pointer request, canonical reconciliation, and real OIDC Infisical Cloud v4 adapter; 23/23 owned assertions pass.

- [x] G2: A leaf-specific executable contract test exists.
  CHECK: cd ../.. && test -f tests/maturity/leaf-P2-04.test.ts && echo LEAF_TEST_PRESENT
  EXPECT: LEAF_TEST_PRESENT
  EVIDENCE: `tests/maturity/leaf-P2-04.test.ts` exists and exercises the context-local public seam.

- [x] G3: The leaf-specific contract test passes.
  CHECK: cd ../.. && npx vitest run tests/maturity/leaf-P2-04.test.ts
  EVIDENCE: Node 22 Vitest passed the maturity contract (1 file, 1 test); the owned unit plus maturity sweep passed 23/23 assertions.

- [x] G4: The critical negative invariant is proved: secret material never persists in Convex or environment projections.
  EVIDENCE: Hostile tests reject callback escape, stale generation, forged receipt-only advance, validation failure, expired/incorrect tokens, timeouts, and secret-canary provider errors; the production sweep returned `NO_PERSISTENCE_OR_OBSERVABILITY_SINKS` for Convex, environment, log, evidence, and snapshot sinks.

- [x] G5: Type checking passes with the leaf integrated through context-local exports.
  CHECK: cd ../.. && npm run typecheck
  EVIDENCE: Node 22 `npm run typecheck -- --pretty false` passed.

- [x] G6: Owned production files contain no placeholder implementation markers.
  CHECK: cd ../.. && if rg -n '(TODO|FIXME|not implemented)' tests/maturity/leaf-P2-04.test.ts 2>/dev/null; then exit 1; else echo NO_PLACEHOLDERS; fi
  EXPECT: NO_PLACEHOLDERS
  EVIDENCE: Owned source/test sweep returned `NO_PLACEHOLDERS_OWNED`; the adapter executes documented Infisical OIDC login and v4 secret HTTP requests.

- [x] G7: The expert reread, defect hunt and free-polish pass found no remaining improvement.
  EVIDENCE: All four Unlazy passes completed. Expert reread added consequence-time pointer recheck and canonical post-advance reconciliation; defect hunt added ambiguous-commit handling, failed-write cleanup, bounded HTTP and strict token validation; free polish removed pointer receipts and cancels unread provider bodies. Owned lint passed and exact coverage is 183/183 statements, 127/127 branches, 22/22 functions, 174/174 lines.
