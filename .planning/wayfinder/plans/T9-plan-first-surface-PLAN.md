# T9 — Plan-first consumer surface

## Context

Ticket `.planning/wayfinder/tickets/T9-plan-first-surface.md` asks AE to turn an abstract need into a consumer-plain plan: steps, comparable options, and a safe next action. The founder framing is binding: **“Plan mode for the real world.”** The destination is the customer’s outcome, the map is a legible plan, tickets are steps with options, HITL tickets are fresh approval decisions, AFK tickets are bounded read/check work, the frontier is what can be decided now, and decisions-so-far are a readable trail.

The current public one-view is `src/routes/index.tsx` (`Route`, `readServicesPageServer`, `loadServicesRouteReadback`, `ServicesRoute`). Its ask-box invokes `registryServicesSearchAction`, whose output is `PublicServicesApiPage`/`ServiceDto` from `src/modules/registry/internal/services-api-projection.ts`. `AeServiceList`/`AeServiceRow` already show the first three comparable service rows, published price, timing copy, and a next action; `AeInstantQuote` calls the existing sandbox quote path and displays quote provenance and validity.

The round-6 answer system remains the reusable answer-side rendering seam: `src/modules/answer/answer-synthesizer.ts` owns `AnswerWorkStep`, `AnswerSource`, `AnswerSnapshot`, and `AnswerEvent`; `src/modules/answer/answer-schema.ts` owns the closed artifact vocabulary; `src/modules/answer/internal/dto-to-answer-source.ts` is the single catalog-DTO-to-answer-source mapper; and `src/components/ae/artifacts/AeGenerativeAnswer.tsx` renders answer artifacts plus the existing “How this was put together” journey. `/t/$threadId` (`src/routes/t.$threadId.tsx`) owns persisted answer replay through `AeChat`; it is not a second plan authority.

The Customer Request source already owns the ask → understand → choose → authorize → act spine. `src/modules/customer-request/application/interpret-compile/interpret.ts` exposes `proposeThenCompile` and `interpretCompileCommit`; `src/modules/customer-request/application/interpret-compile/types.ts` defines the bounded graph and compilation inputs; `src/modules/customer-request/compiler.ts` creates route generations; and `src/modules/customer-request/customer-projection.ts`/`src/modules/customer-request/agent-contract.ts` project safe customer states, options, route decisions, authority boundaries, progress, and activity. `src/components/ae/customer-request/AeCustomerRequestWorkspace.tsx` is the existing browser lifecycle host. Its records seam is `RequestRecordLinks` (`src/components/ae/customer-request/panels/records/records.tsx`) backed by `GET /api/requests/$requestRef/evidence`.

The authority contract is ADR-019: `inspect_only` reads, compares, and prepares with no consequence; `approve_each` requires a fresh exact principal decision; `bounded_mandate` permits repeated exact uses in declared bounds; `full_yolo` permits autonomous pursuit only inside explicit, attributable, revocable bounds. T9 does not add booking or payment authority. Booking-specific language and booking endpoints remain T10 work.

## Decisions (settled)

1. **One consumer plan object, projected from existing compilation and public supply.** Add a source-owned `ConsumerPlan` projection seam under `src/modules/customer-request/application/consumer-plan-projection.ts`, exported through `src/modules/customer-request/application/public.ts`. It accepts a bounded, read-only compilation preview plus the matching `registry.services_*` rows and returns only consumer fields. It may inspect compiled route-generation material internally, but its output contains no `CustomerRequestRoutePlan`, `routePlanId`, `CapabilityContractRef`, binding, registry digest, or transport detail. The UI imports `ConsumerPlan`, never the compiler or RoutePlan types.

   The projection is the composition point between the two existing sources of truth:
   - the Customer Request preview supplies canonical step order, dependencies, current frontier, route expiry, and authority boundary;
   - `PublicServicesApiPage.services` supplies the business/offering label, summary, structured published `price`, exact published `pricingSummary`, exact published availability, public business link, and the available next action.

   No new catalog, route store, workflow engine, or parallel authority model is introduced. The semantic object is one projection reused by the one-view, the answer-thread artifact/replay path, and the Customer Request handoff.

