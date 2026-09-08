# Codebase Concerns

**Analysis Date:** 2026-09-04

## Tech Debt

**Oversized security, authority, supply, and money modules:**
- Issue: Several high-consequence modules combine validation, persistence, state transitions, projections, and provider adapters in one file. The largest maintained examples are `convex/agentAccessOAuth.ts` (1,910 lines), `convex/agentAccessPrincipals.ts` (1,864), `convex/lib/providerConnections/owner.ts` (1,757), `convex/catalogOfferingMutations.ts` (1,745), `src/lib/server/agent-access-oauth-api.ts` (1,601), `convex/moneyAccountFunding.ts` (1,405), `src/modules/money/formance.ts` (1,364), and `src/modules/capability-supply/supply-actions.ts` (1,367).
- Files: `convex/agentAccessOAuth.ts`, `convex/agentAccessPrincipals.ts`, `convex/lib/providerConnections/owner.ts`, `convex/catalogOfferingMutations.ts`, `src/lib/server/agent-access-oauth-api.ts`, `convex/moneyAccountFunding.ts`, `src/modules/money/formance.ts`, `src/modules/capability-supply/supply-actions.ts`
- Impact: A small policy or state-machine change has a large review surface and can couple unrelated lifecycle branches. This is most dangerous in OAuth rotation, Account Funding, and Provider publication because each path combines authority and external effects.
- Fix approach: Split by stable responsibility already visible in the code: pure contracts and validators, command admission, persistence, provider transport, and read projections. Preserve the public entry points and add a second module only where a real caller boundary exists.

**White-box test exception inventory:**
- Issue: The module-boundary manifest carries a large explicit `whiteBoxTestExceptions` list allowing tests to import internal implementation paths. The runtime exception list is empty, but test coupling remains substantial.
- Files: `src/modules/module-boundaries.ts`, `src/lib/ui/contract-scans/module-boundaries.ts`, `tests/imports/module-boundaries.test.ts`
- Impact: Internal refactors can cause broad test churn even when observable behavior is unchanged, weakening the black-box guarantee defined in `AGENTS.md`.
- Fix approach: Move reusable test setup behind public test harnesses or behavior-level HTTP/Convex adapters, then retire exception entries as each internal import disappears.

**Money cutover compatibility stubs:**
- Issue: Retired Convex credit reads remain callable but return `account_aud_required`; Provider earnings return `not_found` or `source_unavailable`; owner payout transfer paths authenticate and then always return `payout_not_ready`.
- Files: `convex/moneyLedger.ts`, `src/modules/money/internal/payout-transfer-http.ts`, `src/modules/money/server.ts`
- Impact: Callers can reach API-shaped paths that look implemented but cannot complete the economic workflow. Compatibility stubs increase the risk of confusing a deliberate refusal with a transient outage.
- Fix approach: Keep refusals explicit while completing the Formance-backed replacement, then remove retired exports and routes in the same compatibility migration. Do not keep two monetary authorities alive.

**Production dependency location — resolved 2026-09-08:**
- The exact Formance SDK 7.0.0 archive now lives at `vendor/formance-formance-sdk-7.0.0.tgz`.
- Root and spike manifests/locks use that shared archive; clean installs preserve version and integrity.
- Provenance remains in the spike's `SOURCE-PINS.md`; see `docs/workflow/work/WF-20260908-closeout.md` for verification and retained live-proof limits.

**Compiler and framework escape hatches:**
- Issue: TypeScript skips dependency declaration checking, Nitro uses a dated nightly build, and React Doctor is advisory rather than blocking.
- Files: `tsconfig.json`, `package.json`, `.github/workflows/react-doctor.yml`
- Impact: Incompatible dependency types, nightly regressions, or React security/performance findings can reach the main release gate without a dedicated failure signal.
- Fix approach: Remove `skipLibCheck` after dependency declarations pass, graduate Nitro to a stable pinned release when compatible, and promote React Doctor to a blocking level after the existing baseline is triaged.

## Known Bugs

**Recovery objective misses the declared RPO:**
- Symptoms: The isolated database restore is functionally correct and meets the 60-minute RTO, but the restored point is 308 seconds old against a 300-second RPO.
- Files: `docs/operations/deployment-maturity.md`, `docs/guides/package-4-release-evidence.md`, `infra/package4/recovery-drill/main.tf`, `infra/package4/recovery-drill/verify-restored-formance.sh`
- Trigger: Run the Package 4 point-in-time recovery drill against the declared five-minute recovery-point threshold.
- Workaround: Keep the environment below `RECOVERABLE` and production locked; repeat the drill with a restore point that remains at or below 300 seconds.

