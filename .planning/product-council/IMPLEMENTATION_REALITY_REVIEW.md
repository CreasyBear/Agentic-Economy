# Implementation Reality Review
**Council Lens:** Implementation Reality Critic
**Date:** 2026-07-03

## Built Reality

AE has a real source-backed spine for published service discovery. Public registry actions are declared in `src/modules/registry/registry.actions.ts`, registered in `src/modules/actions/index.ts`, served through `/api/businesses*` routes, and backed by source reads in `src/modules/registry/registry.functions.ts` and `convex/registry.ts`. The quiet assistant door in `src/routes/api.agent.tools.ts` exposes only `registry.search`, `registry.detail`, and `inquiry.submit`; `registry.list` exists but is intentionally not an `agentTools` action.

The qualified inquiry loop is substantially implemented in source. `src/modules/inquiries/inquiry.actions.ts` defines the only assistant-exposed write, `src/modules/inquiries/inquiry.functions.ts` shares the human and assistant source path, `src/modules/inquiries/internal/commands.ts` owns idempotency/rate-limit/support-readiness state transitions, `src/modules/inquiries/internal/convex-schema.ts` defines durable inquiry tables, and `convex/inquiries.ts` persists public submit plus owner inbox/read/reply/close/privacy readbacks.

The answer/search front door is implemented as a registry-grounded thread system rather than a generic chat product. `src/modules/answer-thread/internal/turn-orchestrator.ts` runs context, intent, route, retrieval, model, gate, assemble, persist, and report phases; `src/modules/answer-thread/internal/tool-runner.ts` refuses non-read tools; `src/modules/answer/internal/answer-gate.ts` blocks ungrounded slugs, internal epistemic labels, unsafe claims, and missing boundary copy; `src/modules/answer-thread/answer-thread.functions.ts` persists threads/turns/tool calls through Convex refs.

The harness/action layer is operationally meaningful. `src/modules/harness/action-tool.ts`, `src/modules/harness/approval-policy.ts`, `src/modules/harness/evidence-envelope.ts`, and `src/modules/harness/run-loop.ts` provide strict schemas, read/write policy checks, public/private evidence projections, and run evidence. This is enough to support the product vision's "assistants can read, compare, summarize, and route" contract, provided writes stay narrow.

Billing and business-action proof exist, but as bounded source/test-mode systems. Billing has Autumn/Stripe provider adapters and readbacks in `src/modules/billing/internal/operations.ts`, `src/modules/billing/internal/provider-readback.ts`, `src/lib/server/billing-provider.ts`, `src/modules/billing/billing.functions.ts`, `convex/billing.ts`, and `convex/billingStore.ts`. Phase 6 business action receipts are narrower and cleaner: one slug in `src/modules/business-action/internal/schema.ts`, receipt reconstruction in `src/modules/business-action/internal/business-action.ts`, Stripe test-mode evidence in `src/modules/business-action/internal/stripe-checkout.ts` and `src/modules/business-action/internal/stripe-webhook-source.ts`, server seams in `src/modules/business-action/business-action.functions.ts`, and durable adapters in `convex/businessActions.ts` / `convex/businessActionStore.ts`.

The Convex model is broad and modular. `convex/schema.ts` composes table fragments from domain modules, `convex/authz.ts` derives owner/admin authority from Convex/Clerk identity, and `convex/sourceWriteAdmission.ts` checks signed source-write admissions. `tests/unit/schema/convex-schema.test.ts` asserts the durable table/index inventory, which is a useful guard against accidental schema drift.

## Evidence Quality

Source/local evidence is strong for the core contracts. Unit, integration, copy, SEO, import, type, eval, and local Playwright coverage are extensive across `tests/unit`, `tests/integration`, `tests/eval`, `tests/e2e`, `tests/copy`, `tests/seo`, and `tests/ui-contract`. `package.json` has a serious `test:release` gate covering typecheck, Convex codegen, unit/integration/eval/copy/UI/e2e/a11y, and build.

