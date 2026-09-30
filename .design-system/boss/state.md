# Design system audit: aecon

## Ask
> install these skills and scan against aecon (not AEcon) in the current state. use luna max subagents npx skills add arla6ka/skills go hard go deep. actually use the skills
Received 2026-09-30.

## Triage
State: drifting, provisional (7 families with 2+ members; scripted route count 1 is incorrect for the 155 file routes under `src/routes/`).
Intent: audit (scan current state).
Foundation: shadcn+registry, CSS variables in `src/styles/globals.css`.
Host: subagents available; four Luna max read-only workers over the run; shell and browser available.
Signals: `triage/signals.tsv`.
Question: none.

## Route
Audit from `design-system-boss/references/routes.md`. Product code remains read only.
Branch: existing `well-30/rebuild-a`, starting at `939237d833433d50fd02c150dbc3c612b34ce13a`. Another task advanced it to `e1f2b3f59ee785deb114dc195f33c2bda54593e7` during this audit with a local-dev timeout change and test only.
Clearance: not applicable.

## Steps
| # | Step | Skill | State | Record | Verdict | Evidence |
|---|---|---|---|---|---|---|
| 1 | Token mapping | token-mapping | done | returns/token-mapping.md | partial: gap threshold | returns/token-mapping.md |
| 2 | Migration inventory and parity audit | migrate-design-system | done | .migration/2026-09-30-aecon-audit/ | complete at audit plan; source-only buyer parity | .migration/2026-09-30-aecon-audit/plan.md; close.md |
| 3 | Buyer flow review | ui-review | done | review/market-shell-review.md | partial: valid product runtime unavailable | returns/ui-review.md |
| 4 | Component evidence sample | component-docs | done | returns/component-docs.entry.md | complete with NEEDS REVIEW (9); diagnostic sample, not published | returns/component-docs.entry.md |
| 5 | Close and verify reports | design-system-boss | done | .design-system/close.md | complete; check blocked by pre-existing dependency cycles | .design-system/close.md; triage/after/signals.tsv |

## Decisions
| When | Decision | Why | Evidence |
|---|---|---|---|
| 2026-09-30 | Audit route | User requested a current-state scan | Ask; `design-system-boss/references/routes.md` |
| 2026-09-30 | Treat route count as a triage blind spot | `src/routes/` has 155 files while script says 1 | `rg --files src/routes \| wc -l`; `triage/signals.tsv` |
| 2026-09-30 | Use Luna max subagents | User specified model and effort | Ask |
| 2026-09-30 | Stop local runtime startup and keep UI review partial | Joel questioned the need for `dev:local`; structural IA can be audited from source and existing captures | `review/market-shell-review.md` |
| 2026-09-30 | Record the first concurrent commit | A separate task committed the local-dev timeout change during the scan; no reviewed UI source changed | `git show --stat e1f2b3f59` |
| 2026-09-30 | Preserve current branch work after a second concurrent commit | The later chat Quote change does not alter the market UI sources reviewed | `git log -2 --oneline --stat`; `ebfc4c7d2` |
| 2026-09-30 | Treat token gap counts as mapping coverage, not a defect count | The mapped geometry has distinct component roles; only the eyebrow conflict is a direct design-source discrepancy | returns/token-mapping.md; .migration/2026-09-30-aecon-audit/mapping/market.md |

## Gates
| ID | Question | Default | Status | Commit | From |
|---|---|---|---|---|---|
| G-01 | Which local components are stock, customized or superseded? | Treat `src/components/ui/` as the live layer; do not infer legacy paths. | open | — | .migration/2026-09-30-aecon-audit/gates.md G-01 |
| G-02 | Should unpinned remote `@bklit` be the migration target? | Use the pinned in-repo contract. | open | — | .migration/2026-09-30-aecon-audit/gates.md G-02 |
| G-03 | Should comparison align with the documented table rule? | Preserve current presentation during this audit; capture before/after for any later change. | open | — | .migration/2026-09-30-aecon-audit/plan.md P-01 |
| G-04 | How should Seller and missing Quote authority/commercial facts appear? | Preserve current data and invent no identity; treat as product-contract work. | open | — | .migration/2026-09-30-aecon-audit/plan.md P-02 |
| G-05 | Should compact key glyph and tracking values follow current rendering or tokens? | Preserve current rendering until visual contract is reconciled. | open | — | .migration/2026-09-30-aecon-audit/plan.md M-01; returns/token-mapping.md |
| G-06 | How should browse-only filters behave during query search? | Keep current behavior for the read-only audit; surface applicability before a later search change. | open | — | ia.md |

## Resume
Next action: none for this read-only audit. A later implementation should start from the prioritized findings in close.md and the gates above.

## Report
Installed all six `arla6ka/skills` skills and applied the audit, token mapping, migration inventory, UI review and component documentation workflows to the current aecon checkout. The build skill's inventory method informed the scan; its writing workflow was outside this request. The inventory covers 1,507 source files across seven surface groups; detailed IA and parity review focused on the buyer market path. No product screen changed because the request was a current-state scan. The active component layer is local, but zero declared legacy imports does not establish full adoption without a component replacement map. Evidence: [audit plan](</Users/joelchan/Documents/Coding/App-Dev/live/01. Pre-Implementation/Agentic-Economy/.migration/2026-09-30-aecon-audit/plan.md>) and [close counts](</Users/joelchan/Documents/Coding/App-Dev/live/01. Pre-Implementation/Agentic-Economy/.design-system/close.md>).

The clearest current UI mismatch is Compare Tools: its repeated cards conflict with the documented tabular comparison rule. Query search also leaves browse-only filters selectable even though it ignores them and explains that only with results. Eyebrow tracking/weight needs reconciliation between the live market reference and token contract. The Seller and Quote omissions are already identified as forward-looking product work, not new UI regressions. Most raw layout values have component-specific roles and do not justify new global tokens.

Checks: the inventory helper passed syntax, portability and no-mutation `--help` checks; `git diff --check` passed. `npm run check` passed lint, then stopped at `deps:check` on two existing dependency cycles, so later gates did not run. The 390px and 1280px shell captures lack a valid local backend; populated catalogue, interaction, accessibility and the full buyer journey remain unverified. Audit records are untracked and no product source was edited or committed.

Next: for a later implementation, resolve the comparison layout, show filter applicability before search, and choose the canonical eyebrow value. [Source-only IA review](</Users/joelchan/Documents/Coding/App-Dev/live/01. Pre-Implementation/Agentic-Economy/.design-system/boss/ia.md>) gives the exact call sites and limits.
