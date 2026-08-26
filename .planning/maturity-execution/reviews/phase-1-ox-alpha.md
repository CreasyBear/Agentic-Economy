# Ox Alpha Phase 1 red-team result

Process: `codex -p ox-alpha`

Profile confirmation: `model: stealth/ox-alpha`, `provider: openrouter`, `approval: never`, `sandbox: read-only`, session `01a03923-67c7-7fc3-9fc7-b31d3971cf8f`.

The text below is Ox Alpha's final output, preserved verbatim.

---

## Red-Team Verdict: `CHANGES_REQUIRED`

I did not refute principal/account isolation, lifecycle serialization, credential rotation, stranger protection, or workload fail-closed admission. I did refute two deciding aspects of P1-04’s “genuinely met” claim.

### Successful Refutations

**1. High / deciding — legacy identity removal is asserted, not performed**
- Evidence: `.planning/maturity-execution/gates/leaf-P1-04.md:3` requires “legacy internal identity data is removed.” The shipped artifact is only a deterministic reset port: `tools/maturity-reset/legacy-identity-reset.ts:123-143`. No live deletion implementation or caller exists.
- Contradiction: `.planning/maturity-execution/PLAN.md:209` states there is “no live Convex deletion port,” while `.planning/maturity-execution/PHASE-1-BLAST-RADIUS.md:38` confirms legacy `owners` and `agentAccessPrincipals` remain active until a later migration.
- Impact: P1-04 G1 cannot be genuinely met as written. This is not a present authorization bypass because no new canonical authorization path replaces or bypasses legacy paths, but it is a false-positive completion claim against the frozen scope.
- Required acceptance test: against an isolated authorized Convex deployment, apply the digest-confirmed plan through a real deletion port; assert `owners` and `agentAccessPrincipals` reach zero facts, all six canonical table counts remain unchanged, replay returns `already-applied`, and non-manifest/canonical targets are rejected. Alternatively, the frozen contract must be formally reopened—not silently reinterpreted.

**2. High / deciding — reset idempotency trusts forged receipts**
- Evidence: `tools/maturity-reset/legacy-identity-reset.ts:136-140` accepts any receipt returned by `findReceipt`; the port type at lines 53-55 provides no cryptographic or inventory proof.
- Exploit: supply an execution port whose `findReceipt(digest)` fabricates `{ planDigest, removed: [...] }`. `executeLegacyIdentityReset(..., { apply: true, confirmedPlanDigest })` returns `already-applied`, reports nonzero removal, invokes no deletion, and changes nothing.
- Invariant violated: P1-04’s deterministic exact-apply and idempotency claim at `.planning/maturity-execution/gates/leaf-P1-04.md:8`.
- Required acceptance test: add an adversarial port returning a forged matching receipt before `applyExact`; execution must fail closed, never classify the operation as applied, and reconcile post-apply per-target counts plus protected canonical counts against a trusted inventory before emitting a receipt-derived result.

**3. Medium / acceptance-boundary limitation — release and authorization proof is local/source-only**
- Evidence: `.planning/maturity-execution/gates/phase-1.md:23` describes Convex’s anonymous local deployment and a local-only Clerk issuer placeholder. Repository inspection also shows no production/live-cloud authorization evidence.
- Impact: this validates source behavior and exact-command mechanics locally, but not live Clerk identity mapping, deployment configuration, or production authorization. It should not be represented as live cloud proof.

### Failed Attacks

- **Active-stranger access:** fails. `requireAccountAccess` permits only the current owner or an active member (`src/modules/principal-account/account/registry.ts:788-797`), enforced by both context admission paths at lines 512-544.
- **Cross-account escalation:** fails. Counterparty validation only produces revision-pinned attribution; it does not grant access or become a second context (`src/modules/principal-account/account/registry.ts:529-550`, `workload-context.ts:158-178`).
- **Lifecycle race:** no successful TOCTOU shown. Transitions reload state, check expected revisions, and commit replacements transactionally (`account/registry.ts:563-584` and `609-665`). A stale actor/context fails revision or access checks.
- **Credential rotation identity mutation:** fails. Binding, previous credential, and canonical principal must match the same active principal; generation and provider-state checks occur atomically (`external-identity/registry.ts:324-361`, `637-667`).
- **Workload superuser/context forgery:** fails. Exact-shape parsing rejects extra authority fields, non-workload kinds, inactive principals/accounts, wrong-account membership, and malformed facts (`workload-context.ts:136-186`, tests `leaf-P1-04.test.ts:110-120`).
- **Schema/codegen integration:** no refutation. Six tables are composed once at `convex/schema.ts:19,37`, with exact-composition assertions in `tests/maturity/phase-1-principal-account-integration.test.ts:27-45`.

### Conclusion

The core Phase 1 ownership model survives adversarial review, but P1-04 does not genuinely meet its frozen removal/reset outcome, and its idempotency proof is forgeable. Under the stated rule requiring all 34 gates to be genuinely met, the result is **`CHANGES_REQUIRED`**.
