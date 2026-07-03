# Journey and GTM Review
**Council Lens:** Customer Journey / GTM Critic
**Date:** 2026-07-03

## Core Journeys

**Business owner journey.** The intended owner path is claim -> publish -> status/readback -> share public URL -> receive qualified inquiries -> reply or close. The implemented path mostly exists:

- Claim starts at `src/routes/claim.tsx`, with business identity, one service, service area, hours, response cue, first-request state, public disclosure, unavailable reason, and explicit owner confirmation before publishing.
- Publish success continues through `src/routes/claim.success.tsx`, which shows what was published, exposes the public URL, and routes to `src/routes/owner.status.tsx`.
- Owner status uses `src/components/ae/status/AeStatusCard.tsx` and `src/components/ae/status/AeCapabilityList.tsx` to show publication, trust, index, discovery, unavailable capabilities, and the copy/share action.
- Owner messages live at `src/routes/owner.inquiries.tsx` and `src/routes/owner.inquiries.$threadId.tsx`, with reply, mark-read, close, and delivery readback.

This is close to the PRODUCT.md loop, but the owner journey still feels more like "publish a page" than "be activated." GTM readiness requires status seen, capability health seen, share or interest, and attribution. The UI has `share_url_copied` in `src/components/ae/forms/AeCopyPublicUrlButton.tsx` and owner status events in `src/routes/owner.status.tsx`, but inspected UI wiring is weaker for `claim_started`, `claim_submitted`, `publish_succeeded`, and owner inbox view. `src/modules/observability/internal/funnel.ts` defines the activation model, yet the journey needs a clearer owner-facing activation moment.

**Customer journey.** The customer can ask or browse:

- Ask path: `src/routes/index.tsx` -> `src/components/ae/chat/AeChat.tsx` -> cited provider cards in `src/components/ae/artifacts/AeGenerativeAnswer.tsx` -> listing -> inquiry when available.
- Browse path: `src/routes/registry.tsx` -> provider card -> `src/routes/$slug.tsx` -> `src/components/ae/listing/AeProviderListingPage.tsx`.
- Inquiry path: `src/routes/$slug.inquiry.tsx` validates contact details and message, then submits via `src/modules/inquiries/inquiry.functions.ts`.

The customer language is mostly right: "published details only," "business confirms timing, quote, and availability," and "does not book or take payment." The current risk is thin-inventory comprehension. The home page leads with asking, but if supply is sparse the no-match route must become useful acquisition, not a dead end. The registry is clear but literal; `src/modules/registry/registry.actions.ts` explicitly does not typo-correct, so the chat layer must carry search recovery for normal users.

**Assistant/developer journey.** AE exposes a strong read layer:

- Human "Get as agent JSON" appears in `src/components/ae/landing/AeAgentJsonAffordance.tsx` and listing/registry surfaces.
- Public JSON routes are `src/routes/api.businesses.ts`, `src/routes/api.businesses.search.ts`, and `src/routes/api.businesses.$slug.ts`.
- Quiet agent tools are registered in `src/modules/actions/index.ts` and exposed by `src/routes/api.agent.tools.ts`. The tool set is appropriately narrow: `registry.search`, `registry.detail`, and `inquiry.submit`.
- The answer tool runner in `src/modules/answer-thread/internal/tool-runner.ts` refuses non-read tools in the answer loop and records tool evidence.
- Builder readback exists at `src/routes/developers.discovery.tsx`, backed by `src/modules/discovery/developer-discovery.ts`.

This journey honors the safe assistant contract better than most of the UI: assistants can read, compare, summarize, route, and submit the qualified inquiry action when allowed. The developer route is noindex/operator-gated, which is good because it uses internal terms like "source-owned readback," "route health," "schema," and "gated exclusions" that would be poor public GTM copy.

**Operator journey.** Operator/admin surfaces exist for claim recovery, index health, audit events, inquiry reconstruction, run evidence, protected actions, business actions, and monetization. The core launch operator path is:

- `src/routes/admin.claims.tsx`
- `src/routes/admin.index-health.tsx`
- `src/routes/admin.audit-events.tsx`
- `src/routes/admin.inquiries.tsx`

These are source/readback oriented and avoid raw private content. The admin inquiry reconstruction in `src/routes/admin.inquiries.tsx` is especially aligned with the trust posture: it reconstructs customer inquiry, owner action, delivery, audit, funnel, and operation refs with redaction. The risk is operator-surface sprawl. `src/lib/operator/navigation.ts` includes advanced owner/admin links for contact follow-ups, business actions, and billing. Production hides advanced nav unless configured, but any GTM or demo environment that enables it can blur the first-conversion narrative.

## First Conversion Readiness

