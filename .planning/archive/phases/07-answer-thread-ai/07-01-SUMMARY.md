# 07-01 - AE Agent Tool Loop Summary

**Status:** Complete and deployed  
**Completed:** 2026-06-30  
**Production Convex:** https://formal-jaguar-441.convex.cloud  

## Landed Commits

- `e59eeda fix(07): WR-01 repair answer tool loop blockers`
- `5283f68 fix(07): WR-02 fail closed on disabled answer tools`

## What Shipped

- `registry.search` and `registry.detail` are registered AE read actions and are exposed through `/api/agent/tools` with public-fact boundaries.
- The public answer synthesis toolset is whitelisted to exactly `registry.search` and `registry.detail`.
- The LLM answer path now runs a real tool loop: the model can request registry tools, AE runs the action, and the actual safe result JSON is returned to the model before final prose.
- Direct registry/API search remains literal. Misspellings such as `paramata` / `parammata` are not silently rewritten by catalog search.
- Tool evidence persists validated input, safe public result JSON, result summary, result hash, status, and error/refusal state.
- Provider-bearing `complete` is fail-closed: `answerTurns` plus matching `answerToolCalls` must persist first, unless the turn is explicitly non-shareable/error/no-provider.
- Public answer chat stays read-only in v1. `inquiry.submit` remains on explicit qualified-inquiry paths and the quiet agent door, not auto-called from chat prose.
- Static guards now block hidden rewrite paths and production `retrievalQuery` use before catalog search.

## Validation

Passed:

```text
./node_modules/.bin/vitest run tests/unit/answer/answer-tool-use-agent.test.ts tests/unit/answer-thread/tool-runner.test.ts tests/integration/answer-tool-calls.test.ts tests/integration/agent-tools-api.test.ts tests/integration/answer-turn-empty-state.test.ts tests/integration/registry-api.test.ts tests/integration/answer-thread-sidebar.test.ts
```

Result: 7 files, 46 tests passed.

Passed:

```text
npm run typecheck
```

Passed:

```text
npx convex codegen
npm run check:convex-codegen
```

No generated Convex diff remained after codegen.

Passed:

```text
npm run build
```

The build completed successfully. Vite reported an existing CSS optimizer warning for `rounded-[var(--ae-radius-*)]`; it did not fail the build.

Static guards passed with no matches:

```text
rg -n "registry-query-rewrite|AE_LLM_QUERY_REWRITE" src
rg -n "retrievalQuery" src/modules/answer src/modules/answer-thread src/routes/api.answer.ts src/routes/api.answer.turn.ts
```

## Deployment

Convex production deploy completed:

```text
CONVEX_DEPLOYMENT=prod:formal-jaguar-441 npx convex deploy --message "Phase 7 answer tool-loop completion"
```

Production deployment: `https://formal-jaguar-441.convex.cloud`

Indexes added during deploy:

- `answerThreads.by_session_updatedAt`
- `answerThreads.by_threadId`
- `answerToolCalls.by_toolCallId`
- `answerToolCalls.by_turn_seq`
- `answerTurns.by_thread_createdAt`
- `answerTurns.by_turnId`
- `billingReceipts.by_receiptId`
- `billingReconciliations.by_reconciliationId`

## Completion Notes

- This completes the 07-01 Phase 7 answer tool-loop slice.
- The production Convex functions/schema are deployed.
- The web/Vercel frontend was not deployed in this closeout because the repo exposes no deploy script and the requested codegen/deploy path resolved to Convex.
