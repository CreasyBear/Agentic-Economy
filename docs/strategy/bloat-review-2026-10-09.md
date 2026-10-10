# Bloat design review, 2026-10-09

This is an independent third-party review: six haiku mappers, then a product reviewer and an architecture reviewer (both opus), then an opus judge. It was read-only, with no code changed. The full reviewer texts are in the session workflow output.

## Verdict
Agentic Economy has legs. The core loop is real, working code: admit provider, list, discover, fixed quote, fund, call, record, receipt, remedy. It runs mainly in `convex/lib/capabilityExecution` (14,541 LOC, of which `callLifecycle` is 6,613) and is exposed through the MCP, HTTP v1 and `ae` CLI surfaces. Of about 610k tracked TS LOC (tests included), about 95–110k (roughly 17%) can be deleted with low risk and no change to the loop, and folding duplicate structure could take the total to about 50%.

## The core to keep (paths)
- **Paid call:** `convex/lib/capabilityExecution` (14.5k), including `callLifecycle` and `quotes`.
- **Recovery:** `src/modules/capability-execution/call-worker/recovery/*`.
- **Money:** `convex/lib/money/x402PaymentAttempt` (2.4k), plus `money/funding` and `money/documents` (1.3k).
- **Supply:** `convex/lib/capabilitySupply/{admission,publish,providerConnections}`.
- **Market:** `convex/lib/market/directoryIndex`.
- **Agent access:** `convex/lib/agentAccess` (5.2k), including `spendingPolicy`.
- **Domain logic and schema:** `src/modules/*/schema.ts`. `convex/schema.ts:2-15` imports them, so they are the live schema.
- **Surfaces:**
  - `src/lib/server/mcp-api.ts` (940)
  - `src/lib/server/call-api.ts` (878)
  - `src/routes/api.v1.*` (1.3k)
  - `tools/ae` (8.5k)
- **Migrations:** `convex/migrations.ts`, which is registered in `convex.config.ts:78`.

## Cut list
| # | Path | ~LOC | Kind | Replacement | Risk |
|---|---|---|---|---|---|
| 1 | `docs/archive/2026-10-05/` (168 files) | 31k text | Archive | git history | Zero |
| 2 | `tools/dev/jev-*`, `tools/eval/selection-*`, `eval/` + `tests/eval` | 4.6k (1,888+504+2,199) | Dead experiments | Nothing | Zero |
| 3 | `docs/operations/mercator-maturity-register.md`, plus `deployments.md` after line 46 | 3.4k | Ledger docs | git log and issues; keep the 40-line map | Zero |
| 4 | `src/components/ui/sidebar.tsx` | 725 | Dead UI (0 importers) | Nothing | Zero |
| 5 | `convex/workspaceAccounts.ts`, `workspaceInvitations.ts`, `workspaceMemberships.ts`, `convex/capabilityServiceUsage.ts` | ~300 | Dead Convex modules (only refs are `_generated` and the snapshot fixture) | Nothing (keep the `capabilityServiceUsageRecords` table) | Low |
| 6 | `tests/fixtures/convex-api-kind-snapshot.json` plus its scan helper | 5.2k | Process test | Nothing | Low |
| 7 | `tests/unit/release` + `tests/unit/deployment` | 5.1k (2,788+2,269) | Process tests | Nothing | Low |
| 8 | `tools/release/tool-gateway-production-smoke*` plus its tests | 7.3k (5,358+~1.9k) | Release ceremony | One scripted `ae` CLI scenario against hosted | Low |
| 9 | Tests that `readFileSync` their own source | ~3.2k | Source-reading tests | Nothing | Low |
| 10 | `src/components/reui` | 5.7k | Second UI library | Arc (7 importers to migrate) | Low |
| 11 | `src/components/ae/admin` + `convex/lib/adminConsole` + `convex/adminConsole*` + 43 `_operator` routes | ~16.8k (10,494+5,362+424+~500) | Operator console | Convex dashboard plus one read-only exceptions/remedy queue | Medium |
| 12 | `convex/lib/capabilitySupply/{ownerFunnel,ownerStaging,providerOffboarding}` folded into `publish` | ~2.5k net (3,818 into 1,186) | Duplicate pipelines | One publish path; offboarding becomes a status plus settling pending calls | Medium |
| 13 | `providerConnectionAttempts`, `providerConnectionOwner` folded into `providerConnections` | ~2k net (6.8k total down to ~4k) | Folder sprawl | One lifecycle folder | Medium |
| 14 | `convex/lib/capabilitySupply/{graphPorts,publicationPorts}` + `src/modules/capability-supply/internal/graph/ports` | ~1k | Ports with a dev-only implementer | Direct calls | Medium |
| 15 | `src/components/ae/supply` + `ae/offerings` | ~8k of 11.2k | Wizards | One listing form; CLI concierge for the first providers | Medium |

