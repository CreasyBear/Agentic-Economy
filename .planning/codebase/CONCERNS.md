---
last_mapped_commit: 796c584aaac12a48443b2f42c9d0d69c949615e2
---
<!-- refreshed: 2026-08-20 -->
# Codebase Concerns

**Analysis Date:** 2026-08-20

Working-tree map of current source. Code is authoritative over `.planning/STATE.md`. Inquiry Convex modules, Customer Request HTTP, WorkTree/Study/demand TypeScript, and inquiry UI routes are absent — do not treat restoring inquiry as a fix. Live money / x402 / Stripe stay fail-closed — do not recommend opening the live-money gate. `.env` / `.env.*` files are noted by existence only; contents are not quoted.

TODO/FIXME/HACK/XXX: **not detected** in `src/` or `convex/` TypeScript. Debt here is structural, not comment-tagged. Friction log: `PAPERCUTS.md`.

Intentionally red tests (do not “fix” to green this cut): Connect reserve/finalize and Convex admin-membership success paths. See Known Bugs.

---

## Tech Debt

**Convex money / payout files sit on the 1k-line cliff (do not split this cut):**
- Issue: `convex/moneyCreditTopup.ts` is 999 lines, `convex/moneyQualifiedUsePayout.ts` is 999 lines, `src/modules/money/internal/ledger.ts` is 993 lines. Adding Convex validators or shared types immediately crosses 1000 (PAPERCUTS 294). Neighbor files are close: `convex/moneyRefund.ts` (919), `convex/moneyPayoutTransferShared.ts` (912), `convex/moneyPayoutTransferCompleteApply.ts` (892).
- Files: `convex/moneyCreditTopup.ts`, `convex/moneyQualifiedUsePayout.ts`, `src/modules/money/internal/ledger.ts`, `convex/moneyLedgerValues.ts`, `convex/moneyConnect.ts`, `convex/moneyLedger.ts` (363-line wrapper)
- Impact: The next validator/type add fails the 1k-line rule. Reviews already miss fail-closed branches.
- Fix approach: Do **not** split those three files this cut. Prefer `Infer` from existing `v.object` validators and shared unions in `convex/moneyLedgerValues.ts`. Keep ledger math in `src/modules/money/internal/ledger.ts`. Do not add a generic “retired table” helper.

**Invocation worker helpers import `convex/_generated` (leave those imports):**
- Issue: Worker peel lives under `src/modules/capability-execution/invocation-worker/` (`charge.ts`, `x402Route.ts`, `recover.ts`, `lease.ts`). Those files import `ActionCtx` / `internal` from `convex/_generated/server` and `convex/_generated/api`. Host `convex/capabilityOperationInvocationWorker.ts` is 725 lines and starts with `"use node"`.
- Files: `src/modules/capability-execution/invocation-worker/charge.ts`, `src/modules/capability-execution/invocation-worker/x402Route.ts`, `src/modules/capability-execution/invocation-worker/recover.ts`, `src/modules/capability-execution/invocation-worker/lease.ts`, `convex/capabilityOperationInvocationWorker.ts`
- Impact: A “generic Ctx port” would break Convex node-action registration. `recover.ts` / `x402Route.ts` import `undici` and must stay on the node action (PAPERCUTS 299).
- Fix approach: Leave the `_generated` imports. Do not invent a generic Ctx port. Keep `"use node"` on the Convex worker module.

**Dual catalog: owner offerings vs capability offerings:**
- Issue: Public listings live in `businessOfferings` / `businessOfferingRevisions` / `offeringAccessPaths`. Market operations live in `capabilityOfferings` / `capabilityPublications` / `capabilityTransportBindings`. HTTP `/api/businesses*` and `/api/v1/services*` stay frozen measured URLs, not the paid door.
- Files: `src/modules/catalog/internal/schema.ts`, `src/modules/capability-supply/internal/convex-schema.ts`, `src/modules/product-frontier/business-services-policy.ts`, `src/routes/api.businesses*.ts`, `src/routes/api.v1.services*.ts`, `src/modules/actions/index.ts`
- Impact: `tests/unit/product-frontier/business-services-policy.test.ts` asserts measured HTTP files stay and `registry.search` / `registry.detail` stay listed, while `registry.list` / `registry.services_*` stay **unlisted**. Chat `agentJsonUrl` still points at `/api/businesses/search` (`src/modules/answer/answer-synthesizer.ts` `buildAgentJsonUrl`) even when the turn used operations.
- Fix approach: Point Answer agent-json at `/api/v1/market-operations/search` when the tool loop used operations. Do not re-list `registry.list` / `registry.services_*`.

**Empty schema objects and leftover Convex handlers for unlisted families:**
- Issue: `convex/schema.ts` does not spread unlisted families. Empty table objects remain: `src/modules/routing-kernel/internal/convex-schema.ts` (`routingKernelTables = {}`), `src/modules/agent-access/internal/oauth-convex-schema.ts` (`agentAccessOAuthTables = {}`), `src/modules/notification-outbox/internal/schema.ts` (`notificationOutboxTables = {}`). P6 hasher still names unlisted families including inquiry 12.
- Files: those schema files; census `src/modules/product-frontier/table-export-tables.ts` (`INQUIRY_EXPORT_TABLES`, `CUSTOMER_REQUEST_EXPORT_TABLES`, `P6_CLOSEOUT_EXPORT_TABLES`); stub `convex/routingKernelV1History.ts` (admin query returns `not_found` / `authorization_denied`); operator-shaped `convex/notificationOutbox.ts` with persist no-ops in `convex/notificationOutboxPersistence.ts`
- Impact: Agents treat empty-schema modules as live storage. Notification persist returns immediately while `convex/notificationOutbox.ts` still looks like an operator surface. Hosted leftover table names (`.planning/evidence/inquiry-export-2026-08-19/`) are an ops census, not a restore target.
- Fix approach: Keep listed schema at 48 (`tests/unit/schema/convex-schema.test.ts` `durableTables`). Do not re-list inquiry / CR / RK / WorkTree / Study / outbox / OAuth tables. Do not restore inquiry Convex modules.

**Public action inventory is 14 listed ids; `findAction` does not resurrect tombstones:**
- Issue: `listActions()` in `src/modules/actions/index.ts` equals the 14 `requiredActionIds` in `.planning/evidence/product-frontier-baseline/product-frontier-manifest.json`. `findAction()` only searches that array. `QUARANTINE_FAMILY_ACTION_PREFIXES` is `[]` in `src/modules/product-frontier/quarantine-write-admission.ts`. HTTP `/api/v1/operations/execute` is the remaining 410 door.
- Files: `src/modules/actions/index.ts`, `src/modules/product-frontier/quarantine-write-admission.ts`, `src/routes/api.v1.operations.execute.ts`, `src/routes/api.v1.operations.call.ts`, `tests/imports/product-frontier-manifest.test.ts`, `tests/unit/actions/registry.test.ts`, `tests/unit/study-actions.test.ts`
- Impact: New work can re-register a retired id. Deleted family ids (`inquiry.*`, `study.*`, `customerRequest.*`) return `undefined` — do not re-add tombstone resolvers that mint those ids.
- Fix approach: Keep `findAction` as listed-only. Any new market action goes through `requiredActionIds` + MCP/CLI/Answer parity. Do not restore inquiry, Customer Request, WorkTree, or Study actions.

