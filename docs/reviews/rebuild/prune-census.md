# Prune census — canary, mocks, fixtures, release scripts

Snapshot 2026-09-29, this checkout, read-only. Money, supply, and chat files are being edited by other agents; re-grep before deleting anything they touch. Binding decisions: R2 prepaid purse (no second buyer charge, no Connect payouts), R3 x402 URL + payee proof (no provider-facing canary), R5 prune in place, R8 keep payment, authz, security, import-boundary, Convex fences, and journey tests. Rule 10: a script is not proof of the implementation.

Verdicts: **DELETE** means the whole file can go; **KEEP** means protective or required for local paid use; **DECIDE** means a shared file, a migration, or an in-flight owner. Counts are file length, not a diff.

## Totals

| Verdict | Files | Lines | What |
|---|---:|---:|---|
| DELETE | 71 | 15,900 | Seller-canary modules and their tests, local x402 canary, dev evidence packets and fixtures, two non-protective UI tests, one unused fixture |
| KEEP | 70 | 19,022 | Secret-isolation canary, dev seed, bazaar JSON used by parser tests, gate verifiers, 37 of the 40 densest mock tests |
| DECIDE | 28 | ~9,400 | Onboarding state machine, production smoke, package5, OpenAPI chooser, webhook script, one admin copy test. Shared Call-worker branches and the schema field are extra in-place edits, not in this line count |

No MSW handlers exist. Auto-recharge and post-paid invoice strings are already gone (0 files).

## 1. Canary

The seller onboarding canary is a second charge lane. AE spends platform USDC (`funding.kind: ae_owned`, `ledgerEffects: external_spend_only`, no buyer usage, no Provider earnings) to probe a seller, then promotes. It is not a step on Add Tool. A receipt shows it when `commercialModel === 'seller_canary_x402'` (`CallSummarySection.tsx`). Callers: `requestSellerOnboardingCanary` (`convex/capabilitySupplyOwnerCanary.ts`), funding provision and readiness, Call worker prepare/release/recovery, `prepareSellerOnboardingCanaryPaymentAuthorizationHandler`, `promoteAdmittedSellerCanaryHandler`, and `qualify-candidate` reason `seller_canary_admission_required`.

**DELETE** these file-owned modules (31 files, 6,155 lines) and their tests (5 files, 1,762 lines):

| Path | Lines | Role |
|---|---:|---|
| `src/modules/capability-supply/internal/x402-seller-onboarding/canary.ts` | 505 | Commitment, envelope, purpose `seller_onboarding_canary` |
| `convex/lib/capabilitySupply/canaryFunding/` (8 files, including `custody.ts` and `provision.ts`) | 1,512 | Platform grant, CDP balance, sandbox and production caps |
| `convex/capabilitySupplyCanaryFunding.ts` and `capabilitySupplyCanaryFundingPreflight.ts` | 221 | Internal mutations, queries, and the CDP action |
| `convex/lib/capabilitySupply/ownerCanary/` (4) and `convex/capabilitySupplyOwnerCanary.ts` | 682 | Owner request, evidence, identity |
| `convex/lib/catalog/sellerCanary/` (4) | 748 | Promote an admitted canary into the catalogue |
| `convex/lib/capabilitySupply/currentTool/sellerCanary.ts` | 282 | Canary operation snapshot |
| `convex/lib/money/x402PaymentAttempt/canary.ts` | 129 | Canary payment authority |
| `convex/lib/capabilityExecution/callProjection/canary.ts` | 185 | Canary projection |
| `sellerCanaryRearm.ts`, `sellerCanarySafeBeforeRelease.ts`, `sellerCanaryKnownUnpaid.ts`, `supplyCanaryAuthority.ts` | 700 | Canary-only Call recovery and authority |
| `src/modules/capability-execution/call-worker/sellerCanaryReceipt.ts` | 76 | Receipt that must not book buyer usage |
| `x402-seller-onboarding/promotion.ts` and `admission.ts` | 313 | Promotion gate and admission ref |
| `tools/dev/x402-local-canary.ts` | 802 | Local fake x402 server. Only caller is its unit test |
| Tests: funding-readiness 648, `seller-onboarding-canary.test.ts` 367, CDP preflight 416, `x402-seller-promotion.test.ts` 237, `x402-local-canary.test.ts` 94 | 1,762 | Pin the lane above |

