# Gates: Phase 2 foundation checkpoint assessment

Scope: Prove whether checkpoint `f293325c87934e5fefc52c1dbc8cb3b799d00aa0` is safe input to a maturity rebaseline without accepting, repairing, or completing Phase 2.

- [x] G1: Exact base, candidate, preserved-source, foundation-verdict, inventory, Phase 1, and product-finding refs plus initial branch/worktree state are verified.
  EVIDENCE: `codex/ae-maturity-phase-2` and the initial detached checkout both resolved to `f293325c87934e5fefc52c1dbc8cb3b799d00aa0`; ordinary tracked/staged/untracked status was empty. `git show -s` and ancestry checks verified `ae284871 -> d20d62d8`, `85486e84 -> 6a56ae64 -> a0ced993 -> f293325c`, and root-only product input `22f4930ec6a56b27f246f6c8c010d6dc71c40e80`.

- [x] G2: The exact changed-file inventory and all open checkpoint gates are measured from repository evidence.
  EVIDENCE: `a0ced993^..a0ced993` is 17 source files, 554 insertions and 69 deletions; `6a56ae64..f293325c` is those files plus the checkpoint document. Accepted-Phase-1-to-checkpoint is 370 files. Named Unlazy checks and direct counts measured Start 8/8, registrar foundation 3/8, authority foundation node 1/6 and Phase 2 root 0/6. No 298-registration migration was dispatched.

- [x] G3: All four bounded, non-overlapping, report-only reviews are received with exact file/line/command citations: architecture/domain, authority/security/Convex, evidence/tests/gates, and product operability/papercuts.
  EVIDENCE: Four leaves returned: architecture/domain boundaries; authority/security/Convex and all 17 files; evidence/test/gate trust; product-operability/AE-PAP-024. Each was report-only, cited exact source/commands, reported no edits and stopped at its assigned boundary; the integration driver alone wrote these artifacts.

- [x] G4: Both known registrar bypasses and the coverage shortfall are reproduced without expanding or modifying the checker.
  EVIDENCE: In-memory ESLint with unchanged config returned zero diagnostics for protected `const { db } = ctx` use and aggregate registrar-object selection. Focused Istanbul measured registrar 100/100/100/100, rule 84.11/74.45/100/88.08 and runner 73.91/55.55/75/75.55; the literal 100% gate remains failed. Ox independently reproduced both escapes.

- [x] G5: All 17 preserved partial-source edits are audited as unaccepted code for composition, trust boundaries, failure modes, and retention safety.
  EVIDENCE: The assessment contains one disposition for every file. Commit `a0ced993` is safe to retain as immutable evidence but unsafe to adopt as an aggregate baseline; exclude/revert initially, then selectively re-land reviewed hardening with canonical adapters, exact validators and focused tests.

- [x] G6: Source-proven evidence is separated from hosted/external evidence, and tests/gates are challenged for diagnostic substitution, test-only paths, mocks, stale artifacts, and overbroad claims.
  EVIDENCE: The assessment separates source, test-harness, hosted/external and open evidence. A same-signature diagnostic at a substitute registration would pass the runner. Registrar references are fixture-only; identity/rows and Infisical transports are injected/mocked. The retained Start artifact is actually at `787396e1`, not its `85486e84` label, and ignored `output/` is absent in this fresh checkout.

- [x] G7: Working, incomplete, false, overbuilt, and insufficiently integrated foundation capabilities are distinguished, with Phase 1–2 judged independently of discarded Phase 3+ plans.
  EVIDENCE: Accepted Phase 1, static inventory, bounded Start source behavior and promising domain modules are separated from unused registrars, test-only adapters, duplicate canonical resolvers, absent production composition and open integration/release. No Phase 3+ plan is used as an acceptance premise.

- [x] G8: Registrar/static-rule viability is decided against official documentation or mature examples, with a recommendation to retain, simplify/replace, or abandon.
  EVIDENCE: Retain static inventory and narrow import/category lint; replace the bespoke analyzer as a security boundary with documented Convex custom-function authorization, thin registered endpoints, internal-function revalidation, optional deny-default RLS and actual-reference vertical tests. Ox corrected one overclaim: Convex Helpers merges original context, so raw-field removal needs an explicit wrapper/enforced membrane and proof.

- [x] G9: Product-operability papercuts and whack-a-mole process learnings are enumerated, including the missing canonical Principal/Account operator console and concrete inputs for later GSD forensics.
  EVIDENCE: AE-PAP-024 was inspected without cherry-pick; nine canonical operator/support capability gaps and ten concrete GSD-forensics inputs are enumerated. The console is post-Phase-2 rebaseline work, not added Phase 2 scope.

- [x] G10: An independent version-matched Ox Alpha adversarial challenge is completed and its challenges are resolved or carried into the verdict.
  EVIDENCE: Codex CLI `0.149.0`, installed `ox-alpha` profile, `stealth/ox-alpha`, OpenRouter, read-only/never. High-effort run verified refs/ledgers and reproduced both escapes but ended on provider 429. One bounded medium-effort retry, session `01a03db0-5671-7b51-a023-1a0b79aa9e34`, completed with no blocker and upheld `SAFE_REBASELINE_INPUT_EVIDENCE_OPEN`; its context-merge caveat was corrected in the assessment and prior-run reliance remains open evidence.

- [x] G11: Only the two required assessment artifacts are changed; production source, tests, gates other than this new assessment gate, package/config, generated code, and existing ledgers are untouched.
  EVIDENCE: Driver edits are limited to this gate and `.planning/maturity-execution/reviews/phase-2-foundation-checkpoint-assessment.md`. Project dependencies were installed from the unchanged lockfile only to run checks and are removed before commit. Cached coverage and Ox outputs were outside the repository. Staged-path and final-status checks enforce the two-file boundary.

- [x] G12: A single allowed rebaseline-input verdict is stated without accepting or claiming completion/maturity for Phase 2.
  EVIDENCE: The only verdict is `SAFE_REBASELINE_INPUT_EVIDENCE_OPEN`. It judges rebaseline-input safety only; implementation authorization remains withheld and Phase 2 is explicitly incomplete, unaccepted and not mature.

- [x] G13: The two assessment artifacts are committed in one evidence commit and the final worktree is clean at that commit.
  CHECK: `test -z "$(git status --porcelain=v1)" && test "$(git show --name-only --format= HEAD | sed '/^$/d' | sort | tr '\n' ' ')" = ".planning/maturity-execution/gates/phase-2-foundation-checkpoint-assessment.md .planning/maturity-execution/reviews/phase-2-foundation-checkpoint-assessment.md "`
  EXPECT: exit 0 after the evidence commit
  EVIDENCE: Post-commit verification returned `ASSESSMENT_EVIDENCE_COMMIT_CLEAN`; `git show --name-only --format= HEAD` contained exactly this gate and the companion assessment, and `git status --porcelain=v1` was empty. The final amended evidence ref and the same rerun result are reported in the handoff.

## Unlazy accounting

- Mode: orchestrated, with four read-only review leaves and integration owned only by the driver.
- Completion rule: every gate above has concrete evidence; no `pending` remains; one final adversarial pass finds no unsupported claim.
- Artifact constraint: this required gate file serves as the Unlazy ledger; no extra `GATES.md` or `PLAN.md` is created because the task permits exactly two new files.