**OAuth / keys keep `customer_requests:*` ceiling tokens (do not mint `customer_requests:create`):**
- Issue: Mode strings `customer_requests:inspect_only|approve_each|bounded_mandate|full_yolo` are OAuth ceiling tokens in `src/modules/agent-access/contract.ts`. `CUSTOMER_REQUEST_AGENT_SCOPE` is still `'customer_requests:create'`. `canonicalAgentScopes` / `normalizeRequestedScopes` refuse that scope on new keys (`src/modules/agent-access/agent-access.ts`, `src/modules/agent-access/oauth-state.ts`).
- Files: `src/modules/agent-access/contract.ts`, `src/modules/agent-access/agent-access.ts`, `src/modules/agent-access/oauth-state.ts`, `tests/unit/agent-access.test.ts`, `tests/unit/agent-access-oauth-state.test.ts`
- Impact: Renaming the tokens breaks grant/OAuth parsers. Minting `customer_requests:create` reopens a deleted Customer Request write door.
- Fix approach: Keep the four mode strings as ceiling tokens. New OAuth/keys must not mint `customer_requests:create`. Do not treat the constant name as a product to restore.

**Funnel unions keep historical `inquiry_*` event names (do not re-emit):**
- Issue: Observability literals still include `inquiry_available_seen`, `inquiry_attempted`, `inquiry_started`, `inquiry_submitted`, `inquiry_rejected`, `owner_inquiry_read`, `owner_inquiry_replied`, `inquiry_closed`, plus operator flag `inquiry_owner_replies_enabled`. `shouldDropPublicFunnelSourceSync` drops `inquiry_attempted` as nonessential.
- Files: `src/modules/observability/internal/literals.ts`, `src/modules/observability/internal/funnel.ts`, `src/modules/observability/source-sync-gate.ts`, `convex/observability.ts`, `src/modules/observability/internal/operator-controls.ts`
- Impact: Deleting the union arms breaks stored-event decode. Re-emitting them pretends inquiry is live.
- Fix approach: Keep the names in the union. Do not re-emit. Do not add new inquiry funnel producers.

**Planning docs lag the current tree:**
- Issue: `.planning/codebase/STACK.md` still says 60 tables. CAPABILITY-MAP / PROMPT-DATA-FLOW / IA-DATA-FLOW / COPY-MAP name deleted kernels. Inquiry export JSONL under `.planning/evidence/inquiry-export-2026-08-19/` is a hosted leftover census.
- Files: `.planning/codebase/STACK.md`, `.planning/codebase/PROMPT-DATA-FLOW.md`, `.planning/codebase/IA-DATA-FLOW.md`, `.planning/codebase/CAPABILITY-MAP.md`, `.planning/COPY-MAP.md`, `.planning/STATE.md`
- Impact: New phases re-litigate deleted inquiry/CR kernels or “restore” work that already landed (Qualified Use, payouts, keep-48).
- Fix approach: Remap from current `durableTables` (48) + `listActions()` (14) + `/api/v1/operations/call`. Treat STATE historical blocks as archive.

**Convex wrappers-first peels and path-pinned scanners:**
- Issue: Family handlers live in siblings (`convex/securityAdminMembership.ts`, `convex/capabilitySupply*.ts`, `convex/harnessSessions*.ts`, `convex/answerThreads*.ts`, `convex/money*.ts`) while thinness/ts-standards tests pin filenames. `isDocumentedJsonBoundary` in `src/lib/ui/contract-scans.ts` allows `v.any()` only on `convex/capabilitySupply.ts`, `convex/capabilitySupplyOperations.ts`, `convex/capabilitySupplyOperationQueries.ts`, `convex/capabilitySupplyOperationKeyless.ts`, and `src/modules/capability-execution/internal/convex-schema.ts`.
- Files: `src/lib/ui/contract-scans.ts`, PAPERCUTS 264, 269, 270
- Impact: Moving a `v.any()` validator without editing the allowlist fails `test:ts-standards`. Thinness tests that grep the wrapper file fail until they read the family files.
- Fix approach: Update the path-pinned allowlist in the same PR as a peel. Do not broaden `v.any()` to new files.

**`exactOptionalPropertyTypes` + hashed prices / source-write args:**
- Issue: Optional price fields and `sourceWrite?: unknown` break `exactOptionalPropertyTypes` across money persist and hashed structures (PAPERCUTS 6, 283).
- Files: `tsconfig.json`, `src/modules/catalog/internal/offering-price.ts`, `convex/moneyCreditTopup.ts`, `convex/sourceWriteAdmission.ts`
- Impact: Typecheck red on optional hash/price fields; Convex `runMutation` arg pass-through fails.
- Fix approach: Populate sub-cent decimals at the operation-read boundary. Infer source-write args from validators and conditional-spread optionals. Do not persist undefined optional hashes.

**Local Convex codegen restores deleted modules:**
- Issue: `npx convex codegen` (non-dry-run) and `npm run dev:local` restore deleted Convex files from the last push (PAPERCUTS 263, 266). Parallel sandboxes recopied `convex/inquiries.ts` during the inquiry cut.
- Files: `package.json` `dev:local`, `tools/dev/local-dev.mjs`, Convex generated tree `convex/_generated/`
- Impact: Cut work reappears mid-session. Prefer `npm run check:convex-codegen` (`convex codegen --dry-run`).
- Fix approach: Stop the local stack before deleting Convex modules. Quote `inquiry*` globs under zsh `nomatch`. Do not restore inquiry files if codegen puts them back — delete again after stopping the stack.

**Business-tool comments still name `/tools/inquiry.submit`:**
- Issue: `src/modules/business-tools/public.ts` and `src/modules/business-tools/public-values.ts` comment that descriptors can be built without advertising a hosted send. `InquirySubmitToolId` remains an export name.
- Files: `src/modules/business-tools/public.ts`, `src/modules/business-tools/public-values.ts`
- Impact: Agents re-wire a hosted inquiry submit from the comment.
- Fix approach: Keep the tool id as a retired name if HTTP still needs it for 410/undefined. Do not add a live submit route.

---

## Known Bugs

**Chat turns often do not call `operation.execute` for catalog asks that MCP executes:**
- Symptoms: Landing EUR/USD and Berlin weather complete with work-log “No live operation was needed yet”. Anonymous MCP `ae_operation_execute` for Frankfurter EUR/USD returns a rate + `evidenceHash`. CLI `--operation-ref --candidate-digest` posts a JSON envelope as the user query; the model still skips execute.
- Files: `src/modules/answer/internal/answer-tool-use-agent.ts`, `src/modules/answer/internal/answer-agent-tools.ts`, `src/modules/answer-thread/internal/turn-orchestrator.ts`, `src/modules/answer/catalog-example-asks.ts`, `tools/ae/commands/ask.ts`, PAPERCUTS 223–228
- Trigger: Play `POST /api/answer/turn` with composer catalog asks, or CLI machine-selected follow-up after the host planner prune.
- Workaround: Call MCP `ae_operation_execute` / HTTP `POST /api/v1/operations/call` (paid) directly. Do not treat chat prose as execution evidence.

