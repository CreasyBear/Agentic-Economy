---
verified: 2026-08-26T09:15:22Z
scope: repair-P2-authority-entry-inventory
verdict: PASS
score: 8/8 gates verified
candidate_head: 3dd77ba0c8800124e1374a91bc83b06ca970effc
branch: codex/ae-maturity-phase-2
re_verification:
  previous_verdict: FAIL
  gaps_closed:
    - classification contract digest is independently validated
    - all declared source digests are independently recomputed
    - every non-empty runtimeRef must exist in the exact frozen runtime namespace
    - stale runAdmittedAction line-qualified identity was replaced by the stable symbol
  gaps_remaining: []
  regressions: []
---

# Phase 2 authority-entry inventory re-verification

## Verdict

**PASS — 8/8 inventory gates independently verified.** The bounded repair closes
the prior provenance/runtime-join false green. This verdict accepts only the
registration inventory/classification leaf; all 607 assigned source migration
obligations and later runtime/actual-handler gates remain red until their owning
leaves execute.

## Goal-backward gate results

| Gate | Result | Independent evidence |
|---|---|---|
| G1 complete symbol inventory | PASS | Node 22 `npm run test:phase2:registrations -- --inventory-only` passed 14/14 and printed 298 registrations, 52 files, 119 public, 172 internal, seven HTTP, 208 ordinary, 90 Generic, unresolved=0 and duplicate=0. Hostile fixtures cover typed, alias, bounded-factory, unresolved, duplicate and compiler-diagnostic forms. |
| G2 exact declaration baseline | PASS | A separate TypeScript `Program`/`TypeChecker` export enumeration found the same 298 IDs across 52 files and exact 119/172/7 split, with no missing or extra contract row. The five typed declarations are present; production has zero current alias/factory registrations while hostile fixtures prove both shapes are detected. |
| G3 classification, provenance and join | PASS | Node 22 `--require-classified` passed 14/14 and printed classified=298/unresolved=0/duplicate=0. Independent recomputation matched the classification digest `ce8fedca…`; all 59 declared source digests match current bytes. All 1,186 declared runtime references (232 unique) exist in the exact 242-row namespace. In-memory hostile mutations independently proved a bad contract digest, a recomputed stale source digest and a recomputed stale runtime ref each fail with its specific diagnostic. |
| G4 separate runtime/edge namespaces | PASS | Deterministic `--check-snapshot` reproduced SHA-256 `c8bd3f98…`: 47 Start, 119 public Convex, seven HTTP actions, seven HTTP routes, 10 crons and 52 backgrounds = 242, partitioned as 207 protected/35 exemptions; edges remain 39 HTTP/14 MCP/12 CLI. Exactly one stable `run_action:convex/workloadCron.ts:runAdmittedAction` exists and no `runAdmittedAction@<line>` remains in classification, migration or runtime contracts. |
| G5 exemption inventory | PASS | The exact focused check passed 23/23. All 27 non-protected Convex rows retain policy references, structural capability metadata and non-empty test assignment: 20 public, five narrow-system and two dev-only. This is inventory/test assignment only; planned migration test execution remains with later leaves. |
| G6 ownership and impact plan | PASS | Owner groups remain disjoint: A 108 rows/13 files, B 68/17, C 115/19 and HTTP 7/3. No row has an owner/file or obligation-owner mismatch. Seven runtime seams, 14 driver-only paths, exact type/import/bundle/codegen/release checks, compatibility rules and atomic rollback are frozen. |
| G7 hostile/deterministic proof | PASS | The focused suite passed 14/14, including both new stale-provenance and stale-runtime-identity regressions. `--require-classified --check` reproduced the migration contract byte-for-byte; its independently recomputed digest matches `9233e704…`. The bounded 70,700-byte discovery output remains covered by the large-output test and inventory output makes no dominance/sink-coverage claim. |
| G8 four-pass hygiene and stop | PASS | Named Unlazy checker reports 8/8. Focused oxlint and `git diff --check` pass. The 17 visible production-source modifications are the preserved pre-inventory Phase 2 work; no registration/handler/shared-composition file was newly edited by this repair. Ignored planning artifacts are present and require explicit force-staging. |

## Closed blocker evidence

The prior mismatch is gone:

```text
classification contract digest: ce8fedca2909b30921a9a2942bf85929195967f3caa1addec2d794e2ad7ab914 (recomputed exact)
classification source digests: 59 declared / 59 current / 0 mismatches
runtime namespace: 242 exact refs
classification runtime refs: 1,186 declarations / 232 unique / 0 absent
runAdmittedAction refs: run_action:convex/workloadCron.ts:runAdmittedAction only
runAdmittedAction@<line> refs: 0
migration contract digest: 9233e7045cac0c2988eb3aee35efff154bb584ab57249f4b53894a0c21e0e848 (recomputed exact)
```

Independent falsification, with each mutated document kept internally
self-consistent except for the targeted defect:

```text
tampered classification contract digest -> classification_contract_digest_mismatch
recomputed contract containing stale source digest -> classification_source_digest_mismatch
recomputed contract containing stale runtime ref -> classification_runtime_ref_unknown
```

## Obligation and caller-trust audit

- All 607 migration obligations remain assigned to their exact owner: 351 prior
  findings plus 256 fixed-policy additions on the 128 indirect protected workload
  rows.
- All 128 indirect rows are fixed to `workload_account` /
  `protected_workload_account`, require server-derived durable workload authority
  plus target-time revalidation, and explicitly prohibit caller-identity inheritance
  or dynamic authority-mode selection.
- Exactly 32 internal registrations remain runtime-empty: 31 protected rows carry
  the exact fail-closed no-accepted-ancestor reason and all seven planned authority
  cases; one is explicitly dev-only. None becomes an internal superuser.
- No owner-file conflicts, obligation-owner mismatches, silent registration
  omissions or projected 27-sink acceptance claims were found.

## Commands independently run

- Named Unlazy checker: 8/8 met.
- Node 22 inventory-only: 14/14 passed.
- Node 22 require-classified: 14/14 passed.
- Three in-memory hostile provenance/runtime mutations: all rejected specifically.
- Independent 59-source digest recomputation: zero mismatch.
- Independent 242-runtime namespace membership audit: zero missing/stale ref.
- Registration and runtime deterministic regeneration checks: passed.
- Independent TypeScript registered-export ID comparison: 298 exact.
- Public exemptions: 23/23 passed; exact 27-row metadata check passed.
- Exact counts/owners/351+256 obligations/128 fixed/32 dormant checks: passed.
- Focused oxlint and `git diff --check`: passed.

Explicit stop: this verifier replaced only this owned report. It edited no source,
tool, test, contract, gate or other planning artifact.
