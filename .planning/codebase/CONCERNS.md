---
last_mapped_commit: abcc85a8a4b6f0d3e5c1c9b2f42c9d0d69c949615e2
---
<!-- refreshed: 2026-08-21 -->
# Codebase Concerns

**Analysis Date:** 2026-08-21

Working-tree map of current source (708 files changed uncommitted, +12,181/−155,067 vs HEAD `abcc85a8`). Code is authoritative over `.planning/STATE.md`. Inquiry Convex modules, Customer Request HTTP, WorkTree/Study/demand TypeScript, and inquiry UI routes are absent — do not treat restoring inquiry as a fix. `.env.local` and `.env.example` are present at the repo root — noted by existence only; contents are not quoted.

TODO/FIXME/HACK/XXX: **not detected** in `src/` or `convex/` TypeScript. Debt here is structural, not comment-tagged. Friction log: `PAPERCUTS.md` (321 entries; Recurring + Close-loop-then-cut sections are dedupe floors).

**Changed shape since the 2026-08-20 map (verified against source):**

- **Live-money gate is now a source-policy switch, not a counsel-signoff structure.** `LIVE_MONEY_GATE_POLICY` in `src/modules/money/internal/live-money-gate.ts` is `{ policyId: 'live-money-source-policy', revision: '2026-08-20', enabled: true }`; `evaluateLiveMoneyGate` accepts whenever `enabled` is true. Stripe live-readiness refusal (`stripe_setup_required`) moved to key-prefix validation and payout policy (`src/lib/server/stripe-money-provider-config.ts`, `src/modules/money/internal/payout-policy.ts`). Opening live money is now a one-line source edit plus review — treat any diff to `enabled` as a founder-level change.
- **Admin membership is listed and real again.** `adminMemberships`, `adminMembershipAuditEvents`, `auditEvents` are in the 51-table `durableTables` (`tests/unit/schema/convex-schema.test.ts`), `readActiveAdminMembership` in `convex/authz.ts` queries the listed table, and `persistAdminAuthorityMutation` in `convex/securityShared.ts` inserts/updates rows. The prior "admin is always undefined / persist is a no-op / success tests stay red on purpose" claims are **stale and dropped**.
- **Schema census is now 51 listed tables** (was 48): `adminMemberships`, `adminMembershipAuditEvents`, `auditEvents` re-listed; `capabilityProviderConnectionLeases`, `capabilityProviderApprovals`, `externalRunGateDecisions` and friends present.
- **`src/modules/money/internal/ledger.ts` crossed the 1k-line rule** (1,031 lines). The prior "do not split this cut" stance is overtaken; the rule is now broken in source.
- **`convex/capabilityOperationInvocationWorker.ts` shrank to 43 lines** (was 725); worker logic lives in `src/modules/capability-execution/invocation-worker/*.ts` helpers that still import `convex/_generated` and `undici`.
- Intentionally red tests are now **Connect-only**: `tests/unit/convex/payout-ledger-connect.test.ts` expects `kind: 'accepted'` from handlers that hard-refuse. Admin success-path tests seed real memberships and should pass; re-verify by running the suites, not by editing assertions.

---

## Tech Debt

**1k-line rule broken and at the cliff in the money family:**
- Issue: `src/modules/money/internal/ledger.ts` is 1,031 lines (over the rule). `convex/moneyCreditTopup.ts` and `convex/moneyQualifiedUsePayout.ts` sit at 999 — one validator or type add crosses 1,000 (PAPERCUTS 294). Neighbors close behind: `convex/moneyRefund.ts` (919), `convex/moneyPayoutTransferShared.ts` (912), `convex/moneyExternalSpend.ts` (895), `convex/moneyPayoutTransferCompleteApply.ts` (892).
- Files: `src/modules/money/internal/ledger.ts`, `convex/moneyCreditTopup.ts`, `convex/moneyQualifiedUsePayout.ts`, `convex/moneyRefund.ts`, `convex/moneyPayoutTransferShared.ts`, `convex/moneyExternalSpend.ts`
- Impact: Reviews already miss fail-closed branches in these files; every edit risks tripping the size gate mid-change.
- Fix approach: Peel `ledger.ts` first (charge-contract/account-ref pattern already exists from the earlier split — see `src/modules/money/internal/charge-contract.ts` if present, else PAPERCUTS 235). For the 999-line pair, prefer `Infer` from existing `v.object` validators and shared unions in `convex/moneyLedgerValues.ts` instead of hand-written TS types.

**5,000-line release smoke tool:**
- Issue: `tools/release/operation-gateway-production-smoke.ts` is 5,000 lines — the largest file in the repo and unreviewable as a unit. It also calls `evaluateLiveMoneyGate()` directly (line ~1507) and throws `GatewaySmokeError("stripe_setup_required")` on closed gates.
- Files: `tools/release/operation-gateway-production-smoke.ts`
- Impact: Any gate/policy change requires editing a monolith; smoke failures are hard to localize.
- Fix approach: Split per scenario family (money, x402, catalog, answer) behind one CLI entry; keep gate assertions in one shared helper.

**Path-pinned `v.any()` allowlist in contract scans:**
- Issue: `isDocumentedJsonBoundary` hard-codes the files allowed to use `v.any()`: `convex/capabilitySupply.ts`, `convex/capabilitySupplyOperations.ts`, `convex/capabilitySupplyOperationQueries.ts`, `convex/capabilitySupplyOperationKeyless.ts` (`src/lib/ui/contract-scans.ts` lines ~194–212).
- Files: `src/lib/ui/contract-scans.ts`
- Impact: Moving a validator during a peel fails `test:ts-standards` until the allowlist is edited in the same PR (PAPERCUTS 269).
- Fix approach: Update the allowlist in the same PR as any peel. Do not broaden `v.any()` to new files.