**Berlin weather invents coordinates; forecast op requires lat/long:**
- Symptoms: Chat prose cites Berlin coordinates with no execute record. Open-Meteo forecast accepts `latitude`/`longitude`. There is no geocode tool on the Answer loop. Landing copy is still “What is the current weather in Berlin?”
- Files: `src/modules/answer/catalog-example-asks.ts`, `src/routes/index.tsx`, curated Open-Meteo in `convex/curatedProviders.ts` / `src/modules/dev/internal/curated-cluster-c-fixtures.ts`, `tests/unit/capability-execution/operation-execute.test.ts`
- Trigger: “What is the current weather in Berlin?”
- Workaround: Execute forecast with explicit coordinates via MCP, or add a listed geocoding operation and require the model to call it before forecast. Do not restore host location injection.

**`agentJsonUrl` is always a business-directory URL:**
- Symptoms: After an FX ask, `complete.answer.agentJsonUrl` is `/api/businesses/search?q=…`. CLI cannot print `operationRef` / `evidenceHash` from chat stream events (plan/one-line/summary-delta/complete; no kernel tool JSON).
- Files: `src/modules/answer/answer-synthesizer.ts` (`buildAgentJsonUrl`), `src/modules/answer/internal/answer-agent-result.ts`, `src/components/ae/chat/answer-stream.ts`
- Trigger: Any Answer turn that builds a snapshot.
- Workaround: Use MCP/CLI operation search/detail/execute. Fix: choose agent-json from the tools actually run.

**Parramatta / location search is token overlap only:**
- Symptoms: Full-phrase local-service queries miss listings unless published words token-overlap. Trade-vocabulary expansion is absent (`src/modules/registry/internal/trade-vocabulary.ts` does not exist).
- Files: `src/modules/registry/internal/search.ts`, `src/modules/registry/internal/search-documents.ts`, `src/modules/answer/search-context.ts`, `eval/answer/lib/cases.ts` (`turn-perth-context-blocks-parramatta`)
- Trigger: Queries that do not token-overlap published words.
- Workaround: Search published tokens. Do not restore `trade-vocabulary.ts` or silent Perth defaults.

**Connect reserve/finalize always return `connect_account_unlisted` (tests expecting success stay red on purpose):**
- Symptoms: `reserveConnectAccountHandler` / `finalizeConnectAccountHandler` in `convex/moneyConnect.ts` return `{ kind: 'refused', code: 'connect_account_unlisted' }` with no DB write. `tests/unit/convex/payout-ledger-connect.test.ts` still expects `kind: 'accepted'` and a `moneyPayoutAccounts` row even after mocking `evaluateLiveMoneyGate` as accepted.
- Files: `convex/moneyConnect.ts`, `convex/moneyLedger.ts` (re-exports the mutations), `src/modules/money/internal/payout-connect-http.ts`, `tests/unit/convex/payout-ledger-connect.test.ts`, `tests/unit/convex/payout-ledger-test-harness.ts`, `tests/unit/money/owner-connect-http.test.ts`
- Trigger: `npm run test:unit` on the connect suite; any owner Connect reserve/finalize HTTP call.
- Workaround: Do not make these handlers succeed this cut. `bindConnectAccountHandler` remains the listed-table path behind the live-money gate. Keep tests red until a founder-authorized Connect table/policy change.

**Admin membership is always undefined (tests expecting grant/register success stay red on purpose):**
- Symptoms: `readActiveAdminMembership` in `convex/authz.ts` returns `undefined` after a token-identifier check. `loadAdminAuthoritySource` in `convex/securityAdminMembership.ts` always returns `{ adminMemberships: [], adminMembershipAuditEvents: [], auditEvents: [] }`. `adminMembershipFromDocument` returns `undefined`. `persistAdminAuthorityMutation` in `convex/securityShared.ts` is a no-op. `findAdminMembershipDocument` always `{ kind: 'missing' }`.
- Files: `convex/authz.ts`, `convex/securityAdminMembership.ts`, `convex/securityShared.ts`, `convex/security.ts`, `convex/capabilityContractDocuments.ts` (`register` refuses `authorization_denied` when authority is not allowed), `tests/integration/admin-runtime.test.ts` (expects `admin_membership_granted`), `tests/unit/convex/harness-sessions-runtime.test.ts` (seeds `adminMemberships` then expects `kind: 'allowed'`), `tests/unit/convex/capability-contract-documents-runtime.test.ts` (expects `kind: 'registered'`), `tests/integration/capability-supply-registration-offering.test.ts` (and sibling registration files; PAPERCUTS 298: 15/16 fail `authorization_denied`), `tests/unit/security/admin-authority.test.ts` (convex-test pin: both identities `missing_membership`)
- Trigger: Convex-test or FakeDb suites that seed memberships / call `ownerAdmin()` then expect allowed admin mutations.
- Workaround: In-memory `src/modules/security` grant/revoke tests in `tests/unit/security/admin-authority.test.ts` still pass because they never hit Convex load. Do not re-list admin membership tables this cut. Keep Convex success-expecting tests red.

**`inspectBindingControlState` / owner-admin Convex paths refuse `authorization_denied`:**
- Symptoms: PAPERCUTS 278: convex-test binding inspect returns `authorization_denied` because `readActiveAdminMembership` is a stub. Quarantine tests have to compute `bindingObservedRowDigest` via `backend.run` instead.
- Files: `convex/authz.ts`, `tests/integration/capability-publication-security.test.ts`, PAPERCUTS 278
- Trigger: Convex-test inspect/register/publish that requires admin authority.
- Workaround: Assert `authorization_denied` or compute digests without the admin readback. Do not re-insert memberships.

**P5-e measured actions vs 14-action inventory (aligned):**
- Symptoms: Measured HTTP URLs stay. `registry.list` / `registry.services_*` stay unlisted. `registry.search` / `registry.detail` stay in the 14.
- Files: `tests/unit/product-frontier/business-services-policy.test.ts`, `src/modules/product-frontier/business-services-policy.ts`, `tests/unit/actions/registry.test.ts`
- Trigger: `npm run test:unit` / `test:imports`.
- Workaround: Keep measured HTTP as adapters. Do not list the six historical service actions.

**Hosted Customer Request smoke is retired; inquiry HTTP is 404:**
- Symptoms: `test:release:hosted:retired` records the successor `/api/v1/operations/call`. `tests/e2e/public-owner-ui.spec.ts` asserts `/demo-inquiry-provider/inquiry`, `/owner/inquiries`, and `/admin/inquiries` are 404. `tests/deploy-smoke/phase2-support-record-smoke.spec.ts` asserts `/{slug}/inquiry` is 404.
- Files: `tools/release/customer-request-hosted-retired.ts`, `package.json` `test:release:hosted*`, `tests/e2e/public-owner-ui.spec.ts`, `tests/deploy-smoke/phase2-support-record-smoke.spec.ts`
- Trigger: Direct CR smokes / old inquiry URLs.
- Workaround: Do not run CR smokes. Do not restore inquiry routes. Live paid proof remains opt-in `test:release:hosted:live-gateway` after counsel — still fail-closed in source.