**Deployed Stripe boundary does not match the durable source boundary:**
- Symptoms: Source defines destination-isolated webhook verification, a durable inbox, and a dedicated Workpool, while the synthetic deployment still runs the synchronous webhook boundary. The live snapshot destination is unversioned and its event set is broader than the declared contract.
- Files: `src/routes/api.stripe.webhook.accounts-v2.ts`, `src/modules/money/server.ts`, `convex/moneyStripeWebhookInbox.ts`, `convex/moneyStripeWebhookWorker.ts`, `convex/stripeWebhookWorkpool.ts`, `docs/operations/deployment-maturity.md`
- Trigger: Compare the deployed Stripe destinations and event processing path with the source contract in `docs/operations/deployment-architecture.md`.
- Workaround: Production remains disabled. Deploy the exact source revision to synthetic, install restricted credentials, replay both destinations, and prove no queued or stranded work before release closure.

**Cost and forecast readback unavailable:**
- Symptoms: AWS Cost Explorer returns `DataUnavailable`; month-to-date cost and forecast cannot be evidenced even though budgets and anomaly detection exist.
- Files: `docs/operations/deployment-maturity.md`, `infra/package4/account-baseline/main.tf`
- Trigger: Query Cost Explorer before the new account has sufficient ingestion history.
- Workaround: Treat budget amounts as limits rather than observed cost and block production-capacity claims until provider readback returns actual usage and forecast.

## Security Considerations

**Synthetic Cloudflare Tunnel credential exposure:**
- Risk: A locally exposed Tunnel token can authorize an old connector until rotation and forced disconnection are proven. Continued use is accepted only for the synthetic release environment.
- Files: `docs/operations/deployment-maturity.md`, `docs/guides/package-4-release-evidence.md`, `infra/package4/modules/release-environment/cloudflare.tf`
- Current mitigation: The synthetic environment is not production, sensitive production data is absent, and the issue is recorded as an accepted release-only risk.
- Recommendations: Rotate the Tunnel credential, force-disconnect old connectors, bind both replicas to the new generation, and prove old-token denial before production.

**Recovery-drill database credential exposure:**
- Risk: The isolated restore credential is exposed and the retained drill remains addressable inside the recovery boundary.
- Files: `docs/operations/deployment-maturity.md`, `docs/guides/package-4-release-evidence.md`, `infra/package4/recovery-drill/main.tf`
- Current mitigation: The source database credential is rotated, Formance health is re-proven, the drill is isolated, and the exposed drill credential is ineligible for production.
- Recommendations: Do not retrieve or reuse the credential. Destroy the exact retained drill after evidence approval and create a fresh isolated target for the next recovery exercise.

**Deployment role exceeds steady-state least privilege:**
- Risk: The MFA-backed deployment role attaches AWS `PowerUserAccess`, increasing the blast radius of a compromised human deployment session.
- Files: `infra/package4/bootstrap/state-and-deployer.yaml`, `docs/operations/deployment-maturity.md`, `infra/package4/README.md`
- Current mitigation: Access uses named human login, MFA-backed temporary role assumption, root MFA, and no root access keys.
- Recommendations: Derive a narrow policy from the declared seven-day CloudTrail usage trace, preserve explicit `iam:PassRole` boundaries, and remove `PowerUserAccess` before production.

**Production legal and financial perimeter is deliberately unapproved:**
- Risk: Enabling production funding or mainnet settlement before Australian legal, AML/CTF, tax, and bank-account gates are approved could create regulated stored-value, remittance, GST, privacy, or client-money exposure.
- Files: `START_LINE.md`, `PRODUCT.md`, `convex/moneyCommercialPolicy.ts`, `src/modules/money/internal/convex-schema.ts`, `infra/package4/environments/production/main.tf`
- Current mitigation: Production policy supports `disabled_pending_approval`; the production infrastructure root is declared but unapplied; production funding and mainnet effects are disabled.
- Recommendations: Preserve fail-closed versioned policy admission. Require named external approvals and exact production readback before changing the policy state or applying the production root.

**Advisory-only React security scan:**
- Risk: React Doctor reports security, correctness, accessibility, and performance issues but never fails a pull request.
- Files: `.github/workflows/react-doctor.yml`, `doctor.config.ts`
- Current mitigation: The kernel release workflow separately runs lint, typecheck, unit, integration, import-boundary, UI-contract, E2E, accessibility, and build checks.
- Recommendations: Triage the current Doctor baseline and set blocking to `error`; keep the broader source gate as the primary release proof.

## Performance Bottlenecks