2. **Consumer plan shape is closed and plain.** `ConsumerPlan` is a discriminated result:

   ```ts
   type ConsumerPlanResult =
     | { kind: 'plan'; destination: ConsumerDestination; steps: readonly ConsumerPlanStep[]; frontier: ConsumerPlanFrontier; decisions: readonly ConsumerDecisionRecord[]; authority: 'inspect_only' | 'approve_each' | 'bounded_mandate' | 'full_yolo' }
     | { kind: 'needs_information'; prompt: string; destination: ConsumerDestination; decisions: readonly ConsumerDecisionRecord[] }
     | { kind: 'unavailable'; reason: 'no_current_supply' | 'preview_unavailable' | 'options_changed'; destination: ConsumerDestination; decisions: readonly ConsumerDecisionRecord[] }
   ```

   Exact fields:
   - `ConsumerDestination`: `{ label: string; request: string }`. It names the outcome in customer language, never a compiler or capability identifier.
   - `ConsumerPlanStep`: `{ step: number; title: string; purpose: string; state: 'frontier' | 'queued' | 'running' | 'completed' | 'needs_attention' | 'blocked'; dependsOn: readonly number[]; options: readonly ConsumerPlanOption[]; nextAction: ConsumerNextAction; record?: ConsumerDecisionRecord }`.
   - `ConsumerPlanOption`: `{ optionRef: string; business: { slug: string; name: string; location?: string }; offering: { name: string; summary: string }; price: { kind: 'published' | 'not_published'; published?: OfferingPrice; summary?: string }; availability: { kind: 'published' | 'needs_confirmation'; summary?: string; validUntil?: number }; nextAction: ConsumerNextAction; evidence: { observedAt?: number; source: 'business_published' | 'ae_sandbox' } }`.
   - `ConsumerNextAction`: `{ kind: 'inspect' | 'compare' | 'quote' | 'start_request' | 'revise' | 'wait'; label: string; href?: string }`. `quote` means the existing AE sandbox quote only. There is no `book`, `reserve`, `pay`, `dispatch`, or `confirm_slot` kind in T9.
   - `ConsumerPlanFrontier`: `{ step: number; availableActions: readonly ConsumerNextAction[] }`. It is the set of choices the person/agent can make now, not a promise that later steps are available.
   - `ConsumerDecisionRecord`: `{ step: number; optionRef?: string; action: 'inspected' | 'compared' | 'quoted' | 'approved' | 'started' | 'completed' | 'refused' | 'needs_attention'; authority: 'inspect_only' | 'approve_each' | 'bounded_mandate' | 'full_yolo'; summary: string; observedAt: number; evidenceRefs: readonly string[]; nextAction: ConsumerNextAction }`.

   `price.published` is the existing structured `OfferingPrice`; `price.summary` is the business’s exact published string. Never derive a number from copy, estimate a range, or turn a quote-only offering into a price. `availability.summary` is the exact published `availabilitySummary` only; absence becomes `needs_confirmation`, never “available now.” `validUntil` is expiry/freshness evidence, not a slot or booking guarantee.

3. **A single-service ask short-circuits only on compiled shape, never keyword heuristics.** If the read-only compilation preview has exactly one route step and that step has no dependency edges, emit exactly one `ConsumerPlanStep`. Multiple businesses/offers remain comparable options inside that one step. If compilation has two or more steps, preserve every step and dependency in order. Do not infer single-service status from words such as “plumber,” from result count, or from one business returned by search. If the preview cannot establish step shape, return `unavailable`/`needs_information`; do not silently collapse a composite ask.

