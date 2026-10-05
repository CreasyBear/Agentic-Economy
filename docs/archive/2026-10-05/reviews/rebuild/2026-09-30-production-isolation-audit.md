> **Archived 5 October 2026.** Dated evidence or proposal; not a current work queue or approval. See the [archive index](../../../README.md) for its successor and remaining limits.

# Production isolation for a real-money alpha (30 September 2026)

**Question:** in a production deployment, can sandbox, testnet, canary, test, mock, seed or synthetic code reach users or move money?

**Answer today: yes.** Five read-only audits (env defaults, seed and sandbox Tools, mocks, canary and release residue, money-rail readiness) found the cause. The environment is decided at many points, with many defaults, and most of those defaults are `sandbox` or permissive.

## Findings (P0 = can move real money wrongly or show fake Tools)

| # | Finding | Evidence | Sev |
|---|---|---|---|
| 1 | A missing `AE_SERVICE_MODE` means `standard`, which admits BOTH environments. Sandbox grants and Tools can Quote and Call in production | `service-mode.ts:4-14`, `issueQuote.ts:86-97` | P0 |
| 2 | Agent-key issuance, policy construction and the connect-agent UI default to sandbox | `agent-access.ts:264`, `agent-access.functions.ts:111,403`, `agent-key-draft.ts:28-30` | P0 |
| 3 | A missing or invalid `aeEnvironment` credential claim falls back to `sandbox` | `agent-access-auth.ts:288-293`, `policy.ts:31` | P0 |
| 4 | The owner-chat credential is hard-coded sandbox | `agent-access.functions.ts:476-480` | P0 |
| 5 | Stripe mode follows the key prefix. Production accepts `sk_test`/`rk_test` plus a test webhook and books test top-ups into the production Formance ledger, whose AUD account has no environment segment | `stripe-money-provider-config.ts:86-95`, `account-funding-http.ts:502-521`, `formance-transaction-templates.ts:710-717` | P0 |
| 6 | `hosted_alpha` and `AE_PACKAGE4_SANDBOX_DEPLOYMENT_PROFILE=synthetic_vps_fixture` make a production-class deployment use test Stripe and sandbox Formance. `hosted_alpha` is sandbox-only, which contradicts a real-money alpha | `manifest.ts:263-285`, `stripe-money-provider-config.ts:90-94` | P0 |
| 7 | The provider-consequence route signs production x402 with the sandbox-only raw-key signer | `api.internal.provider-consequence.ts:354-395,464-479`, `x402-payment-signer.ts:143-180` | P0 |
| 8 | Chat and search keep testnet or demo Tools when the query names them. The classifier ignores `runtimeEnvironment`, and non-x402 sandbox Tools pass as `unknown` network | `immediate.ts:77-80`, `search.ts:228-231`, `tool-choice-evidence.ts:4-25` | P0 |
| 9 | Sandbox Quote policy defaults to the `local_ci` fixture when the profile is absent | `commercialPolicy.ts:44-62`, `issueQuote.ts:112-117` | P0 |
| 10 | `unrestricted_test_only` is blocked for production grants, but the API accepts it for sandbox grants, and sandbox is the default | `agent-access.functions.ts:64-70,145-154` | P0 (with #1) |
| 11 | The dev seed can publish sandbox and Base Sepolia Tools with no deployment guard. It is internal only, with no production caller found | `devSeed.ts:21-36`, `sandboxPublication.ts:74-134` | P1 |
| 12 | The public `/api/v1/sandbox-reference` returns a deterministic synthetic token with no production gate | `api.v1.sandbox-reference.ts:13-73` | P1 |
| 13 | Market home rails use a wildcard network, so Base Sepolia rows appear | `x402-marketplace-home.server.ts:5-8`, `browse.ts:38-45` | P1 |
| 14 | Missing Stripe config silently makes public funding constraints sandbox | `account-funding-http.ts:322-336` | P1 |
| 15 | Quote accepts the latest treasury observation with no age check, so stale capacity can pass | `prepareFinancialSubjects.ts:141-154` | P1 |
| 16 | The manifest does not require Stripe, Formance or RPC groups in production, and readiness ignores them. Runtime fails closed at the boundary, but the deployment boots | `manifest.ts:454-492`, `readiness.ts:323-328` | P1 |

Fails closed today (keep as is):
- Missing Formance config returns `setup_required`.
- Missing RPC config means no settlement.
- Missing custody means managed signing refuses.
- A stale FX rate (more than 24 hours old) refuses the Quote.
- `unrestricted_test_only` is refused for production grants.
- The production call callback forces custody signing.

## Root cause
There is no single deployment-level statement of which money world this deployment is. Each subsystem infers it (key prefix, service mode, claim, default argument), and defaults to sandbox or to both worlds.

## Plan: one switch, enforced at choke points, fail closed

1. **One declaration.** `AE_DEPLOYMENT_ENVIRONMENT = production | development`. It is required with no default: a missing value fails boot and fails every money operation. `deploymentPaymentEnvironment()` maps it to `production | sandbox`. Delete `hosted_alpha`, `standard` and `AE_PACKAGE4_SANDBOX_DEPLOYMENT_PROFILE`/`synthetic_vps_fixture`. Service mode becomes "this deployment admits exactly its own environment".
2. **Close the doors (P0 #1-4, 7-10).**
   - Quote and Call admit only the deployment's environment.
   - Issuance, policy and the UI take the deployment's environment. There is no sandbox default.
   - A missing or invalid claim is refused, not treated as sandbox.
   - The owner-chat credential follows the deployment.
   - `unrestricted_test_only` is refused in production deployments.
   - The provider-consequence route refuses the raw signer in production.
   - The testnet/demo query bypass is deleted.
   - The classifier requires the Tool's `runtimeEnvironment` to equal the deployment's.
   - The sandbox commercial-policy fixture is unreachable in production.
3. **Money consistency (P0 #5-6, P1 #14-15).**
   - A production deployment requires live Stripe restricted keys and a live webhook, and refuses test keys at boot and per request.
   - The Formance environment must equal the deployment environment.
   - Funding constraints fail closed.
   - Treasury observations older than N minutes do not count as capacity.
4. **Directory (P1 #13).** A production deployment ingests, lists and Runs only production networks (Base mainnet today). Search, chat, Market rails and resolve all filter by the deployment environment.
5. **Dev-only surfaces (P1 #11-12).** The dev seed and `/api/v1/sandbox-reference` refuse (404) in production deployments.
6. **Readiness gate (P1 #16).** In production the manifest requires the Stripe, Formance, CDP custody, RPC (2× Base) and FX groups. Readiness reports them, and payments stay closed until they all pass.
7. **One isolation test.** With `AE_DEPLOYMENT_ENVIRONMENT=production`, assert refusal for every door in steps 2-5: sandbox grant issuance, a sandbox Quote, a test Stripe key, a sandbox Tool in search, the seed, and the sandbox route.
8. **First real Call.** Joel's account on the production deployment makes one A$0.01 Call on Base mainnet. Then alpha users.
