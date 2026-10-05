> **Archived 5 October 2026.** Dated evidence or proposal; not a current work queue or approval. See the [archive index](../../../../README.md) for its successor and remaining limits.

# Type safety and tests — 29 September 2026

**Verdict.** Hand-written `src/` and `convex/` are strict and almost free of `any` (0 `as any`, 0 `: any`, 0 `as unknown as`, 0 `@ts-expect-error` / `@ts-ignore`). The hole is the standards ratchet: its non-null pattern only matches `!` at end of line, so **55 runtime `!` assertions pass `test:ts-standards`**, including payment signing and Formance writes. Tests are numerous (850 files, ~6,132 `it`/`test`) but Convex lib is 561 source files to 14 colocated tests.

HEAD `722d85158`. Scanned `src convex tests tools scripts`, excluding `node_modules`, `vendor`, `packages/cli/dist`, `convex/_generated`. Counts are comment-stripped. This was not a test run.

## Metrics

| Metric | Value | Command / path |
|---|---|---|
| Compiler | `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `useUnknownInCatchVariables` | `tsconfig.json:10-15` |
| Prod `as any` / `: any` / `<any>` / `as unknown as` | 161 / 1 / 2 / 7 | comment-stripped walk; 155 `as any` and `@ts-nocheck` are generated `src/routeTree.gen.ts:3,172` |
| Hand-written prod holes | 6 `as any`, 1 `: any`, 1 `<any>`, 6 `as unknown as` | all in `tools/` plus `scripts/audit-action-surfaces.ts:188`; none in `src/` or `convex/` except the generated file |
| Runtime `!` the ratchet misses | 55 across 32 files; scanner matches 0 | pattern `src/lib/ui/contract-scans.ts:134` requires `!` then `; , ) ] }` or end of line |
| `v.any()` outside the scanner text | 8, each a commented JSON or UIMessage boundary | `convex/chatMessages.ts:127-128`; `convex/lib/capabilitySupply/tool/contracts.ts:107,137,184-185`; `originMap.ts:43,45`; `src/modules/capability-execution/internal/convex-schema.ts:20` |
| Lint disables, hand-written | 10 prod + 2 test; 0 `@ts-ignore` | `src/components/ai-elements/code-block.tsx` holds 6 of the prod lines |
| Test files / `it`+`test` | 850 / ~6,132 | unit 659/5,116; integration 64/350; imports 32/114; src colocated 41/252; convex colocated 21/138; e2e+smoke 12/34; eval 9/50 |
| `vi.mock(` | 517 calls in 197 files | 13 files have 7+, 32 have 4–6, 152 have 1–3 |
| Skip / todo | 8 `test.skip` (missing env), 3 `it.todo` (documented N/A) | `tests/e2e/**`; `tests/integration/catalogue-hostile-inputs.test.ts:211,403,415` |
| Convex lib source : colocated test | 561 : 14; 10 of 17 domains have zero | `find convex/lib -name '*.ts'` |
| Weakest module file ratio | business 0/9, chat-sharing 0/4; market 30/35; chat 16/8 | `src/modules/<m>` against `tests/unit/<m>` plus colocated |

`@typescript-eslint/no-explicit-any` is off for `tests/**` and `tools/**` (`oxlint.config.ts:64-70`). Tests themselves hold 233 `as unknown as` and 15 `as any`.

## Findings

1. **The ratchet misses every live `!`.** `tests/imports/ts-standards.test.ts:27` expects zero violations, and the fixture only plants `maybe!` at end of line (`tests/fixtures/bad-ts-standards/unsafe.fixture:3`). Signing and money still assert: `src/modules/capability-supply/internal/cdp-x402-payment-signing.ts:203-204` (`cdp!`, `account!`, no prior null check), `src/modules/money/internal/formance-writes.ts:110` (9 hits on `commands[0]!`), `src/modules/registry/internal/services-api-projection.ts:342` (`scaled[0]!.minimum!.units`). Fix: also match `!` before `.`, `[`, or `(`, exclude `!=` and Tailwind `!` utilities, then replace the 55 with a narrowed binding or an explicit empty refusal.

2. **Convex depth is tested from the outside.** `convex/lib/capabilitySupply` is 133 files / 3 colocated tests; money 91/2; capabilityExecution 80/1; principalAccount 59/0; agentAccess 33/0; chat 29/0. `tests/unit/convex` has 99 files, so the behaviour is not untested, but a lib edit cannot follow the colocated-test rule in `docs/operations/convex-root-protocol.md:15`. Fix: put the next edit's test beside that concern. Do not start a new suite.

3. **Four modules have no unit directory.** `business` (9 files), `chat-sharing` (4), `workspace-invitation` (1), and `workspace-membership` (1) are ratio 0.00. Authority is 2 tests / 13 files. Fix: one public-seam behaviour test each for business and chat-sharing. Leave the one-file modules until they grow.

4. **The heaviest mocks sit on route and UI seams.** Top files: `tests/unit/chat/chat-provider-boundary.test.tsx` (11), `tests/unit/routes/agent-access-caller-continuation.test.tsx` (11), `tests/unit/ui/provider-workspace.test.tsx` (11), `src/components/ae/settings/agent-keys/useAgentKeysSettings.test.ts` (10). 152 of 197 files have only 1–3 mocks. Fix: keep mocks at the Clerk or Convex boundary; do not add one inside `src/modules`.

5. **Dev tools still parse evidence as `any`.** `tools/dev/full-yolo-process-worker.ts:28,67,74` and `tools/dev/unrestricted-test-only-evidence-packet.ts:216-218`. The runtime scan covers only `src` and `convex` (`tests/imports/scan-targets.ts:4-6`). Fix: decode those two reads with the existing packet schema.

The `it.todo` rows are intentional non-cases (GET routes have no body), not unfinished tests. The e2e skips are "no Clerk keys" guards, so the default browser job does not prove signed-in commerce.

## Track

```bash
# 1. runtime ! the ratchet misses (target 0 once the pattern is fixed)
rg -n --pcre2 '(?:\]|\)|[A-Za-z0-9_$])!(?:\.|\[|\()' src convex -g '!*.test.ts' -g '!**/_generated/**'

# 2. hand-written any / double cast outside the generated route tree
rg -n -g '!*.test.ts' -g '!**/routeTree.gen.ts' -g '!**/_generated/**' 'as unknown as|\bas any\b|:\s*any\b' src convex

# 3. convex/lib files with no colocated test
find convex/lib -name '*.ts' ! -name '*.test.ts' | wc -l; find convex/lib -name '*.test.ts' | wc -l

# 4. modules whose tests/unit twin is missing
for d in src/modules/*/; do b=$(basename "$d"); test -d "tests/unit/$b" || echo "$b"; done

# 5. mock weight (files and calls)
rg -o 'vi\.mock\(' tests src convex -g '!node_modules/**' | wc -l
```