4. **`/` remains the one-view and the ask-box remains its only entry point.** Keep `Route`’s `q` search contract and `registryServicesSearchAction` call. Extend `loadServicesRouteReadback` (or rename the returned internal object to `loadOneViewReadback` while preserving the existing service readback helper for callers) to load the public service page and the read-only compilation preview, then run `projectConsumerPlan`. Render the plan immediately below the ask-box; do not add a second “plan mode” page, a directory route, a wizard, or a separate plan URL. With no query, render the existing owner-first/ask-box state and do not load supply. With a query, show the destination heading, the current frontier, and the first 1–3 options per step; “More options” stays collapsed as in `AeServiceList`.

   `AeCustomerRequestWorkspace` remains the execution host after the person chooses `start_request`/a consequential future action. The one-view may hand off to it inline or via the existing Request entry path, but it must not reproduce its submit/compare/confirm/run state machine. `/t/$threadId` remains the durable answer/replay view; when a plan is emitted from the answer stream it uses the same `ConsumerPlan` artifact and record renderer, not a second shape.

5. **All currently executable T9 steps are inspect-only.** Search, compare, and the existing sandbox quote are read/inspect work. They do not create `approve_each`, `bounded_mandate`, or `full_yolo` authority. A future effectful step must enter the existing Customer Request authority seam: fresh exact choice maps to `approve_each`; a repeated bounded action maps to `bounded_mandate`; explicit broad autonomous pursuit maps to `full_yolo`; inspect-only remains no-effect. T9 does not expose or imply those effectful actions on the public one-view.

6. **Every execution has a readable record, without a new store.** The projection’s `decisions`/per-step `record` is the readable record for inspect/compare/quote results in the current plan and answer replay. For a persisted Customer Request, map existing `CustomerRequestView.progress`, `activity`, `action`, `confirmation`, `decision.changes`, and the evidence export (`GET /api/requests/$requestRef/evidence`) into `ConsumerDecisionRecord`; render it through a shared `AeDecisionTrail` and keep `RequestRecordLinks` for evidence/problem actions. Do not add a plan-events table, browser-only durable authority, or copied route execution journal. A record says what AE read or observed, who/what still owns the next action, evidence refs, and whether the next action is safe; it never turns an observation into completion.

7. **Copy is claim-bounded and responsibility-positive.** Public copy may say “plan,” “step,” “compare,” “published price,” “published timing,” “check an example quote,” “see business details,” and “the business confirms timing, price, availability, and the work.” It must not say or imply booking, reservation, confirmed slot, provider acceptance, checkout, payment, dispatch, fulfilment, guaranteed availability, or “done” before T10 and the relevant provider evidence. Keep the limitation once at the decision point rather than repeating “AE does not book” in every card. Keep `RoutePlan`, capability, binding, registry, source, sandbox/provider internals, `inspect_only`, and other implementation terms out of public human copy; diagnostics and machine contracts may retain exact technical terms. Claims remain labelled local/dev or `ae_sandbox_provider` where those are the only evidence classes.

## Approach

### 1. Freeze the source contract and preview seam