**Notification Novu/Resend HTTP dispatch is 410:**
- Symptoms: `sendOwnerInquiryResendEmail` and `triggerInquiryNovuWorkflow` / `triggerOwnerInquiryNovuWorkflow` throw `NotificationProviderError` `unsupported_notification_dispatch` status 410. `tests/unit/server/notification-provider-seam.test.ts` pins that. In-memory `tests/unit/notification-outbox/readback.test.ts` still models successful Resend/Novu dispatch against module state. Deploy smokes `tests/deploy-smoke/phase2-resend-dispatch-smoke.spec.ts` and `phase2-novu-dispatch-smoke.spec.ts` still exist.
- Files: `src/lib/server/notification-provider-resend.ts`, `src/lib/server/notification-provider-novu.ts`, `src/lib/server/notification-dispatch.ts`, `convex/notificationOutboxPersistence.ts`, `convex/notificationOutbox.ts`
- Trigger: Any owner-inquiry provider send; hosted provider smokes against current dispatch.
- Workaround: Do not re-enable HTTP dispatch. Do not treat in-memory outbox success as hosted send proof.

---

## Security Considerations

**Live money is fail-closed by source policy, not an env flag:**
- Risk: Flipping an environment variable must not open Stripe live charges, Connect payouts, or production x402.
- Files: `src/modules/money/internal/live-money-gate.ts` (`LIVE_MONEY_GATE_POLICY`: all six counsel signoffs `open`, `stripe.mode: 'test'`, `readiness: 'unavailable'`), `src/modules/money/server.ts`, `src/lib/server/stripe-money-provider.ts`, `src/lib/server/stripe-money-provider-config.ts`, `convex/moneyLedger.ts`, `convex/moneyConnect.ts`
- Current mitigation: `evaluateLiveMoneyGate` refuses `live_money_gate_open` until every counsel decision is `accepted` with `artifactRef`, then `stripe_setup_required` until live Stripe is `ready`. Connect reserve/finalize are additionally hard-refused `connect_account_unlisted`. UI copy in `src/components/ae/console/AeCreditTopUpPanel.tsx` and `src/components/ae/supply/AeSupplyEarningsCard.tsx` states transfers are held.
- Recommendations: Keep counsel artifacts in `.planning/research/` (pack ref `2026-08-01-compliance-first-dollar-counsel-pack.md`). Do not replace the policy object with `NODE_ENV`. Do not open the live-money gate in code. Hosted first-dollar needs a separate certification packet.

**Provider-direct x402 is refused in production:**
- Risk: Direct rail settles outside AE’s ledger (no rake, no dispute answer, no output-before-value).
- Files: `src/modules/capability-supply/internal/x402-invocation-policy.ts` (`paymentLaneAdmission`), `convex/moneyX402PaymentAttempts.ts`, `src/modules/capability-execution/invocation-worker/x402Route.ts`, `tests/unit/capability-supply/x402-invocation-policy.test.ts`, `tests/unit/action-invocation/x402-payment-reconciliation.test.ts`
- Current mitigation: Production admits only `brokered`. Non-production keeps `provider_direct_x402` for conformance. Attempts persist on `moneyX402PaymentAttempts`.
- Recommendations: Never re-query `customerRequestX402PaymentAttempts`. Keep `@x402/core` schema composition behind `safeParse` plus a non-empty CAIP-2 guard (PAPERCUTS 16: dependency Zod runtime is not this repo’s Zod).

**SSRF: dynamic `fetch` must import network-guard:**
- Risk: Owner- or model-supplied URLs reaching link-local, metadata, or private ranges.
- Files: `tests/unit/security/ssrf-surface-drift.test.ts`, `src/modules/network-guard/public.ts`, `src/modules/capability-execution/operation-execute.functions.ts`, allowlist `src/modules/answer/internal/answer-tool-use-agent.ts`, `src/modules/answer/internal/openrouter-models.ts`, `src/modules/routing-kernel/caller-identity.ts`, worker `convex/capabilityOperationInvocationWorker.ts` (undici `Agent` + `guardedFetch`)
- Current mitigation: Scan of `convex/`, `src/routes/`, `src/modules/` for non-literal `fetch(`; violations must import network-guard. Keyless execute is HTTPS-only. CLI policy `tools/ae/lib/policy.ts` repeats `https_only`.
- Recommendations: Do not grow `KNOWN_PROVIDER_CLIENT_FILES` for owner-influenced URLs. Answer OpenRouter allowlist is fixed-host only. Extending the list is a security decision, not a silence-the-test change.

**Source-write secrets and Clerk bypass:**
- Risk: Client-bundled source-write material, production auth bypass, webhook spoofing.
- Files: `.env.example` present (template names only); `src/lib/ui/contract-scans.ts` forbids `VITE_AE_SOURCE_WRITE_SECRET`; `src/lib/server/local-e2e-bypass.ts` throws if `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E` in production; `src/lib/client/local-e2e-auth.ts`; `tests/unit/server/server-seams.test.ts`; `convex/sourceWriteAdmission.ts`; Stripe webhook body cap in `src/lib/server/stripe-money-provider-config.ts` (`MAX_WEBHOOK_BODY_BYTES` = 256 KiB)
- Current mitigation: Scoped `AE_SOURCE_WRITE_KEY_*` families; HKDF derivation from server-only `AE_SOURCE_WRITE_SECRET` in non-production; scan tests for public-env leaks.
- Recommendations: Never read or commit `.env`. Production must set per-family keys, not rely on derived secret. Keep `AE_X402_PAYMENT_PRIVATE_KEY` / `AE_X402_RPC_URLS_JSON` server-only (`convex/convex.config.ts` env validators).

**Two “dispute” vocabularies:**
- Risk: Privacy removal disputes vs money chargeback/recovery get mixed.
- Files: `src/modules/security/internal/disputes.ts`, `convex/securityRemovalDisputes.ts`, `tests/unit/security/disputes.test.ts` (hashes only; no raw email/phone in state); money `recoveryDue` in `src/modules/money/internal/ledger.ts`; live-money counsel `refund_dispute_chargeback_responsibility` still `open`
- Current mitigation: Removal disputes store contact/evidence hashes on listed `disputes`. Money recovery is ledger fields, not the `disputes` table. Admin membership persist is no-op, so dispute close that requires admin membership fails closed.
- Recommendations: Do not hang Stripe chargebacks on `disputes`. Keep CSRF on `openRemovalDispute`. Do not mix removal-dispute rows with payout recovery.

**Quarantine freeze is empty prefixes + `/execute` 410; Convex leftover mutations must refuse in-handler:**
- Risk: A caller with source-write or internal Convex can still mutate if leftover handlers are not fail-closed.
- Files: `src/modules/product-frontier/quarantine-write-admission.ts` (`QUARANTINE_FAMILY_ACTION_PREFIXES = []`; comment: Convex mutations stay writable), `src/routes/api.v1.operations.execute.ts` (410), `src/routes/api.v1.operations.call.ts` (paid door), `convex/notificationOutbox.ts` (retired errors), `convex/routingKernelV1History.ts` (`authorization_denied` / `not_found`)
- Current mitigation: Family HTTP including inquiry is gone (404), not 410. `/api/v1/operations/execute` is 410; paid door is `/call`. Inquiry Convex modules are absent.
- Recommendations: Every leftover Convex mutation for unlisted families must refuse in-handler. Do not add a shared no-op that returns success. Never 410 `/call`. Do not restore inquiry HTTP as 410 “tombstones” unless a listed door needs it — current e2e expects 404.

