# Codebase Concerns

**Analysis Date:** 2026-06-29

## Phase 4 / Phase 5 Readiness Boundary

**Phase 4 local/source proof is closed:**
- Evidence: `.planning/phases/04-owner-pending-protected-actions/04-VERIFICATION.md` records `status: passed`, `score: "8/8 must-haves verified"`, and `deployed_proof: not_claimed`.
- Files: `.planning/phases/04-owner-pending-protected-actions/04-VERIFICATION.md`, `convex/protectedActions.ts`, `tests/unit/convex/protected-actions-runtime.test.ts`, `tests/integration/protected-action-route-readbacks.test.ts`, `tests/e2e/protected-action-owner-flow.spec.ts`
- Boundary: Phase 4 proves selected `contact-follow-up` proposal, owner decision, gateway, attempt, receipt/proof-gap/no-repair/retry reconstruction, copy scans, and local/source tests. It does not prove deployed owner/provider behavior.
- Phase 5 implication: Planners may rely on P4 source-owned authority and reconstruction patterns, but must not claim deployed protected-action proof or provider proof from P4.

**Phase 5 money rail proof is not closed:**
- Evidence: `.planning/phases/05-paid-activation-money-rails/05-01-autumn-stripe-paid-activation-PLAN.md` has `status: blocked_on_p1_p4_authority_and_money_decision_record`; `.planning/phases/05-paid-activation-money-rails/05-MONEY-RAIL-DECISION.md` is absent; `src/future-phases/05-paid-activation-money-rails/routes/*` uses `createParkedFileRoute`.
- Files: `.planning/phases/05-paid-activation-money-rails/05-01-autumn-stripe-paid-activation-PLAN.md`, `.planning/phases/05-paid-activation-money-rails/05-SPEC.md`, `.planning/phases/05-paid-activation-money-rails/05-CONTEXT.md`, `.planning/phases/05-paid-activation-money-rails/05-UI-SPEC.md`, `src/future-phases/05-paid-activation-money-rails/routes/owner.billing.tsx`, `src/future-phases/05-paid-activation-money-rails/routes/api.billing.webhook.ts`
- Boundary: The repo has partial local billing scaffolding, schema, pure module tests, and parked UI helpers. It does not have an accepted money decision record, active billing routes, Convex billing functions, real Autumn webhook verification, Stripe PSP evidence ingest, or deployed provider smoke.
- Phase 5 implication: The next money-rail phase must treat all paid activation as not live until source-owned provider readback, receipt, reversal/dispute, reconciliation, and deployed smoke evidence exist.

## Tech Debt

**Phase 5 implementation has source modules without an active Convex billing adapter:**
- Issue: `convex/schema.ts` includes `billingTables`, and `src/modules/billing/public.ts` exposes the intended route-facing API, but there is no active `convex/billing.ts` or server-function adapter that persists `startPaidActivation`, `ingestBillingProviderEvent`, receipts, or reconciliation rows into Convex.
- Files: `convex/schema.ts`, `src/modules/billing/public.ts`, `src/modules/billing/internal/operations.ts`, `src/modules/billing/internal/schema.ts`, `tests/unit/billing/rail.test.ts`, `tests/unit/schema/convex-schema.test.ts`
- Impact: Pure-module tests prove contract behavior, but deployed source state cannot yet create or reconstruct money-rail operations through the live Convex API.
- Fix approach: Add `convex/billing.ts` with indexed operation-scoped loaders/persist adapters, route all owner/admin/server calls through `src/modules/billing/public.ts`, and add runtime tests equivalent to `tests/unit/convex/protected-actions-runtime.test.ts`.

**Money decision record is missing while billing scaffolding exists:**
- Issue: Phase 5 planning requires `.planning/phases/05-paid-activation-money-rails/05-MONEY-RAIL-DECISION.md` before runtime changes, but that file is absent while `.env.example`, `convex/schema.ts`, `src/modules/billing/*`, and parked route files already contain Autumn/Stripe scaffolding.
- Files: `.planning/phases/05-paid-activation-money-rails/05-01-autumn-stripe-paid-activation-PLAN.md`, `.planning/phases/05-paid-activation-money-rails/05-SPEC.md`, `.env.example`, `src/modules/billing/internal/schema.ts`, `src/lib/server/billing-provider.ts`
- Impact: Provider ownership, offer/free boundary, AUD/GST/tax/legal/refund/dispute posture, credential rotation, support/rollback, public claims, and rejected rails are not accepted as the product authority.
- Fix approach: Create `05-MONEY-RAIL-DECISION.md` with the headings and content required by `05-01-autumn-stripe-paid-activation-PLAN.md` before expanding live billing behavior.