**Unbounded per-owner reads and fan-out:**
- Problem: `loadOfferingSourceState` collects every offering for a Business and then performs per-offering revision and access-path reads. OAuth family invalidation also collects every active family for a credential or Principal and patches them in parallel.
- Files: `convex/catalogOfferingMutations.ts`, `convex/agentAccessPrincipals.ts`
- Cause: `.collect()` and `Promise.all()` scale with total historical owner state rather than a fixed command batch.
- Improvement path: Add cursor-backed batches with durable continuation state. Keep revocation fail-closed across batches and enforce a maximum active-family policy at issuance.

**Webhook retries can occupy a narrow worker pool for long periods:**
- Problem: Stripe ingestion has four-way parallelism and up to 13 exponentially backed-off attempts starting at 60 seconds. Provider outages or poison events can create a long-lived queue.
- Files: `convex/stripeWebhookWorkpool.ts`, `convex/moneyStripeWebhookInbox.ts`, `convex/moneyStripeWebhookWorker.ts`
- Cause: All Checkout, refund, and Accounts v2 work shares one small pool and retry policy.
- Improvement path: Measure queue age and depth, alert on oldest queued event, quarantine deterministic refusals immediately, and split pools only when observed traffic or failure domains justify it.

**Large discovery payload baseline:**
- Problem: The recorded MCP manifest is 221,955 bytes, with 186,908 bytes in output schemas. Contract tests prevent more than 20% growth but do not make the baseline cheap for agents to fetch or parse.
- Files: `docs/guides/package-4-cutover-evidence.md`, `src/lib/server/mcp-api.ts`, `src/modules/actions/contract.ts`, `tests/unit/server/mcp-api-official-client.test.ts`
- Cause: A broad action surface publishes complete schemas together even though the managed Call path is intentionally narrow.
- Improvement path: Keep the canonical generated manifest, but expose compact action-specific discovery and avoid repeating schemas in search, status, and refusal responses.

## Fragile Areas

**Cross-system financial authority:**
- Files: `docs/operations/deployment-architecture.md`, `src/modules/money/formance.ts`, `src/modules/money/formance-workflows.ts`, `convex/moneyAccountFunding.ts`, `convex/moneyX402PaymentAuthorization.ts`, `convex/moneyDocuments.ts`
- Why fragile: Stripe owns funding evidence, Formance owns balances and postings, Convex owns authority/Commitment/Invocation/recovery, and x402/CDP owns payment submission evidence. A cached Convex projection must never authorize a financial consequence.
- Safe modification: Preserve exact durable references and idempotency digests across systems; write through Formance before finalizing Convex projections; treat provider timeouts as `outcome_unknown`; never net AUD and USDC legs.
- Test coverage: Deterministic and real-Formance tests exist, but the full authenticated funding-refund-managed-Call-document-close journey remains unproved in the synthetic release (`tests/integration/money-formance-boundary.test.ts`, `tests/e2e/authenticated/package4-account-commerce.spec.ts`, `docs/guides/package-4-release-evidence.md`).

**x402 possible-submission and recovery fence:**
- Files: `src/modules/capability-execution/invocation-worker/x402Authorization.ts`, `src/modules/capability-execution/invocation-worker/runRelease.ts`, `convex/lib/operationInvocations/dispatch.ts`, `convex/moneyX402PaymentAttempts.ts`, `src/routes/api.v1.operations.$invocationRef.reconcile.ts`
- Why fragile: A timeout after signing or submission cannot be classified as success or failure from transport errors. A blind retry can pay or invoke twice.
- Safe modification: Persist the possible-submission fence before signing, retain the stable Invocation reference, and require status/reconcile evidence before any new effect generation.
- Test coverage: Local deterministic tests cover state transitions, but the external Base Sepolia canary is absent from release evidence (`tests/unit/convex/money-x402-payment-attempts.test.ts`, `tests/unit/dev/x402-local-canary.test.ts`, `docs/guides/package-4-release-evidence.md`).

**Dual Stripe webhook destinations:**
- Files: `src/lib/server/stripe-money-webhook.ts`, `src/routes/api.stripe.webhook.ts`, `src/routes/api.stripe.webhook.accounts-v2.ts`, `convex/moneyStripeWebhookInbox.ts`
- Why fragile: Snapshot events and thin Accounts v2 events require different signatures and disjoint event vocabularies, yet converge on one durable inbox. Destination drift can reject valid events or admit the wrong payload class.
- Safe modification: Keep per-destination secrets and exact event allowlists, bind destination and payload digest to event identity, and hold conflicting replays for reconciliation.
- Test coverage: Unit tests cover parsing and inbox replay, while deployed redelivery, destination narrowing, and no-stranded-work evidence remain open (`tests/unit/money/stripe-webhook.test.ts`, `tests/unit/convex/money-stripe-webhook-inbox.test.ts`, `docs/operations/deployment-maturity.md`).

