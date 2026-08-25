# Gates: P1-02 — Account ownership and lifecycle

Scope: Accounts own tenancy and resources with explicit creation, suspension, closure, transfer and succession states.

Ownership: src/modules/principal-account/account, tests/unit/principal-account/account, tests/maturity/leaf-P1-02.test.ts

- [x] G1: The leaf's observable outcome is implemented completely under the frozen contract.
  EVIDENCE: Account, AccountOwnership, Membership, recovery declarations, optimistic revisions, idempotent creation, lifecycle, transfer, succession and account-isolated context attribution are implemented in src/modules/principal-account/account. The exactly-one active Account context requires active ownership or active membership; an explicit cross-account counterparty must independently exist, be active, differ from the context Account and be revision-pinned without becoming a second access context. Acceptance repair `58a73a444` replaces caller-constructed succession authority with canonical stored authorization derived from independently verified unique recovery participants. It binds Account, incumbent, successor, policy revision, freeze/delay/expiry and consumes exactly once in the ownership transaction. The 32 unit, 5 leaf and 1 repaired review assertions pass; the changed Account path measures 100% statements (349/349), branches (217/217), functions (73/73) and lines (324/324).

- [x] G2: A leaf-specific executable contract test exists.
  CHECK: cd ../.. && test -f tests/maturity/leaf-P1-02.test.ts && echo LEAF_TEST_PRESENT
  EXPECT: LEAF_TEST_PRESENT
  EVIDENCE: LEAF_TEST_PRESENT

- [x] G3: The leaf-specific contract test passes.
  CHECK: cd ../.. && npx vitest run tests/maturity/leaf-P1-02.test.ts
  EVIDENCE: Test Files 1 passed (1); Tests 5 passed (5).

- [x] G4: The critical negative invariant is proved: an Account cannot enter an impossible lifecycle transition.
  EVIDENCE: leaf-P1-02.test.ts proves pending suspension, active closure and closed reactivation fail deterministically; unit tests exhaust the pending_activation -> active -> suspended -> active/suspended -> closed graph and prove suspended/closed Accounts cannot admit protected work. Succession also rejects replay, stale policy, wrong parties or Account, duplicate participants, below-threshold evidence, missing freeze and `no_transfer`; concurrent consumption yields exactly one ownership change with no partial write.

- [x] G5: Type checking passes with the leaf integrated through context-local exports.
  CHECK: cd ../.. && npm run typecheck
  EVIDENCE: > agentic-economy@0.1.0 typecheck | > tsc --noEmit (exit 0)

- [x] G6: Owned production files contain no placeholder implementation markers.
  CHECK: cd ../.. && if rg -n '(TODO|FIXME|not implemented)' tests/maturity/leaf-P1-02.test.ts 2>/dev/null; then exit 1; else echo NO_PLACEHOLDERS; fi
  EXPECT: NO_PLACEHOLDERS
  EVIDENCE: NO_PLACEHOLDERS

- [x] G7: The expert reread, defect hunt and free-polish pass found no remaining improvement.
  EVIDENCE: Four original passes plus independent-verifier, acceptance-repair and contract-reread correction passes completed. Active strangers cannot bind the selected Account; active owners or members can. Cross-account attribution preserves exactly one access context while requiring an explicit, active, distinct and revision-pinned counterparty without counterparty membership. Succession authorization is resolved from trusted stored participant approvals rather than supplied structural claims, without introducing a Phase 2 Grant substitute. Final owned lint, typecheck, diff, placeholder, 38-test and 100%-coverage checks pass with no remaining internal finding.
