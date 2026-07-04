# Product Council Synthesis
**Frame:** Vision vs implementation, LLM council style
**Date:** 2026-07-03
**Inputs:** `VISION_VS_IMPLEMENTATION.md`, `TRUST_CONTRACT_REVIEW.md`, `JOURNEY_GTM_REVIEW.md`, `IMPLEMENTATION_REALITY_REVIEW.md`

## Council Verdict

AE has crossed from concept into a real trust-and-discovery product skeleton. The strongest implemented asset is not "agentic commerce" in the broad sense; it is a boundary-honest read/compare/summarize/router for published local-service facts, with a deliberately narrow assistant write path for qualified inquiry.

The implementation does not yet earn a broad launch narrative. The product can support an internal, founder-assisted alpha if it stays narrow: publish real service pages, compare them, route customers and assistants to the safe next step, and prove the qualified inquiry loop. It should not present itself as a booking, payment, dispatch, autonomous fulfillment, or production transaction platform.

The council's central tension is simple:

```text
The architecture is ahead of the market proof.
The safe assistant contract is ahead of the deployed operational proof.
The future commerce modules are ahead of the public product permission.
```

## Consensus Findings

### 1. The Core Spine Is Real

All four lenses agree the product has a credible implemented spine:

- Public service discovery exists through `src/routes/registry.tsx`, `src/routes/$slug.tsx`, `src/routes/api.businesses.ts`, `src/routes/api.businesses.search.ts`, and `src/routes/api.businesses.$slug.ts`.
- Assistant-readable actions are centralized through `src/modules/actions/index.ts`, `src/modules/registry/registry.actions.ts`, `src/modules/inquiries/inquiry.actions.ts`, and `src/routes/api.agent.tools.ts`.
- The answer surface is a registry-grounded router, not an unconstrained action agent, through `src/modules/answer-thread/internal/turn-orchestrator.ts`, `src/modules/answer-thread/internal/tool-runner.ts`, and `src/modules/answer/internal/answer-gate.ts`.
- Owner and operator readbacks exist across `src/routes/owner.*.tsx`, `src/routes/admin.*.tsx`, `convex/inquiries.ts`, `convex/registry.ts`, and `convex/source_state.ts`.

This supports the product thesis in `AGENTS.md` and `PRODUCT.md`: AE reads, compares, summarizes, routes, and can submit a qualified inquiry where published.

### 2. The Safe Contract Is Stronger Than The Launch Proof

The council found a strong boundary model:

- `registry.search` and `registry.detail` are read-only and public-fact scoped.
- `inquiry.submit` is the only assistant-exposed write.
- Owner-only inquiry operations are not in the quiet agent tool registry.
- Answer turns refuse non-read tools through `src/modules/answer-thread/internal/tool-runner.ts`.
- Copy and contract tests exist in `tests/copy`, `tests/integration/agent-tools-api.test.ts`, and `tests/integration/answer-tool-calls.test.ts`.

But launch proof lags:

- `.planning/STATE.md` still records `0/5` friendly-owner activation rows.
- Phase 2 deployed inquiry support and provider smokes remain open.
- Phase 3 discovery proof is local/source, not deployed.
- Phase 5/6 provider evidence is source-local or test-mode and deliberately fail-loud for production.

So AE can say: "implemented and locally/source proven." It cannot yet say: "production-proven operating network."

### 3. Qualified Inquiry Is The Product Hinge

Every lens independently converged on qualified inquiry as the gating conversion.

The code is substantial: `src/routes/$slug.inquiry.tsx`, `src/modules/inquiries/inquiry.actions.ts`, `src/modules/inquiries/inquiry.functions.ts`, `src/modules/inquiries/internal/commands.ts`, `convex/inquiries.ts`, `convex/notificationOutbox.ts`, and owner inbox routes.

The remaining risk is not whether the feature exists. The risk is whether AE can prove the whole loop:

```text
customer intent -> eligible listing -> inquiry submit -> durable owner thread
-> provider delivery/readback -> owner response/close -> admin reconstruction
```

Until that deployed loop passes with real source-owned evidence, the inquiry conversion should remain alpha-scoped.

### 4. Real Supply Is The Binding Constraint

The implementation has more machinery than the market side has proof. The council was unanimous that the next product bottleneck is not another abstraction layer; it is real owner activation and real inquiry evidence.

The ten-star vision in `.planning/PRODUCT-10-STAR.md` names "meat" as the constraint. The current implementation confirms that diagnosis. Without claimed, response-committed businesses, the answer-first homepage and assistant-readable APIs expose sparse supply faster than a registry page would.

### 5. Future Capability Work Is Useful But Narratively Dangerous

Billing, business-action receipts, protected actions, harness sessions, answer evals, and provider smokes are meaningful engineering assets. They are not yet public product permission.

Risky areas:

- `src/modules/billing/*` and `convex/billing*.ts` can be mistaken for live money readiness.
- `src/modules/business-action/*` and business-action routes can be mistaken for execution capability.
- `src/modules/harness/*` can be mistaken for general-purpose autonomous action infrastructure.
- Developer/operator surfaces can expose internal language if they drift into public marketing.

The product story must keep these framed as source-local, owner/admin, test-mode, unavailable, or future-gated until proof exists.

## Promise Fit Matrix

| Product Promise | Council Fit | Why |
|---|---:|---|
| Publish comparable service pages | Partial/Strong | Registry, listings, public APIs, and DTO projections exist, but real owner inventory is still thin. |
| Assistant-safe read/compare/summarize | Strong | Tool allowlists, read-only answer runner, prompts, gates, and public projections align with the contract. |
| Qualified inquiry as first conversion | Partial | Substantial implementation exists; deployed support/provider proof is still open. |
| No booking/payment/dispatch/autonomous fulfillment | Strong with watchpoints | Copy and action boundaries are strong; first-turn booking/payment intent and inquiry-body semantics need tighter refusal proof. |
| Trust through source/freshness/boundary | Partial | Status fields and readbacks exist; live freshness/contradiction evidence and "verified" vocabulary remain weak spots. |
| Owner activation and response commitment | Thin | Product requires real owner evidence; state still records `0/5` friendly-owner rows. |
| Agent-readable discovery | Partial/Strong | APIs, `/llms.txt`, agent tools, and readbacks exist; external assistant read/citation/conversion evidence is not yet proven. |
| Future commerce/action rails | Thin for public claims | Code exists, but production provider evidence and public permission do not. |

## Red Lines

These should block broad public launch claims:

1. **No "verified" public label without a named standard.** Resolve `registry_verified` public presentation in `src/lib/ui/status-presentation.ts` or prove the named standard.

2. **No qualified-inquiry launch claim without deployed loop evidence.** Run and record the deployed Phase 2 support smoke plus Resend/Novu provider smokes with source-owned dispatch IDs.

3. **No booking/payment/dispatch language.** Keep public copy, answer output, action summaries, and human surfaces free of booking, payment, dispatch, autonomous fulfillment, guaranteed response, quote acceptance, or job acceptance claims.

4. **No public money/action capability claims from Phase 5/6 code.** Billing and business-action evidence remain source-local/test-mode/future-gated until provider smokes and production proof pass.

5. **No broad demand launch before owner liquidity.** Internal alpha needs real owner activation rows and real inquiry evidence, not just seeded demos.

6. **No external assistant write exposure without abuse/replay proof.** `/api/agent/tools` should have explicit rate/size/origin/replay/idempotency evidence before being promoted as a public integration point.

## Highest-Leverage Next Moves

1. **Prove five real owners.** Capture the 0/5 friendly-owner activation debt with owner rows, status views, listing shares or attribution, and friction notes. This unlocks honest alpha language.

2. **Close the deployed inquiry loop.** Make Phase 2 support/provider smokes pass against real deployed source state. Treat this as the product's first conversion proof.

3. **Tighten semantic boundary refusals.** Add tests and runtime handling for booking/payment/dispatch/autonomous intent in first-turn answer requests and inquiry submissions.

4. **Replace or standardize "verified."** Move public language to "checked", "published", "last checked", or define a named standard.

5. **Instrument assistant-to-inquiry attribution.** Track whether external assistant reads, API/tool calls, agent JSON opens, answer sessions, listing views, and inquiries connect.

6. **Keep future rails feature-gated.** Billing, business actions, protected actions, and harness evidence should stay out of public launch narrative unless explicitly marked unavailable/source-local.

## Product Positioning For The Next Slice

Recommended public posture:

> Agentic Economy publishes checked local service pages that people and assistants can compare. It does not book, charge, dispatch, or confirm availability. When a business supports it, AE can send a qualified inquiry for owner review.

Recommended alpha posture:

> We are proving whether real local businesses will maintain assistant-readable service pages and respond to qualified inquiries from customers and assistants.

Recommended internal operator posture:

> The operating product is claim -> publish -> discovery -> inquiry -> owner response -> reconstruction. Everything else is future rail, support system, or proof machinery.

## Council Decision Questions

1. What exact owner evidence upgrades AE from internal alpha rehearsal to internal alpha?

2. Should answer-first remain the homepage before inventory density is proven, or should `/registry` and `/claim` dominate until supply is stronger?

3. Is "booking-shaped inquiry" always refused, or allowed as an inquiry only when the receipt explicitly says no booking occurred?

4. What is the public name for AE's trust state if "verified" is forbidden?

5. Which future-surface routes should be hidden, noindexed, or operator-only before the next public demo?

## Bottom Line

AE should not slow down because the implementation is fake; it is not fake. It should slow the narrative down because the implementation is ahead of the evidence.

The next product win is not more capability breadth. It is making one narrow promise undeniably true:

```text
A real customer or assistant can find a real published local-service listing,
send a boundary-honest qualified inquiry,
and AE can prove what happened without pretending it booked, charged, or dispatched anything.
```
