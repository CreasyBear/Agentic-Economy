# Testing Patterns

**Analysis Date:** 2026-07-14
**Evidence Base:** Live working tree, `package.json`, test/config source, `.github/workflows/kernel-release-gate.yml`, and GitHub Actions through run `29304983501` for exact revision `aca296db9f4f4f2f5e04d1c8331c64f1b4344960`.

## Test Framework

**Runners:**
- Vitest 4.1.9 runs `tests/**/*.test.ts[x]` and `convex/**/*.test.ts` under Node by default (`vitest.config.ts`). DOM tests opt into jsdom; Convex tests opt into edge-runtime and use `convex-test` with a normalized `import.meta.glob` module map.
- Testing Library exercises React semantics in jsdom. Playwright 1.61.1 runs Chromium browser tests from `tests/e2e/`; `playwright.deploy-smoke.config.ts` runs separately against explicit hosted targets.
- Promptfoo plus TypeScript report scripts exercise answer evaluation through `eval/answer/`; this suite is not in the normal source release gate.
- Assertions are explicit Vitest `expect`, Testing Library semantic queries, and Playwright web-first assertions. Snapshot testing is not an established pattern.

**Commands:**
```bash
npm test                                      # All configured Vitest tests
npm run test:unit                             # tests/unit
npm run test:integration                      # tests/integration, serial files
npm run test:types                            # Compile-time/domain contracts
npm run test:imports                          # Clean-source architecture scans
npm run test:ts-standards                     # Unsafe TypeScript source scan
npm run test:copy                             # Human/assistant language guardrails
npm run test:seo                              # Discovery and metadata contracts
npm run test:ui-contract                      # Design/source contract
npm run test:eval                             # Eval audit, report, Promptfoo, Vitest
npm run test:e2e                              # Local compact and wide Chromium
npm run test:a11y                             # Local Playwright accessibility subset
npm run test:all                              # Broad local source gate and build
npm run test:release:source                   # Clean CI source contract and build
npm run test:release:hosted                   # Credentialed exact-deployment readback
npx vitest run tests/unit/customer-request/customer-request-workspace.test.tsx
npx playwright test tests/e2e/a11y/engine-product-a11y.spec.ts
```

## Organization and Scale

**Current live files:**
- `tests/unit/`: 205 `*.test.ts[x]` files, grouped by owned domain.
- `tests/integration/`: 40 files for route, persistence, provider, and multi-module behavior.
- `tests/imports/`: 12 static architecture/source-completeness suites; `tests/types/`, `tests/copy/`, `tests/seo/`, `tests/ui-contract/`, and `tests/eval/` hold specialized contract proof.
- `tests/e2e/`: 9 Playwright specs, including two accessibility specs. `tests/deploy-smoke/`: 5 hosted/provider specs.
- `convex/*.test.ts`: colocated edge-runtime tests where direct Convex execution semantics matter.

```text
tests/
  unit/<domain>/<observable-behavior>.test.ts[x]
  integration/<boundary-or-flow>.test.ts
  imports/ | types/ | copy/ | seo/ | ui-contract/ | eval/
  helpers/<in-memory-port-or-local-contract-server>.ts
  fixtures/bad-*/<intentional-source-violation>.fixture
  e2e/<customer-flow>.spec.ts
  e2e/a11y/<surface>-a11y.spec.ts
  deploy-smoke/<hosted-boundary>.spec.ts
convex/<function-boundary>.test.ts
```

## Test Structure and Seams

- Name suites for a unit/boundary and tests for observable outcomes. For refusals, assert both the returned discriminator and absence of forbidden writes or calls.
- Exercise real schemas, validators, generated functions, indexes, auth identities, and persistence with `convexTest(schema, modules)` rather than mocking Convex internals.
- Prefer explicit injected ports/fetch/clocks and local contract servers over broad module mocks (`tests/helpers/answer-thread-test-port.ts`, `tests/helpers/openrouter-contract-server.ts`).
- UI unit tests stub `fetch` and render real components. `tests/unit/customer-request/customer-request-workspace.test.tsx` proves rendering, request-body shape, clarification, disclosure, recovery, and auth-error presentation; it does not prove a route, Clerk, Convex, registered supply, or provider call.
- Use `it.each` for behavior matrices and concurrent calls plus durable-row inspection for replay, race, idempotency, and atomicity contracts.
- Restore mocks, globals, environment, clocks, ports, and servers after every test. Playwright specs should use accessible roles/labels and assert customer outcomes rather than DOM structure.