Deployed proof is uneven. Phase 1 has a recorded Vercel/Convex/Clerk deploy smoke pass in `.planning/phases/01-ten-star-spine-foundation/01-DEPLOY-READBACK-EVIDENCE.md`, but that artifact explicitly excludes the five-owner internal-alpha gate. `.planning/phases/01-ten-star-spine-foundation/01-INTERNAL-ALPHA-READINESS.md` records 0/5 friendly-owner evidence rows, so internal alpha and public launch are still not earned.

Phase 2 is locally implemented but not deploy/provider closed. `.planning/phases/02-human-inquiry-owner-inbox/02-DEPLOY-SMOKE-BLOCKERS.md` says deployed inquiry support and provider smokes remain blocked until a published eligible service has a complete `human_inquiry_owner_inbox` support row and until `npm run test:phase2-support-smoke`, `npm run test:provider-smoke:resend`, and `npm run test:provider-smoke:novu` pass with source-owned dispatch IDs.

Phase 3 is local/readback proven only. `.planning/phases/03-standard-agent-builder-discovery/03-VERIFICATION.md` records route-derived local proof for discovery docs/schema/examples/fixtures, but also says no deployed Phase 3 evidence artifact exists.

Phase 5 and Phase 6 are deliberately fail-loud, not provider-proven. `tests/deploy-smoke/phase5-paid-activation-provider-smoke.spec.ts` and `tests/deploy-smoke/phase6-business-action-stripe-smoke.spec.ts` require deployed source-owned evidence IDs before they can pass. `.planning/phases/06-agentic-business-action-receipts/06-VERIFICATION.md` closes Phase 6 as source/local engineering proof only, says production proof is not claimed, and notes copy/language gates were waived for that closeout only.

Generated/deferred proof is a real caveat. `src/routeTree.gen.ts` and `convex/_generated/*` are necessary generated artifacts. Local test ports and bypasses such as `setAnswerThreadPortForTests` in `src/modules/answer-thread/answer-thread.functions.ts` and `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E` across `src/modules/inquiries/inquiry.functions.ts`, `src/modules/business-action/business-action.functions.ts`, `src/modules/registry/registry.functions.ts`, and route code make local tests productive but not equivalent to deployed Clerk/Convex/provider proof.

## Architecture Carrying Capacity

The architecture can carry the current product contract if AE stays disciplined. The action registry, explicit action boundaries, source-write admission, public DTO projection, answer gate, harness evidence, owner/admin readbacks, and fail-loud deploy-smoke style all reinforce the same trust contract. The architecture is especially mature around refusing unsupported capabilities instead of pretending to book, charge, dispatch, or auto-fulfil.

The architecture is strained by scale and proof-strength issues. Several Convex paths still load broad source slices with `collect()` and then filter in memory, especially `convex/source_state.ts`, `convex/inquiries.ts`, `convex/billingStore.ts`, and `convex/notificationOutbox.ts`. That is acceptable for fixtures, local proof, and small alpha usage, but it will not carry production inquiry/billing/provider-event volume without index-first loaders and bounded pagination.

Large modules are carrying too much operational responsibility. Examples include `src/modules/answer-thread/internal/turn-orchestrator.ts`, `src/modules/inquiries/internal/commands.ts`, `convex/inquiries.ts`, `convex/registry.ts`, `convex/businessActionStore.ts`, and `src/modules/billing/internal/operations.ts`. These files encode product boundaries, persistence, evidence, projection, and recovery together; that makes future changes riskier.

Evidence hashing is weaker than the product language may imply. `src/modules/common/stable-hash.ts` uses an 8-hex FNV-style stable hash. That is useful for deterministic IDs and cache/equality checks, but it is not enough for privacy-preserving contact hashes, collision-resistant receipts, or high-confidence provider evidence.

Public abuse and write hardening are not yet centralized. Answer rate limits in `src/modules/answer-thread/internal/turn-guard.ts` are process-local. `/api/agent/tools` in `src/routes/api.agent.tools.ts` can run the public inquiry write through harness policy, but route-handler-level rate/origin/request-size protections are not yet a single shared wrapper.