**Empty schema objects for unlisted families:**
- Issue: `routingKernelTables = {}` (`src/modules/routing-kernel/internal/convex-schema.ts`), `agentAccessOAuthTables = {}` (`src/modules/agent-access/internal/oauth-convex-schema.ts`), `notificationOutboxTables = {}` (`src/modules/notification-outbox/internal/schema.ts`). The host modules (`convex/routingKernelV1History.ts`, `convex/notificationOutbox.ts`) remain as refusing stubs.
- Files: those schema files, `convex/routingKernelV1History.ts`, `convex/notificationOutbox.ts`
- Impact: Agents can mistake empty-schema modules for live storage; the stubs must keep refusing in-handler forever.
- Fix approach: Keep listed schema at exactly the 51 in `durableTables`. Do not re-list RK/outbox/OAuth tables; do not restore inquiry modules.

**Public action inventory is 14 listed ids; `findAction` is listed-only:**
- Issue: `listActions()` in `src/modules/actions/index.ts` returns the listed array only; `QUARANTINE_FAMILY_ACTION_PREFIXES` is `[]` in `src/modules/product-frontier/quarantine-write-admission.ts`; `/api/v1/operations/execute` is a hard 410 (`src/routes/api.v1.operations.execute.ts`) while `/api/v1/operations/call` is the paid door.
- Files: `src/modules/actions/index.ts`, `src/modules/product-frontier/quarantine-write-admission.ts`, `src/routes/api.v1.operations.execute.ts`, `src/routes/api.v1.operations.call.ts`
- Impact: New work can re-register a retired id; deleted-family ids (`inquiry.*`, `study.*`, `customerRequest.*`) resolve `undefined`.
- Fix approach: Keep `findAction` listed-only. New market actions go through the manifest + MCP/CLI/Answer parity tests.

**`customer_requests:*` ceiling tokens retained; `customer_requests:create` refused on new keys:**
- Issue: Mode strings live in `src/modules/agent-access/contract.ts` (`CUSTOMER_REQUEST_AGENT_SCOPE = 'customer_requests:create'` plus four ceiling modes and `standing_authority`). `canonicalAgentScopes` (`src/modules/agent-access/agent-access.ts` ~line 456) and `normalizeRequestedScopes` (`src/modules/agent-access/oauth-state.ts` ~line 167) return `undefined` when the create scope is present.
- Files: `src/modules/agent-access/contract.ts`, `src/modules/agent-access/agent-access.ts`, `src/modules/agent-access/oauth-state.ts`
- Impact: Renaming tokens breaks grant/OAuth parsers; minting `customer_requests:create` would reopen a deleted write door.
- Fix approach: Keep the refusal. Treat the constant names as retired vocabulary, not a product to restore.

**Funnel unions keep historical `inquiry_*` event names (do not re-emit):**
- Issue: `src/modules/observability/internal/literals.ts` (lines ~87–94), `src/modules/observability/internal/funnel.ts`, `convex/observability.ts` (~line 164) still carry `inquiry_available_seen`, `inquiry_attempted`, `owner_inquiry_replied`, etc. `src/modules/observability/source-sync-gate.ts` drops `inquiry_attempted` from public source-sync.
- Files: `src/modules/observability/internal/literals.ts`, `src/modules/observability/internal/funnel.ts`, `convex/observability.ts`, `src/modules/observability/source-sync-gate.ts`
- Impact: Removing arms breaks stored-event decode; re-emitting pretends inquiry is live.
- Fix approach: Keep names, do not re-emit, keep the source-sync drop.

**`agentJsonUrl` still points at the business directory:**
- Issue: `buildAgentJsonUrl` in `src/modules/answer/answer-synthesizer.ts` (~line 200) returns `/api/businesses/search?...` (~line 216) even when the turn ran market operations; `src/modules/answer/internal/answer-agent-result.ts` (~line 233) consumes it.
- Files: `src/modules/answer/answer-synthesizer.ts`, `src/modules/answer/internal/answer-agent-result.ts`, `src/components/ae/chat/answer-stream.ts`
- Impact: Agents following `agentJsonUrl` land on the dual-catalog businesses URL, not operations search/detail.
- Fix approach: Derive the URL from tools actually run (operations when the loop executed operations).

**Dual catalog (owner offerings vs capability offerings) with frozen measured HTTP:**
- Issue: Public listings live in `businessOfferings`/`businessOfferingRevisions`/`offeringAccessPaths`; market operations live in `capabilityOfferings`/`capabilityPublications`/`capabilityTransportBindings`. `/api/businesses*` and `/api/v1/services*` remain measured, frozen URLs (`src/modules/product-frontier/business-services-policy.ts`).
- Files: `src/modules/catalog/internal/schema.ts`, `src/modules/capability-supply/internal/convex-schema.ts`, `src/modules/product-frontier/business-services-policy.ts`, `src/routes/api.businesses*.ts`, `src/routes/api.v1.services*.ts`
- Impact: Two discovery vocabularies; agents must use `/api/v1/operations/*` for the paid door.
- Fix approach: Freeze stands. Add operations URLs only; never re-list `registry.list`/`registry.services_*`.

**Business-tool comments still name `/tools/inquiry.submit`:**
- Issue: `src/modules/business-tools/public.ts` exports `InquirySubmitToolId` and carries the `/tools/inquiry.submit` comment (~line 59); `src/modules/business-tools/public-values.ts` shares it.
- Files: `src/modules/business-tools/public.ts`, `src/modules/business-tools/public-values.ts`
- Impact: Agents may re-wire a hosted inquiry submit from the comment.
- Fix approach: Keep the id as a retired name only; no live submit route.

**Local Convex codegen and parallel sandboxes restore deleted modules:**
- Issue: `npx convex codegen` (non-dry-run) and `npm run dev:local` can resurrect deleted Convex files from the last push; a parallel sandbox recopied `convex/inquiries.ts` during the inquiry cut (PAPERCUTS 263, 266).
- Files: `package.json` `dev:local`, `tools/dev/local-dev.mjs`, `convex/_generated/`
- Impact: Cut work reappears mid-session.
- Fix approach: Stop the local stack before deleting Convex modules; prefer `npm run check:convex-codegen` (`convex codegen --dry-run --typecheck=disable`); quote `inquiry*` globs under zsh.

**`exactOptionalPropertyTypes` brittleness on optional hashed fields:**
- Issue: Optional price/hash fields and `sourceWrite?: unknown` break typecheck and Convex `runMutation` arg pass-through (PAPERCUTS 6, 283).
- Files: `tsconfig.json`, `src/modules/catalog/internal/offering-price.ts`, `convex/moneyCreditTopup.ts`, `convex/sourceWriteAdmission.ts`
- Impact: Typecheck red on optional hash/price fields; runtime arg mismatch.
- Fix approach: Populate sub-cent decimals at the operation-read boundary; infer source-write args from validators; conditional-spread optionals.