**KEEP** secret isolation. It is a different mechanism: `src/modules/authority/recovery/secret-canary.ts` (83, `proveSecretCanaryIsolation`), called from the recovery public API, and `tests/security/maturity/isolation-secret-canary.test.ts` (113). Infisical tests use the string `vault-canary-never-observable` to prove a secret does not leak. Do not delete those.

**DECIDE.** Do not delete the whole file:

- `x402-seller-onboarding/lifecycle.ts` (250), `types.ts` (111), `identity.ts` (103), `index.ts` (48), and `x402-seller-onboarding-lifecycle.test.ts` (260). Payee identity stays. Canary states (`canary_pending`, `canary_failed`) go.
- Schema: optional `capabilityCalls.sellerOnboardingCanary` and table `sellerOnboardingCanaryRearmAudits` in `convex-schema.ts`. That is a migration. Historical rows must stay readable.
- Shared Call path. Strip the branch only: `call-execution-gates.ts`, `runPreparation.ts`, `runRelease.ts`, `x402Authorization.ts`, `recovery/{loading,x402,managedSigning,preSubmission}.ts`, `x402-call-policy.ts` (`managed_testnet_canary`), the canary rules in `cdp-x402-payment-policy.ts`, `qualify-candidate.ts`, supply-funnel canary types, and the `public.ts` / `server.ts` re-exports. STOP if a reference is not named here.

## 2. Tests that mock

175 test files contain 457 `vi.mock` calls. Twenty files have more than five. Assertions are not mostly `toHaveBeenCalled`. The called-heavy files are still a minority of `expect` (worst: `jit-provider-consequence.test.ts` 38/67, `route-transport-x402.test.ts` 49/112 with zero `vi.mock`). Those spy on real transport and Call boundaries. **KEEP.**

Top 40 by `vi.mock` count. **DELETE** (2 files, 311 lines): `toaster-placement.test.tsx` (9 mocks, 83 lines, Sonner offset only) and `tactile-navigation-physics.test.tsx` (4 mocks, 228 lines, motion polish). **DECIDE** `admin-call-object-route.test.tsx` (7, 124): keep the "no zero charge" assertion; the copy pin is an R8 wording test. **KEEP** the other 37 (14,772 lines). They assert authz, money, containment, or a real route outcome:

`chat-provider-boundary` 11/396, `provider-workspace` 11/219, `agent-access-caller-continuation` 11/392, `admin-observability` 9/172 (MFA and redaction), `detail-route-containment` 8/68, `source-first-owner` 7/495, `status-route` 7/261, `admin-providers-route` 7/184, `owner-tool-detail-route` 7/137, `x402-directory-page` 6/756, `supply-actions` 6/810, `owner-x402-connection-environment` 6/278, `owner-provider-connection-handoff-route` 6/407, `market-search` 6/299, `market-functions` 6/76, `capability-call-worker-harness` 6/1,651 (shared Call harness, not a test), `admin-object-pages-route` 6/130, `supply-owner-routes` 6/146, `owner-provider-connections` 5/424, `capability-call-authority-boundary` 5/1,360, `source-authority-review` 5/91, `privacy-removal-outcome` 5/119, `provider-workspace-functions` 5/261, `operator-shell-chrome` 5/533, `admin-role-gate` 5/175, `workspace-danger-zone` 5/216, `capability-call-identity` 5/217, `market-demand-actions` 4/510, `provider-consequence-coverage-gaps` 4/874, `provider-connection-handoff` 4/603, `start-observability` 4/176, `call-status-observation` 4/61, `provider-consequence` 4/537, `shell-a11y-focus` 4/241, `admin-overview-route` 4/107, `auth-redirect-sanitizer` 4/93, `demand-console` 3/1,297.

OpenAPI and Agent Plugin are still product UI, not a mock (`supply-source-type/`, 471 lines). That cut belongs to the supply prune.

## 3. Seeds, fixtures, demo code

**KEEP** the local seed the paid path uses: `convex/lib/dev/seed/` (15 files, 1,994; `local-dev.ts` calls `seedDevCatalog` and `publishSandboxTool`), `convex/devSeed.ts` (43), `convex/devSeedStore.ts` (170), `src/modules/dev/` (3 files, 234). `legacyPublication.ts` (264) is still called by `sandboxPublication.ts`. It is not dead.