**OAuth / API keys must not mint `customer_requests:create`:**
- Risk: A new key with `customer_requests:create` looks like Customer Request write authority.
- Files: `src/modules/agent-access/contract.ts`, `src/modules/agent-access/agent-access.ts` (`canonicalAgentScopes` returns `undefined` if the scope is present), `src/modules/agent-access/oauth-state.ts` (`normalizeRequestedScopes`), `tests/unit/agent-access.test.ts`, `tests/e2e/public-owner-ui.spec.ts` (assistant text must not contain `customer_requests:create`)
- Current mitigation: Issue/normalize refuse the create scope. Ceiling tokens remain the four mode strings.
- Recommendations: Keep refusing `customer_requests:create`. Do not add it to `AGENT_ACCESS_OAUTH_DEVICE_CLIENT_REGISTRATION_REQUEST.scope`.

**Notification provider HTTP is 410:**
- Risk: Retrying Resend/Novu against retired inquiry dispatch looks like a send.
- Files: `src/lib/server/notification-provider-resend.ts`, `src/lib/server/notification-provider-novu.ts`, `convex/notificationOutboxPersistence.ts`
- Current mitigation: Provider send functions throw 410. Persist is a no-op. Operator retry mutations return `notification_operator_denied`.
- Recommendations: Do not reconnect Novu/Resend for inquiry. Config readers may still require env names for webhook verify; send paths stay 410.

---

## Performance Bottlenecks

**Answer turn: two-phase model loop + 30s lease:**
- Problem: Chat catalog asks take tens of seconds with “let me fetch / one moment” even when no operation runs. Preflight structured interpretation plus a bounded AI SDK tool loop plus a separate AnswerProse `generateText`.
- Files: `src/routes/api.answer.turn.ts` (16 KiB body `MAX_ANSWER_TURN_BODY_BYTES`, `x-ae-turn-key`), `convex/answerThreadsReserve.ts` (`ANSWER_THREAD_MAX_TURNS = 25`), `src/modules/answer-thread/answer-thread.schema.ts` (`ANSWER_TURN_EXECUTION_LEASE_MS = 30_000`), `src/modules/answer-thread/internal/turn-orchestrator.ts`, `src/modules/answer/internal/answer-query-safety.ts` (`maxOutputTokens: 256`, `maxRetries: 0`), `src/modules/answer/internal/answer-tool-use-agent.ts`
- Cause: OpenRouter round-trips, search-only budgets, and prose after tools. A model stop with no tool call is a legitimate end of the tool loop.
- Improvement path: Skip prose-phase when tools already produced gated snapshot fields. Fail faster when `classifier_unavailable`. Do not lengthen the lease to hide missing execute.

**Money / invoke file size at the 1k cliff:**
- Problem: Topup, qualified-use payout, and ledger math sit at 993–999 lines. Worker is 725 plus helpers. Reconciliation tests are split across `tests/unit/convex/money-ledger-*.test.ts`.
- Files: `convex/moneyCreditTopup.ts`, `convex/moneyQualifiedUsePayout.ts`, `src/modules/money/internal/ledger.ts`, `convex/capabilityOperationInvocationWorker.ts`, `convex/convex.config.ts` (`app.use(workpool)`)
- Cause: Exactly-once money and invoke were grown in place, then peeled into command files.
- Improvement path: Do not split the three cliff files this cut. Keep Workpool as `marketDispatchWorkpool` (do not delete the pool). Respect Convex 1MB document and 8192 array limits (`convex/_generated/ai/guidelines.md`).

**CLI / search payload noise:**
- Problem: `ae search --json` for a short query is large because navigation embeds full HTTP action schemas; items have `summary` but no top-level `name`.
- Files: `tools/ae/commands/ask.ts`, `src/modules/registry/operation-action-contracts.ts`, `src/modules/capability-supply/operation-projection.ts`
- Cause: Agent-facing descriptors include full input JSON Schema.
- Improvement path: CLI human mode: name + operationRef + price. Keep full schema on inspect/MCP.

**Eval and unit suites are heavy and order-sensitive:**
- Problem: `test:release:source` runs lint/typecheck after unit. PAPERCUTS 182: ts-standards hid behind a red unit suite. `tests/unit/market-terminal/cli-errors-*.test.ts` use 30s timeouts. Intentionally red admin/connect/registration tests make a full unit run red even when product code is fail-closed correctly.
- Files: `package.json` scripts, `eval/answer/lib/evaluators.ts` (165 lines after peel), `tests/eval/answer-pipeline.test.ts`, `tests/unit/convex/payout-ledger-connect.test.ts`, `tests/integration/admin-runtime.test.ts`
- Cause: Promptfoo + OpenRouter contract server; duplicated interpretation literals (PAPERCUTS 179); success-expecting tests against fail-closed stubs.
- Improvement path: Run `test:ts-standards` before slow suites. Shared `answerInterpretation({...})` builder. Do not green the Connect/admin success tests by reopening unlisted tables.

**Node 25 vs required 22.x:**
- Problem: Shell default Node 25 breaks `convex dev --once` (`DeploymentNotConfiguredForNodeActions`) and `tsx` loader (`--import` vs `--loader`). `package.json` `engines.node` is `22.x`. Worker helpers that import `undici` must run as Convex node actions (PAPERCUTS 208–211, 216, 299).
- Files: `package.json`, `.nvmrc`, `src/lib/deployment/manifest.ts`, `convex/capabilityOperationInvocationWorker.ts`, `src/modules/capability-execution/invocation-worker/x402Route.ts`
- Cause: Convex node actions + tsx ESM on Node 25.
- Improvement path: Use nvm 22 for Convex. Document in local-dev; do not “fix” by dropping node actions.

**`npm run papercut` appends without dedupe; zsh glob traps:**
- Problem: Recurring cargo-env / `$slug` / `inquiry*` glob traps are documented in `PAPERCUTS.md` Recurring and Close-loop-then-cut sections. Unquoted `ls tests/unit/convex/inquiry*` becomes bare `ls` of the repo root.
- Files: `PAPERCUTS.md`, `tools/dev/papercut.mjs`
- Cause: zsh `nomatch` / `$` in filenames; append-only ledger.
- Improvement path: Quote globs. Check Recurring before logging a duplicate.

---

## Fragile Areas

**Answer-thread tool loop (no host planner):**
- Files: `src/modules/answer-thread/internal/turn-orchestrator.ts`, `src/modules/answer/internal/answer-tool-use-agent.ts`, `src/modules/answer/internal/answer-agent-tools.ts`, `src/modules/answer/internal/answer-gate.ts`, `src/components/ae/chat/*`, `src/components/ae/artifacts/AeGenerativeAnswer.tsx`, `eval/answer/lib/cases.ts`
- Why fragile: Host does not plan query-shape routes; preflight interpretation is advisory. Continuation/rebinding that used to live in deleted `keyless-data-ask.ts` must live in continuation-state + tool loop or it is gone. Chat often skips `operation.execute`.
- Safe modification: Change the tool loop and gate together. Update Promptfoo via `auditPromptfooAnswerConfig` in `eval/answer/lib/coverage.ts`. Do not restore chips, a named router, or host location injection.
- Test coverage: Strong unit/eval on the intended tool loop (`tests/unit/answer/answer-selected-operation-loop.test.ts`); weak hosted/chat execute proof. Surviving `tests/unit/answer-thread/follow-up-intent.test.ts` covers regex intent, not chips.