- `src/modules/registry/internal/services-api-projection.ts`: extend `ServiceDto` with `availabilitySummary?: string` and (if the projection needs freshness in the UI) `observedAt?: number`; copy the already-normalized `PublicOfferingDto.availabilitySummary`/source observed time without rewriting it. Keep `PublicServicesApiSchemaVersion` at `v1` because these are optional additive fields, matching the existing schema-version comment in `offering-api-projection.ts`.
- `src/modules/registry/registry.actions.ts`: extend `serviceOutputSchema` with the same optional fields and descriptions. Do not add route-plan, capability, or provider-private fields. `registryServicesListAction` and `registryServicesSearchAction` remain the only service supply inputs; `registry.list`/`registry.search` are not a rival source.
- Add `src/modules/customer-request/application/interpret-compile/preview.ts` with `previewCustomerRequest`/`PreviewCustomerRequestResult`. It reuses `loadRequestGraph`, `createConfiguredRequestInterpreter`, and `proposeThenCompile` with `finalAttempt: true`; it returns a bounded neutral compilation material for projection and never calls `compileCommit`, `replayCommittedCommand`, `commitAggregate`, preparation, confirmation, or execution.
- Export the preview types/function from `src/modules/customer-request/application/interpret-compile/index.ts` and `src/modules/customer-request/application/public.ts`. Preserve the existing `interpretCompileCommit` write path unchanged.
- Add a public read-only source action seam (`src/modules/customer-request/plan-preview.actions.ts`, registered in `src/modules/actions/index.ts` only if the implementation uses the action registry): schema `{ customerJob: z.string().trim().min(1).max(200), network: z.string().trim().min(1).max(120) }`, output the neutral preview union, `readOnly: true`, `surfaces: ['ui']`, no agent/HTTP exposure until a separately reviewed contract exists. Its runner calls `customerRequestApplication:preview` via the public Convex source transport.
- Add `preview` to `convex/customerRequestApplication.ts`. It may read routeable supply and active contract documents, then invoke the new pure preview seam. It must not reserve a submission, write a Request aggregate, create authority, contact a business, or expose raw route plans. If the graph/interpreter is unavailable, return the typed refusal used by `ConsumerPlanResult`.

### 2. Add the consumer-plain projection

- Create `src/modules/customer-request/application/consumer-plan-projection.ts`. `projectConsumerPlan` accepts the neutral preview material plus a `readonly ConsumerSupplyOption[]` assembled from `PublicServicesApiPage.services`; it joins by exact `offeringRef === optionRef`/compiled `offeringId`, drops unmatched internal candidates rather than inventing a business, preserves deterministic compiler step order, and enforces bounded counts/bytes.
- Define and export the `ConsumerPlanResult`, `ConsumerPlanStep`, `ConsumerPlanOption`, `ConsumerNextAction`, and `ConsumerDecisionRecord` types from this file and `application/public.ts`. The output is the only plan contract consumed by UI and answer adapters.
- Implement the single-step rule from Decisions (3). For multi-step routes, use compiled dependency edges to populate `dependsOn`, set only the first currently satisfiable step to `frontier`, and mark later steps `queued`/`blocked`. A route expiry becomes `needs_attention`, not “available.” A missing published price/availability remains absent/needs confirmation.
- Add `src/modules/registry/public.ts` adapter export (or a sibling `src/modules/registry/internal/consumer-supply-material.ts`) that maps each `ServiceDto` to `ConsumerSupplyOption`: business slug/name/location, offering name/summary, exact price/pricing summary, exact availability summary, public business URL, open sandbox quote URL where present, and observation/freshness fields. The adapter is the one place that knows the service projection field names; `projectConsumerPlan` does not import registry internals.
- Add focused projection tests under `tests/unit/customer-request/consumer-plan-projection.test.ts` and extend `tests/unit/registry/services-api-projection.test.ts`: one compiled step with three options, a multi-step route with dependency `2` after `1`, a missing/expired supply row, no published price, no availability, and an unmatched internal candidate. Assert no raw RoutePlan/compiler fields occur in serialized consumer output.

### 3. Make the one-view render the plan

