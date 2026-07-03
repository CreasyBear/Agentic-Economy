# Doctor + Partial Matt Pocock Audit — 2026-07-03

## Scope

- React Doctor full repo audit refreshed in `.planning/react-doctor/`.
- Partial Matt Pocock-style review run against the current WIP answer/thread/harness/chat/eval subset.
- Matt fixed point: `HEAD` at `006a486 docs: map existing codebase`.
- Full dirty tree at scope selection time: 315 changed files. Matt scope intentionally limited to the answer/thread/harness subset because the request asked for “some of” the Matt Pocock full audit.

## Commands / Evidence

```bash
npm run doctor -- --scope full --verbose --output-dir .planning/react-doctor --json --json-out .planning/react-doctor/diagnostics.json --no-score --blocking none -y .
```

React Doctor output:

- Full diagnostics directory: `.planning/react-doctor/`
- JSON report: `.planning/react-doctor/diagnostics.json`
- React Doctor version: `0.6.2`
- Elapsed: `6420.874417ms`
- CLI `ok`: `true`

Matt scoped diff command:

```bash
git diff HEAD -- .planning/ANSWER-AI-CONTRACT.md .planning/phases/07-answer-thread-ai src/modules/answer src/modules/answer-thread src/modules/harness src/components/ae/chat src/components/ae/artifacts src/routes/api.answer.ts src/routes/api.answer.turn.ts src/routes/api.chat.ts src/routes/t.$threadId.tsx tests/unit/chat tests/unit/answer tests/unit/answer-thread tests/unit/harness tests/integration/answer-tool-calls.test.ts tests/integration/answer-turn-empty-state.test.ts tests/integration/answer-thread-share.test.ts tests/eval eval/answer convex/answerThreads.ts convex/harnessSessions.ts
```

Matt scoped changed-file count: 54 files.

## React Doctor Summary

| Metric | Count |
| --- | ---: |
| Total diagnostics | 415 |
| Errors | 0 |
| Warnings | 415 |
| Affected files | 156 |
| Score | Not requested (`--no-score`) |

### Diagnostics by category

| Category | Count |
| --- | ---: |
| Maintainability | 281 |
| Performance | 106 |
| Bugs | 16 |
| Security | 6 |
| Accessibility | 6 |

### Top rules

| Rule | Count | Severity | Sample files |
| --- | ---: | --- | --- |
| `unused-export` | 155 | warning | `convex/_generated/api.js:21`, `convex/_generated/api.js:23`, `convex/_generated/server.js:29` |
| `async-await-in-loop` | 62 | warning | `convex/answerThreads.ts:166`, `convex/answerThreads.ts:260`, `convex/answerThreads.ts:301` |
| `no-multi-comp` | 45 | warning | `src/components/ae/primitives/AeCollapsible.tsx:53`, `src/components/ae/primitives/AeCollapsible.tsx:89`, `src/components/ai-elements/message.tsx:28` |
| `only-export-components` | 35 | warning | `src/routes/$slug.inquiry.tsx:59`, `src/routes/admin.audit-events.tsx:9`, `src/routes/admin.business-actions.tsx:134` |
| `unused-file` | 21 | warning | `convex/answerThreads.ts`, `convex/billing.ts`, `convex/billingStore.ts` |
| `jsx-no-jsx-as-prop` | 18 | warning | `src/app/ai-chat/page.tsx:311`, `src/app/ai-chat/page.tsx:372`, `src/app/ai-chat/page.tsx:374` |
| `zod-v4-no-deprecated-schema-apis` | 12 | warning | `src/modules/inquiries/inquiry.actions.ts:10`, `src/modules/registry/registry.actions.ts:68` |
| `js-combine-iterations` | 7 | warning | `src/app/library/page.tsx:418`, `src/components/ae/chat/AeChat.tsx:388`, `src/components/ae/chat/AeModelSelector.tsx:26` |
| `control-has-associated-label` | 5 | warning | `src/routes/claim.tsx:417`, `src/routes/privacy.remove-business.tsx:159` |

### React Doctor errors

Latest rerun has **0 errors**. The original four errors are resolved:

1. `src/components/ae/chat/AeThreadMessageScroller.tsx` no longer updates scrollable state inside the prop-driven repositioning effect.
2. `src/components/ae/layout/AeOperatorBreadcrumbs.tsx` no longer passes item props through a spread that can overwrite React keys.
3. `src/routes/claim.tsx` no longer passes `status={undefined}` to `Field` and keeps the `key` explicit outside any prop spread.

### React Doctor triage

P0:

- Resolved in the remediation pass below. React Doctor rerun reports 0 errors.
P1:

- Audit whether `unused-file` / `unused-export` findings are false positives for Convex/TanStack/generated surfaces before deleting anything. Generated files and framework-discovered route/function modules can look unused to static analysis.
- Prioritize real `async-await-in-loop` findings in Convex/public request paths where sequential awaits increase latency or block provider/source reads.
- Fix accessibility warnings on public forms/buttons before visual polish.

P2:

- Treat `no-multi-comp`, `only-export-components`, and `jsx-no-jsx-as-prop` as cleanup candidates after behavior/spec issues are resolved.
- Keep the intentional PostHog supply-chain warning visible per `doctor.config.ts`.

## Matt Pocock Review — Standards Axis

- **High — `convex/answerThreads.ts` (`patchAnswerTurnEvidence`, added around lines 326-358); `src/modules/answer-thread/answer-thread.functions.ts` (`patchAnswerTurnEvidenceMutation`).**  
  Source: `convex/_generated/ai/guidelines.md` says public Convex functions are exposed to the Internet and sensitive internal functions must not use public `query`/`mutation`; it also says authorization identity must be derived server-side. `CONVENTIONS.md` says Convex functions need server-derived auth and source-write boundaries. The diff adds a public `mutationGeneric` that overwrites private `evidenceJson` using caller-supplied `turnId`, `threadId`, and `pseudonymousSessionId`. That is an internal evidence repair/write path, not a public anonymous mutation, and it authorizes from a user-supplied session identifier rather than a server/auth/source-write boundary.

- **Medium — `convex/answerThreads.ts` (`patchAnswerTurnEvidence`, added throws around lines 339-353).**  
  Source: `CONVENTIONS.md` Error Handling: expected business states should be exact discriminated unions; throw `Error` only for impossible invariants, route-local consistency bugs, or misconfiguration. The new mutation throws `thread_not_found`, `thread_forbidden`, and `turn_not_found` for ordinary not-found/forbidden states instead of returning typed outcomes/stable reasons.

- **Medium — `src/modules/answer-thread/internal/answer-turn-finalization.ts` lines 133-143 plus `src/modules/answer-thread/internal/turn-orchestrator.ts` lines 255-276.**  
  Source: `CONVENTIONS.md` requires typed source-write failures; `ANSWER-AI-CONTRACT.md`/`AI-SPEC.md` require persisted turns to carry the private `harnessRun` rollup and runtime-fed evidence. `patchAnswerTurnHarnessRun` catches every patch failure and returns `false`, and the orchestrator ignores that result before emitting `complete`. A completed provider-bearing turn can therefore proceed with stale/incomplete harness evidence without a typed outcome or error path.

- **High — `src/components/ae/chat/AeChatWelcome.tsx` lines 7-23 and 45-66.**  
  Source: `AGENTS.md` and `DESIGN.md` explicitly ban “3-column icon grids” as AI-slop. The diff adds exactly three icon-led trust cards (`SearchIcon`, `ShieldCheckIcon`, `SparklesIcon`) rendered in a responsive `Grid`, which will become the banned three-card icon grid on the public chat welcome surface.

- **Medium — `src/components/ae/chat/AeThreadTurnStreamSection.tsx` line 191 and `src/components/ae/chat/AeModelSelector.tsx` line 63.**  
  Source: `DESIGN.md`/`CONVENTIONS.md` say Tailwind is layout glue, raw/arbitrary visual tokens are prohibited, and semantic tokens/components should own styling. The retry button adds `underline-offset-[3px]`; the model selector hard-codes `width="min(18.75rem,calc(100vw-2*var(--ae-public-gutter)))"`. Both introduce ad-hoc visual values in product-owned chat UI instead of Astryx/tokenized styling.

## Matt Pocock Review — Spec Axis

1. **P0 hard violation — `src/modules/answer-thread/internal/answer-turn-finalization.ts` / `src/modules/answer-thread/answer-thread.schema.ts` / `src/modules/answer-thread/internal/tool-runner.ts`**  
   Spec source: `.planning/ANSWER-AI-CONTRACT.md:71-73`; `.planning/phases/07-answer-thread-ai/07-ENGINEERING-PLAN.md:180-190,401-402`; `07-01-ae-agent-tool-loop-PLAN.md:63-66,94-96,140-142`.  
   Mismatch: the tool runner carries `resultJson` transiently (`tool-runner.ts:192-198`), but the persisted `AnswerToolCallRecord`/Convex row shape only keeps `inputJson`, `resultSummaryJson`, `resultHash`, and `status` (`answer-thread.schema.ts:68-77`; finalization maps only those at `answer-turn-finalization.ts:208-216`). The spec requires reconstructable safe public result JSON per turn, not only slugs/hash/summary. This means `answerToolCalls` cannot independently reconstruct the catalog payload that grounded provider-bearing answers.