## Sequencing
**Wave 1: zero risk (rows 1–5, about 40k).**
- Delete the archive, the dead experiments, the dead files and the ledger docs.
- Proof: `npx tsc --noEmit`, `npx convex codegen`, then one paid `ae` CLI call on dev that returns a receipt.

**Wave 2: test and UI ceremony (rows 6–10, about 26k).**
- Remove the process tests and the smoke tooling.
- Replace them with a single `ae` scenario script (discover, quote, call, receipt, refund) run against hosted.
- Migrate the 7 reui importers to Arc.
- Proof: that scenario passes through the CLI, MCP and `/api/v1`.

**Wave 3: structural folds (rows 11–15, about 30k).**
- Do one fold per PR: admin, then publication, then connections, then ports, then supply UI.
- Proof for each PR: a provider is admitted through the CLI, then listed and found through MCP, then called through HTTP, and an operator sees the remedy queue.

## Do not cut
- **The dispatch/finalize state machine.** That is `callLifecycle`, `quotes` and `x402PaymentAttempt`.
- **The x402 money and boundary tests.** This code moves real money.
- **Receipts, statements and remedy data.** They are the product. Merge the three receipt UIs into one view, but keep the data model.
- **`spendingPolicy`.** Fold the other spend-limit implementations into it.
- **The three-tier split.** Convex routes by file, so the top-level shims are required, and `src/modules/*/schema.ts` is the live schema.
- **`src/components/ai-elements` (529).** `ae/market/DirectoryToolPlayground.tsx` imports it.
- **`convex/migrations.ts`.**
- **Treasury (`money/treasury`, 2,661, 24 outside refs).** Hold it until the admin fold shows which reads survive.
- **OAuth (`agentAccess/oauth`, about 6.5k).** First run a spike on whether Clerk supports MCP dynamic client registration; do not cut it on a guess.

## Anti-regrowth rules
1. **Name the loop step and a real counterparty.** Every new folder or module states which loop step it serves (find, quote, pay, call, record or remedy) and who is using it this month.
2. **Two production callers.** A new file or module needs at least two production callers to merge; one caller means inline it. Enforce this in the existing `src/modules/module-boundaries.ts`.
3. **Docs describe the current state only.** History lives in git, and nothing new goes into `docs/archive`.
4. **Ratchet non-test LOC.** CI fails when non-test LOC grows unless the PR moves completed paid calls. Delete the other gate scripts.

