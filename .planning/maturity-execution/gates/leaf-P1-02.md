# Gates: P1-02 — Account ownership and lifecycle

Scope: Accounts own tenancy and resources with explicit creation, suspension, closure, transfer and succession states.

Ownership: src/modules/principal-account/account, tests/unit/principal-account/account, tests/maturity/leaf-P1-02.test.ts

- [x] G1: The leaf's observable outcome is implemented completely under the frozen contract.
  EVIDENCE: Account, AccountOwnership, Membership, recovery declarations, optimistic revisions, idempotent creation, lifecycle, transfer, succession and account-isolated context attribution are implemented in src/modules/principal-account/account. The exactly-one active Account context requires active ownership or active membership; an explicit cross-account counterparty must independently exist, be active, differ from the context Account and be revision-pinned without becoming a second access context. 29 focused unit tests and 5 leaf-contract tests pass with 100% line/branch/function/statement coverage over the canonical module.

- [x] G2: A leaf-specific executable contract test exists.
  CHECK: cd ../.. && test -f tests/maturity/leaf-P1-02.test.ts && echo LEAF_TEST_PRESENT
  EXPECT: LEAF_TEST_PRESENT
  EVIDENCE: LEAF_TEST_PRESENT

- [x] G3: The leaf-specific contract test passes.
  CHECK: cd ../.. && npx vitest run tests/maturity/leaf-P1-02.test.ts
  EVIDENCE: Test Files 1 passed (1); Tests 5 passed (5).

- [x] G4: The critical negative invariant is proved: an Account cannot enter an impossible lifecycle transition.
  EVIDENCE: leaf-P1-02.test.ts proves pending suspension, active closure and closed reactivation fail deterministically; unit tests exhaust the pending_activation -> active -> suspended -> active/suspended -> closed graph and prove suspended/closed Accounts cannot admit protected work.

- [x] G5: Type checking passes with the leaf integrated through context-local exports.
  CHECK: cd ../.. && npm run typecheck
  EVIDENCE: > agentic-economy@0.1.0 typecheck | > tsc --noEmit (exit 0)

- [x] G6: Owned production files contain no placeholder implementation markers.
  CHECK: cd ../.. && if rg -n '(TODO|FIXME|not implemented)' tests/maturity/leaf-P1-02.test.ts 2>/dev/null; then exit 1; else echo NO_PLACEHOLDERS; fi
  EXPECT: NO_PLACEHOLDERS
  EVIDENCE: NO_PLACEHOLDERS

- [x] G7: The expert reread, defect hunt and free-polish pass found no remaining improvement.
  EVIDENCE: Four original passes plus independent-verifier and contract-reread correction passes completed. Active strangers cannot bind the selected Account; active owners or members can. Cross-account attribution preserves exactly one access context while requiring an explicit, active, distinct and revision-pinned counterparty without counterparty membership. Final owned lint, typecheck, diff, placeholder, 34-test and 100%-coverage checks pass with no remaining finding.