- `src/routes/index.tsx`: keep the no-query early return and `registryServicesSearchAction.run({ data: { query, limit: 10 }, context: { caller: 'ui' } })`. Add the read-only preview call only after a non-empty query; run the public service search and preview in parallel, then call `projectConsumerPlan`. Return `{ services, plan }` from the loader readback while preserving the service page object for existing callers/tests.
- `src/components/ae/services/AeServiceList.tsx`: retain the no-match recovery and option-count cap, but render from `ConsumerPlan.steps` when a plan exists. Preserve `AeServiceRow`/`AeInstantQuote` as option-level reuse targets; do not duplicate money formatting or quote lifecycle logic.
- Add `src/components/ae/plan/AeConsumerPlan.tsx` for destination, step rail, frontier state, option groups, and decisions. Add `src/components/ae/plan/AeDecisionTrail.tsx` for the readable records. Use Astryx `Card`, `Heading`, `Text`, `Badge`, `Button`, and existing focus/live-region patterns. Every step exposes a text state (`Ready to compare`, `Waiting for the earlier step`, `Needs a fresh check`, `Checked`) in addition to visual markers; the UI must remain usable without color or motion.
- If the plan is `needs_information`/`unavailable`, render the existing service result as a truthful fallback plus one recovery action (refine the ask or start a Request). Do not render fabricated empty steps or a fake recommendation.
- The ask-box remains the one primary action. Keep `Show my plan`/the settled T8 ask copy; do not put a second composer inside the plan or move the plan to `/registry`/`/t/$threadId`.

### 4. Reuse the round-6 answer seam without creating a rival host

- `src/modules/answer/answer-schema.ts`: add one closed `consumer-plan` artifact carrying `ConsumerPlanResult`, or, if the answer stream is not emitting plans in this slice, add a structural adapter that renders the same `ConsumerPlan` without changing `AnswerArtifact`. Choose the artifact path for any plan that must survive `/t/$threadId`; do not create a second plan JSON shape.
- `src/modules/answer/internal/build-message-parts.ts`, `snapshot-artifacts.ts`, `merge-answer-artifact.ts`, and `src/components/ae/artifacts/AeGenerativeAnswer.tsx`: add the artifact/part switch and render `AeConsumerPlan`/`AeDecisionTrail`. Keep the existing “How this was put together” journey for answer construction; it is not the plan map and must not be relabelled as one.
- `src/modules/answer/internal/dto-to-answer-source.ts`: reuse its exact published `pricingSummary`/`availabilitySummary` rules; do not make a second catalog-to-card mapper. `AnswerSource.services` may supply offering prose, but `ConsumerPlanOption` remains the sole comparable-option contract.
- `src/modules/answer-thread/answer-thread.schema.ts` and its frozen evidence/projection tests: persist and replay the plan artifact if the answer route emits it. `AeChat`/`AeThreadTranscript` continue to own thread lifecycle; plan components remain presentational.

### 5. Hand off effectful work to the existing Customer Request host

- `src/components/ae/customer-request/AeCustomerRequestWorkspace.tsx` and `src/components/ae/customer-request/panels/request-result.tsx`: add the consumer plan presentation at the Request decision boundary by adapting `CustomerRequestView` through `projectConsumerPlan`, not by changing submit/compare/confirm/run semantics. Keep `WorkingUnderstanding`, `OptionsCard`, `RouteDecisionCard`, `RouteProgressCard`, and `ActionStatusCard` as state-specific controls where their detailed disclosures are needed.
- `src/components/ae/customer-request/panels/records/records.tsx`: retain `RequestRecordLinks` for evidence export and problem reports. `AeDecisionTrail` links to the existing evidence action instead of inventing a plan-history endpoint.
- Map authority and next actions exactly: `inspect_only` shows inspect/compare/quote; `approve_each` is a fresh exact confirmation only through `customerRequest.confirm`; `bounded_mandate`/`full_yolo` are displayed only when an existing standing permission/mandate projection says so, and all uses remain bounded/revocable. T9 has no public booking action.
- Add tests for a completed, refused, expired, outcome-unknown, and recovered step. Assert records name the actor/evidence/next safe action and never claim automatic retry or reversal when the source says otherwise.

### 6. Copy and surface gates

