# Wayfinder setup validation — 2026-09-05

Scope: this skill, its record conventions and guarded installation. This is not
an application quality audit, full gstack integration run, or a measured claim of
faster delivery. The first real project goal remains the adoption trial.

## Results

| Check | Result and practical limit |
|---|---|
| Official `skill-creator/scripts/quick_validate.py` | Passed; existing cached PyYAML supplied through `PYTHONPATH`, no dependency installed |
| YAML metadata | Parsed; readable description, valid prompt, explicit-only policy |
| Local Markdown references | All current local links resolve; named legacy planning links are not guaranteed in a clean checkout |
| Fresh CLI and desktop-bundled `app-server` discovery | Exactly one enabled `wayfinder-delivery` entry at the installed global path |
| Fresh CLI explicit `$wayfinder-delivery` invocation | Full root instructions injected; supporting references remain on demand; no workflow stages executed by the probe |
| Fresh desktop-bundled automatic catalogue probe | Skill absent from automatic catalogue; root instructions not injected |
| Independent delivery fixture | Reused approval, reproduced zero-label failure, fixed it, passed 3 tests and committed only 3 owned files; unrelated staged and unstaged work survived unchanged |
| Independent scoping fixture | Left custom installer undecided; requested missing client identities and retained direction approval before implementation |
| Independent client-closeout fixture | Kept the goal blocked on real client proof despite passing unit/SDK checks and a source commit |
| Independent evolution handoff fixture | Rejected a staged-work regression, incomplete evidence and malformed ranking; retained incumbent at exhausted budget |
| Guarded installer | Ten checks passed: initial install, read-only check, idempotence, source update, local-edit refusal, unmanaged-target refusal, symlink refusal, nested-target refusal, restoration after publication failure, and recovery-copy retention after rollback failure |
| Protected content fingerprints | 347 baseline files unchanged: 109 gstack skill/metadata files, 232 plugin files, original Wayfinder and relevant global/project instructions/configuration |
| Existing React pre-commit hook | Could not scan because pre-existing `package.json` differs between index and worktree. Its wrapper printed “staged regressions” but allowed the commit. No React/application files were staged; this is not a passing React scan or an observed React regression. See the hook papercut in TODOS. |

The delivery fixture executed real Python tests and a local Git commit. Its
review stage used a controlled fixture skill, not production gstack. The other
three cases tested independent handoff decisions; they did not run browsers,
external services or an actual multi-round improvement tournament. These limits
remain explicit rather than treating textual evaluation as live behavior proof.

## What fell short and changed

The first installation used a symlink to versioned source. Both runtimes resolved
it to `agentic-economy:wayfinder-delivery`; `$wayfinder-delivery` did not inject the
skill. The failed explicit probe caught the mismatch. Installation now produces a
derived global copy with source/digest receipt and refuses to overwrite local
changes. Subsequent explicit and automatic probes passed.

Existing desktop exposure of other disabled skills is a separate open finding in
TODOS. This setup does not claim that a live app reload has fixed that issue.
No elapsed-time or token-efficiency baseline was measured for the new workflow.

## Reproduce relevant checks

From the repository root:

```sh
python3 docs/workflow/install-skill.py --check
python3 "${CODEX_HOME:-$HOME/.codex}/skills/.system/skill-creator/scripts/quick_validate.py" docs/workflow/wayfinder-delivery
git log --oneline --fixed-strings --grep=WF-20260905-workflow
```

The optional skill validator requires a local Codex skill-creator installation
and a Python environment with PyYAML. Those are local development tools, not
project dependencies; the repository's own installation check is the first command.
Validate changed behavior with realistic forward cases when revising the skill,
including a held-out case for evolution. Do not add a test suite of wording
assertions merely to preserve the template's headings.

Detailed local receipts, failed and successful discovery probes, fixture reports,
installer results and pre-edit baseline are retained outside discovery at
`~/.codex/workflow-build/20260905T044804Z/`. The committed summaries above provide
the reviewable result without requiring those private raw files.
