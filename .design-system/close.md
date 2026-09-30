# Close: aecon design-system audit

Read-only product audit at migration pin `e1f2b3f59ee785deb114dc195f33c2bda54593e7`. The shared checkout later advanced to `ebfc4c7d295cd7e20102323176f5ff3b41e67bc3`; no reviewed market UI source changed. No product screen or runtime contract was edited by this audit.

| Count | Unit | Before | After / result | Source |
|---|---|---:|---:|---|
| Installed design-system skills | skills | 0 from this request | 6 | `~/.agents/skills/{build-design-system,component-docs,design-system-boss,migrate-design-system,token-mapping,ui-review}/SKILL.md`; `npx skills add` result |
| Source inventory | files | — | 1,507 | `.migration/2026-09-30-aecon-audit/inventory/counts.txt` |
| TanStack route census | route files | — | 155, including 64 TSX views/layouts | `.migration/2026-09-30-aecon-audit/plan.md#surfaces`; `rg --files src/routes` |
| Arbitrary raw style values | occurrences | — | 309 across seven surface groups | `.migration/2026-09-30-aecon-audit/inventory/counts.txt` and `inventory/current.tsv` |
| Palette utilities | occurrences | — | 2 | the same inventory |
| Declared legacy imports | imports | — | 0; legacy map absent, so no adoption-completeness claim | the same inventory; `inventory/legacy.txt` |
| Market token map | occurrences | — | 38: 3 exact, 1 semantic, 34 gaps | `.migration/2026-09-30-aecon-audit/mapping/market.md` |
| Buyer-path parity | rows | — | 10: 7 preserved, 1 current comparison mismatch, 2 known forward-looking product-contract gaps | `.migration/2026-09-30-aecon-audit/parity.tsv` |
| Shell-only review | viewport captures | — | 2 (390px and 1280px); populated catalogue and buyer journey unverified | `.design-system/boss/review/market-shell-review.md` |
| Product files edited by this audit | files | 0 | 0 | `git status --short`; only `.design-system/` and `.migration/` are untracked audit records |
| Project check | dependency cycles above ceiling | — | 2; `npm run check` exit 1 at `deps:check` | `.migration/2026-09-30-aecon-audit/close.md` verification |
| Triage script route count | route files detected | 1 | 1 | `boss/triage/signals.tsv`, `boss/triage/after/signals.tsv`; its glob misses TanStack routes |

## Findings to carry forward

- `DirectoryComparison.tsx` repeats one card per Tool in a mobile stack and two-column desktop grid, while `DESIGN.md` says comparison stays tabular. This is the current source-backed presentation mismatch; rendered impact remains unmeasured.
- Query search keeps browse-only filter controls available but omits those filters from the canonical search request. A notice appears with results. The behavior is intentional and tested; applicability needs to be visible before the search decision.
- Eyebrow tracking and weight disagree between the live market reference and named token/contract language. Most other unmapped values are local layout geometry, not evidence that each needs a new token.
- Seller identity and full Quote authority/commercial evidence are explicit forward-looking product work, not newly discovered regressions or design-system migrations.

## Verification and limits

`git diff --check` passed. The migration inventory helper passed syntax, portability and no-mutation `--help` checks. `npm run check` lint passed, then stopped at two existing dependency cycles; later checks did not run. The shell capture was made without a valid local backend and supports no catalogue or live journey verdict. No full browser or accessibility evaluation of populated buyer states was completed. No product code change requires a new behavior test here.

The audit records remain untracked deliverables in `.design-system/` and `.migration/`; neither has been staged or committed. Duplicated temporary screenshots were removed; the two screenshots cited by the shell review remain.