**Billing pure-state and Convex table shapes are not fully aligned:**
- Issue: `src/modules/billing/internal/schema.ts` Convex tables require append-only receipt fields such as `providerEvidenceRefs`, `paidStateTransition`, `refundReversalDisputeRefs`, and `correlationId`, while `BillingReceipt` and `createReceipt` in `src/modules/billing/internal/operations.ts` do not model those fields.
- Files: `src/modules/billing/internal/schema.ts`, `src/modules/billing/internal/operations.ts`, `tests/unit/billing/rail.test.ts`, `tests/unit/schema/convex-schema.test.ts`
- Impact: The pure module can pass while the eventual Convex adapter lacks enough source-owned receipt lineage to satisfy P5 append-only receipt and reversal/dispute acceptance.
- Fix approach: Align `BillingReceipt` with `billingReceipts` before building `convex/billing.ts`, and add tests proving paid, refund, dispute, chargeback, and cancellation receipts retain operation, evidence, transition, and correlation refs.

**P5 support record schema still names the P2 capability:**
- Issue: `capabilityLaunchSupportRecords` in `src/modules/billing/internal/schema.ts` has `capability: v.optional(v.literal('human_inquiry_owner_inbox'))`, which does not represent paid activation as the Phase 5 capability.
- Files: `src/modules/billing/internal/schema.ts`, `src/modules/inquiries/internal/schema.ts`, `convex/inquiries.ts`, `.planning/phases/05-paid-activation-money-rails/05-01-autumn-stripe-paid-activation-PLAN.md`
- Impact: Billing support/readiness rows can be structurally biased toward the Phase 2 inquiry capability and fail to encode paid-activation-specific support ownership, kill rules, and launch stage.
- Fix approach: Introduce an explicit paid-activation capability literal or a shared validated capability union before using this table for P5 support and claim-disable evidence.

## Known Bugs

**Autumn webhook route always rejects provider callbacks:**
- Symptoms: `verifyAutumnWebhook` throws `BillingProviderError('unverified_webhook', ...)` for every input, and the parked webhook route returns a typed 401 error.
- Files: `src/lib/server/billing-provider.ts`, `src/future-phases/05-paid-activation-money-rails/routes/api.billing.webhook.ts`, `tests/unit/server/server-seams.test.ts`
- Trigger: POST any Autumn callback to the parked `/api/billing/webhook` handler.
- Workaround: None for live provider ingest; the fail-closed behavior is correct until real signature verification exists.
- Fix approach: Implement current official Autumn raw-body signature verification, keep raw bytes before JSON parsing, bind events to existing operations, and test missing/malformed/stale/invalid/valid signature paths.

**Parked billing routes are not active product routes:**
- Symptoms: Billing UI and webhook files live under `src/future-phases/05-paid-activation-money-rails/routes/` and use `createParkedFileRoute`; `src/routes` and `src/routeTree.gen.ts` do not contain active `/owner/billing` or `/api/billing/webhook` routes.
- Files: `src/future-phases/05-paid-activation-money-rails/routes/owner.billing.tsx`, `src/future-phases/05-paid-activation-money-rails/routes/owner.billing.activate.tsx`, `src/future-phases/05-paid-activation-money-rails/routes/api.billing.webhook.ts`, `src/future-phases/route-helpers.ts`, `src/routeTree.gen.ts`
- Trigger: Attempt to reach Phase 5 billing routes through the active TanStack route tree.
- Workaround: Tests import helper functions directly from parked route modules.
- Fix approach: Mount routes only after the money decision record and server/Convex source adapter exist, then add browser and server-backed route tests.

**Billing return paths are not aligned with parked route paths:**
- Symptoms: `startPaidActivation` writes `returnPath: /owner/billing/return/<operationId>` and `cancelPath: /owner/billing/cancel/<operationId>`, while parked route handles are `/owner/billing/return` and `/owner/billing/cancel`.
- Files: `src/modules/billing/internal/operations.ts`, `src/future-phases/05-paid-activation-money-rails/routes/owner.billing.return.tsx`, `src/future-phases/05-paid-activation-money-rails/routes/owner.billing.cancel.tsx`, `tests/unit/billing/owner-routes.test.ts`
- Trigger: A real provider redirect uses the operation-specific return/cancel path from the operation state.
- Workaround: None in active routes because the routes are parked.
- Fix approach: Decide whether operation IDs are path params or search params, align route definitions with source-controlled return/cancel keys, and test return/cancel against mounted routes.

