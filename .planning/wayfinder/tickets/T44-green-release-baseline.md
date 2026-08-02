# T44 — Green release baseline

Labels: `wayfinder:task`, `tdd:red`. Parent: [T43](T43-human-agent-framework-parity-spec.md). Source ticket: T37.
Status: landed + verified at the source/local-smoke evidence boundary — `npm run test:release:source` exited 0 with 2,687 unit tests, 244 integration tests, eval 12/12 and build in `output/release/final-gate-2.log` (also `output/release/final-gate.log`); the no-mock-code WorkTree smoke completed `outcome → create → elaborate → study → propose → inbox → lock → receipt → reload_readback` in `output/release/work-tree-smoke.json.log`; open: hosted/external evidence remains downstream in T51/T53.

## Outcome

A maintainer and CI can distinguish a regression from pre-existing drift before framework cutover work lands.

## Public seam

`npm run gate:release` (add this named script) and the required GitHub Actions check on pull requests, merge queue and main.

## Red

The current source gate omits Convex codegen and deterministic answer evaluation; 2 unit and 29 integration failures are recorded baseline drift; hosted smoke copy is stale; CI has no exact machine-readable release artifact. The check therefore cannot truthfully certify a release.

## Minimal green

1. Reproduce and fix or explicitly remove obsolete contracts causing every current unit/integration failure; do not add a failure comparator or allowlist.
2. Define one release command that runs Convex codegen/type generation, typecheck, lint, focused source/import/retirement contracts, unit, integration, deterministic eval and production build.
3. Update hosted smoke selectors to current public copy or behavior.
4. Run the same command in CI for `pull_request`, `merge_group` and `push` to `main`; cancel only superseded PR runs, not main.
5. Upload sanitized Vitest/eval/Playwright evidence with `if: always()`; never upload `.env*` or credentials.
6. Keep React Doctor advisory until pinned and made reproducible; it is not the release gate.

## TDD tracer

Write one failing test/CI contract proving the release command includes each required sub-gate and emits exact-SHA metadata; make it pass using package/workflow configuration, then run the command itself. Do not test source text where the executable workflow can be invoked.

## Adopted seams

Existing npm scripts, Vitest, Playwright, Convex codegen, GitHub Actions `upload-artifact`. No custom test framework or baseline comparator.

## Acceptance

- Clean checkout + required environment can run one command to a green result.
- Unit and integration suites have zero known failing tests.
- CI evidence names repository SHA, workflow run and evidence class.
- Hosted smoke uses current public behavior.
- Failure artifacts contain no secrets.

## End condition

Required check is green on the exact commit that begins T45; any later red gate blocks release.

## Source evidence

`package.json` scripts; `.github/workflows/kernel-release-gate.yml`; `.github/workflows/react-doctor.yml`; `eval/answer/README.md`; `tests/deploy-smoke/customer-request-human-lifecycle-smoke.spec.ts`.