**Generated API and route artifacts:**
- Files: `convex/_generated/api.d.ts`, `convex/_generated/server.d.ts`, `src/routeTree.gen.ts`, `tools/release/verify-convex-generated-anonymous.ts`
- Why fragile: Route or Convex function changes require regenerated committed artifacts; stale output can compile locally through old declarations while deployment exposes a different contract.
- Safe modification: Regenerate through the maintained scripts, run the anonymous codegen drift check, and review generated diffs with the source change.
- Test coverage: CI proves anonymous generation does not mutate `convex/_generated`, but the proof applies only to the committed revision in `.github/workflows/kernel-release-gate.yml`.

**Single-host Formance application tier:**
- Files: `infra/package4/modules/release-environment/compute.tf`, `infra/package4/modules/release-environment/templates/bootstrap.sh.tftpl`, `infra/package4/environments/production/main.tf`
- Why fragile: Formance components have workload replicas but all run on one `t4g.large` k3s host. RDS is Multi-AZ, but host loss removes the application tier until replacement/bootstrap completes.
- Safe modification: Treat the single host as synthetic-release architecture. Before production availability claims, prove automated host replacement or move the workload to a multi-node managed control plane.
- Test coverage: Service restart and database restore are evidenced; full host-loss replacement is not listed as verified in `docs/guides/package-4-release-evidence.md`.

## Scaling Limits

**External registry ingestion caps:**
- Current capacity: One source job accepts at most 1,000 total entries, 200 Agentic Market services, eight pages, two sweeps, and a 20-second job deadline.
- Limit: Larger or slower registries become explicitly incomplete; the canonical market cannot assume the external snapshot is exhaustive.
- Scaling path: Persist source cursors and continuation checkpoints, retain provenance and incomplete reasons, and graduate entries in bounded batches (`src/modules/market/registry-source-adapters.ts`, `convex/marketExternalRegistryRefresh.ts`).

**Facilitator withdrawal scan cap:**
- Current capacity: Missing-publication withdrawal inspects at most 1,000 current publications for `ae:public` in one call.
- Limit: Once matching publications exceed the cap, records beyond the first batch can remain current even when absent from the latest source snapshot.
- Scaling path: Paginate the indexed scan with a durable cursor and complete all pages before declaring refresh success (`convex/facilitatorDiscovery.ts`).

**Convex workpool allocation:**
- Current capacity: Market dispatch reserves 32 of the documented 100 global Convex workpool slots; Stripe webhook processing uses four parallel workers.
- Limit: Concurrent refresh, invocation, and webhook bursts can contend for finite global action capacity; retrying provider failures extends slot occupancy.
- Scaling path: Track per-pool queue age, completion latency, and retry counts; adjust allocations from observed demand and isolate high-consequence financial work when contention appears (`convex/marketDispatchWorkpool.ts`, `convex/stripeWebhookWorkpool.ts`).

**Webhook health counters saturate at 100:**
- Current capacity: Health reads take at most 100 rows in each of stalled, failed, and reconciliation-required states.
- Limit: A reported value of 100 means “100 or more,” so operators cannot determine backlog magnitude from the health result.
- Scaling path: Return a saturation flag or use aggregate counters while preserving bounded reads (`convex/moneyStripeWebhookInbox.ts`).

## Dependencies at Risk

**Nitro nightly runtime:**
- Risk: The Vercel server runtime is pinned to `nitro-nightly@3.0.1-20260628-090458-3df69609`, which has a narrower stability and support expectation than a stable release.
- Impact: SSR, route handling, webhook raw-body behavior, or deployment output may regress on framework upgrades.
- Migration plan: Keep the exact pin until a stable Nitro version passes raw-body webhook, route suffix, Clerk SSR, build, and deploy-smoke tests; then replace the nightly alias in `package.json` and `package-lock.json`.

**Vendored Formance SDK tarball:**
- The audited local artifact is maintained in root `vendor/`; keep it in runtime source distributions.
- Changes require version/integrity review and clean-install verification for both consumers. Local vendoring does not replace upstream vulnerability or compatibility review.

