# Vision vs Implementation
**Council Lens:** Product Vision Steward
**Date:** 2026-07-03

## Product Promise Map

| Promise | Source citations |
|---|---|
| AE is a trust and discovery layer for fragmented local service commerce, not a fake marketplace. It publishes business-supplied service pages customers can compare and assistants can read. | `AGENTS.md`, `PRODUCT.md`, `.planning/PRODUCT-10-STAR.md`, `.planning/ROADMAP.md` |
| The first owned conversion is a qualified inquiry: a human first-contact message sent to a business for owner review. | `AGENTS.md`, `PRODUCT.md`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md` |
| Assistants have a conservative safe contract: read, compare, summarize, route to next step, and submit qualified inquiry only when published. No booking, charging, dispatch, autonomous fulfillment, or invented availability. | `AGENTS.md`, `DESIGN.md`, `PRODUCT.md`, `.planning/codebase/ARCHITECTURE.md` |
| Trust must name source, freshness, and boundary. "Verified" is banned unless a named standard exists and is met. | `PRODUCT.md`, `AGENTS.md`, `.planning/PRODUCT-LENS.md`, `.planning/codebase/CONCERNS.md` |
| The launch wedge is real supply first: narrow local services, owner activation, response commitment, and real inquiries before broader demand or future capability work. | `.planning/PRODUCT-10-STAR.md`, `.planning/STATE.md`, `.planning/PRODUCT-LENS.md`, `.planning/ROADMAP.md` |
| Human and assistant discovery should share the same public facts through registry pages, JSON APIs, `/llms.txt`, and AE-hosted fallback discovery, without protocol theater. | `AGENTS.md`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/codebase/ARCHITECTURE.md` |
| The answer surface is a demand router into trusted listings, not an open-ended chat product or hidden action runner. | `.planning/ROADMAP.md`, `.planning/PRODUCT-10-STAR.md`, `.planning/codebase/ARCHITECTURE.md` |
| Correction, claim, suppression, owner readback, and operator repair are part of the trust loop, not admin afterthoughts. | `PRODUCT.md`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/codebase/ARCHITECTURE.md` |

## Implementation Evidence

| Promise | Evidence on main |
|---|---|
| Trust/discovery service pages | Public registry and listing surfaces exist in `src/routes/registry.tsx`, `src/routes/$slug.tsx`, `src/components/ae/listing/AeProviderListingPage.tsx`, and `src/components/ae/primitives/AeProviderCard.tsx`. Catalog claim/publish/readback flows live in `src/modules/catalog/owner-claim.functions.ts` and `convex/catalog.ts`. Public catalog reads and search are backed by `src/modules/registry/registry.functions.ts`, `src/modules/registry/internal/search.ts`, and `convex/registry.ts`. |
| Qualified inquiry conversion | `src/modules/inquiries/inquiry.actions.ts` defines `inquiry.submit` as the only assistant-exposed write and states the no-book/no-charge boundary. Human form and route readback live in `src/routes/$slug.inquiry.tsx` and `src/modules/inquiries/route-readbacks.ts`. Durable submission, owner inbox, reply, close, delivery, and privacy readbacks are in `src/modules/inquiries/inquiry.functions.ts`, `src/modules/inquiries/internal/commands.ts`, `convex/inquiries.ts`, and `convex/notificationOutbox.ts`. Owner UI exists in `src/routes/owner.inquiries.tsx` and `src/routes/owner.inquiries.$threadId.tsx`. |
| Assistant safe contract | `src/modules/actions/index.ts` registers only `registry.list`, `registry.search`, `registry.detail`, and `inquiry.submit`; only `registry.search`, `registry.detail`, and `inquiry.submit` surface through `agentTools`. `src/routes/api.agent.tools.ts` is the quiet tool door. `src/modules/answer-thread/internal/tool-runner.ts` refuses non-read actions during answer turns. `src/modules/answer/internal/answer-llm-prompts.ts` and `src/modules/answer/answer-synthesizer.ts` prohibit invented providers, booking, payment, dispatch, live availability, and unqualified verified claims. |
| Source/freshness/boundary trust | Public DTOs include `trustTier`, `indexStatus`, `discoveryStatus`, `updatedAt`, `firstRequest`, and capability status in `src/modules/registry/public.ts` and `src/modules/registry/internal/search.ts`. Listing/card presentation maps trust and availability to plain labels in `src/lib/ui/provider-presentation.ts` and `src/lib/ui/status-presentation.ts`. Registry/discovery projection attempts and health readbacks are modeled in `src/modules/registry/public.ts`, `convex/registry.ts`, `src/modules/discovery/public.ts`, and `src/modules/discovery/internal/ucp-manifest.ts`. |
| Real supply and owner activation | The mechanics for claim, publish, status, correction, and listing are present in `src/routes/claim.tsx`, `src/modules/catalog/owner-claim.functions.ts`, `convex/catalog.ts`, and `src/routes/privacy.remove-business.tsx`. However, `.planning/STATE.md` records five-owner activation evidence as `0/5`, still blocking internal-alpha and public-launch claims. `.planning/PRODUCT-10-STAR.md` calls "meat" the binding constraint. |
| Assistant/developer discovery | `/api/businesses`, `/api/businesses/search`, and `/api/businesses/$slug` are implemented in `src/routes/api.businesses.ts`, `src/routes/api.businesses.search.ts`, and `src/routes/api.businesses.$slug.ts`. `/llms.txt` and `/$slug/ucp` are implemented in `src/routes/llms[.]txt.ts`, `src/routes/$slug.ucp.ts`, and `src/modules/discovery/discovery.functions.ts`. Developer readbacks and gated unavailable surfaces are in `src/routes/developers.discovery.tsx` and `src/modules/discovery/developer-discovery.ts`. |
| Answer/search router | The home route starts with an answer prompt in `src/routes/index.tsx`. Turn streaming runs through `src/routes/api.answer.turn.ts` and `src/modules/answer-thread/internal/turn-orchestrator.ts`. Tool calls, allowed slugs, snapshot hashes, evidence JSON, and public thread projection persist through `src/modules/answer-thread/answer-thread.functions.ts`, `src/modules/answer-thread/internal/answer-turn-finalization.ts`, and `convex/answerThreads.ts`. |
| Correction and operator trust loop | Claim/publish writes create operations, audit events, registry attempts, and discovery attempts in `convex/catalog.ts`. Suppression-aware catalog reads are implemented in `src/modules/registry/internal/search.ts` and `convex/registry.ts`. Correction/removal requests are exposed at `src/routes/privacy.remove-business.tsx`; admin and owner readback routes are present under `src/routes/admin.*.tsx` and `src/routes/owner.*.tsx`. |

## Fit Assessment

| Promise | Score | Assessment |
|---|---|---|
| Trust/discovery service pages | Partial | The catalog, registry, listing, API, and discovery mechanics are real. Product reality is weaker because supply evidence is not yet real enough to support marketplace language. Current fallback/local fixture paths also make local confidence easier than deployed confidence. |
| Qualified inquiry conversion | Partial | The inquiry path is well-modeled: gated target, admission, idempotency, rate limit, support record, notification state, owner inbox, and reply controls exist. Fit is still partial because `.planning/STATE.md` says deployed Phase 2 support/provider smokes remain blockers, and local owner E2E can show success without exercising real mutations. |
| Assistant safe contract | Strong | The action registry, quiet tool door, answer tool-runner, prompts, and action boundaries consistently enforce read-only answer behavior and isolate the single write to `inquiry.submit`. This is the strongest implementation/vision fit. |
| Source/freshness/boundary trust | Partial | DTO/status fields and presentation labels exist, and public copy often says the business confirms timing/quote/availability. But the truth engine is thin: `.planning/PRODUCT-10-STAR.md` says schema states exist while no engine populates contradiction/freshness observation. Also `registry_verified` remains a public status presentation label in `src/lib/ui/status-presentation.ts`, which is vocabulary risk unless a named standard is defined. |
| Real supply and owner activation | Thin | The product's core constraint is not code; it is real owner liquidity. Main has claim/publish plumbing and a correction route, but the planning state records `0/5` friendly-owner rows and blocks internal-alpha/public-launch claims. |
| Assistant/developer discovery | Partial | Public JSON, `/llms.txt`, AE-hosted UCP fallback, schema/examples, and developer readbacks exist and are boundary-aware. Fit is partial because `.planning/STATE.md` says Phase 3 local/source proof is passed but deployed route/readback proof is not claimed. |
| Answer/search router | Strong | The answer surface is built as a registry-grounded router, not an action executor. It stores tool evidence and gates provider slugs. It will still feel weak if catalog supply stays sparse, but the architecture matches the promise. |
| Correction and operator trust loop | Partial | Claim, publish, correction/removal, suppression, projection attempts, audit, and repair concepts are implemented. The gap is proof and operational readiness: broad Convex source-state scans, local bypasses, and unresolved launch evidence make the loop not yet production-trustworthy. |

## Highest-Leverage Gaps

1. **Real supply is the binding gap.** The implementation can publish and search listings, but the product promise needs real claimed, response-committed owners. The recorded `0/5` owner evidence means AE cannot honestly ship as a marketplace yet.

2. **The qualified inquiry loop needs deployed proof.** Inquiry code is substantial, but the first owned conversion must be proven end to end: customer submit -> durable thread/message -> owner read/reply -> notification/provider readback -> operator reconstruction.

3. **Trust states need a living evidence pipeline.** Today the model has source hashes, statuses, projection attempts, and presentation labels; it does not yet have enough freshness/contradiction/checking machinery to fulfill "trust must name source, freshness, and boundary" at product strength.

4. **Assistant discovery needs external-read evidence and attribution.** `/llms.txt`, agent JSON, and tools exist, but the strategy depends on external assistants reading/citing AE and routing demand. Instrumentation and deployed readback proof remain more important than additional discovery formats.

5. **Future-surface code increases narrative risk.** Billing, protected actions, and business-action receipt modules exist in the active tree, while product state says money/action proof is source-local or future-gated. Public claims must stay anchored to listings, answers, and qualified inquiries until real transaction evidence exists.

6. **Trust infrastructure has production-scale weak spots.** `.planning/codebase/CONCERNS.md` flags whole-state Convex adapters, public route-handler hardening, process-local answer rate limits, local E2E bypass parity, and short non-cryptographic hashes. These are product trust risks once real customer messages and receipts matter.

## Strategic Risks

- **Marketplace theater:** If AE launches before real owners and inquiries, the product becomes a polished empty directory, which the 10-star doc explicitly says is not the wedge.

- **First-conversion disappointment:** If a customer sends an inquiry and owner/provider delivery is not proven, AE loses the trust thesis at the exact moment it asks for trust.

- **Assistant promise without distribution:** The assistant-readable surface is unique, but if external assistants do not fetch/cite it, "agent-readable front door" remains internal correctness rather than growth.

- **Vocabulary breach:** Any public "verified", "callable", payment, booking, dispatch, or autonomous wording would collapse the boundary contract. The `registry_verified` presentation label is the main visible vocabulary hazard to resolve.

- **Future work swallowing the present:** Money, receipts, protected actions, and HSK-shaped clearance are strategically compelling, but shipping more of them before owner liquidity and inquiry proof risks building hands before meat.

## Council Questions

1. What is the minimum owner/inquiry evidence required before AE can use marketplace language publicly?

2. Should `registry_verified` be renamed or hidden until a named verification standard exists?

3. Is the next product sprint best spent on owner acquisition/proof, inquiry provider smoke, or trust/freshness evidence?

4. What instrumentation proves external assistants actually read/cite AE and convert into inquiries?

5. Which future-surface routes/modules should remain operator-only or feature-gated until the qualified inquiry loop has real usage?