2. **P1 hard/partial — `src/modules/answer-thread/internal/turn-orchestrator.ts` and `src/modules/answer/answer-synthesizer.ts`**  
   Spec source: `.planning/ANSWER-AI-CONTRACT.md:132-134`; `.planning/AI-SPEC.md:390-400,486-501`; `07-01-ae-agent-tool-loop-PLAN.md:101-108,147`.  
   Mismatch: the public stream/persisted work log still serializes internal trace identifiers. `AnswerWorkStep` includes public `id`/`phase` (`answer-synthesizer.ts:74-85`) and the stream emits them as `{ type: 'work-step' }` (`answer-synthesizer.ts:152-156`; `turn-orchestrator.ts:1442-1447`) with values like `search.registry.initial` (`turn-orchestrator.ts:731-739`), `route.clarify`, and `assemble.answer`. The spec allows sanitized operation events/check summaries, but forbids public raw tool evidence/internal trace names. Human UI may hide the ids, but the public SSE/projection contract still exposes them.

3. **P3 judgement call / implemented wrong — `src/components/ae/chat/AeThreadSidebar.tsx` and `src/components/ae/chat/AeChat.tsx`**  
   Spec source: `.planning/ANSWER-AI-CONTRACT.md:23-26,33-35`; `.planning/phases/07-answer-thread-ai/07-ENGINEERING-PLAN.md:229-231,397,412`.  
   Mismatch: the diff changes “New question” / unavailable-thread recovery to literal `href="/?q="` (`AeThreadSidebar.tsx` hunk replacing `Link to="/" search={defaultHomeSearch}`; `AeChat.tsx` hunk replacing `/` with `/?q=`). `/?q=` is documented as deprecated legacy convenience for creating a turn from a real query, while the new-thread surface is `/`. Empty `q=` links muddy the thread-first contract and can route through legacy compatibility instead of the welcome-only home state.

## Recommended Fix Order

1. Fix the Matt P0: persist reconstructable safe public `resultJson` for `answerToolCalls` and prove public projection still strips private/raw evidence.
2. Remove or internalize `patchAnswerTurnEvidence`; if repair is required, make it internal/source-write-admitted and return typed outcomes.
3. Make provider-bearing `complete` fail closed when harness/evidence patching fails, or mark the turn explicitly non-shareable/no-provider.
4. Sanitize public SSE work-step payloads so public clients see only human-safe step copy/status, not `search.registry.initial`, `route.clarify`, or `assemble.answer` trace ids/phases.
5. Replace empty `/?q=` navigation with `/` for new-thread/recovery links.
6. Fix React Doctor’s 4 errors.
7. Remove the 3-icon trust grid from `AeChatWelcome` or recast it as non-icon/non-3-card copy that passes `DESIGN.md`.
8. Clean the raw visual values in chat controls.
9. Triage React Doctor warnings after generated/framework false positives are classified.

## Remediation Applied

Implemented fixes from the recommended order:

1. Persisted reconstructable `resultJson` on `answerToolCalls` rows, including schema, Convex insert/readback, test ports, and fixtures.
2. Removed the public `patchAnswerTurnEvidence` repair path and removed the ignored `patchAnswerTurnHarnessRun` follow-up write from the turn orchestrator.
3. Moved harness evidence into the atomic turn persistence path so completed turns persist the harness rollup before `complete`.
4. Sanitized public work-log ids/phases to stable `step-N` ids and broad public phases before SSE emission and share projection.
5. Replaced empty home `/?q=` links with `/`; the home route now omits `q` from validated search state when empty.
6. Fixed the four React Doctor errors listed above.
7. Removed the banned three-card icon trust grid from `AeChatWelcome`.
8. Moved the retry underline styling into token-backed CSS and removed the hard-coded model-selector popover width prop.

## Verification Performed

- `npm run typecheck` — passed.
- `npm run test -- tests/integration/answer-turn-empty-state.test.ts tests/integration/answer-tool-calls.test.ts tests/unit/answer-thread/public-projection.test.ts tests/unit/answer-thread/answer-harness-operation.test.ts tests/unit/answer-thread/answer-run-summary.test.ts tests/unit/answer-thread/tool-runner.test.ts tests/unit/harness/run-viewer-projection.test.ts tests/unit/harness/run-viewer-functions.test.ts tests/unit/chat/ae-chat-route-promotion.test.ts tests/unit/public-layout-contract.test.ts` — 9 files passed, 36 tests passed.
- `npm run test:copy` — 5 files passed, 46 tests passed.
- `npm run test:ui-contract` — 6 files passed, 36 tests passed.
- `npm run test:eval` — answer eval suite passed 12 cases / 14 turns, Promptfoo passed 27/27, Vitest eval passed 2 files / 23 tests.
- Final React Doctor rerun with the same command above — 0 errors, 415 warnings.

## Remaining Follow-up

- React Doctor still reports 415 warnings. Next triage remains generated/framework false positives first (`unused-export`, `unused-file`), then real public-path performance/a11y warnings.