**Planning docs lag / were stale until this remap:**
- Issue: `.planning/codebase/STACK.md`, `CAPABILITY-MAP.md`, `PROMPT-DATA-FLOW.md`, `IA-DATA-FLOW.md`, `.planning/COPY-MAP.md` previously named deleted kernels, 60-table counts, or inquiry surfaces; inquiry export JSONL under `.planning/evidence/inquiry-export-2026-08-19/` is a hosted leftover census, not a restore target.
- Files: `.planning/codebase/STACK.md`, `.planning/codebase/CAPABILITY-MAP.md`, `.planning/codebase/PROMPT-DATA-FLOW.md`, `.planning/codebase/IA-DATA-FLOW.md`, `.planning/COPY-MAP.md`
- Impact: New phases re-litigate deleted inquiry/CR kernels.
- Fix approach: Plan from current `durableTables` (51) + `listActions()` (14) + `/api/v1/operations/call`.

---

## Known Bugs

**Chat turns often skip `operation.execute` for catalog asks that MCP executes:**
- Symptoms: Composer asks complete in 25–35s with work-log "No live operation was needed yet" while anonymous MCP `ae_operation_execute` returns results in <1s (PAPERCUTS 224). Mixed-intent asks execute one operation and falsely claim the other is unavailable (PAPERCUTS 124); same-thread follow-ups lose the selected capability (PAPERCUTS 125); search-only instructions are ignored (PAPERCUTS 175).
- Files: `src/modules/answer/internal/answer-tool-use-agent.ts`, `src/modules/answer/internal/answer-agent-tools.ts`, `src/modules/answer-thread/internal/turn-orchestrator.ts`, `tools/ae/commands/ask.ts`
- Trigger: `POST /api/answer/turn` with catalog asks; CLI machine-selected follow-up after host planner prune.
- Workaround: Call MCP `ae_operation_execute` / HTTP `POST /api/v1/operations/call` directly. Do not treat chat prose as execution evidence.

**No geocode/place-resolution tool on the Answer loop:**
- Symptoms: Weather/local-service asks need coordinates; chat prose has invented coordinates with no execute record (PAPERCUTS 224). Landing/composer example asks were changed to handshake/catalog asks (`src/modules/answer/catalog-example-asks.ts` no longer advertises Berlin weather/FX), which mitigates the trigger but not the missing capability.
- Files: `src/modules/answer/catalog-example-asks.ts`, `src/modules/answer/internal/answer-agent-tools.ts`, curated providers in `convex/curatedProviders.ts`
- Trigger: Any place-implicit ask that reaches a coordinates-required operation.
- Workaround: Execute with explicit coordinates via MCP. Do not restore host location injection.

**`agentJsonUrl` is always a business-directory URL:**
- Symptoms: After any Answer turn, `complete.answer.agentJsonUrl` is `/api/businesses/search?q=…`; CLI cannot print `operationRef`/`evidenceHash` from chat stream events.
- Files: `src/modules/answer/answer-synthesizer.ts` (`buildAgentJsonUrl`), `src/modules/answer/internal/answer-agent-result.ts`, `src/components/ae/chat/answer-stream.ts`
- Trigger: Any Answer turn that builds a snapshot.
- Workaround: Use MCP/CLI operation search/detail/execute.

**Location search is token overlap only:**
- Symptoms: Full-phrase local-service queries miss listings unless published words token-overlap (PAPERCUTS 223). `src/modules/registry/internal/trade-vocabulary.ts` does not exist (verified absent).
- Files: `src/modules/registry/internal/search.ts`, `src/modules/registry/internal/search-documents.ts`, `src/modules/answer/search-context.ts`, `eval/answer/lib/eval-turn-cases.ts`
- Trigger: Queries without published-token overlap.
- Workaround: Search published tokens. Do not restore silent Perth defaults or a trade-vocabulary module without a product decision.

**Connect reserve/finalize always refuse `connect_account_unlisted` (test red on purpose):**
- Symptoms: `reserveConnectAccountHandler`/`finalizeConnectAccountHandler` in `convex/moneyConnect.ts` (~lines 273–287) return `{ kind: 'refused', code: 'connect_account_unlisted' }` with no DB write; `bindConnectAccountHandler` remains the listed-table path behind the live-money gate. `tests/unit/convex/payout-ledger-connect.test.ts` mocks `evaluateLiveMoneyGate` as accepted and still expects `kind: 'accepted'` plus a `moneyPayoutAccounts` row — it stays red until a founder-authorized Connect policy change.
- Files: `convex/moneyConnect.ts`, `convex/moneyLedger.ts` (re-exports), `src/modules/money/internal/payout-connect-http.ts`, `tests/unit/convex/payout-ledger-connect.test.ts`, `tests/unit/convex/payout-ledger-test-harness.ts`
- Trigger: `npm run test:unit` connect suite; any owner Connect reserve/finalize HTTP call.
- Workaround: Do not make the handlers succeed to green the test. Keep red until the Connect table/policy decision.

**Notification HTTP dispatch is 410; persist is a no-op:**
- Symptoms: Resend/Novu send functions throw `NotificationProviderError('unsupported_notification_dispatch', …, 410)` (`src/lib/server/notification-provider-resend.ts` ~line 116); `convex/notificationOutboxPersistence.ts` documents "Persist is a no-op — not a successful send" and returns early; operator retries return `notification_operator_denied` (`convex/notificationOutbox.ts` ~line 156). In-memory `tests/unit/notification-outbox/readback.test.ts` still models successful dispatch.
- Files: `src/lib/server/notification-provider-resend.ts`, `src/lib/server/notification-provider-novu.ts`, `src/lib/server/notification-dispatch.ts`, `convex/notificationOutboxPersistence.ts`, `convex/notificationOutbox.ts`
- Trigger: Any owner-inquiry provider send; deploy smokes `tests/deploy-smoke/phase2-resend-dispatch-smoke.spec.ts`, `phase2-novu-dispatch-smoke.spec.ts`.
- Workaround: Do not re-enable HTTP dispatch; do not treat in-memory outbox success as hosted-send proof.