The implemented claim -> publish -> listing/registry/search/API -> qualified inquiry path is materially present, but not launch-ready in the GTM sense.

**Claim.** `src/routes/claim.tsx` is strong for Phase 1: ABN is not required, service details are structured, facts are confirmed before publish, and owners choose whether a first request is available. This supports owner onboarding and provider pride. The main risk is that "Qualified inquiry is available" can be selected by an owner as a page fact. The deeper support gate exists in the inquiry domain, but the claim UI must not let an owner believe selecting the radio is enough to make P2 operational.

**Publish and readback.** `src/routes/claim.success.tsx` and `src/routes/owner.status.tsx` create the right post-publish loop: show what published, copy URL, open public page, see status and unavailable capabilities. This maps well to `.planning/GTM-READINESS.md` owner activation, but activation proof is not complete. `.planning/STATE.md` still records 0/5 friendly-owner rows and says internal-alpha/public-launch claims remain blocked.

**Listing, registry, search, API.** `src/routes/registry.tsx`, `src/routes/$slug.tsx`, `src/routes/api.businesses.search.ts`, `src/routes/api.businesses.$slug.ts`, `src/routes/llms[.]txt.ts`, and `src/routes/api.agent.tools.ts` support comparable discovery for humans and assistants. Copy and tests show the public surfaces avoid booking/payment/dispatch overclaim. The search experience is enough for seeded inventory, but not enough to carry a public demand launch if inventory is thin or queries are misspelled.

**Qualified inquiry.** P2 is implemented as a real first owned conversion: `src/routes/$slug.inquiry.tsx`, `src/modules/inquiries/inquiry.actions.ts`, `src/modules/inquiries/internal/commands.ts`, owner inbox routes, admin reconstruction, notification state, and privacy redaction all exist. The critical gate is support readiness: `src/modules/inquiries/internal/commands.ts` and `tests/unit/inquiries/inquiry-flow.test.ts` require a `human_inquiry_owner_inbox` support record before inquiry availability can be claimed.

The readiness gap is deployment and provider proof. `.planning/STATE.md` says final Phase 2 closeout still needs deployed `npm run test:phase2-support-smoke`, `npm run test:provider-smoke:resend`, and `npm run test:provider-smoke:novu`. `tests/deploy-smoke/phase2-support-record-smoke.spec.ts` exists and fails loudly without deployed inputs. Until those smokes pass, qualified inquiry can be described as implemented/source-local, not launch-ready.

## Experience Proof

Evidence that supports the journey:

- `src/routes/index.tsx` and `src/components/ae/chat/AeChatWelcome.tsx` lead with "Ask for a local service. See who fits." and explain that AE answers from published business details.
- `src/components/ae/artifacts/AeGenerativeAnswer.tsx` renders provider cards, comparison tables, and "What to do now" copy, with a visible reminder that a person at the business confirms timing, quote, and availability.
- `src/components/ae/listing/AeProviderListingPage.tsx` gives listings a clear action card, service area, hours, services, photos or category illustrations, "What comes from the reply," correction/removal, and agent JSON.
- `src/modules/answer/internal/boundary-prose.ts` is direct: AE reads and compares listings; it does not book, charge, or dispatch.
- `src/modules/actions/index.ts`, `src/modules/registry/registry.actions.ts`, and `src/modules/inquiries/inquiry.actions.ts` define the current assistant contract in one action registry and include explicit boundaries.
- `tests/e2e/public-owner-ui.spec.ts` covers home, registry, claim validation, claim success, owner status, listing, inquiry submission, owner reply/close, and admin inquiry reconstruction while scanning for future-surface copy.
- `tests/e2e/landing-answer.spec.ts` and `tests/e2e/thread-first.spec.ts` prove the ask path routes to cited listings and stays free of internal public vocabulary.
- `tests/e2e/developer-discovery.spec.ts` proves read-only discovery pages and machine endpoints expose schema/examples/fixtures without callable/payment/mutation claims.
- `tests/copy/phase1-banned-copy.test.ts`, `tests/copy/discovery-overclaim.test.ts`, `tests/copy/claims-register.test.ts`, and `tests/ui-contract/public-language-copy.test.ts` are strong guardrails against public overclaim.

Evidence that undermines or complicates readiness:

- `.planning/STATE.md` says 0/5 friendly-owner activation rows remain deferred debt, and Phase 2/3 deployed smoke proof is still open.
- `src/routes/$slug.tsx` builds listing inquiry affordance from the public catalog alone via `buildPublicInquiryAffordance`, while support readiness checks in `src/modules/inquiries/route-readbacks.ts` only run when inquiry source state is supplied. If a listing publishes `inquiry_available` but support state is incomplete, the public CTA can appear ahead of operational proof unless the Convex-backed publish path prevents that upstream.
- `src/routes/$slug.inquiry.tsx` currently says "Send the job details"; `tests/deploy-smoke/phase2-support-record-smoke.spec.ts` expects "Send a human inquiry to the owner" and "does not create a booking, payment, or automated action." That may be harmless drift, but it means the deployed smoke is not visibly aligned with the current UI copy.
- `src/lib/ui/status-presentation.ts` contains a public-audience `registry_verified` status with compact label "Verified." `plainTrustLabel` maps the same tier to "Checked," which is safer. The status badge path should not expose "Verified" unless a named standard exists.
- `src/lib/operator/navigation.ts` includes advanced owner/admin links for billing, protected actions, and business actions. They are hidden in production unless enabled, but they should not appear in launch demos unless the narrative explicitly says they are internal/source-local or unavailable.
- `public/images/illustration/*` gives the Astryx-era visual system usable assets, but generic category illustrations can weaken provider trust if real photos are absent across many listings. The ten-star marketplace feel needs real inventory signals, not just pleasant placeholders.

## Trust and Comprehension Risks

1. **"Send inquiry" may still sound like service commitment.** Listing and inquiry copy usually says the business replies with timing, quote, and availability, but users with urgent needs may still read "Send inquiry" as "get help now." The CTA should stay paired with the boundary on every step.

2. **Owner-selected availability can outrun support readiness.** The claim form asks owners to choose first-request status. The system has support-record gates, but GTM should verify that public CTAs cannot appear unless inquiry support, dispatch state, owner inbox, and kill rules are actually ready in the deployed source state.

3. **"Verified" vocabulary is dangerous.** `registry_verified` should either be backed by a named registry standard or be presented as "Checked" everywhere public/owner-facing.

4. **Developer/operator terms are useful internally but toxic in public launch copy.** "Source-owned," "readback," "schema," "route health," "operator," and similar terms are acceptable in admin/developer noindex surfaces, but the public launch story must translate them into "published details," "last checked," "support status," and "what to do next."

5. **The answer-first home page amplifies cold-start risk.** The 10-star doc says discovery alone is table stakes and "meat" is the binding constraint. If launch inventory is sparse, the ask flow will reveal thin supply faster than the registry does. Empty answers need to route into owner acquisition or narrower geography, not generic "browse services."

6. **Realness needs more than illustrations.** DESIGN.md allows bitmap assets and the repo has category illustrations, but PRODUCT.md says lead with real inventory. Listing photos, owner-supplied evidence, and concrete service area details should become the trust signal before broad GTM.

## Launch Narrative Fit

Current product communicates the 5-star vision reasonably well: customers can ask or browse, compare published local service details, open a listing, get agent-readable JSON, and submit a qualified inquiry when available. It avoids evaluating itself as a booking/payment marketplace, which is correct.

It does not yet earn the public launch narrative implied by the ten-star strategy. `.planning/PRODUCT-10-STAR.md` says the binding constraint is "meat": real owners, real inquiries, and owner response. `.planning/GTM-READINESS.md` says Phase 1 is not launch-ready until owner activation state, channel attribution, claims register, support proof, and copy scans are green. `.planning/STATE.md` confirms those proof gaps remain.

The launch narrative should therefore be narrow and honest:

- For owners: "Free published service page, readable by customers and assistants, with qualified inquiries when support is enabled."
- For customers: "Ask or browse, compare what businesses publish, and send job details for owner review when available."
- For assistants/builders: "Read public catalog facts and route to the next step; do not infer booking, payment, dispatch, or availability."
- For operators: "Every claim, listing, inquiry, delivery state, and repair path must be reconstructable before channel expansion."

The current product can carry an internal founder-assisted alpha. It should not carry broad demand launch, paid acquisition, developer launch, or "agentic commerce platform" positioning until the activation and deployed support evidence catches up.

## Council Questions

1. What exact public claim is allowed for qualified inquiry before Phase 2 deployed support, Resend, and Novu smokes are green?

2. Should `registry_verified` be removed from public presentation, renamed to "Checked," or tied to a named standard before any launch copy can use it?

3. Should the first launch screen emphasize `/registry` and `/claim` until a wedge has enough supply, or is the answer-first homepage safe with current no-match routing?

4. Which funnel events are the non-negotiable owner activation path for alpha, and are `claim_started`, `claim_submitted`, `publish_succeeded`, `owner_inbox_viewed`, and registry result clicks fully wired in production?

5. Are advanced owner/admin routes for billing, contact follow-ups, and business actions excluded from all public demos and owner onboarding until their phase evidence is launch-ready?