## Verification Layers and Their Claims

| Rung | Primary evidence | What it proves | What it does not prove |
|---|---|---|---|
| Typed/static | `npm run typecheck`, `tests/types/`, `tests/imports/`, `tests/ui-contract/` | Types compile; selected ownership, vocabulary, and source-presence invariants hold | Runtime wiring, useful answers, live auth, real provider behavior |
| Unit | `tests/unit/` | Pure semantics, schemas, projections, rendering, adapters under controlled inputs | HTTP/Convex integration or customer journey |
| Integration | `tests/integration/`, `convex/*.test.ts` | Multiple real modules, validators, in-memory Convex persistence, selected routes/adapters | Production deployment, remote auth/config, arbitrary supply |
| Local browser | `tests/e2e/`, `playwright.config.ts` | Real Vite UI, responsive/keyboard semantics, legacy landing/thread flows | Production Clerk/Convex behavior; the local server sets `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true` |
| Clean checkout | CI `source-proof` | `npm ci` plus `test:release:source` and build at one clean SHA | Current dirty workspace, hosted deployment, browser journey |
| Hosted readback | `test:release:hosted` | Exact Vercel deployment ID/revision and authenticated Request discovery/readback | General customer usefulness or arbitrary request success |
| Cold external agent | `tools/release/customer-request-production-smoke.ts`, `src/modules/customer-request/hosted-agent-journey.ts` | Fixed sandbox machine journey through `/api/v1/requests`, clarification/fact, authority stops, resume, options | `/engine`, human sign-in, arbitrary language, live businesses, broad matching |
| Hosted computer use | Manual/agent browser evidence | What a customer can actually see and operate in the deployed UI | Generalizes only to the exact observed scenario and revision |

Never promote one rung into another. Tests and generated maps support proof; production behavior must remain in `src/` and `convex/`.

## CI and Hosted Gates

- `.github/workflows/kernel-release-gate.yml` runs on PRs and pushes to `main`. `source-proof` performs a frozen npm install and `npm run test:release:source`.
- Despite the job name **“Clean source, contract, browser, and build proof,”** `test:release:source` runs no Playwright command. `test:all` also omits E2E, accessibility, Promptfoo, and deploy smokes. A green source job is not browser proof.
- On non-PR `main`, `hosted-proof` refuses a dirty/wrong checkout, deploys exact Vercel source and Convex functions, seeds two labelled sandbox businesses through `convex/sandboxAcceptanceSupply.ts`, verifies exact readback, and runs the fixed external-agent journey.
- Latest observed remote run `29304983501` is green for `aca296db`; the local checkout is at `63f7fac5`, ahead 3/behind 10 with extensive uncommitted files. That run does not certify the local working tree.
- The hosted scenario is intentionally narrow: `Find the cheapest labelled sandbox option.` with wildcard fact `Return a labelled sandbox comparison reference.` It proves the registered sandbox path, not that a fresh user query finds a useful result.

## Why `/engine` Can Fail While Gates Pass