**CLI compare and persist seams (papercut-reported, not re-verified live):**
- Symptoms: `ae compare` failed live with `operation_read_unavailable` / Convex `operation_comparison_value_invalid` (PAPERCUTS 131); exact candidate selection died with `answer_turn_persist_failed` HTTP 500 (PAPERCUTS 174); CLI natural follow-up requires `--operation-ref --candidate-digest` (PAPERCUTS 132).
- Files: `tools/ae/commands/ask.ts`, `convex/capabilitySupplyOperations.ts`, `convex/answerThreadsReserve.ts`
- Trigger: Canonical CLI loop on compare; collaborative selection flows.
- Workaround: Use search/inspect/inspect-plan; re-verify compare after the capability-supply peels.

---

## Security Considerations

**Live money is a source-policy switch — review discipline is now the only structural guard:**
- Risk: `LIVE_MONEY_GATE_POLICY.enabled` is `true` by construction in `src/modules/money/internal/live-money-gate.ts`; `evaluateLiveMoneyGate` accepts any well-formed enabled policy. A careless edit or a "runtime callers may inject a disabled policy" seam (`src/modules/money/internal/payout-http-runtime.ts` accepts `runtime.gatePolicy`) could open payout paths.
- Files: `src/modules/money/internal/live-money-gate.ts`, `src/modules/money/internal/payout-http-runtime.ts`, `src/modules/money/internal/credit-topup-http.ts`, `src/modules/money/server.ts`, `convex/moneyPayoutTransferBegin.ts`, `convex/moneyPayoutTransferCompleteApply.ts`, `convex/moneyPayoutTransferReconcile.ts`, `convex/moneyConnect.ts` (`bindConnectAccountHandler`), `tools/release/operation-gateway-production-smoke.ts`
- Current mitigation: Payout admission still refuses `stripe_setup_required` until Stripe config validates live-ready (`src/modules/money/internal/payout-policy.ts`); `readStripeMoneyProviderConfig` derives mode from `sk_live_`/`sk_test_` prefixes and refuses mode mismatch (`src/lib/server/stripe-money-provider-config.ts`); Connect reserve/finalize are additionally hard-refused.
- Recommendations: Treat any diff touching `LIVE_MONEY_GATE_POLICY`, `gatePolicy` injection, or `enabled` as founder-level review. Do not replace key-prefix validation with env flags. Hosted first-dollar still needs a certification packet.