**Eval/answer pipeline:**
- Files: `eval/answer/lib/cases.ts`, `eval/answer/lib/evaluators.ts`, `eval/answer/lib/coverage.ts`, `eval/answer/lib/scoring.ts`, `eval/answer/promptfooconfig.yaml`, `tests/eval/answer-pipeline.test.ts`, `tests/helpers/openrouter-contract-server.ts`
- Why fragile: Coverage tags are a floor (`ANSWER_EVAL_COVERAGE_REQUIREMENTS`). Promptfoo is answer-turn/thread/gate only (no `mode: chip` rows). Golden counts in `tests/eval/answer-pipeline.test.ts` break when the two-phase loop changes. No committed `output/eval/answer-suite-report.json`.
- Safe modification: Change cases first, then evaluators, then pipeline test golden numbers. Keep `near-me-location-guard` as “do not inject location into the query”.
- Test coverage: `npm run test:eval:report` is in the source gate; live Promptfoo + OpenRouter is config-gated.

**Fail-closed money + x402 + Stripe + Connect unlist:**
- Files: `src/modules/money/internal/live-money-gate.ts`, `src/lib/server/stripe-money-provider.ts`, `src/lib/server/stripe-money-webhook.ts`, `convex/moneyX402PaymentAttempts.ts`, `convex/moneyConnect.ts`, `convex/moneyCreditTopup.ts`, `convex/moneyQualifiedUsePayout.ts`, `src/modules/money/internal/ledger.ts`
- Why fragile: First-dollar policy, webhook idempotency (`moneyStripeEvents`), payout reserve-before-I/O, and x402 observation reconciliation must stay exact. `@x402/core` Zod cannot be embedded in repo Zod objects. Connect reserve/finalize are hard-unlisted on top of the gate.
- Safe modification: Tests in `tests/unit/money/`, `tests/unit/action-invocation/x402-payment-reconciliation.test.ts`, `tests/unit/convex/payout-ledger-transfer.test.ts` before any policy change. Do not open the live-money gate. Do not make Connect succeed to green `payout-ledger-connect.test.ts`.
- Test coverage: Source-strong for ledger math; hosted-live Stripe/x402 **not certified**. Connect success tests intentionally red.

**Admin membership unlist vs Convex-test fixtures:**
- Files: `convex/authz.ts`, `convex/securityAdminMembership.ts`, `tests/helpers/convex-fixtures.ts` (`ownerAdmin`), `tests/integration/capability-supply-registration-*.test.ts`, `tests/integration/admin-runtime.test.ts`
- Why fragile: Fixtures still insert or assume memberships. Loaders ignore the DB. `ownerAdmin()` does not make `resolveAdminAuthority` return `allowed`.
- Safe modification: Pin `authorization_denied` / `missing_membership` in Convex-test. Keep in-memory security tests on `src/modules/security`. Do not re-list membership tables.
- Test coverage: Fail-closed pin in `tests/unit/security/admin-authority.test.ts`; success-path integration tests stay red on purpose.

**Quarantine HTTP vs listed kernel:**
- Files: `src/routes/api.v1.operations.execute.ts`, `src/routes/api.v1.operations.call.ts`, `src/lib/server/mcp-api.ts`, `src/modules/product-frontier/deprecation-notice.ts` (`Sunset: Tue, 18 Aug 2026 23:59:59 GMT`)
- Why fragile: `/execute` 410 is easy to “fix” back to invoke. MCP must not host-410 listed tools; in-tool tombstone only if a tool is retired. Inquiry URLs are 404, not 410.
- Safe modification: Follow `tests/unit/product-frontier/deprecation-notice.test.ts` and `tests/unit/server/mcp-api-*.test.ts`. Never attach RFC 9745 headers to `/call`.
- Test coverage: Unit HTTP 410 on `/execute` is present; hosted 410 on production is consent-gated.

**Convex schema keep-48 + component tables:**
- Files: `tests/unit/schema/convex-schema.test.ts` (48 `durableTables`), `convex/schema.ts`, `convex/convex.config.ts` (workpool, rateLimiter, aggregate — **workflow is not mounted**)
- Why fragile: Component tables are not in the 48. Local `--replace-all` keep-48 import must never run `--prod`. Hosted deployment may still list leftover inquiry/CR names until a founder-authorized dashboard delete (`.planning/evidence/inquiry-export-2026-08-19/`).
- Safe modification: Any new `defineTable` updates `durableTables` and indexes in the same PR. Do not re-list the inquiry 12.
- Test coverage: Schema inventory test is the floor; hosted `npx convex data` is environment-specific.

**Worker `_generated` imports and `"use node"`:**
- Files: `src/modules/capability-execution/invocation-worker/*.ts`, `convex/capabilityOperationInvocationWorker.ts`
- Why fragile: Moving helpers behind a generic port breaks Convex codegen and node-action bundling. Node 25 cannot deploy those actions.
- Safe modification: Leave `_generated` imports. Keep `"use node"` on the worker. Run Convex on Node 22.
- Test coverage: `tests/unit/convex/capability-operation-recovery.test.ts` and worker harnesses; PAPERCUTS 279/287 on harness `vi.hoisted` export rules.

**Funnel `inquiry_*` union arms:**
- Files: `src/modules/observability/internal/literals.ts`, `src/modules/observability/internal/funnel.ts`, `convex/observability.ts`
- Why fragile: Removing names breaks decode of historical events; adding emitters pretends inquiry is live.
- Safe modification: Keep names. Do not re-emit. Drop public source-sync for `inquiry_attempted` stays in `src/modules/observability/source-sync-gate.ts`.
- Test coverage: `tests/unit/observability/funnel.test.ts` still lists the names.

**exactOptionalPropertyTypes + hashed prices:**
- Files: `tsconfig.json`, PAPERCUTS 6, `src/modules/catalog/internal/offering-price.ts`
- Why fragile: Optional price fields into `StableHashValue` / invocation writers break typecheck or hashes.
- Safe modification: Populate sub-cent decimals at the operation-read boundary, not in persisted hashes.
- Test coverage: Publication/importers and offering-price unit tests.

---

## Scaling Limits

**Answer threads:**
- Current capacity: 25 turns per thread (`convex/answerThreadsReserve.ts`); 30-second generation lease (`src/modules/answer-thread/answer-thread.schema.ts`); request body 16 KiB (`src/routes/api.answer.turn.ts`); preflight `maxOutputTokens: 256`.
- Limit: Lease expiry mid-tool-loop; thread cap forces a new thread; 16 KiB blocks large CLI JSON envelopes as the user query (amplifies the execute-skip bug).
- Scaling path: Raise caps only with persistence/replay tests in `tests/unit/answer-thread/`. Prefer operationRef in structured parts, not raw JSON as `query`.

**Convex documents and Workpool:**
- Current capacity: Convex 1MB/doc, 8192 array elements, 1024 object keys (guidelines). Workpool is mounted in `convex/convex.config.ts`; invoke queue stays Workpool. Workflow component is **not** mounted.
- Limit: Large OpenAPI descriptors, full action schemas in search hits, notification payloads (outbox tables unlisted — persist is no-op).
- Scaling path: Store hashes + bounded redacted payloads. Keep search projections in `registrySearchDocuments`.

**Money / payout:**
- Current capacity: Exact amounts, UTC-daily payout allocation, live transfers held while the gate is closed. Connect reserve/finalize unlisted.
- Limit: First-dollar counsel incomplete; Stripe Connect live unreadiness; production x402 direct rail refused; Connect onboard cannot persist.
- Scaling path: Counsel signoff artifacts, then Stripe live readiness, then hosted invoke smoke — not a code flag. Do not open the live-money gate to scale.