1. **No functional browser spec for `/engine`.** `tests/e2e/a11y/engine-product-a11y.spec.ts` visits `/engine`, fills the textarea, checks absence of upfront budget, keyboard focus, and viewport width. It never clicks `Explore`, signs in, answers clarification, requests options, or sees a result.
2. **UI behavior is mocked below the network.** `tests/unit/customer-request/customer-request-workspace.test.tsx` stubs every `fetch` response, so its green options and clarification flows can coexist with broken auth, routes, Convex deployment, supply, or matching.
3. **Legacy browser journeys exercise a different product path.** `tests/e2e/landing-answer.spec.ts`, `tests/e2e/thread-first.spec.ts`, and `tests/e2e/chat-discovery-inquiry-loop.spec.ts` start at `/` and traverse `/t/*`; they do not cover `src/components/ae/customer-request/AeCustomerRequestWorkspace.tsx` or `/api/requests*` end to end.
4. **Local auth bypass does not prove the Request server path.** `playwright.config.ts` sets `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true`, while `src/lib/server/convex-source.ts` still requires a real Clerk `convex` token for human Request actions. Existing `/engine` browser tests avoid submission, so this integration gap stays invisible.
5. **Hosted proof bypasses the human surface.** `src/modules/customer-request/hosted-agent-journey.ts` calls `/api/v1/requests` with a temporary API key and uses a separate customer session token for authority stops; it never renders `AeCustomerRequestWorkspace`.
6. **The acceptance query is supply-shaped.** CI seeds and asks for the exact labelled sandbox capability. It does not test open-ended language, incomplete intent, unrelated capabilities, no-match recovery from the UI, or whether current registered supply matches a customer's actual query.
7. **Several named smoke scripts are dead.** `package.json` points `test:deploy-smoke:public`, `test:deploy-smoke:inquiry-support`, `test:provider-smoke:resend`, and `test:provider-smoke:novu` at filenames absent from `tests/deploy-smoke/`. Running `npm run test:deploy-smoke:public -- --list` currently reports “No tests found.” The actual files use `phase1-*`/`phase2-*` names.
8. **Static completeness can be presence-based.** `tests/imports/customer-request-source-completeness.test.ts` pins files, strings, imports, and ordering. Valuable architectural guardrails can pass even when the customer flow is unusable.

## Verified Homepage Failure

The public `/` journey is a second, independently failing product path. A hosted query on 2026-07-14 produced an HTTP 200 SSE response with a valid `thread` event followed by `answer_turn_persist_failed`; readback of that thread returned `404 thread_not_found`. `src/components/ae/chat/AeHomeComposer.tsx` ignores stream frames and waits for readback, so the customer sees “Starting your thread” rather than the actual failure.

`tests/unit/chat/home-landing-submit.test.tsx` does not cover this contract: its successful mock is an empty event stream, and its concurrency test leaves fetch pending. A credible regression must assert the streamed error path, durable thread readback, navigation to `/t/:threadId`, and customer-visible recovery. Passing that regression would repair the legacy Answer Thread path; it would not prove parity with the Customer Request engine.

## Required Regression Shape for Customer Queries

For an `/engine` fix, the smallest credible ladder is:

1. Red unit test for the exact state or projection defect, using the canonical `agent-contract.ts` schema.
2. Red integration test crossing the real HTTP handler, authenticated Convex action, durable Request state, capability graph, and generic binding.
3. Functional Playwright flow that submits through `/engine`, handles sign-in or an explicitly faithful authenticated harness, answers only decision-changing clarification, prepares options, and proves visible no-match/error recovery.
4. Clean-checkout release gate that actually invokes that browser spec.
5. Exact-revision hosted browser readback with a cold user session and a query not copied from the seeded capability label.
6. Separate cold external-agent proof over `/api/v1/requests` to retain human/machine parity.

The success assertion is customer-semantic: the user sees what AE understood, why it needs more information, which registered options fit, cost/data/effect/uncertainty, and a recoverable next step. “Endpoint returned 200,” “state reached `options_ready`,” or “source-completeness passed” is insufficient alone.

## Coverage Policy

- There is no line or branch coverage threshold in `vitest.config.ts` or `package.json`. Coverage is contract- and risk-oriented.
- Evaluation has executable case-coverage checks (`test:eval:coverage`, `test:eval:report`), not source-line coverage.
- Scanner fixture mode (`AE_SCAN_MODE=fixtures`) proves guardrails detect known-bad source; clean mode must find zero violations in live source.
- Add tests at the lowest rung that can catch the defect, but close a customer-facing ticket only after the corresponding browser and hosted rungs pass.

---

*Testing analysis: 2026-07-14*
*Update whenever release composition or customer journey coverage changes*