**DELETE** development evidence the product does not call (27 files, 6,797 lines) and the tests that only lock those packets (5 files, 873). Packets: `tools/dev/{action-execution,spending-policy,unrestricted-test-only}-evidence-packet.ts`, `full-yolo-process-worker.ts`, `evidence-provenance.ts`, `development-provider-tool-evidence.ts`, `action-execution-development-evidence.ts` (7 files, 2,178; npm scripts `evidence:*:development`), and `tools/dev/fixtures/` (20 files, 4,619: fake provider, fake x402 port, published-tool evidence). Tests: `unrestricted-test-only.test.ts` 390, `spending-policy-packet.test.ts` 71, `development-evidence-surface.test.ts` 139, `development-provider-operation-packet.test.ts` 159, `development-provider-operation.test.ts` 114. Real spending-policy behaviour stays in `spending-policy.test.ts`.

**KEEP, but move off the product barrel:** `src/modules/capability-supply/internal/x402-bazaar-fixtures/` (4 JSON files, 483 lines). Only tests and `tests/helpers/discovered-tool-fixture.ts` import them, through `public.ts` lines 315–318. Delete that re-export. Leave the JSON beside the parser tests.

**DELETE** unused `tests/fixtures/bad-ui-contract/route-styles.fixture` (2 lines). Every other file under `tests/fixtures/` is referenced. `operation-secret.ts` is imported by the sibling boundary fixture. `convex-api-kind-snapshot.json` (3,537) is the Convex kind fence. Keep it.

**DECIDE** Connect remnants. Types only, no implementation: `ConnectAccountPort` in `src/modules/money/internal/ports.ts`, re-exported from `public.ts` and `server.ts`, and `stripeConnectIdempotencyKey` in `src/lib/server/stripe-idempotency.ts` (52 lines, shared with other Stripe keys — delete the Connect helpers only). `supply-funnel-harness.tsx` still mocks `createOwnerConnectAccountServer`. Tax-invoice modules (`tax-invoice-control.ts`, `invoice-history.view-model.ts`, `convex/lib/money/documents/`) are the money agent's R2 cut, not fixture code.

## 4. Release and verify scripts

`npm run gate` runs `test:release:source` only: deployment manifest, env example, anonymous Convex codegen, release integrity, then the prebuilt CLI check. It does not run the unit suite or the live gateway smoke.

**KEEP** because gate runs them: `verify-deployment-manifest.ts` 78, `verify-release-integrity.ts` 67, `verify-convex-generated-anonymous.ts` 203, `release-integrity.ts` 148, `render-env-example.ts` 344, `scripts/build-cli.ts` 46, `scripts/test-cli-package.ts` 244.

**DECIDE** the production smoke. It is not a duplicate of gate (9 files, 5,685 lines): `tool-gateway-production-smoke.ts` 1,095 and `-call` 563, `-discovery` 372, `-money` 410, `-receipt` 1,065, `-hosted-money` 763, `-hosted-owner` 1,078, `-hosted-runtime` 262, plus `validate-tool-gateway-production-smoke-receipt.ts` 77. Scripts: `smoke:gateway:production` and `test:release:live-gateway`. This is the only hosted money walk. Delete it only after a recorded CLI, HTTP, or MCP journey replaces it. `vercel-protection-bypass.ts` (11) goes with that smoke.

**DECIDE** `package5-provider-operations.ts` (544), `package5-reference-provider/` source excluding `node_modules` (`core.ts` 294, `api/fixture.ts` 75), fixtures 68, and tests `package5-provider-operations.test.ts` 367 plus `package5-reference-provider.test.ts` 227. That is a local reference provider, not gate. `scripts/audit-action-surfaces.ts` (195) is not in gate. `stripe-webhook-destinations.ts` (561) is money configuration, not a mock.

## Delete order

1. File-owned seller-canary modules and the five canary tests, then the local canary.
2. Evidence packets, `tools/dev/fixtures/`, and the five packet tests.
3. Toaster and tactile tests. Drop `route-styles.fixture`. Move the bazaar JSON off `public.ts`.
4. Strip canary branches and Connect types only after the money, supply, and chat edits land. STOP on any reference this census does not name. Do not drop `sellerOnboardingCanary` from the schema until its readers are gone.