## Security Considerations

**Provider signature trust is a caller-supplied boolean inside the pure module:**
- Risk: `ingestBillingProviderEvent` trusts `command.signatureVerified` and can move a bound operation to `paid_active` when that boolean is true. The server boundary correctly has no verifier yet, but the module itself does not prove the signature.
- Files: `src/modules/billing/internal/operations.ts`, `src/lib/server/billing-provider.ts`, `tests/unit/billing/rail.test.ts`, `tests/unit/server/server-seams.test.ts`
- Current mitigation: `verifyAutumnWebhook` refuses all callbacks; tests prove unsigned events are rejected by the pure module and unverified callbacks receive 401.
- Recommendations: Keep signature verification at the raw request boundary, make the verified webhook type unforgeable by app code, and ensure provider ingest accepts only verified/bound normalized events from the server adapter.

**Owner-private billing projection exposes provider URLs and refs before active auth wiring exists:**
- Risk: `readOwnerBillingProjection` can return `checkoutUrl`, `portalUrl`, `invoiceUrl`, and provider-safe refs from in-memory state; parked route helpers render those without a live server-authenticated owner boundary.
- Files: `src/modules/billing/internal/projections.ts`, `src/future-phases/05-paid-activation-money-rails/routes/owner.billing.tsx`, `tests/unit/billing/owner-routes.test.ts`
- Current mitigation: Files are parked under `src/future-phases/` and are not registered in `src/routes`.
- Recommendations: When mounting Phase 5 routes, source owner authority from Clerk/Convex/server functions, never browser state, and prove wrong-owner/admin/operator denial for checkout, portal, receipts, and redirects.

**Public paid activation projection can expose offers from source state without claim-evidence gating:**
- Risk: `readPublicPaidActivationProjection` returns active offer name, description, CTA, price summary, and terms whenever an active offer exists and `paidActivationEnabled` is true; P5 requires public claims only after route/readback/provider smoke evidence.
- Files: `src/modules/billing/internal/projections.ts`, `.planning/phases/05-paid-activation-money-rails/05-SPEC.md`, `.planning/GTM-READINESS.md`, `tests/copy/claims-register.test.ts`
- Current mitigation: Public routes do not import the billing projection, and copy scans reject unsupported public paid claims.
- Recommendations: Add a claim-evidence/support/kill-rule gate to public paid activation projection before any catalog, registry, discovery, SEO, UCP, llms, or API surface consumes it.