**Public HTTP catalogs:**
- Current capacity: Businesses/services URL expansion frozen; six measured paths retained (`src/modules/product-frontier/business-services-policy.ts`). Operation search query max 200 chars, max 20 results; compare/inspect-plan max four refs.
- Limit: Dual URL families confuse agents; full schemas bloat search; `agentJsonUrl` always hits businesses search.
- Scaling path: Freeze stands. Add operations URLs only, not new businesses/services paths.

**Listed schema 48:**
- Current capacity: 48 source-owned tables in `durableTables` (`tests/unit/schema/convex-schema.test.ts`). Inquiry family 12 is unlisted (`capabilityLaunchSupportRecords` + 7 inquiry + 4 governed-send in `INQUIRY_EXPORT_TABLES`). Do not re-list them.
- Limit: New product state requires dropping or justifying a 49th table against the reset cap.
- Scaling path: Founder-authorized cap change plus schema test. Component tables (Workpool/rate-limiter/aggregate) stay outside the 48.

---

## Dependencies at Risk

**Vercel AI SDK `ai` ^7.0.44 vs `@tanstack/ai` ^0.38.0:**
- Risk: Two JSON Schema / tool-contract worlds. Answer runtime uses `ai` (`generateText`, UIMessage stream). Action/harness contracts import `JSONSchema` / `convertSchemaToJsonSchema` from `@tanstack/ai` (`src/modules/common/action.ts`, `src/modules/actions/tool-contract.ts`, `src/modules/harness/tool-contract.ts`, `src/modules/answer/internal/action-to-tool-spec.ts`).
- Impact: Schema conversion drift between MCP/CLI descriptors and the OpenRouter tool loop.
- Migration plan: One schema pipeline. Do not add `@convex-dev/agent`; Convex Agent skill exists under `.agents/skills/convex-agent/` but the runtime is AI SDK + OpenRouter (`src/modules/model-gateway/public.ts`). Native `@tanstack/ai` schema migration stays deferred.

**`@x402/core` 2.18.0 + `zod` 4.4.3:**
- Risk: x402 `NetworkSchemaV2` is a different Zod runtime; cannot embed in repo Zod objects. Dependency schema accepts empty CAIP-2 (`eip155:`).
- Impact: Type/runtime parse failures; empty network refs.
- Migration plan: Keep `safeParse` + non-empty namespace/reference guard. Do not hoist x402 schemas into `exactOptionalPropertyTypes` objects.

**`@openrouter/ai-sdk-provider` ^3.0.0 + AI SDK 7:**
- Risk: Provider/SDK minor skew breaks tool-then-prose contract tests (`tests/helpers/openrouter-contract-server.ts`).
- Impact: Eval and integration Answer tests go red independently of product logic.
- Migration plan: Pin both on upgrades; keep the contract server as the fake.

**Clerk `1.4.9` vs TanStack Start `1.168.26` vs Router `1.170.16`:**
- Risk: Peer mismatch across `@clerk/tanstack-react-start`, `@tanstack/react-start`, `@tanstack/react-router`.
- Impact: Auth SSR / server-fn session bugs.
- Migration plan: Upgrade as a set. Keep production Clerk bypass throw in `src/lib/server/local-e2e-bypass.ts`.

**`nitro` nightly (`nitro-nightly@^3.0.1-20260628-…`) + Vite + TypeScript `6.0.3`:**
- Risk: Nightly bundler and TS 6 are ahead of most ecosystem types. Convex codegen + oxlint + react-doctor pre-commit already rewrite `convex/_generated` (PAPERCUTS 183).
- Impact: Flaky generate/build; generated files one commit behind schema.
- Migration plan: Stay on Node 22. Re-stage codegen the hook rewrites. Do not adopt Node 25.

**`@convex-dev/workflow` is unmounted; keep Workpool:**
- Risk: Re-adding `@convex-dev/workflow` because spine docs mention Workflow. Invoke queue is Workpool (`convex/convex.config.ts` uses `workpool`, `rateLimiter`, `aggregate` only).
- Impact: Component cost and “is Workflow the invoke queue?” confusion.
- Migration plan: Do not remount workflow. Keep `@convex-dev/workpool`.

**`promptfoo` ^0.121.17 + `braintrust` 3.27.0:**
- Risk: Eval config drift vs answer-turn cases. Chip provider path is gone; do not re-add `mode: chip`.
- Impact: `promptfoo eval` green on a deleted surface, or red on YAML drift.
- Migration plan: Keep `auditPromptfooAnswerConfig` as the floor. No chip tests.

**`undici` 7.28.0:**
- Risk: undici dispatcher is the SSRF-safe outbound path. Accidental raw `fetch` bypasses the guard (caught by ssrf-surface-drift if non-literal).
- Impact: SSRF if a new dynamic fetch skips network-guard.
- Migration plan: Keep undici behind network-guard. Do not re-add `graphology` (removed with WorkTree TypeScript).

**Lockfile / package manager:**
- Risk: Historical PAPERCUTS `npm ci` EUSAGE / yarn `packageManager` mismatch. Current `package.json` has `"packageManager": "npm@11.5.1"`.
- Impact: Fresh clones fail install if lockfile drifts again.
- Migration plan: `npm ci` on Node 22 after any dependency change. Do not reintroduce yarn.

---

## Missing Critical Features

**Hosted-live-certified market loop:**
- Problem: Source tests and local keep-48 Convex do not prove production invoke, Stripe live, or brokered x402. Production dashboard delete of leftover inquiry/CR tables is not authorized. Live-money gate stays closed.
- Blocks: First-dollar go-live, hosted x402 certification, treating chat as an execution adapter.

**Chat as a thin execute adapter:**
- Problem: MCP/CLI can execute keyless reads; chat often does not. No geocode tool in the Answer loop. `agentJsonUrl` does not name operations.
- Blocks: “Chat has no tool MCP lacks” is a structural assertion (`tests/imports/product-frontier-manifest.test.ts`); the reverse — chat actually calling those tools for catalog asks — is unproven in play.

**Geocoding / place resolution as a listed operation:**
- Problem: Weather and local-service copy assume a place. Forecast ops need coordinates. Host location injection is absent on purpose.
- Blocks: Honest Berlin weather and local-service Answer without hallucinated coordinates.

**Source-owned admin membership persist:**
- Problem: Convex admin membership is always undefined; grant/bootstrap persist is a no-op. Operator admin UI copy in `src/routes/_operator/admin.claims.tsx` says review happens only after source-owned admin membership is active.
- Blocks: Admin claims queue, contract registration, capability-supply admin registration, harness private-payload admin reads. Do not re-list membership tables without a founder-authorized schema change. Tests expecting success stay red on purpose.

**Live payouts and Stripe Connect onboard:**
- Problem: Daily allocation and ledger exist; live transfers remain held. Connect reserve/finalize return `connect_account_unlisted`. Counsel `stripe_connect_flow_payout_reconciliation` is `open`.
- Blocks: Supplier money leaving AE; Connect account binding via reserve/finalize. Do not open the live-money gate to unblock this.

