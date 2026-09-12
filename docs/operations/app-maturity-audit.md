# App Maturity Audit

Point-in-time census dated 2026-09-12 on branch `well-7/app-shell`. Counts are re-derivable with the commands given inline.

## Verified strong
- Auth/tenancy census: 356 exported Convex functions (enumerate cmd: `grep -rEn '^export const [A-Za-z0-9_]+ = (query|mutation|action|internalQuery|internalMutation|internalAction|httpAction)\(' convex --include='*.ts' | grep -v _generated`). Breakdown: query 55, mutation 62, action 20, httpAction 1, internalQuery 55, internalMutation 120, internalAction 43. 218 internal (Convex caller-guarded), 138 public: 121 resolve a principal, 16 public-by-intent, 0 unguarded.
- IDOR check: every public fn taking caller-supplied businessId/accountRef verifies against resolved actor. Evidence: capabilityProviderTools.ts:89, capabilitySupplyOwnerCanary.ts:328, capabilityProviderOffboarding.ts:276/333/408, recoveryBreakGlass.ts:143-166. Guard wrappers: resolveBusinessActor (convex/authz.ts:41), requireSourceWrite, resolveRecoveryOperator (convex/recoveryBreakGlass.ts:133).
- Money idempotency: idempotency key + unique index + state guard on every traced path. moneyStripeWebhookInbox.ts:56-74 (by_stripeEventId, replay->no-op, digest mismatch->reconciliation_required), moneyAccountFunding.ts:398-407,505-516,887,925 (by_idempotencyKey + state==='succeeded' guard), moneyX402PaymentAuthorization.ts:226-234 (by_paymentIdentifier), sourceWriteAdmission.ts:167-182 (by_keyId_and_nonce replay rejection). Stripe signature verified at src/lib/server/stripe-money-webhook.ts:134 before any mutation.
- Infra present: Sentry+PostHog, correlation IDs (src/lib/server/request-correlation.ts), api.health.ts, 7 rate-limit buckets (convex/rateLimit.ts), RDS PITR drill passed (docs/operations/deployment-maturity.md:61-62), CI source-proof gate (.github/workflows/kernel-release-gate.yml).
- Schema: 90 defineTable across src/modules, all 90 have at least one .index().
- Frontend: error boundary (AeObservabilityErrorBoundary), route pendingComponent/errorComponent, AeEmptyState, Sonner toasts, sidebar a11y with aria-current.

## Gap 1 (highest priority): errors are swallowed, production is undebuggable
- 640 bare `} catch {` out of 863 total catch sites in src+convex excluding tests/_generated (74%). Only 217 bind the error. Only 76 capture*Exception call sites codebase-wide. ZERO bare catches log within 3 lines.
- Re-derive: `grep -rn '} catch {' src convex --include='*.ts' --include='*.tsx' | grep -v _generated | grep -v '\.test\.' | wc -l`
- Worst offenders, money/reconciliation paths silently dropping work: convex/capabilityCallWorker.ts:205, 224, 271, 290 (failed reconciliation candidates `continue` with no trace); convex/moneyX402PaymentAuthorization.ts:44, 59, 94, 541.
- Degrade-path catches with no logging: src/modules/market/x402-directory-index.server.ts:128-131, src/modules/market/server.ts:124-144, src/modules/market/x402-directory.server.ts:46-59. Result: "catalog temporarily unavailable" (AeMarketPage.tsx:310-334) cannot be distinguished from a projection bug or bad upstream data.
- Files with most bare catches: provider-connection-handoff.ts (29), agent-access-oauth-api.ts (16), agent-access.functions.ts (12), jitProviderConsequence.ts (11), provider-workspace.functions.ts (10).
- Recommended fix: a single `degrade(cause, fallback)` helper that reports then returns the fallback; mechanical sweep starting with capabilityCallWorker.ts and moneyX402PaymentAuthorization.ts.

## Gap 2: failure-to-user chain breaks on the provider path
- AeSupplySourceNativeStart.tsx:290-305 catches everything and always renders "AE could not confirm submission. Reload Tools before trying again." (:301). Thrown message discarded, no correlationRef rendered.
- Working counter-example to copy: correlationRef threaded from src/lib/server/agent-access-oauth-store.ts:236 through convex/capabilitySupplyPublish.ts:659/685 to AeAgentAccessAuthorizeForm.tsx:308, rendered at :558-560.
- No shared form/validation library anywhere; hand-rolled useState/useReducer. Zod already a dependency, react-hook-form absent. Consequence: no field-level errors exist on any form.
- AeAgentAccessAuthorizeForm.tsx:346 unmounts the entire form on error status with no path back; entered data unreachable without reload.

## Gap 3: no boot-time config validation
- ~112 raw process.env reads across src/ and convex/, no centralized zod schema. Helper exists (src/lib/server/read-trimmed-env.ts) but is not a validator. Missing secrets fail at runtime, often inside a silent catch.

## Second tier
- No user.deleted webhook handler (convex/auth.ts:142-145). Account deletion never reaches app state.
- Unbounded read: convex/x402DirectoryIndexBackfill.ts:21 collects marketExternalRegistryGenerations with no .withIndex(); grows per cron ingestion generation. Future 16MB-read failure.
- .filter() without preceding .withIndex() (in-memory full scan): confirmed at convex/lib/callLifecycle/dispatch.ts:540. 87 .filter() calls across 39 files, remainder unclassified.
- Dead scaffolding: convex/lib/authorityRegistrars.ts defines protectedInteractiveQuery/narrowSystem*/devOnlyInternal* and is imported nowhere in convex/. Delete.
- No root catch-all 404 route (per-page notFoundComponent only).

## Not audited / unknown
- HTTP layer: only 5 of 61 files under src/routes/api* and 28 handlers in src/lib/server were sampled. 0/61 confirmed unguarded; NOT a clean bill.
- moneyProviderObligations.ts, moneyPayouts, moneyLedger.ts handler bodies not traced for idempotency.
- Clerk and x402/facilitator webhook routes not located.
- Cron retry semantics for the 8 non-workpool crons in convex/crons.ts unverified.
- Transactional email and any admin/back-office view: no evidence found either way.