- Update route metadata in `src/routes/index.tsx` only after the rendered plan is present. Use current-state wording such as “Turn one ask into a short plan and compare published options.” Do not add booking, payment, or fulfilment keywords.
- Update `src/modules/customer-request/public-comprehension.ts` only for shared Request handoff copy; keep the plan-specific strings in the plan component or a plan copy module so the one-view and Request host use the same wording.
- Extend `tests/unit/routes/services-one-view.test.ts`, `tests/unit/ui/rider-services.test.tsx`, `tests/unit/customer-request/customer-request-workspace.test.tsx`, and the relevant answer-thread tests with exact accessibility labels, one-step/multi-step output, frontier transitions, and the no-booking copy scan.
- Inspect emitted root HTML and thread replay text, then run the copy/SEO gates listed in Verification. Public wording must agree with `registry.services_*` action summaries/boundaries and the plan’s typed refusals.

## Critical files & anchors

- `src/routes/index.tsx:21-51,53-98` — one-view loader, ask-box, result placement, metadata.
- `src/modules/registry/registry.actions.ts:371-420` — `registryServicesListAction`/`registryServicesSearchAction`; this is the supply source, not a new catalog.
- `src/modules/registry/internal/services-api-projection.ts:11-63,66-113` — `ServiceDto`, `PublicServicesApiPage`, and flattening projection.
- `src/components/ae/services/AeServiceList.tsx:13-81` and `AeServiceRow.tsx:18-110` — existing comparable cards, option cap, price/timing/next action reuse.
- `src/components/ae/services/AeInstantQuote.tsx:30-117` — read-only sandbox quote lifecycle and refusal recovery.
- `src/modules/customer-request/application/interpret-compile/interpret.ts:53-115,117-183` — `proposeThenCompile` and durable write boundary to keep out of the preview.
- `src/modules/customer-request/application/interpret-compile/types.ts:10-75` — bounded graph/material types.
- `src/modules/customer-request/compiler.ts:89-154,218-226` — internal route generation source; never export its shapes to UI.
- `src/modules/customer-request/customer-projection.ts:78-164,261-320,490-506` — existing customer-safe state projection.
- `src/modules/customer-request/agent-contract.ts:249-303,364-390,508-566,634-784` — existing option, route decision, navigation, progress, activity, evidence boundaries.
- `src/components/ae/customer-request/AeCustomerRequestWorkspace.tsx:38-149,168-209,342-458` — browser lifecycle and safe handoff host.
- `src/components/ae/customer-request/panels/routes/routes.tsx` and `panels/records/records.tsx` — existing decision controls and evidence trail; reuse, do not clone.
- `src/modules/answer/answer-synthesizer.ts:70-186` and `src/modules/answer/answer-schema.ts:34-108` — work-step/event/artifact seams.
- `src/modules/answer/internal/dto-to-answer-source.ts:17-105,107-133` — exact published price/availability mapping.
- `src/components/ae/artifacts/AeGenerativeAnswer.tsx:50-189,213-340` — answer artifact host and existing construction record.
- `src/routes/t.$threadId.tsx:31-86` — persisted answer replay host.
- `.planning/adr/ADR-019-authority-modes-and-consequential-operations-target.md:13-56` — authority and evidence ceiling.

Rival patterns to avoid: `CustomerRequestRoutePlan`/`routePlanId` in React props or human copy; a second `ServiceDto`/`AnswerSource` mapper; a new plan-history table; a client-only authority switch; direct booking/checkout/inquiry claims from a quote or published availability string; a directory wall on `/`; a separate plan page/composer; keyword/result-count heuristics for composite decomposition; and using the answer “How this was put together” trace as if it were the customer decision trail.

## Verification

Run from the repository root. Keep all development/fixture results labelled `local/dev`; sandbox quote evidence remains `ae_sandbox_provider` and does not establish provider fulfilment.