**Provider SDK/API coupling across high-consequence paths:**
- Risk: Stripe, Convex Workpool, Formance, CDP, and x402 packages all participate in the managed Call and funding boundary.
- Impact: A provider API change can alter signature verification, retry semantics, transaction readback, or payment authorization across more than one subsystem.
- Migration plan: Keep provider packages pinned on consequence paths, upgrade one provider boundary at a time, and require exact replay/uncertainty tests (`src/lib/server/stripe-money-webhook.ts`, `src/modules/money/formance.ts`, `src/modules/capability-supply/internal/cdp-x402-payment-signer.ts`, `src/modules/capability-supply/internal/route-transport-x402.ts`).

## Missing Critical Features

**Production-ready managed x402 purchase:**
- Problem: Package 4 is deployed but not release-closed. Required live evidence is absent for durable Stripe replay/refund, managed x402 success/refusal/recovery, Calls/Usage/Spend documents, signed daily close, full protocol parity, strict restore, and Base Sepolia.
- Blocks: Production funding, production USDC settlement, and the first complete managed Call (`docs/operations/deployment-maturity.md`, `docs/guides/package-4-release-evidence.md`, `START_LINE.md`).

**Complete Australian principal-reseller record:**
- Problem: Buyer-facing Seller identity, separate Provider obligation, attributed tax facts, business-document evidence, and commercial closure are not one explicit production record.
- Blocks: A finance team cannot yet rely on one production record to explain the full purchase and remedy chain (`PRODUCT.md`, `CONTEXT.md`, `convex/moneyProviderObligations.ts`, `convex/moneyDocuments.ts`, `convex/capabilityOperationCalls.ts`).

**Provider payout execution:**
- Problem: The owner payout transfer boundary intentionally returns `payout_not_ready`; earnings reads on the retired money surface do not expose a live payout workflow.
- Blocks: Provider obligations cannot close through a production payout and recovery path (`src/modules/money/internal/payout-transfer-http.ts`, `convex/moneyLedger.ts`, `convex/moneyProviderObligations.ts`).

**Applied Cloudflare account alerts and production-ready token lifecycle:**
- Problem: The Cloudflare alert root is declared but unapplied because the available management token lacks the required API authority; the synthetic Tunnel token also requires rotation.
- Blocks: Cloudflare operations cannot be called observable or production-ready (`infra/cloudflare/account-baseline`, `docs/operations/deployment-maturity.md`).

## Test Coverage Gaps

**Authenticated commerce journey is optional in routine CI:**
- What's not tested: The normal push/PR source-proof job does not execute the exact-revision authenticated platform job; that job runs only on manual workflow dispatch. The Playwright specs skip when Clerk/owner/application configuration is absent.
- Files: `.github/workflows/kernel-release-gate.yml`, `tests/e2e/authenticated/environment.ts`, `tests/e2e/authenticated/package4-account-commerce.spec.ts`, `tests/e2e/authenticated/multi-agent-lifecycle.spec.ts`
- Risk: Identity, Account binding, hosted funding, and authenticated owner UI regressions can pass routine CI.
- Priority: High

**Real Formance suite is environment-gated:**
- What's not tested: The real Formance integration suite uses `describe.runIf(AE_FORMANCE_INTEGRATION === 'true')` and otherwise does not run.
- Files: `tests/integration/money-formance-boundary.test.ts`, `package.json`
- Risk: SDK, schema, cursor, contention, and exact-reference behavior can diverge from deterministic mocks without failing a standard local run.
- Priority: High

**External x402 canary lacks release evidence:**
- What's not tested: No remote HTTPS Base Sepolia Provider/payment-key proof is attached to the Package 4 release; local deterministic transport tests do not prove the external protocol, custody, or network boundary.
- Files: `tools/dev/x402-local-canary.ts`, `tests/unit/dev/x402-local-canary.test.ts`, `docs/guides/package-4-release-evidence.md`
- Risk: A real payment challenge, signature, RPC, or Provider incompatibility can appear only after release.
- Priority: High

**No enforced coverage threshold:**
- What's not tested: Vitest config defines test locations and setup but no line, branch, function, or statement thresholds; package scripts have no maintained coverage gate.
- Files: `vitest.config.ts`, `package.json`
- Risk: High-risk branches can lose coverage without a release-gate failure even though the suite contains hundreds of tests.
- Priority: Medium

**Host-loss recovery is not verified:**
- What's not tested: Service restart and database restore are proven, but replacement/bootstrap of the single k3s host after total host loss is not part of the verified release evidence.
- Files: `infra/package4/modules/release-environment/compute.tf`, `infra/package4/modules/release-environment/templates/bootstrap.sh.tftpl`, `docs/guides/package-4-release-evidence.md`
- Risk: Application-tier recovery time and secret rehydration remain unknown despite Multi-AZ database protection.
- Priority: High

---

*Concerns audit: 2026-09-04*