**Provider secrets are placeholders only, not readiness proof:**
- Risk: `.env.example` contains `AUTUMN_SECRET_KEY`, `AUTUMN_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, and `STRIPE_WEBHOOK_SECRET`; these names can be mistaken for a ready provider configuration.
- Files: `.env.example`, `src/lib/server/billing-provider.ts`, `tests/unit/billing/rail.test.ts`, `.planning/SECURITY-SPEC.md`
- Current mitigation: `.env.example` states provider readiness is proven by source-owned readback rows, and `recordBillingEvidence` rejects `evidenceSource: 'env'` for ready status.
- Recommendations: Preserve the env-not-proof invariant in implementation closeout and provider smoke evidence; never use secret presence, dashboard status, return URL arrival, or webhook arrival alone as paid-state proof.

## Performance Bottlenecks

**Registry public reads still collect and project per business:**
- Problem: `readPublicCatalogs` collects published businesses, checks suppression, then builds each catalog with per-business context, service, capability, index, and discovery queries.
- Files: `convex/registry.ts`, `src/modules/registry/internal/search.ts`, `tests/integration/registry-api.test.ts`
- Cause: The registry favors dynamic projection over precomputed public catalog read models.
- Improvement path: Build indexed public projection rows for list/search/detail, and keep P5 paid-state facts out of these projections until the money decision and claim-evidence gates approve them.

**Phase 1 source loader remains broad for shared operations:**
- Problem: `loadPhaseOneSourceState` collects more than twenty tables, and `persistPhaseOneSourceState` uses generic upsert loops that collect existing rows per table while persisting.
- Files: `convex/source_state.ts`, `convex/business.ts`, `convex/security.ts`, `convex/observability.ts`
- Cause: Shared source reducers use aggregate snapshots for many domains.
- Improvement path: Keep aggregate helpers for tests, but use operation-scoped indexed adapters for new Phase 5 money writes so billing does not inherit the broad Phase 1 transaction pattern.

**Phase 5 billing must not copy old aggregate persistence patterns:**
- Problem: The billing module currently has pure source state but no Convex persistence layer. A naive adapter that loads all `billingOperations`, `billingProviderEvents`, `billingReceipts`, and `billingReconciliations` per webhook will become a money-rail hotspot.
- Files: `src/modules/billing/internal/operations.ts`, `src/modules/billing/internal/schema.ts`, `convex/schema.ts`
- Cause: The implementation seam is ready for adapters, but adapter shape is still open.
- Improvement path: Query billing by `operationId`, `idempotencyKey`, `provider/providerEventId`, `businessId/status`, and receipt indexes; persist only changed rows for the current operation/event.

## Fragile Areas

**Phase 5 provider HTTP contract lacks provider smoke proof:**
- Files: `src/modules/billing/internal/provider-readback.ts`, `src/lib/server/billing-provider.ts`, `tests/unit/billing/rail.test.ts`, `tests/unit/server/server-seams.test.ts`
- Why fragile: `createAutumnHttpProvider` normalizes expected Autumn responses and calls Autumn endpoints, but no test exercises a sandbox Autumn account, real checkout, customer portal, customer readback, or Stripe PSP evidence under Autumn.
- Safe modification: Treat `AutumnProvider` as an adapter boundary, add contract tests with recorded redacted fixtures, and require sandbox/deployed smoke before public claims.
- Test coverage: Pure deterministic provider tests exist in `tests/unit/billing/rail.test.ts`; provider integration and deploy smoke tests are absent.

**Billing reconciliation status coverage is narrower than the Phase 5 plan:**
- Files: `src/modules/billing/internal/schema.ts`, `src/modules/billing/internal/operations.ts`, `.planning/phases/05-paid-activation-money-rails/05-01-autumn-stripe-paid-activation-PLAN.md`
- Why fragile: Plan acceptance requires stale, missing, duplicate, disputed, mismatched, unbound, provider-unavailable, retry-exhausted, and no-repair readbacks. Current `BillingReconciliationStatusValues` covers only `matched`, `missing`, `mismatched`, `provider_unavailable`, `retry_available`, `retry_exhausted`, and `no_repair`.
- Safe modification: Expand the reconciliation model before building operator UI, and map each state to owner/operator next actions, evidence refs, retry/no-repair controls, and redacted payload display.
- Test coverage: `tests/unit/billing/rail.test.ts` does not yet cover duplicate, disputed, unbound, stale, retry-after, concurrent retry, or no-repair reconciliation matrices.

**Phase 4 source-owned receipt patterns must not be treated as money receipts:**
- Files: `convex/protectedActions.ts`, `src/modules/protected-action/internal/contact-follow-up.ts`, `tests/unit/convex/protected-actions-runtime.test.ts`, `src/modules/billing/internal/operations.ts`
- Why fragile: P4 records `source-receipt:<proposalId>` for a source-owned contact-follow-up outbox boundary, while P5 receipts require provider evidence, payment/refund/dispute lineage, and financial/legal retention.
- Safe modification: Reuse P4 gateway/reconstruction discipline, but create separate P5 billing receipt evidence with Autumn/Stripe refs, payload hash, signature status, provider readback, and reconciliation state.
- Test coverage: P4 local/source tests are strong; P5 money receipt tests only cover pure in-memory signed event handling with deterministic data.

## Scaling Limits

**Billing tables have indexes for the first pass, but provider-event binding needs complete query coverage:**
- Current capacity: `billingOperations` has `by_idempotencyKey` and `by_operationId`; `billingProviderEvents` has `by_provider_event` and `by_operation`; `billingReceipts` has `by_operation` and `by_business_recordedAt`.
- Files: `src/modules/billing/internal/schema.ts`, `tests/unit/schema/convex-schema.test.ts`
- Limit: P5 plan also needs logical provider object dedupe, unbound-event queues, business/status reconciliation queues, support kill rules, and provider-unavailable scans.
- Scaling path: Add indexes for logical provider object key, provider event status, business/status, support capability/status, and reconciliation status before live webhook volume exists.

**Public registry/search cannot absorb paid-state joins at runtime:**
- Current capacity: Public registry routes support small seed/smoke catalogs through dynamic projections.
- Files: `convex/registry.ts`, `src/modules/billing/internal/projections.ts`, `src/modules/catalog/public.ts`, `src/modules/discovery/public.ts`
- Limit: Joining billing status into public catalog/discovery at request time risks slow public surfaces and accidental owner-private provider leaks.
- Scaling path: Publish only explicitly approved public paid-state facts into a redacted projection after P5 smoke evidence, and keep owner/admin billing details in private projections.

## Dependencies at Risk

**Autumn API and webhook contracts are unverified in source:**
- Risk: `src/modules/billing/internal/provider-readback.ts` implements an HTTP adapter, but webhook verification is intentionally missing and no provider smoke validates endpoint paths, response shapes, API version, or signature semantics.
- Impact: Phase 5 cannot claim live paid activation, customer portal, receipts, provider readback, or reconciliation until the adapter is proven against the selected Autumn environment.
- Migration plan: After the money decision record, verify current official Autumn and Stripe docs, implement raw-body verification, add redacted provider fixtures, and run sandbox/deployed smoke with stable provider refs and payload hashes.

**Direct Stripe fallback remains quarantined:**
- Risk: Phase 5 allows direct Stripe subscription authority only after an evidence-backed Autumn blocker record, but `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` placeholders can invite premature direct Stripe work.
- Impact: Direct Stripe subscription logic can violate the selected Autumn Cloud + Stripe PSP responsibility split and create unsupported public/payment claims.
- Migration plan: Keep Stripe code as PSP evidence under Autumn only; require an Autumn blocker record before any direct Stripe subscription authority is introduced.

## Missing Critical Features

**Phase 5 money decision record is a hard blocker:**
- Problem: The required `.planning/phases/05-paid-activation-money-rails/05-MONEY-RAIL-DECISION.md` does not exist.
- Files: `.planning/phases/05-paid-activation-money-rails/05-01-autumn-stripe-paid-activation-PLAN.md`, `.planning/phases/05-paid-activation-money-rails/05-CONTEXT.md`, `.planning/phases/05-paid-activation-money-rails/05-SPEC.md`
- Blocks: Runtime expansion, public claims, provider credential ownership, support/rollback posture, legal/tax/refund/dispute posture, and direct-Stripe fallback decisions.
- Fix approach: Complete P5-T01 before money runtime work; then reconcile existing billing scaffolding against the decision record.

**Active owner billing and provider routes are missing:**
- Problem: Owner activation, redirect, return, cancel, Billing Center, receipt, admin monetization, and provider webhook routes are parked future files, not mounted `src/routes` entries.
- Files: `src/future-phases/05-paid-activation-money-rails/routes/owner.billing.tsx`, `src/future-phases/05-paid-activation-money-rails/routes/owner.billing.activate.tsx`, `src/future-phases/05-paid-activation-money-rails/routes/owner.billing.return.tsx`, `src/future-phases/05-paid-activation-money-rails/routes/owner.billing.cancel.tsx`, `src/future-phases/05-paid-activation-money-rails/routes/owner.billing.receipts.$receiptId.tsx`, `src/future-phases/05-paid-activation-money-rails/routes/api.billing.webhook.ts`, `src/routes`, `src/routeTree.gen.ts`
- Blocks: Browser proof, owner payment start, return/cancel readback, receipt viewing, webhook delivery, and provider smoke.
- Fix approach: Mount routes after source adapters exist, use server functions for owner/admin actions, and add E2E/a11y tests for 375px and wide states required by `05-UI-SPEC.md`.

**Provider signature, binding, receipt, reversal/dispute, and reconciliation proof is missing:**
- Problem: P5 requires signed Autumn webhook/readback ingest, Stripe PSP evidence under Autumn, append-only receipts, failed payment/refund/reversal/dispute/cancellation handling, and operator reconciliation. The source has pure state helpers but no verified provider boundary or deployed evidence.
- Files: `src/lib/server/billing-provider.ts`, `src/modules/billing/internal/operations.ts`, `src/modules/billing/internal/provider-readback.ts`, `tests/unit/billing/rail.test.ts`, `tests/unit/server/server-seams.test.ts`, `.planning/phases/05-paid-activation-money-rails/05-SPEC.md`
- Blocks: Paid activation launch, public/GTM/discovery paid claims, and Phase 5 closeout.
- Fix approach: Implement raw-body verification, provider retrieval where required, binding/dedupe/admission rows, receipt/reversal/dispute ledger rows, reconciliation queues, retry/no-repair controls, and deployed sandbox smoke evidence.

**Phase 4 deployed protected-action proof remains absent:**
- Problem: Phase 4 local/source proof is passed, but `.planning/phases/04-owner-pending-protected-actions/04-VERIFICATION.md` explicitly says `deployed_proof: not_claimed`.
- Files: `.planning/phases/04-owner-pending-protected-actions/04-VERIFICATION.md`, `convex/protectedActions.ts`, `tests/e2e/protected-action-owner-flow.spec.ts`
- Blocks: Any deployed/public claim that a real protected-action proposal, owner decision, attempt, receipt/proof-gap, and admin reconstruction chain has been proven in production-like infrastructure.
- Fix approach: Treat this as separate deployed evidence work; do not make Phase 5 money proof depend on unclaimed P4 deployment proof.

## Test Coverage Gaps

**No Convex billing runtime tests exist:**
- What's not tested: Convex mutations/actions/queries for billing offers, checkout starts, provider events, receipts, reconciliation, no-repair, support records, and operator controls.
- Files: `src/modules/billing/internal/operations.ts`, `src/modules/billing/internal/schema.ts`, `convex/schema.ts`, `tests/unit/billing/rail.test.ts`, `tests/unit/schema/convex-schema.test.ts`
- Risk: Pure module behavior can pass while live Convex persistence, indexing, auth, idempotency, and redaction mappings are broken.
- Priority: High

**No mounted Phase 5 browser or route tests exist:**
- What's not tested: Active `/owner/billing/*`, `/admin/monetization/*`, and `/api/billing/*` route behavior through TanStack routing, server functions, auth, CSRF/origin, loaders, focus, mobile layout, and route-generated metadata.
- Files: `src/future-phases/05-paid-activation-money-rails/routes/owner.billing.tsx`, `src/future-phases/05-paid-activation-money-rails/routes/api.billing.webhook.ts`, `tests/unit/billing/owner-routes.test.ts`
- Risk: Parked helper tests can pass while mounted route behavior, auth, redirects, and source-readback wiring are absent.
- Priority: High

**No real Autumn/Stripe provider smoke tests exist:**
- What's not tested: Autumn checkout/customer portal start, signed Autumn webhook, provider readback retrieval, Stripe PSP invoice/refund/dispute evidence under Autumn, unbound event hold, provider unavailable, and reconciliation mismatch against a provider sandbox.
- Files: `src/lib/server/billing-provider.ts`, `src/modules/billing/internal/provider-readback.ts`, `src/future-phases/05-paid-activation-money-rails/routes/api.billing.webhook.ts`, `tests/unit/server/server-seams.test.ts`, `tests/deploy-smoke`
- Risk: Local pure tests can be mistaken for live money-rail proof.
- Priority: High

**Copy and SEO scans reject premature paid claims but do not yet validate allowed post-smoke claims:**
- What's not tested: A successful P5 claim evidence register row that allows a precise public paid-activation claim only after provider route/readback/funnel/support evidence exists.
- Files: `tests/copy/claims-register.test.ts`, `tests/copy/phase1-banned-copy.test.ts`, `tests/seo`, `src/lib/ui/contract-scans.ts`, `.planning/GTM-READINESS.md`
- Risk: Public paid claims can remain blocked even after legitimate evidence, or future changes can bypass the evidence gate without a positive-path test.
- Priority: Medium

**Deployed proof separation needs explicit tests/evidence for P5:**
- What's not tested: Deployed checkout start, return/cancel readback, signed webhook, receipt, refund/dispute, reconciliation mismatch, retry/no-repair, disable/rollback, and public claim evidence rows.
- Files: `.planning/phases/05-paid-activation-money-rails/05-01-autumn-stripe-paid-activation-PLAN.md`, `tests/deploy-smoke`, `playwright.deploy-smoke.config.ts`
- Risk: Env configuration, dashboards, or local fixtures can be mistaken for deployed/provider readiness.
- Priority: High

---

*Concerns audit: 2026-06-29*