1. **Projection contract (vertical + horizontal):**
   ```sh
   npx vitest run tests/unit/customer-request/consumer-plan-projection.test.ts tests/unit/registry/services-api-projection.test.ts tests/unit/routes/services-one-view.test.ts
   ```
   Required input → output checks:
   - Query `"dental check-up in Adelaide"`, one compiled step, three `ServiceDto` rows → `kind: 'plan'`, one step, three options, exact published prices, availability only where supplied, and `frontier.step === 1`.
   - Query `"renovate my bathroom"`, two compiled steps with step 2 depending on step 1 → two steps in order; step 1 is `frontier`, step 2 is `blocked`/`queued`, and no RoutePlan/compiler key appears in `JSON.stringify(plan)`.
   - One route with three businesses → still one step (the single-service short-circuit is based on step shape, not option count).
   - Missing price or availability → `price.kind === 'not_published'` and `availability.kind === 'needs_confirmation'`; output never says “available now,” invents a price, or removes the option.
   - Expired preview or an internal candidate with no matching public service row → typed `needs_attention`/`unavailable`; no invented business or option.

2. **UI and route behavior:**
   ```sh
   npx vitest run tests/unit/ui/rider-services.test.tsx tests/unit/customer-request/customer-request-workspace.test.tsx tests/unit/answer/merge-answer-artifact.test.ts tests/integration/answer-turn-empty-state.test.ts
   npx playwright test tests/e2e/landing-answer.spec.ts tests/e2e/customer-request-decision-experience.spec.ts
   ```
   Inspect the root with no query (ask-box only), one-step query (destination → one ticket → comparable options), and composite query (ordered tickets with frontier and blocked state). Click a quote/refusal and confirm the readable record names the observed result, evidence class, authority, and next safe action. Confirm a Customer Request completion/refusal/unknown/recovery state renders through the same `AeDecisionTrail` and existing evidence link.

3. **Authority boundary checks:**
   - `inspect_only` preview/search/quote has no `customerRequest.confirm`, `customerRequest.run`, booking, payment, dispatch, or inquiry side effect; the plan record says `authority: 'inspect_only'`.
   - A future/fixture `approve_each` action appears only as a fresh exact Customer Request decision and leaves the existing confirmation/progress/evidence fields intact.
   - A revoked, expired, widened, or stale standing permission is not rendered as an executable frontier action; it becomes a review/refusal record.

4. **Public copy/SEO gates (required after rendered output inspection):**
   ```sh
   npm run test:ui-contract
   npm run test:seo
   ```
   Inspect emitted `/` and `/t/$threadId` text/metadata. Assert the plan copy contains destination/step/compare language and the responsible next action, while the copy scan rejects booking confirmation, reservation, checkout, payment, dispatch, fulfilment, guaranteed availability, and internal RoutePlan/capability terminology. Run `npm run test:imports` if the new projection/action module is registered or a module boundary changes.

5. **Local evidence boundary:** exercise the dev server with a seeded service row and a labelled sandbox quote. Verify the output records `ae_sandbox_provider`, quote `validUntil`, and refusal recovery; do not describe this as live availability, booking, provider fulfilment, hosted reachability, or customer value.

## Assumptions & contingencies

- The neutral preview action is read-only and may use public Convex source transport. If the deployment cannot expose the capability graph safely without authentication, keep the public one-view on the existing `registry.services_search` result and render `ConsumerPlanResult.kind === 'unavailable'`; the authenticated/guest Customer Request host still uses the same projection after submit. Do not expose internal graph rows to recover the preview.
- If `PublicServicesApiPage` cannot carry optional `availabilitySummary` without breaking a pinned consumer, keep the field inside the internal `ConsumerSupplyOption` adapter and preserve the public services wire shape; the plan remains sourced from the same public catalog DTO readback.
- If the answer stream cannot persist a `consumer-plan` artifact in this slice, render the exact same `ConsumerPlan` through the one-view and use existing `AnswerWorkStep`/frozen evidence for answer replay; do not create a second schema or silently omit decision records.
- A quote’s `nextAvailable` is an observed sandbox quote field, not a booking slot. Display it only as “example quote timing”/“next time shown by this quote” with provenance and validity; T10 owns any booking-specific transition.
- Static inspection, unit tests, and labelled local/sandbox runs prove source and development contract behavior only. They do not prove hosted reachability, independent supply, provider fulfilment, settlement, or customer value.
