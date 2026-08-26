# Gates: P2-04 — Infisical secret plane

Scope: A provider-neutral SecretStore uses Infisical JIT retrieval and two-phase generation rotation.

Ownership: src/modules/secrets, tests/unit/secrets, tests/maturity/leaf-P2-04.test.ts

- [x] G1: The leaf's observable outcome is implemented completely under the frozen contract.
  EVIDENCE: `src/modules/secrets/public.ts` exposes the replaceable port, zeroized callback-scoped JIT plane, attempt-proven collision-safe creation, receipt-free atomic pointer request, canonical reconciliation, and real non-redirecting OIDC Infisical Cloud v4 adapter; 33/33 owned assertions pass.

- [x] G2: A leaf-specific executable contract test exists.
  CHECK: cd ../.. && test -f tests/maturity/leaf-P2-04.test.ts && echo LEAF_TEST_PRESENT
  EXPECT: LEAF_TEST_PRESENT
  EVIDENCE: `tests/maturity/leaf-P2-04.test.ts` exists and exercises the context-local public seam.

- [x] G3: The leaf-specific contract test passes.
  CHECK: cd ../.. && npx vitest run tests/maturity/leaf-P2-04.test.ts
  EVIDENCE: Node 22 Vitest passed the maturity contract (1 file, 1 test); the owned unit plus maturity sweep passed 33/33 assertions.

- [x] G4: The critical negative invariant is proved: secret material never persists in Convex or environment projections.
  EVIDENCE: Hostile tests prove captured byte views are zeroed and callback returns discarded; active and inactive/orphan generation collisions, the official Infisical `{statusCode:400,error:'BadRequest',message:'Secret already exists'}` duplicate, and approval-pending 2xx responses cannot overwrite or grant deletion authority; fresh IDs retry while genuine failed-validation creations clean up. Stale generation, forged advance, token/identity outage, provider canaries, and cross-origin 30x remain rejected. Production sink sweep passed.

- [x] G5: Type checking passes with the leaf integrated through context-local exports.
  CHECK: cd ../.. && npm run typecheck
  EVIDENCE: Node 22 `npm run typecheck -- --pretty false` passed.

- [x] G6: Owned production files contain no placeholder implementation markers.
  CHECK: cd ../.. && if rg -n '(TODO|FIXME|not implemented)' tests/maturity/leaf-P2-04.test.ts 2>/dev/null; then exit 1; else echo NO_PLACEHOLDERS; fi
  EXPECT: NO_PLACEHOLDERS
  EVIDENCE: Owned source/test sweep returned `NO_PLACEHOLDERS_OWNED`; the adapter executes documented Infisical OIDC login and v4 secret HTTP requests.

- [x] G7: The expert reread, defect hunt and free-polish pass found no remaining improvement.
  EVIDENCE: All four adapter-repair passes completed. Implementation accepts only status 409 or the exact official Infisical v4 `BadRequest` 400 duplicate outcome and validates a matching created-secret identity before issuing attempt-local cleanup authority; expert reread verified approval/ambiguous 2xx remains non-authoritative and real 400 collision retry preserves the orphan; defect hunt rejects the spaced `Bad Request` spelling plus malformed/non-JSON and canary-bearing near matches, wrong secret identity, blank IDs and invalid versions; free polish retained the single exact classifier and private DELETE. Owned lint passed and exact coverage is 235/235 statements, 180/180 branches, 24/24 functions, 215/215 lines.
