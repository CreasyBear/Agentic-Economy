# react-doctor audit — AE frontend (canonical scan)

- react-doctor version: 0.5.8
- scan mode: full (lint + dead-code) · framework: tanstack-start · react: 19.2.7
- scan root: /Users/skchan/Jcsyc_Projects/agentic-economy (repo root, scoped to src/ via ignore.files)
- scannedFileCount (react-doctor metric): 163 · sourceFileCount (enumerated): 609
- elapsed: 10471 ms · supplyChain disabled · --no-score

## Totals
- Total diagnostics: 391
- src/ findings: 388 across 142 files
- non-src findings: 3 -> `package.json` (unused-dependency dead-code on package.json; kept for completeness, filter by path)
- Errors: 38 · Warnings: 353 · Affected files: 143

## By severity (src only)
- `warning`: 350
- `error`: 38

## By category (src only)
- `Maintainability`: 279
- `Accessibility`: 47
- `Bugs`: 38
- `Performance`: 21
- `Security`: 3

## By rule (src only, all)
- `unused-export`: 149
- `only-export-components`: 49
- `no-multi-comp`: 47
- `aria-role`: 34
- `unused-file`: 16
- `prefer-tag-over-role`: 10
- `circular-dependency`: 7
- `no-react19-deprecated-apis`: 6
- `rendering-hydration-no-flicker`: 6
- `no-initialize-state`: 6
- `rerender-memo-with-default-value`: 6
- `prefer-useReducer`: 5
- `no-derived-state`: 5
- `no-adjust-state-on-prop-change`: 4
- `no-render-in-render`: 4
- `no-fetch-in-effect`: 3
- `rerender-state-only-in-handlers`: 3
- `no-cascading-set-state`: 3
- `exhaustive-deps`: 3
- `js-combine-iterations`: 3
- `tanstack-start-no-anchor-element`: 3
- `iframe-missing-sandbox`: 2
- `no-array-index-as-key`: 2
- `use-lazy-motion`: 2
- `no-many-boolean-props`: 1
- `no-chain-state-updates`: 1
- `no-event-handler`: 1
- `no-derived-useState`: 1
- `heading-has-content`: 1
- `label-has-associated-control`: 1
- `click-events-have-key-events`: 1
- `button-has-type`: 1
- `jsx-no-constructed-context-values`: 1
- `insecure-crypto-risk`: 1

## Top 15 files by finding density (src)
| # | findings | file |
|---|---|---|
| 1 | 14 | `src/modules/billing/billing.functions.ts` |
| 2 | 13 | `src/components/ae/chat/AeChat.tsx` |
| 3 | 12 | `src/routes/admin.business-actions.tsx` |
| 4 | 11 | `src/components/ai-elements/message.tsx` |
| 5 | 10 | `src/routes/owner.inquiries.$threadId.tsx` |
| 6 | 9 | `src/modules/answer/openui/ae-library.tsx` |
| 7 | 9 | `src/routes/admin.inquiries.tsx` |
| 8 | 8 | `src/routes/admin.monetization.$operationId.tsx` |
| 9 | 8 | `src/routes/admin.monetization.tsx` |
| 10 | 7 | `src/modules/observability/funnel.functions.ts` |
| 11 | 7 | `src/modules/security/internal/validators.ts` |
| 12 | 7 | `src/routes/owner.actions.$proposalId.tsx` |
| 13 | 6 | `src/modules/protected-action/contact-follow-up.functions.ts` |
| 14 | 6 | `src/routes/admin.protected-actions.tsx` |
| 15 | 6 | `src/routes/claim.tsx` |

## 5 highest-severity findings (verbatim, error-severity)

**1. [error] `no-adjust-state-on-prop-change` · `Bugs` · src/components/ae/chat/AeChat.tsx:96**
> This effect adjusts state after a prop changes, so users briefly see the stale value.
> _help:_ Adjust the state inline during render with a `prev`-prop comparison (`if (prop !== prevProp) { setPrevProp(prop); setX(...); }`), or refactor to remove the duplicated state. Routing the adjustment through a useEffect forces an extra render with a stale UI between the two commits. See https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes

**2. [error] `no-adjust-state-on-prop-change` · `Bugs` · src/components/ae/chat/AeChat.tsx:101**
> This effect adjusts state after a prop changes, so users briefly see the stale value.
> _help:_ Adjust the state inline during render with a `prev`-prop comparison (`if (prop !== prevProp) { setPrevProp(prop); setX(...); }`), or refactor to remove the duplicated state. Routing the adjustment through a useEffect forces an extra render with a stale UI between the two commits. See https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes

**3. [error] `no-adjust-state-on-prop-change` · `Bugs` · src/components/ae/chat/AeChat.tsx:106**
> This effect adjusts state after a prop changes, so users briefly see the stale value.
> _help:_ Adjust the state inline during render with a `prev`-prop comparison (`if (prop !== prevProp) { setPrevProp(prop); setX(...); }`), or refactor to remove the duplicated state. Routing the adjustment through a useEffect forces an extra render with a stale UI between the two commits. See https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes

**4. [error] `no-adjust-state-on-prop-change` · `Bugs` · src/components/ae/chat/AeChat.tsx:122**
> This effect adjusts state after a prop changes, so users briefly see the stale value.
> _help:_ Adjust the state inline during render with a `prev`-prop comparison (`if (prop !== prevProp) { setPrevProp(prop); setX(...); }`), or refactor to remove the duplicated state. Routing the adjustment through a useEffect forces an extra render with a stale UI between the two commits. See https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes

**5. [error] `aria-role` · `Accessibility` · src/routes/admin.audit-events.tsx:30**
> This `role` is not a valid ARIA role, so assistive tech cannot expose it correctly. Use a real, non-abstract role. `admin` is not one.
> _help:_ Use a real, non-abstract ARIA role so assistive tech can expose the element correctly.

## Methodology & caveats
- Config lived outside the repo at /tmp/rd-home/doctor.config.json for the first probe; final canonical run used a transient repo-root doctor.config.json (deleted) so react-doctor honored the real .gitignore. Auto-created .planning/react-doctor/ diagnostics dump also deleted. Repo working tree otherwise untouched.
- Dirs react-doctor refused to auto-ignore via .gitignore (gitignored but still scanned until force-listed in ignore.files): .output/**, .codex/**, playwright-report/**. node_modules / dist / graphify-out WERE auto-ignored.
- Scoping that did NOT work: (a) scanning src/ directly as the directory (no project package.json at scan root) degraded coverage to ~163 files and suppressed dead-code context; (b) /tmp config + rootDir redirect broke .gitignore respect and leaked build artifacts. The repo-root scan reported here is canonical.
- Coverage caveat: react-doctor reports scannedFileCount=163 vs ~377 tracked src .ts/.tsx files (excl. future-phases + routeTree.gen.ts). Dead-code ran with 0 failures (skippedChecks empty); it produced only the listed unused-export / unused-file / circular-dependency findings. Treat the dedicated dead-code agent as authoritative for dead code.
- Flags guessed/derived from --help + dist inspection (no docs consulted): there is NO --ignore/--include CLI glob flag; scoping is doctor.config.* ignore.files only. REACT_DOCTOR_CONFIG_DIR affects only react-doctor state store, NOT config discovery.

## Raw data
- Full react-doctor JSON (original structure preserved): local://audits/rd-findings.json