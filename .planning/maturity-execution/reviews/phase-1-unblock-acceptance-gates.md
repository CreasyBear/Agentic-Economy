# Gates: Phase 1 final unblock acceptance

Scope: Accept or reject the exact final Phase 1 source repair without starting Phase 2 implementation.

- [x] U1: Exact source ref, branch, ancestry, tracked-clean state, and 14-file final repair inventory are frozen.
  EVIDENCE: `ae284871d9d5bad40245182aefd6f2050d53b556` on `codex/phase-2-unblock`; baselines `868c2fc673f35340dd2079176ab7f913ca665efb`, `028d07bba2508f79a6815f47eb7cb4da4484834a`, `71e2163091ad5cd15259821f82730ebaf6777abf`, and rejection commit `7a592ccedefeb2282bbfc1b34b14368012a481b3` are all ancestors; tracked status was clean.

- [x] U2: B1 succession authority and attribution resist fabrication, substitution, duplication, stale binding, replay, race, cross-Account, no-transfer, delay, and expiry attacks.
  EVIDENCE: Combined Phase 1 suite passed 122/122; all five focused review files passed 7/7; Account critical path measured 357/357 statements, 224/224 branches, 73/73 functions, and 332/332 lines.

- [x] U3: B2 reset cannot report removed facts without separate mutation, evidence, and atomic inventory capabilities plus exact receipt/execution/context/state reconciliation.
  EVIDENCE: Focused reset suite passed 25/25; reset critical path measured 166/166 statements, 196/196 branches, 48/48 functions, and 151/151 lines; same-object, forged receipt/execution, live-count contradiction, partial/retry, mismatch, attribution, and canonical-drift cases fail closed.

- [x] U4: B3 checks the actual transitive CLI dependency closure hermetically and preserves package release ordering.
  EVIDENCE: Import suite passed 29/29 with `packages/cli/dist` absent; synthetic clean-entry/transitive-legacy attack is rejected by the same esbuild-metafile helper used by the production gate; full release later produced `CLI_PACKAGE_PASS` through build, pack, install, byte comparison, and execution.

- [x] U5: Frozen and repair ledgers are independently remeasured with zero operational abandon.
  EVIDENCE: Repair leaves 20/20, repair integration 9/9, frozen Phase 1 leaves/integration 34/34, and `NO_OPERATIONAL_ABANDON`.

- [x] U6: Schema, authorization, lint, type, import, diff, and focused integration checks pass.
  EVIDENCE: Schema/integration 14/14; 63 composed tables including all nine principal/Account tables; Convex auth foundation present and deterministic four-shape scan returned zero candidates; lint, typecheck, imports, and `git diff --check` passed.

- [x] U7: Exact Node 22 release is hermetic from a genuinely fresh tracked-clean checkout.
  EVIDENCE: Fresh checkout at `ae284871d` had no `packages/cli/dist`; frozen imports passed 29/29 without creating it; unchanged `npm run test:release:source` passed 421 conformance, 85 chat, 2,577 unit, 570 integration, 4 type, 29 import, 1 standards, 32 SEO, 1 UI-contract, 20 E2E, 10 accessibility, 7 paid-operation, 2,781 maturity/coverage, `COVERAGE_RATCHET_PASS files=708`, `CLI_PACKAGE_PASS`, integrity checks, and final production build; tracked status remained clean.

- [x] U8: A fresh read-only Ox Alpha process attempts to refute all three repairs and regressions.
  EVIDENCE: Deciding ephemeral `ox-alpha` process exited 0 after 44,670 tokens and returned B1 PASS, B2 PASS, B3 PASS, regression PASS, and `SOURCE_ACCEPTED_EVIDENCE_OPEN`; full prompt and output are preserved alongside this ledger.

- [x] U9: The verdict separates current source defects from external/later-phase proof and explicitly controls the Phase 2 handoff.
  EVIDENCE: No current source blocker remains. Hosted Clerk/cloud proof, live Convex reset adapter proof, and production cross-surface wiring remain assigned to later gates. Verdict is `SOURCE_ACCEPTED_EVIDENCE_OPEN`; Phase 2 may start.