## Product-Implementation Mismatches

The product thesis says AE is the trust and discovery layer for agentic commerce. The implementation earns "trust and discovery" for published local-service facts better than it earns "commerce." The safe read/compare/summarize/route contract is implemented; marketplace liquidity, booking, payment, dispatch, fulfillment, and production business-action execution are not.

Qualified inquiry is the first owned conversion in `PRODUCT.md`, but deployed support/provider proof is not closed. Until Phase 2 deploy smokes pass, AE can claim source/local inquiry implementation and Phase 1 deployed catalog proof, not fully deployed inquiry operations.

The answer thread is closer to a credible demand router than a generic assistant. That is good product discipline, but it depends on OpenRouter configuration in `src/modules/answer/internal/llm-config.ts`, prompt/eval gates in `eval/answer/promptfooconfig.yaml`, and local/single-process rate controls. It should not be sold as a production-grade autonomous agent surface.

Billing and Phase 6 business-action receipts outrun production evidence if described too broadly. The code supports provider adapters, readbacks, receipt reconstruction, and test-mode Stripe evidence, but `.planning/STATE.md` and `.planning/phases/06-agentic-business-action-receipts/06-MONEY-EVIDENCE-DECISION.md` are clear: no live money, wallet, custody, Connect, x402, settlement, marketplace, or production payment readiness is proven.

Internal-alpha/public-launch claims are still blocked by human evidence, not just code. The instrumentation for owner activation exists, but `.planning/phases/01-ten-star-spine-foundation/01-INTERNAL-ALPHA-READINESS.md` says there are no real owner activation rows.

## Operational Risks

Provider integration risk is high. Resend, Novu, Autumn, Stripe, and Phase 6 Stripe webhooks have adapters and smoke harnesses, but the important smokes are mostly waiting on deployed source rows, deployed secrets, and source-owned provider IDs. A dashboard screenshot, return URL, webhook arrival, or env presence would not be enough proof.

Convex data-model risk is medium-high. `convex/_generated/ai/guidelines.md` warns against unbounded `collect()` and filter-based queries; the current source-state adapters still use that style in important paths. This could turn small-fixture correctness into production conflict/timeouts.

Auth/routing proof risk remains around local bypass. Production guards exist, but `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E` and source test ports mean local UI success can bypass real owner auth, Convex mutations, source-write admission, and provider bridges. Deploy smoke must be the authority for owner/admin/provider claims.

Evaluation risk is real but contained. The answer eval suite is thoughtful and includes broad catalog cases in `eval/answer/lib/cases.ts`, coverage auditing in `eval/answer/lib/coverage.ts`, and Promptfoo wiring. It still cannot prove real production model behavior, rate-limit economics, or provider-cost abuse controls without deployed traffic evidence.

Source-write admission has replay and scope sharp edges. `src/modules/security/source-write-admission.ts` signs scope, operation key, correlation ID, request context, nonce, and freshness, but there is no central nonce replay store. Some domains rely on operation-key idempotency after admission; future write scopes could get this wrong.

Copy/proof drift is a continuing risk. The copy scanners are useful, but Phase 6 closeout waived copy/language gates in `.planning/phases/06-agentic-business-action-receipts/06-VERIFICATION.md`. That waiver must not leak into public production claims.

## Council Questions

1. What exact proof threshold must be met before AE can say qualified inquiry is deployed, not merely source/local?
2. Should index-first Convex loaders and cryptographic/HMAC evidence hashes become mandatory before adding more commerce-facing capability?
3. Is the answer/search front door allowed to advance before Phase 2 deployed inquiry/provider proof is green, or should it remain a read-only demand router until then?
4. Should Phase 5/6 provider smoke evidence be treated as a release blocker for any public paid/business-action copy, even in owner/admin surfaces?
5. What is the canonical policy for action registration versus route/server-function exceptions so future writes do not bypass the safe assistant contract?