## Disagreements and how I ruled
- **ai-elements.** The architecture review said cut it; it has one importer, so it stays. Product was right.
- **"Duplicate" x402 recovery.** Product called the two x402 files diverged copies; I refuted that. `call-worker/recovery/x402.ts` exports `prepareX402RecoveryEvidence` and is used by `recovery/reconciliation.ts:12`. `providerConsequence/x402.ts` is the Convex RPC handler `authorizeProviderConsequenceX402Rpc*`. They are different concepts, so both stay.
- **Merging `src/modules` into `convex/lib`.** Product's proposal is rejected for now. `convex/schema.ts` and 329 lib files depend on modules, so a merge is a rewrite and not a cut. Fold within each tier first.
- **Ports.** Architecture is partly upheld. `CapabilityGraphPorts` is only supplied through `developmentOnlySuppliedQuoteQualificationPorts`, so I took row 14 at medium risk.
- **Treasury.** Product said cut it and architecture was silent. I deferred it because it has 24 outside refs; revisit after Wave 3.
- **OAuth.** Architecture's own wording was "check whether", so I left it off the cut list and made it a spike.
- **Anti-regrowth rule.** Product proposed a test-ratio cap of 0.4 and architecture a two-caller rule. I took the two-caller rule plus the LOC ratchet: a ratio cap invites deleting good tests, and Waves 1–2 already remove the process tests that inflate it.
- **LOC figures.** The figures for arc-pro and admin include CSS: 3,478 and 9,494 are their TS-only LOC. I used the totals including CSS for UI deletion and the TS-only figures for logic.

---

# Addendum: delete all unit tests and adopt e2e.tester.army?

This is an independent evaluation: four haiku research agents, then a steelman and a red-team review (both opus), then an opus decision.

## Decision
- **Delete all unit tests:** reject. Change it to "delete class F, cut class E down."
- **Adopt e2e.tester.army:** adopt in modified form. Run one time-boxed pilot on a web flow only, not as the main test suite.
- **Delete the bloat:** adopt, following Waves 1 to 3 of `docs/strategy/bloat-review-2026-10-09.md:42-64`.

## Why
- The tool tests web and mobile UI only. It does not cover HTTP, CLI, MCP or chain testing (https://e2e.tester.army/docs).
- It is pre-1.0 (0.17.0) and was open-sourced eight days ago. Agent steps send screenshots to the model provider, and videos and `command.log` are not redacted (/docs/security).
- Today's fix that stops recovery being queued too early is guarded only by `tests/unit/convex/capability-call-dispatch-finalization.test.ts:156`.
- The bloat review's "Do not cut" list keeps the callLifecycle, x402 and spendingPolicy tests (`bloat-review:57-60`).
- Playwright already runs `tests/e2e`, so e2e would add a second copy of the same stack.

## Tests: delete vs keep
| Class | LOC | Action | Reason |
|---|---|---|---|
| A money | 44.8k | Keep | Moves real money; idempotency can't be seen from outside |
| B lifecycle/state | 36.1k | Keep | Needs fake timers to check scheduler ordering |
| C security/authz | 33.6k | Keep the MCP and API contract tests, thin the rest | The real-use surfaces depend on them |
| D pure domain | 36.4k | Thin | Keep only invariant tests |
| E UI | 45.2k | Delete most | The real-use scenario and Playwright cover these |
| F process/release | 21.7k | Delete | Ceremony, not product |
| G other | 29.8k | Triage | The path-based split was rough |

## e2e.tester.army fit
- **Covers:** web flows such as trial and developer discovery.
- **Can't cover:** the `ae` CLI, MCP, `/api/v1`, x402 receipts or the workpool.
- **Trial:** port `tests/e2e/trial.spec.ts` on a branch, using locator-only steps (no model, nothing leaves the machine). Turn telemetry off and keep wallet and Stripe screens out of the pilot.
- **Exit criteria:** after 2 weeks, zero flaky reruns and no gain over Playwright mean you drop it.

## Real-use proof
Write one `tools/ae` scenario: discover, quote, call (x402 testnet), receipt, refund. Run it against hosted through the CLI, MCP (`src/lib/server/mcp-api.ts`) and `/api/v1`. It passes only if all three show the same receipt id and ledger delta.

## Execution order
Each step runs in its own git worktree and lands as its own PR, so each can be reverted on its own.
1. Wave 1: dead code and archive. Verify with tsc, convex codegen and one paid dev call.
2. Wave 2: delete classes F and E, edit `test:conformance` and `test:imports` in `package.json`, and land the `ae` scenario.
3. Run the e2e pilot, then start the Wave 3 folds one per PR.

## Rule going forward
A unit test stays only if it guards an invariant that a real CLI, MCP or HTTP run cannot observe: money, idempotency, timing or authz.