**Remapped codebase docs:**
- Problem: CONCERNS is current; STACK/CAPABILITY-MAP/PROMPT-DATA-FLOW/IA-DATA-FLOW/COPY-MAP still name deleted files, 60 tables, or historical kernels.
- Blocks: Safe `$gsd-plan-phase` / execute without re-litigating inquiry or opening money.

Do **not** treat “inquiry and notification as a live conversion loop” as a missing feature to restore. Inquiry leaves the core. Notification HTTP dispatch stays 410.

---

## Test Coverage Gaps

**Intentionally red Convex success paths (do not green this cut):**
- What's not tested as green: Connect reserve/finalize success; Convex admin grant/bootstrap persist; capability-contract `register` success; capability-supply registration admit after `ownerAdmin()`; harness admin private-payload `kind: 'allowed'`.
- Files: `tests/unit/convex/payout-ledger-connect.test.ts`, `tests/integration/admin-runtime.test.ts`, `tests/unit/convex/capability-contract-documents-runtime.test.ts`, `tests/integration/capability-supply-registration-offering.test.ts`, `tests/integration/capability-supply-registration-binding.test.ts`, `tests/integration/capability-supply-registration-eligibility.test.ts`, `tests/unit/convex/harness-sessions-runtime.test.ts`
- Risk: A well-meaning agent “fixes” red tests by re-listing unlisted tables or opening Connect.
- Priority: High (protect fail-closed; keep red)

**Hosted production / deploy smoke vs deleted CR/inquiry:**
- What's not tested: Live `/api/v1/operations/call` on production; keep-48 table list on production Convex; leftover hosted inquiry tables until founder delete.
- Files: `package.json` `test:release:hosted*`, `tools/release/operation-gateway-production-smoke.ts` (~5000 lines), `tests/deploy-smoke/*`
- Risk: Source green, hosted still serving leftover inquiry/CR table names.
- Priority: High

**Chat execute and catalog-ask play:**
- What's not tested: EUR/USD and Berlin weather actually calling `operation.execute`; agent-json operations URL; CLI JSON envelope as query.
- Files: `tests/e2e/landing-answer.spec.ts`, `tests/e2e/thread-first.spec.ts`, `tests/unit/answer/answer-tool-use-agent.test.ts`
- Risk: Eval contract server greens a scripted tool loop that the live model does not follow.
- Priority: High

**Notification outbox after unlist vs 410 HTTP:**
- What's not tested as hosted: That inquiry notification enqueue cannot dispatch Resend/Novu. In-memory outbox tests still succeed. Provider deploy smokes still assume queued dispatches.
- Files: `convex/notificationOutbox.ts`, `convex/notificationOutboxPersistence.ts`, `tests/unit/notification-outbox/readback.test.ts`, `tests/deploy-smoke/phase2-resend-dispatch-smoke.spec.ts`, `tests/deploy-smoke/phase2-novu-dispatch-smoke.spec.ts`, `src/lib/server/notification-provider-resend.ts`, `src/lib/server/notification-provider-novu.ts`
- Risk: Operator retry UI on a no-op persist; smokes against 410 look like infra failure.
- Priority: Medium

**SSRF allowlist growth:**
- What's not tested: Semantic “this host cannot be owner-influenced” beyond the import scan.
- Files: `tests/unit/security/ssrf-surface-drift.test.ts`
- Risk: New OpenRouter-like clients added to the allowlist without review.
- Priority: Medium

**Quality-gate golden cases vs current catalog:**
- What's not tested against current seed: `eval/quality/cases/goldenCases.ts` still clusters `open-meteo.geocoding`, geocode Paris, wikipedia/crypto workflows while landing/composer copy is ECB FX + Berlin weather (`src/modules/answer/catalog-example-asks.ts`). Comments still mention `customerRequest.planPreview`.
- Files: `eval/quality/cases/goldenCases.ts`, `eval/quality/gate.ts`, `src/modules/answer/catalog-example-asks.ts`, `src/routes/index.tsx`
- Risk: Quality gate can pass on a capability set the chat host does not actually run.
- Priority: Medium

**Eval golden counts and interpretation literals:**
- What's not tested cheaply: Schema evolution of AnswerRequestInterpretation (duplicated literals — PAPERCUTS 179).
- Files: `tests/eval/answer-pipeline.test.ts`, `tests/helpers/openrouter-contract-server.ts`, `eval/answer/lib/cases.ts`
- Risk: Preflight field adds become a multi-file typecheck slog; golden request counts bit-rot.
- Priority: Low

**Import-gate hole class (resolved in `package.json`, easy to reintroduce):**
- What's not tested if scripts list deleted files: Vitest skip-missing can keep `test:imports` green (PAPERCUTS 219). Current `package.json` `test:imports` uses `tools/dev/run-listed-vitest.mjs`, which **fails if a listed path is missing**.
- Files: `package.json` `test:imports`, `tools/dev/run-listed-vitest.mjs`
- Risk: A future script-list edit pointing at a deleted path fails closed only if the runner treats missing files as errors.
- Priority: Low

**Follow-up chips / location filter / evidence assembler / WorkTree home (cleared):**
- What's not tested: Deleted surfaces (good). Home `/` uses `AE_CATALOG_EXAMPLE_ASKS` and does not load WorkTree (`src/routes/index.tsx`). `tests/unit/routes/home-work-tree-loop.test.ts` is the root redirect, not a WorkTree product test. `tests/unit/study-actions.test.ts` asserts `study.*` ids are undefined.
- Files: `src/routes/index.tsx`, `eval/answer/promptfooconfig.yaml`, `src/modules/answer/catalog-example-asks.ts`
- Risk: Do not restore chips, WorkTree on `/`, or inquiry UI.
- Priority: Low

**TODO/FIXME scan:**
- What's not tested: Absence of TODO comments is not absence of debt. `PAPERCUTS.md` is the friction log (Node 25, codegen restore, `vi.hoisted` export, 1k-line cliff, intentionally red admin/connect tests).
- Files: `PAPERCUTS.md`
- Risk: Agents ignore PAPERCUTS and re-hit Node 25, worktree `node_modules`, Convex codegen traps, or “fix” red tests by re-listing tables.
- Priority: Low

**Dirty-tree mapping and gate pinning:**
- What's not tested: Release source gate has no `--require-clean` (PAPERCUTS 181). This working tree is a large uncommitted prune plus leftover planning diffs.
- Files: `package.json` `test:release:source`, entire uncommitted set in git status
- Risk: Mid-run edits look like baseline failures; `git diff --check` cannot gate one stream.
- Priority: Low

`.env` file: not detected at repo root. `.env.example` present — environment configuration template only.

Largest complexity files (line counts, working tree): `tools/release/operation-gateway-production-smoke.ts` ~5000, `src/routeTree.gen.ts` ~2076 (generated, do not hand-edit), `tools/dev/fixtures/capability-supply/development-dynamic-invocation-evidence.ts` ~1027, `convex/moneyQualifiedUsePayout.ts` 999, `convex/moneyCreditTopup.ts` 999, `src/modules/money/internal/ledger.ts` 993, `src/modules/dev/internal/curated-cluster-a-publications.ts` ~987, `src/modules/capability-supply/internal/publication-importer-openapi.ts` ~979, `src/components/ae/chat/AeChat.tsx` ~952, `convex/capabilitySupplyOwnerFunnelProjection.ts` ~943, `convex/capabilityOperationInvocationWorker.ts` 725.

---

*Concerns audit: 2026-08-20*
