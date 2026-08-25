# Ox Alpha Phase 1 adversarial acceptance prompt

Act as an independent red-team reviewer. Try to DISPROVE, not summarize, AE Full-Maturity Phase 1 at candidate `1cf8cd82a2817137ee3e0bc4e0540a12b53c4225` against baseline `868c2fc673f35340dd2079176ab7f913ca665efb`.

The authoritative contract is `.planning/maturity-execution/PLAN.md` and the frozen gates are `.planning/maturity-execution/gates/leaf-P1-01.md` through `leaf-P1-04.md` plus `phase-1.md`. Read `AGENTS.md` and `convex/_generated/ai/guidelines.md` first.

This process is read-only. Do not run tests, package tools, Node, Vitest, or generated executables. Do not attempt to create temporary files. Inspect source, tests, contracts, and `git diff` only with bounded read-only commands. Use no more than 12 commands total; never `cat` a whole contract, guideline, diff, or source file. Prefer targeted `rg`, `git diff --stat`, and narrow `sed`/`nl` ranges. Stop after one complete concise report; do not retry a failed command.

Try to refute at least:

- autonomous agent and organization principal ownership;
- credential rotation without principal-identity mutation;
- active-stranger and cross-account access;
- direct-resource fallback or Clerk-owner bypasses;
- background job, cron, callback and workload account-context parity;
- lifecycle transition races and reset/deletion boundary;
- schema/index/codegen integration and false-positive gate evidence.

For every finding, provide severity, exact file/line evidence, a concrete exploit or reproduction path, the frozen outcome or invariant violated, and an exact repair acceptance test. Distinguish source-only/local proof from live cloud authorization evidence. Explicitly assess whether deferred live deletion wiring is outside Phase 1 and whether it creates a present bypass. If a requested attack fails, say why. Conclude whether you refuted any deciding gate and give `PASS` or `CHANGES_REQUIRED` under this rule: PASS requires all 34 frozen gates genuinely met, exact release pass, no isolation/invariant violation, and no successful deciding refutation.
