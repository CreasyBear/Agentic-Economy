# Gates: P2-02 — Cross-surface authorization

Scope: HTTP, MCP, CLI, callbacks, jobs and crons share one account-context and authorization service.

Ownership: src/modules/authority/context, src/lib/server/authority-boundary, tests/unit/authority/context, tests/maturity/leaf-P2-02.test.ts

- [x] G1: The leaf's observable outcome is implemented completely under the frozen contract.
  EVIDENCE: `src/modules/authority/context/consequence-authority.ts` centralizes exact consequence admission; `src/lib/server/authority-boundary/surface-adapters.ts` binds all nine frozen protected surfaces without a superuser mode.

- [x] G2: A leaf-specific executable contract test exists.
  CHECK: cd ../.. && test -f tests/maturity/leaf-P2-02.test.ts && echo LEAF_TEST_PRESENT
  EXPECT: LEAF_TEST_PRESENT
  EVIDENCE: `tests/maturity/leaf-P2-02.test.ts` exists and asserts the complete protected/workload surface inventories.

- [x] G3: The leaf-specific contract test passes.
  CHECK: cd ../.. && PATH=/Users/joelchan/.nvm/versions/node/v22.22.0/bin:$PATH npm exec vitest -- run tests/maturity/leaf-P2-02.test.ts tests/unit/authority/context/consequence-authority.test.ts
  EVIDENCE: Node 22 Vitest passed 2 files and 14 tests; targeted Istanbul coverage is 123/123 statements, 30/30 branches, 33/33 functions and 117/117 lines (all 100%).

- [x] G4: The critical negative invariant is proved: no protected surface bypasses account or generation checks.
  EVIDENCE: Retained tests reject wrong Account, stranger Principal, missing workload, interactive background caller, stale/revoked generation, expiry race, omitted/unknown surface, malformed intent/binding and forged admission; malformed getter-backed intent proves resolver/admission/consequence counts remain zero. Injected credential/Clerk/provider/payload/proof fields cannot reach the resolver or admission. Getter-backed intent, binding and snapshot fields are read exactly once; mutable scope/resource arrays are validated, copied, sorted and frozen immediately, preventing cross-getter, post-validation actor forgery or mutation drift from reaching the callback.

- [x] G5: Type checking passes with the leaf integrated through context-local exports.
  CHECK: cd ../.. && PATH=/Users/joelchan/.nvm/versions/node/v22.22.0/bin:$PATH npm run typecheck
  EVIDENCE: Node 22 `npm run typecheck` passed after the concurrent P2-05 leaf completed its owned fixture typing.

- [x] G6: Owned production files contain no placeholder implementation markers.
  CHECK: cd ../.. && if rg -n '(TODO|FIXME|not implemented)' src/modules/authority/context src/lib/server/authority-boundary tests/unit/authority/context tests/maturity/leaf-P2-02.test.ts 2>/dev/null; then exit 1; else echo NO_PLACEHOLDERS; fi
  EXPECT: NO_PLACEHOLDERS
  EVIDENCE: Raw owned-path scan returned `NO_PLACEHOLDERS`; scoped Oxlint with `--deny-warnings` and `git diff --check` passed.

- [x] G7: The expert reread, defect hunt and free-polish pass found no remaining improvement.
  EVIDENCE: Pass 1 implemented the single boundary and fixed adapters; pass 2 added exact snapshot-field validation; pass 3 exercised malformed intent, hostile bindings, time races and forged providers; pass 4 canonicalized and runtime-validated complete intent, binding and returned snapshot fields at their trust boundaries, froze copied arrays/outputs and confirmed the complete adapter set. Final reread found no remaining in-scope defect.