**Provider-direct x402 refused in production:**
- Risk: Direct rail settles outside AE's ledger (no rake, no dispute answer).
- Files: `src/modules/capability-supply/internal/x402-invocation-policy.ts` (production admits only `brokered`; verified), `convex/moneyX402PaymentAttempts.ts`, `src/modules/capability-execution/invocation-worker/x402Authorization.ts`, `tests/unit/capability-supply/x402-invocation-policy.test.ts`
- Current mitigation: `paymentLaneAdmission` returns `payment_lane_not_brokered` for `provider_direct_x402` when `environment === 'production'`; non-production keeps the direct rail for conformance.
- Recommendations: Keep `safeParse` + non-empty CAIP-2 guard around `@x402/core` schemas (its Zod runtime is not this repo's Zod).

**SSRF: dynamic `fetch` must import network-guard:**
- Risk: Owner- or model-supplied URLs reaching link-local/metadata/private ranges.
- Files: `tests/unit/security/ssrf-surface-drift.test.ts`, `src/modules/network-guard/public.ts`, worker `convex/capabilityOperationInvocationWorker.ts` + `src/modules/capability-execution/invocation-worker/x402Authorization.ts`/`recover.ts` (undici `Agent`), `src/modules/answer/internal/answer-tool-use-agent.ts` allowlist
- Current mitigation: Import scan over `convex/`, `src/routes/`, `src/modules/` for non-literal `fetch(`; keyless execute HTTPS-only; CLI policy repeats `https_only` (`tools/ae/lib/policy.ts`).
- Recommendations: Do not grow the fixed-host allowlist without security review.

**Source-write secrets and Clerk bypass:**
- Risk: Client-bundled source-write material; production auth bypass; webhook spoofing.
- Files: `.env.local` present (existence only), `.env.example`; `src/lib/ui/contract-scans.ts` forbids `VITE_AE_SOURCE_WRITE_SECRET`; `src/lib/server/local-e2e-bypass.ts` (exists; throws on production bypass); `convex/sourceWriteAdmission.ts`; `src/lib/server/stripe-money-provider-config.ts` (`MAX_WEBHOOK_BODY_BYTES` 256 KiB, verified)
- Current mitigation: Scoped `AE_SOURCE_WRITE_KEY_*` families; HKDF derivation from server-only secret in non-production; env-leak scan tests.
- Recommendations: Never read/commit `.env*`. Production must set per-family keys. Keep `AE_X402_PAYMENT_PRIVATE_KEY`/`AE_X402_RPC_URLS_JSON` server-only (`convex/convex.config.ts` env validators).

**Quarantine freeze: empty prefixes + `/execute` 410 + in-handler refusals:**
- Risk: A caller with source-write or internal Convex access could mutate retired families if leftover handlers were not fail-closed.
- Files: `src/modules/product-frontier/quarantine-write-admission.ts` (`QUARANTINE_FAMILY_ACTION_PREFIXES = []`, verified), `src/routes/api.v1.operations.execute.ts` (all-methods 410 with RFC 9745 notice, verified), `src/routes/api.v1.operations.call.ts` (paid door), `convex/notificationOutbox.ts` (`notification_operator_denied`), `convex/routingKernelV1History.ts` (`not_found`/`authorization_denied`)
- Current mitigation: Family HTTP is 404 (gone), `/execute` is 410, `/call` is the only paid door; leftover Convex mutations refuse in-handler.
- Recommendations: Never add a shared no-op that returns success; never 410 `/call`; keep inquiry URLs 404.

**OAuth/keys must not mint `customer_requests:create`:**
- Files: `src/modules/agent-access/agent-access.ts` (`canonicalAgentScopes`), `src/modules/agent-access/oauth-state.ts` (`normalizeRequestedScopes`), `tests/unit/agent-access.test.ts`, `tests/e2e/public-owner-ui.spec.ts`
- Current mitigation: Issue/normalize refuse the scope.
- Recommendations: Keep refusing; do not add it to device-registration scope unions.

**Two "dispute" vocabularies:**
- Risk: Privacy removal disputes vs money chargeback/recovery mixing.
- Files: `src/modules/security/internal/disputes.ts`, `convex/securityRemovalDisputes.ts`, `tests/unit/security/disputes.test.ts` (hashes only), money `recoveryDue` in `src/modules/money/internal/ledger.ts`
- Current mitigation: Removal disputes store contact/evidence hashes on listed `disputes`; money recovery is ledger fields.
- Recommendations: Do not hang Stripe chargebacks on `disputes`; keep CSRF on `openRemovalDispute`.

**Admin authority is a real matrix now — protect it like one:**
- Risk: With `adminMemberships` listed and persist real, a mis-seeded membership or a broadened `AdminAction` matrix grants real operator power.
- Files: `convex/authz.ts` (`readActiveAdminMembership`, `resolveAdminAuthority`), `convex/securityAdminMembership.ts` (bootstrap/grant/revoke handlers with conflict checks), `convex/securityShared.ts` (`persistAdminAuthorityMutation`), `src/modules/security` role/action matrix, `tests/unit/security/admin-authority.test.ts`
- Current mitigation: Authority requires an active membership row; bootstrap is restricted to preauthorized principals; every admin mutation writes audit rows (`adminMembershipAuditEvents`, `auditEvents`).
- Recommendations: Any new `AdminAction` updates the matrix test in the same PR. Do not seed memberships in shared fixtures casually — `tests/helpers/convex-fixtures.ts` now grants real authority in Convex tests.

---

## Performance Bottlenecks

**Answer turn: two-phase model loop + 30s lease:**
- Problem: Catalog asks take tens of seconds even when no operation runs; preflight interpretation + bounded tool loop + separate prose `generateText`.
- Files: `src/routes/api.answer.turn.ts` (`MAX_ANSWER_TURN_BODY_BYTES` 16 KiB, verified), `convex/answerThreadsReserve.ts` (`ANSWER_THREAD_MAX_TURNS = 25`, verified), `src/modules/answer-thread/answer-thread.schema.ts` (`ANSWER_TURN_EXECUTION_LEASE_MS = 30_000`, verified), `src/modules/answer-thread/internal/turn-orchestrator.ts` (736 lines), `src/modules/answer/internal/answer-query-safety.ts`
- Cause: OpenRouter round-trips; search-only budgets; prose after tools.
- Improvement path: Skip prose when tools produced gated snapshot fields; fail fast on `classifier_unavailable`. Do not lengthen the lease to hide missing execute.

**Money family file size at/over the cliff:**
- Problem: `src/modules/money/internal/ledger.ts` 1,031 (over the rule), `convex/moneyCreditTopup.ts`/`convex/moneyQualifiedUsePayout.ts` at 999.
- Files: see Tech Debt item 1.
- Improvement path: Peel `ledger.ts` using the existing charge-contract pattern; Infer types from validators for the 999-line pair. Respect Convex 1MB doc / 8192 array limits (`convex/_generated/ai/guidelines.md`).

**CLI/search payload noise:**
- Problem: `ae search --json` embeds full HTTP action schemas (~27kB per listing; PAPERCUTS 226); items lack a top-level `name`.
- Files: `tools/ae/commands/ask.ts`, `src/modules/registry/operation-action-contracts.ts`, `src/modules/capability-supply/operation-projection.ts`
- Improvement path: Human mode prints name + operationRef + price; keep full schema on inspect/MCP.

**Release gate ordering hides cheap failures:**
- Problem: `test:ts-standards` runs after `test:release:unit` inside `test:release:source:after-codegen` (verified in `package.json` line 28) — real TS violations sat undetected behind a red unit suite (PAPERCUTS 182). Intentionally red Connect tests make a full unit run red even when product code is correctly fail-closed.
- Files: `package.json` (`test:release:source:after-codegen`, `test:imports`), `tests/unit/convex/payout-ledger-connect.test.ts`
- Improvement path: Run `test:ts-standards` before slow suites. Do not green Connect by reopening handlers.

**Node 25 vs required 22.x:**
- Problem: Shell-default Node 25 breaks `convex dev --once` (`DeploymentNotConfiguredForNodeActions`), tsx loader flags, and codegen (PAPERCUTS 208–211, 299, 310). `engines.node` is `22.x` (verified).
- Files: `package.json`, `.nvmrc`, `convex/capabilityOperationInvocationWorker.ts` (`"use node"`), `src/modules/capability-execution/invocation-worker/x402Authorization.ts`, `recover.ts` (undici)
- Improvement path: Use nvm 22 for all Convex work; do not "fix" by dropping node actions.

**Suite-load flakes and timeout noise:**
- Problem: CLI-error tests time out at 30s under full-suite load (PAPERCUTS 185); integration competing-repeat tests flake at 15s under load (PAPERCUTS 151); TimeoutOverflowWarning floods under Node 25 (PAPERCUTS 123, 163, 149).
- Files: `tests/unit/market-terminal/cli-errors-*.test.ts`, `package.json` `test:release:integration`
- Improvement path: Per-file timeouts or reduced concurrency for spawn-heavy files; run gates on Node 22.

---

## Fragile Areas

**Live-money gate + Stripe readiness (shape changed 2026-08-20):**
- Files: `src/modules/money/internal/live-money-gate.ts`, `src/modules/money/internal/payout-policy.ts`, `src/lib/server/stripe-money-provider-config.ts`, `src/lib/server/stripe-money-provider.ts`, `src/lib/server/stripe-money-webhook.ts`, `convex/moneyConnect.ts`, `convex/moneyPayoutTransferBegin.ts`, `convex/moneyPayoutTransferCompleteApply.ts`
- Why fragile: The gate is now a one-field source switch; Stripe live-readiness is enforced downstream by key-prefix validation and payout policy. Webhook idempotency (`moneyStripeEvents`), payout reserve-before-I/O, and x402 observation reconciliation must stay exact.
- Safe modification: Run `tests/unit/money/`, `tests/unit/action-invocation/x402-payment-reconciliation.test.ts`, `tests/unit/convex/payout-ledger-transfer.test.ts` before any policy change. Never open the gate or make Connect succeed to green a test.
- Test coverage: Source-strong for ledger math; hosted-live Stripe/x402 not certified. Connect success test intentionally red.

**Answer-thread tool loop:**
- Files: `src/modules/answer-thread/internal/turn-orchestrator.ts`, `src/modules/answer/internal/answer-tool-use-agent.ts`, `src/modules/answer/internal/answer-agent-tools.ts`, `src/components/ae/chat/*`, `tests/unit/answer-thread/turn-path-thinness.test.ts`
- Why fragile: No host planner; preflight interpretation is advisory. `turn-path-thinness.test.ts` pins `buildStreamAnswerTurnPhases` plus literal `agentTurnPath.run(`/`boundaryTurnPath.run(` in the orchestrator source (PAPERCUTS 240), so refactors must keep a thin wrapper.
- Safe modification: Change the tool loop and gate together; update Promptfoo via `eval/answer/lib/coverage.ts` (`auditPromptfooAnswerConfig`). Do not restore chips or a named router.
- Test coverage: Strong unit/eval on the intended loop; weak hosted/chat execute proof.

**Admin membership + Convex fixtures:**
- Files: `convex/authz.ts`, `convex/securityAdminMembership.ts`, `convex/securityShared.ts`, `tests/helpers/convex-fixtures.ts` (`ownerAdmin`), `tests/unit/convex/harness-sessions-runtime.test.ts` (seeds `adminMemberships`, expects `kind: 'allowed'`), `tests/unit/security/admin-authority.test.ts`
- Why fragile: Fixtures now grant real authority; the prior fail-closed stub is gone. Tests that assumed `authorization_denied` (e.g., `tests/integration/capability-publication-security.test.ts`) may flip behavior with seeded memberships.
- Safe modification: Pin the role/action matrix in `tests/unit/security/admin-authority.test.ts`; seed memberships only where the test means to exercise authority.
- Test coverage: Matrix test is the floor; run `tests/integration/admin-runtime.test.ts` and capability-supply registration suites after any authz change (prior 15/16 `authorization_denied` failures predate the re-listing — re-verify, do not assume).

**Convex schema keep-51 + component tables:**
- Files: `tests/unit/schema/convex-schema.test.ts` (51 `durableTables`, exact-set assertion), `convex/schema.ts`, `convex/convex.config.ts` (workpool, rateLimiter, aggregate; **workflow not mounted**, verified)
- Why fragile: Any new `defineTable` must update `durableTables` + `requiredIndexes` in the same PR or the exact-set test fails; component tables stay outside the 51.
- Safe modification: Schema change + census test + `npm run check:convex-codegen` in one PR. Local `--replace-all` import must never run `--prod`.

**Worker `_generated` imports and `"use node"`:**
- Files: `src/modules/capability-execution/invocation-worker/*.ts` (import `convex/_generated/server` and `undici`; verified), `convex/capabilityOperationInvocationWorker.ts` (43-line `"use node"` host)
- Why fragile: A "generic Ctx port" breaks Convex node-action registration and codegen; Node 25 cannot deploy those actions.
- Safe modification: Leave `_generated` imports; keep `"use node"` on the host; run Convex on Node 22.
- Test coverage: `tests/unit/convex/capability-operation-recovery.test.ts` and worker harnesses; harness `vi.hoisted` export rules (PAPERCUTS 279, 287).

**Convex glob load order / TDZ during peels:**
- Files: `convex/catalogOfferingMutations.ts`, `convex/catalogPublicReads.ts`, `src/modules/agent-access/contract.ts`, PAPERCUTS 247, 248
- Why fragile: Convex loads module files in glob order; import cycles between split siblings surface as TDZ errors far from the edit.
- Safe modification: Keep public reads depending on mutations, not the reverse; keep shared args on unregistered helpers; run `npm run check:convex-codegen` after peels.

**Quarantine HTTP vs listed kernel:**
- Files: `src/routes/api.v1.operations.execute.ts`, `src/routes/api.v1.operations.call.ts`, `src/lib/server/mcp-api.ts`, `src/modules/product-frontier/deprecation-notice.ts`
- Why fragile: `/execute` 410 is easy to "fix" back to invoke; MCP must not host-410 listed tools.
- Safe modification: Follow `tests/unit/product-frontier/deprecation-notice.test.ts` and `tests/unit/server/mcp-api-*.test.ts`; never attach RFC 9745 headers to `/call`.

**Funnel `inquiry_*` union arms:**
- Files: `src/modules/observability/internal/literals.ts`, `src/modules/observability/internal/funnel.ts`, `convex/observability.ts`, `tests/unit/observability/funnel.test.ts`
- Why fragile: Removing names breaks historical decode; adding emitters pretends inquiry is live.
- Safe modification: Keep names; keep the `source-sync-gate.ts` drop for `inquiry_attempted`.

**`exactOptionalPropertyTypes` + hashed prices:**
- Files: `tsconfig.json`, `src/modules/catalog/internal/offering-price.ts`
- Why fragile: Optional price fields into `StableHashValue`/invocation writers break typecheck or hashes.
- Safe modification: Populate sub-cent decimals at the operation-read boundary.

---

## Scaling Limits

**Answer threads:**
- Current capacity: 25 turns/thread (`convex/answerThreadsReserve.ts`); 30s generation lease (`src/modules/answer-thread/answer-thread.schema.ts`); 16 KiB body (`src/routes/api.answer.turn.ts`).
- Limit: Lease expiry mid-tool-loop; thread cap forces new threads; 16 KiB blocks large CLI JSON envelopes as `query`.
- Scaling path: Raise caps only with persistence/replay tests in `tests/unit/answer-thread/`.

**Convex documents and Workpool:**
- Current capacity: 1MB/doc, 8192 array elements; Workpool + rateLimiter + aggregate mounted in `convex/convex.config.ts`; invoke queue is Workpool.
- Limit: Large OpenAPI descriptors, full action schemas in search hits; notification outbox tables unlisted (persist no-op).
- Scaling path: Store hashes + bounded redacted payloads; keep search projections in `registrySearchDocuments`.

**Money / payout:**
- Current capacity: Exact amounts, UTC-daily allocation, ledger + journal in place; live transfers held behind Stripe readiness + gate review.
- Limit: Connect reserve/finalize unlisted (`connect_account_unlisted`); hosted live Stripe/x402 uncertified.
- Scaling path: Founder-authorized Connect policy + certification packet — not a code flag.

**Listed schema 51:**
- Current capacity: 51 source-owned tables (`durableTables`). Component tables (workpool/rate-limiter/aggregate) outside the census.
- Limit: Each new table needs a same-PR census update and justification against the reset cap.
- Scaling path: Founder-authorized cap change plus schema test.

**Public HTTP catalogs:**
- Current capacity: Businesses/services URL families frozen (measured paths in `src/modules/product-frontier/business-services-policy.ts`); operation search max 200 chars / 20 results.
- Limit: Dual URL families confuse agents; `agentJsonUrl` always hits businesses search.
- Scaling path: Add operations URLs only.

---

## Dependencies at Risk

**Vercel AI SDK `ai` vs `@tanstack/ai` dual schema worlds:**
- Risk: Two JSON Schema/tool-contract pipelines drift between MCP/CLI descriptors and the OpenRouter tool loop.
- Files: `src/modules/common/action.ts`, `src/modules/actions/tool-contract.ts`, `src/modules/answer/internal/action-to-tool-spec.ts`, `src/modules/model-gateway/public.ts`
- Migration plan: One schema pipeline eventually; do not add `@convex-dev/agent`.

**`@x402/core` + repo Zod 4:**
- Risk: x402 schemas are a different Zod runtime; cannot embed in repo Zod objects; dependency schema accepts empty CAIP-2.
- Files: `src/modules/capability-supply/internal/x402-invocation-policy.ts`, `convex/moneyX402PaymentAttempts.ts`
- Migration plan: Keep `safeParse` + non-empty namespace guard.

**`@coinbase/cdp-sdk` x402 adapter (new since 2026-08-20 map):**
- Risk: SDK x402 entrypoint statically imports optional peer `@x402/svm` (not installed) — `fromCdpEvmAccount` fails before tests (PAPERCUTS 311); `npm ci --dry-run` cannot resolve the tree under TS 6 because `@solana/kit` declares optional `typescript ^5` (PAPERCUTS 315); install appended unrelated `npm-init` metadata to `package.json` (PAPERCUTS 317, being removed).
- Files: `package.json`, `package-lock.json` (modified in tree), CDP signer tests `tests/unit/capability-supply/cdp-x402-payment-signer.test.ts`
- Migration plan: Pin a narrower SDK subpath or add the optional peer deliberately; re-run `npm ci` on Node 22 after any dependency change and diff `package.json` for stray metadata.

**`@openrouter/ai-sdk-provider` + AI SDK 7 skew:**
- Risk: Minor skew breaks tool-then-prose contract tests.
- Files: `tests/helpers/openrouter-contract-server.ts`, `eval/answer/promptfooconfig.yaml`
- Migration plan: Pin both on upgrades.

**Clerk / TanStack Start / Router peer set:**
- Risk: Peer mismatch across `@clerk/tanstack-react-start`, `@tanstack/react-start`, `@tanstack/react-router`; Clerk server keyless fileStorage leaks `node:fs`/`node:path` into non-Node Convex bundles (PAPERCUTS 121, 150, 153).
- Files: `src/lib/server/local-e2e-bypass.ts`, `convex/_generated` bundling paths
- Migration plan: Upgrade as a set; keep production bypass throw.

**`nitro` nightly + TypeScript 6.0.3 + generated files:**
- Risk: Ahead-of-ecosystem types; react-doctor pre-commit rewrites `convex/_generated` after staging (PAPERCUTS 183).
- Files: `package.json`, `convex/_generated/`
- Migration plan: Stay on Node 22; re-stage hook-rewritten files.

**`@convex-dev/workflow` unmounted; keep Workpool:**
- Risk: Re-adding workflow because docs mention it.
- Files: `convex/convex.config.ts` (verified: workpool, rateLimiter, aggregate only)
- Migration plan: Do not remount.

**`promptfoo` + `braintrust`:**
- Risk: Eval config drift; chip provider path gone.
- Files: `eval/answer/promptfooconfig.yaml`, `eval/answer/lib/coverage.ts`
- Migration plan: Keep `auditPromptfooAnswerConfig` as the floor.

**`undici` 7:**
- Risk: Dispatcher is the SSRF-safe outbound path; raw `fetch` bypasses the guard (caught only when non-literal).
- Files: `src/modules/capability-execution/invocation-worker/x402Authorization.ts`, `recover.ts`, `tests/unit/security/ssrf-surface-drift.test.ts`
- Migration plan: Keep undici behind network-guard.

**Lockfile / package manager:**
- Risk: Historical `npm ci` EUSAGE drift (PAPERCUTS 190); `packageManager` is `npm@11.5.1`; lockfile is modified in the current tree alongside the CDP dependency work (PAPERCUTS 313: 42 transitive packages changed).
- Files: `package-lock.json`, `package.json`
- Migration plan: `npm ci` on Node 22 after dependency changes; verify lock coherence before release gates.

---

## Missing Critical Features

**Hosted-live-certified market loop:**
- Problem: Source tests and local keep-51 Convex do not prove production invoke, Stripe live, or brokered x402. Live-money gate open requires review; Connect reserve/finalize unlisted.
- Blocks: First-dollar go-live, hosted x402 certification.

**Chat as a thin execute adapter:**
- Problem: MCP/CLI execute keyless reads; chat often does not (Known Bugs). No geocode tool; `agentJsonUrl` names businesses, not operations.
- Blocks: Treating chat as an execution adapter; honest place-implicit asks.

**Geocoding / place resolution as a listed operation:**
- Problem: No geocode operation on the Answer loop; forecast ops need coordinates.
- Blocks: Local-service and weather asks without hallucinated places.

**Live payouts and Stripe Connect onboard:**
- Problem: Ledger/allocation exist; Connect binding cannot persist (`connect_account_unlisted`); live transfers held behind Stripe readiness.
- Blocks: Supplier money leaving AE. Do not open the gate to unblock.

**Hosted leftover table cleanup:**
- Problem: Production Convex may still list retired inquiry/CR table names (`.planning/evidence/inquiry-export-2026-08-19/` census); dashboard delete not yet authorized/executed.
- Blocks: Clean hosted schema parity with the 51-table source census.

---

## Test Coverage Gaps

**Intentionally red Connect success path (do not green this cut):**
- What's not tested as green: Connect reserve/finalize persisting `moneyPayoutAccounts` rows.
- Files: `tests/unit/convex/payout-ledger-connect.test.ts`, `tests/unit/convex/payout-ledger-test-harness.ts`, `convex/moneyConnect.ts`
- Risk: A well-meaning agent "fixes" the red test by making the handlers succeed.
- Priority: High (protect fail-closed; keep red until founder decision)

**Admin/registration suites after the membership re-listing (re-verify, do not assume):**
- What's not verified in this read-only pass: Whether `tests/integration/admin-runtime.test.ts`, `tests/unit/convex/capability-contract-documents-runtime.test.ts`, `tests/unit/convex/harness-sessions-runtime.test.ts`, and `tests/integration/capability-supply-registration-*.test.ts` now pass with listed `adminMemberships` (prior map said 15/16 failed `authorization_denied`; source now supports success).
- Files: those test files, `convex/securityAdminMembership.ts`, `convex/securityShared.ts`, `tests/helpers/convex-fixtures.ts`
- Risk: Stale expectations in either direction — tests asserting denial that now passes, or fixtures seeding authority unintentionally.
- Priority: High — run the suites once on Node 22 before the next cut.

**Hosted production / deploy smoke vs deleted CR/inquiry:**
- What's not tested: Live `/api/v1/operations/call` on production; keep-51 table parity on hosted Convex; leftover hosted inquiry tables.
- Files: `package.json` `test:release:hosted*`, `tools/release/operation-gateway-production-smoke.ts`, `tests/deploy-smoke/*`
- Risk: Source green, hosted still serving leftovers.
- Priority: High

**Chat execute and catalog-ask play:**
- What's not tested: Composer asks actually calling `operation.execute`; agent-json operations URL; CLI JSON envelope as query.
- Files: `tests/e2e/landing-answer.spec.ts`, `tests/e2e/thread-first.spec.ts`, `tests/unit/answer/answer-tool-use-agent.test.ts`
- Risk: Eval contract server greens a scripted loop the live model does not follow.
- Priority: High

**Quality gate golden cases vs current landing copy:**
- What's not aligned: `eval/quality/cases/goldenCases.ts` still clusters `crypto`/`geocode`/`open-meteo` workflows (verified) while landing example asks are handshake/catalog asks (`src/modules/answer/catalog-example-asks.ts`).
- Files: `eval/quality/cases/goldenCases.ts`, `eval/quality/gate.ts`, `src/modules/answer/catalog-example-asks.ts`
- Risk: Quality gate passes on capabilities the landing surface no longer advertises.
- Priority: Medium

**Notification outbox hosted vs 410:**
- What's not tested as hosted: That enqueued notifications cannot dispatch Resend/Novu; deploy smokes still assume queued dispatch.
- Files: `convex/notificationOutbox.ts`, `convex/notificationOutboxPersistence.ts`, `tests/deploy-smoke/phase2-resend-dispatch-smoke.spec.ts`, `tests/deploy-smoke/phase2-novu-dispatch-smoke.spec.ts`
- Risk: Smokes against 410 look like infra failure.
- Priority: Medium

**SSRF allowlist semantics:**
- What's not tested: "This host cannot be owner-influenced" beyond the import scan.
- Files: `tests/unit/security/ssrf-surface-drift.test.ts`
- Risk: Allowlist growth without review.
- Priority: Medium

**Eval golden counts and interpretation literals:**
- What's not tested cheaply: `AnswerRequestInterpretation` schema evolution (duplicated literals, PAPERCUTS 179); golden request counts in `tests/eval/answer-pipeline.test.ts`.
- Files: `tests/eval/answer-pipeline.test.ts`, `eval/answer/lib/cases.ts`, `tests/helpers/openrouter-contract-server.ts`
- Priority: Low

**Dirty-tree gate pinning:**
- What's not tested: Release source gate has no `--require-clean` (PAPERCUTS 181); this tree carries 708 changed files, so gate results are hard to attribute.
- Files: `package.json` `test:release:source`, working tree
- Priority: Low

**Test-harness split traps (process debt):**
- What's not enforced: The recurring `vi.hoisted` harness-export failure mode (PAPERCUTS 246, 267, 280, 287, 288, 295) and harness-import-order requirement (PAPERCUTS 296, 291) have no lint/test guard; each new split suite can re-hit them.
- Files: `tests/unit/convex/*-harness.ts`, `tests/unit/answer/*-harness.ts`
- Priority: Low

`.env.local` and `.env.example` present at repo root — environment configuration only; contents never read or quoted in this document.

Largest complexity files (line counts, working tree, verified 2026-08-21): `tools/release/operation-gateway-production-smoke.ts` 5000, `src/routeTree.gen.ts` 2076 (generated, do not hand-edit), `src/modules/money/internal/ledger.ts` 1031 (over the 1k rule), `convex/moneyQualifiedUsePayout.ts` 999, `convex/moneyCreditTopup.ts` 999, `src/components/ae/chat/AeChat.tsx` 952, `convex/capabilitySupplyOwnerFunnelProjection.ts` 943, `convex/business.ts` 931, `convex/moneyRefund.ts` 919, `convex/moneyPayoutTransferShared.ts` 912, `convex/moneyExternalSpend.ts` 895, `convex/moneyPayoutTransferCompleteApply.ts` 892, `convex/moneyX402PaymentAttempts.ts` 827, `convex/capabilitySupplyPublish.ts` 808, `src/modules/answer-thread/internal/turn-orchestrator.ts` 736. (`convex/capabilityOperationInvocationWorker.ts` is now 43 lines — the prior 725-line concern is resolved.)

---

*Concerns audit: 2026-08-21*
