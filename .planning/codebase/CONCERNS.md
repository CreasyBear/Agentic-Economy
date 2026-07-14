# Codebase Concerns

**Analysis Date:** 2026-07-14
**Mapped Commit:** `f6d7744`
**Scope:** Current source at the mapped commit. Findings labelled **verified defect** are directly established by source or an executable check. Findings labelled **risk** need runtime evidence before being called a defect.

## Product-Critical Diagnosis

**The customer is using two different products, and the neutral engine is not the primary one:**
- Status: **Verified disconnect.**
- Evidence: `/` renders `AeHomeComposer` in `src/routes/index.tsx`. It submits to `/api/answer/turn` through `src/components/ae/chat/AeHomeComposer.tsx` and `src/components/ae/chat/answer-stream.ts`. The Answer Thread agent exposes only `registry.search` and `registry.detail` through `src/modules/answer-thread/answer-thread.schema.ts`, `src/modules/answer-thread/internal/intent-router.ts`, and `src/modules/answer-thread/internal/answer-tool-registry.ts`.
- Separate path: The neutral Request application is mounted only at `/engine` by `src/routes/engine.tsx`, uses `src/components/ae/customer-request/AeCustomerRequestWorkspace.tsx`, and calls `/api/requests`.
- Customer impact: Work on capability contracts, candidate composition, RoutePlans, mandates, and execution cannot change the homepage query experience. The homepage remains an LLM-assisted registry search even when the neutral engine becomes substantially more capable.
- Required correction: Choose one customer Request lifecycle. The homepage composer must submit into the canonical Request application, or the Answer Thread must become a presentation adapter over that application. Do not maintain two intent interpreters, two persistence models, two recovery models, and two customer histories.

**The public `/engine` promise is open, but the first real action is authentication-gated:**
- Status: **Verified defect.**
- Evidence: `src/components/ae/customer-request/AeCustomerRequestWorkspace.tsx` presents “Start with whatever you know” and calls `/api/requests` before showing any sign-in requirement. `src/lib/server/customer-request-api.ts` calls authenticated Convex transport, and `src/lib/server/convex-source.ts` rejects a missing Clerk token.
- Hosted reproduction on 2026-07-14: `GET https://agentic-economy-phi.vercel.app/engine` returned `200`; an anonymous valid `POST /api/requests` returned `401 {"error":"missing_auth"}`.
- Customer impact: “Explore” is a dead end for a signed-out customer. The user gives AE their request before learning that sign-in is mandatory.
- Required correction: Implement the anonymous Request boundary tracked by the product roadmap, or move sign-in before submission with explicit value and return-to-request continuity. The entered request and opaque identity must survive authentication.

**RoutePlans are durable internal objects but are absent from the customer wire contract:**
- Status: **Verified disconnect in committed source.**
- Evidence: `src/modules/customer-request/compiler.ts` now builds `CustomerRequestRoutePlan[]`, and `src/modules/customer-request/internal/convex-v2-schema.ts` plus `convex/customerRequestV2.ts` persist and validate them. `src/modules/customer-request/customer-projection.ts` projects only snapshot/evaluation fields. `src/modules/customer-request/agent-contract.ts` has no RoutePlan field. `convex/customerRequestApplication.ts` serializes no RoutePlan in `customerView`. `src/components/ae/customer-request/AeCustomerRequestWorkspace.tsx` cannot render one.
- Customer impact: A major engine capability can pass compilation and persistence tests while producing exactly the same customer experience as before.
- Required correction: Add a customer-semantic route decision projection with outcome, steps, total cost, data use, effects, evidence, uncertainty, expiry, alternatives, and recovery. Keep internal identifiers backstage, but do not discard the decision object itself.

**The Request application still rejects multi-capability preparation:**
- Status: **Verified defect relative to the RoutePlan objective.**
- Evidence: `convex/customerRequestApplication.ts` gates preparation with `current.aggregate.plan.actions.length !== 1` and returns “This request needs an action choice before AE can prepare it.” Resume, provider-status readback, and preparation readback also run only when `actions.length === 1`.
- Customer impact: A two-step RoutePlan can be compiled and stored but cannot be prepared through the production Request application. No customer action exists to make the missing “action choice.”
- Required correction: Preparation must select an exact RoutePlan, not a single action. Composite authority, per-step execution, cumulative controls, and recovery must all bind to that selected route.

**The hosted `options_ready` result is not usable in the human UI:**
- Status: **Verified defect.**
- Evidence: `projectPreparedAction` in `convex/customerRequestApplication.ts` returns `state: 'options_ready'`, `options: []`, and a populated `preparedAction`. `RequestResult` in `src/components/ae/customer-request/AeCustomerRequestWorkspace.tsx` sends every `options_ready` projection to `OptionsCard`. `OptionsCard` reads only `projection.options` and `optionSet`; it never reads `preparedAction`.
- Symptom: The production prepared-action shape renders as “0 registered options found” with no business card, terms, data use, effects, alternatives, or route-confirmation control.
- Required correction: Render the prepared decision explicitly. Shared route confirmation must be designed as the future boundary that issues an exact RouteMandate; there is no current approval endpoint to connect. Add a production-shape UI test, not another hand-authored option-set response.

**RouteMandate exists, but shared confirmation and downstream enforcement are future work:**
- Status: **Verified integration boundary.**
- Evidence: `src/modules/customer-request/route-mandate.ts` defines exact route-, principal-, spend-, data-, effect-, evidence-, and expiry-bound authority. `convex/customerRequestRouteMandate.ts` durably issues, verifies, reads, and revokes mandates, and `convex/_generated/api.d.ts` includes the RouteMandate modules but none of the retired approval/execution modules. These Convex operations are internal and `convex/customerRequestApplication.ts` does not call them. `src/routeTree.gen.ts` contains preparation authorization routes but no approval or attempt routes.
- Retirement evidence: `tests/imports/customer-request-source-completeness.test.ts` requires the former prepared-action approval, ActionAttempt, provider release, provider outcome, and reconciliation routes and modules to be absent from production. Their historical V2 authority tables remain only in `src/modules/customer-request/internal/convex-v2-schema.ts`, and the same guard rejects any production runtime reference to those tables.
- Customer impact: Neither the human nor external-agent Request surface can express one shared confirmation that creates and returns the exact RouteMandate. A stored mandate is also not an execution admission: no current downstream boundary consumes it to reserve or enforce cumulative spend and data budgets before effects.
- Required correction: Treat shared route confirmation and downstream admission/budget enforcement as future work. Add one confirmation contract used by both caller surfaces, then make every effectful adapter admit only an active exact mandate with atomic cumulative spend/data/effect controls. Do not revive the retired V2 ApprovalGrant or ActionAttempt stacks.

**Editing an existing Request cannot work against the real application:**
- Status: **Verified defect.**
- Evidence: `edit()` in `src/components/ae/customer-request/AeCustomerRequestWorkspace.tsx` resubmits `/api/requests` with `expectedRevision` set to the current nonzero revision. `submit` in `convex/customerRequestApplication.ts` immediately returns `revision_changed` whenever `expectedRevision !== undefined && expectedRevision !== 0`.
- Test blind spot: `tests/unit/customer-request/customer-request-workspace.test.tsx` mocks revision 2 success and therefore proves only the component’s desired behavior, not application compatibility.
- Required correction: Add a real revise operation or make submit support revisioned replacement under the same principal and Request identity; prove it through handler-to-Convex integration.

**A registered business listing is not executable supply:**
- Status: **Verified architectural boundary; current product coverage is unproven.**
- Evidence: Homepage search reads public catalog actions in `src/modules/registry/registry.actions.ts`. The Request graph reads only eligible, current capability publications from `convex/capabilitySupply.ts` through `loadRequestGraph` in `convex/customerRequestApplication.ts`. No bridge treats a catalog service as a capability binding.
- Impact: “We have registered businesses” does not mean the engine can answer a query about them. A business needs an active exact contract, offering, transport binding, eligibility decision, current publication, credential readiness, and health readiness.
- Current source evidence: The only production seed path found for the Request graph is the two labelled sandbox businesses in `convex/sandboxAcceptanceSupply.ts`, `convex/devSeed.ts`, and `src/modules/sandbox-supply/public.ts`. This does not prove the hosted graph contains no other supply, but no source-controlled evidence establishes useful real supply.
- Required correction: Measure and expose supply coverage by customer job. Do not call catalog rows “connected businesses” unless their published capability bindings are currently eligible and reachable.

## Known Bugs

**The homepage query accepts work, then hides a persistence failure behind a spinner:**
- Status: **Verified hosted defect on 2026-07-14.**
- Trigger: Open `/`, submit `I need an electrician in Fremantle tomorrow to fix a circuit that keeps tripping`.
- Result: `POST /api/answer/turn` returns HTTP 200 and emits a `thread` event, then emits `answer_turn_persist_failed`. The emitted thread returns `404 thread_not_found`. `AeHomeComposer` discards all frames, treats the completed transport as success, and polls the missing thread up to 40 times before showing a generic error.
- Customer impact: The primary public ask surface appears frozen at “Starting your thread”; the real failure is neither immediate nor explained.
- Test gap: `tests/unit/chat/home-landing-submit.test.tsx` proves only that one fetch starts and accepts an empty successful stream. It does not assert a thread event, persistence readback, streamed error, navigation, or recovery.
- Required correction: Make persistence failure observable and fail immediately on streamed error, then prove the actual hosted persistence path. This still does not make Answer Thread the neutral Request engine.

**Anonymous `/engine` query submission fails after accepting the query:**
- Status: **Verified defect.**
- Trigger: Open `/engine` signed out, enter any non-empty request, choose “Explore.”
- Result: Hosted API returns `401 missing_auth`; UI replaces the experience with “Sign in to continue.”
- Files: `src/components/ae/customer-request/AeCustomerRequestWorkspace.tsx`, `src/lib/server/customer-request-api.ts`, `src/lib/server/convex-source.ts`.
- Fix: Preserve the request through an explicit auth transition or allow bounded anonymous exploration before durable/private continuation.

**Request revision from the UI always conflicts:**
- Status: **Verified defect.**
- Trigger: Reach any Request projection, choose “Edit this Request,” change the text, and resubmit.
- Root cause: The UI uses submit with a nonzero `expectedRevision`; the Convex action accepts only revision zero.
- Files: `src/components/ae/customer-request/AeCustomerRequestWorkspace.tsx`, `convex/customerRequestApplication.ts`.
- Fix: Implement and call a dedicated revision command with the same durable identity and idempotency guarantees.

**Prepared decision renders as zero options:**
- Status: **Verified defect by production-shape code path.**
- Trigger: Reach the `projectPreparedAction` result after provider preparation.
- Root cause: `preparedAction` exists in the wire schema but is ignored by `OptionsCard`.
- Files: `convex/customerRequestApplication.ts`, `src/modules/customer-request/agent-contract.ts`, `src/components/ae/customer-request/AeCustomerRequestWorkspace.tsx`.
- Fix: Add a prepared-decision component and assert the actual projection shape. Keep future RouteMandate confirmation separate from the retired prepared-action approval contract.

**Public agent instructions contain duplicate step numbers:**
- Status: **Verified defect.**
- Evidence: `src/modules/discovery/internal/agent-skill.ts` has two step 8 entries; `src/modules/discovery/internal/discovery-files.ts` has two step 6 entries.
- Impact: External agents receive an ambiguous lifecycle recipe at the canonical discovery surface.
- Fix: Generate numbering from one structured sequence and add an ordered-sequence assertion.

## Tech Debt

**Two customer-intent stacks own overlapping semantics:**
- Issue: Answer Thread owns conversational search, follow-ups, frozen evidence, registry tools, and public thread history; Customer Request owns semantic interpretation, clarification, capability selection, preparation, authority, and action recovery.
- Files: `src/modules/answer-thread/`, `src/modules/answer/`, `convex/answerThreads.ts`, `src/modules/customer-request/`, `convex/customerRequestApplication.ts`, `convex/customerRequestV2.ts`.
- Impact: A customer can ask the same words at `/` and `/engine` and enter unrelated state machines with different capabilities, privacy, identities, and recovery.
- Fix approach: Make one Request aggregate canonical. Conversation should be a view and input adapter, not a competing domain.

**Customer contract, Convex return validators, persistence validators, and UI shapes are manually duplicated:**
- Issue: Request state and option shapes are repeated in `src/modules/customer-request/agent-contract.ts`, `convex/customerRequestApplication.ts`, `src/modules/customer-request/internal/convex-v2-schema.ts`, and component-local response unions.
- Impact: Internal RoutePlans can be added to persistence without reaching the agent contract or UI. A compile-time green in one layer does not prove end-to-end parity.
- Fix approach: Derive adapters from one owned domain contract where possible; otherwise add exact round-trip contract tests from compiled aggregate to HTTP JSON to rendered state.

**“Source completeness” currently proves presence more strongly than connectivity:**
- Issue: `tests/imports/customer-request-source-completeness.test.ts` verifies canonical files exist, checks import and retirement boundaries, proves the old approval/execution stack is unreachable, and inspects workflow text. It does not prove the homepage uses Customer Request, a human can confirm a RoutePlan into a RouteMandate, or a multi-step RoutePlan reaches the wire/UI.
- Impact: The gate can pass while the product remains visibly unchanged or unusable.
- Fix approach: Retain ownership scans, but rename their claim narrowly and add executable vertical gates for the customer lifecycle.

**Large central modules increase integration risk:**
- Issue: `convex/inquiries.ts` is about 2,979 lines, `convex/capabilitySupply.ts` 2,402, `src/modules/answer-thread/internal/turn-orchestrator.ts` 1,819, `src/modules/routing-kernel/internal/kernel.ts` 1,766, and `convex/customerRequestApplication.ts` 1,596 in the current tree.
- Impact: Authority, validation, persistence, projection, and orchestration changes collide in the same files, increasing the chance that independently correct slices break one another at integration time.
- Fix approach: Split by durable command/query and domain responsibility while preserving public entrypoints and behavioral tests.

**RouteMandate maturity can be overstated from internal source alone:**
- Issue: `src/modules/customer-request/route-mandate.ts` and `convex/customerRequestRouteMandate.ts` establish exact domain and durable lifecycle contracts, but no shared confirmation surface or downstream admission consumer is wired through `convex/customerRequestApplication.ts`. `AGENTS.md` therefore remains correct that AE does not publicly book, charge, dispatch, or auto-fulfil.
- Impact: Contributors can mistake a durable internal authority object for customer-reachable execution or revive retired approval/attempt terminology around it.
- Fix approach: Keep current public truth, internal RouteMandate capability, and target execution architecture explicitly separate. Claims must follow customer-surface and downstream enforcement evidence, not schema or module presence.

**Release/support commands still depend on `.mjs` proof utilities:**
- Issue: `package.json` invokes `.mjs` files for provider readiness, retirement, edge and historical proof helpers even though current runtime ownership is TypeScript.
- Impact: Supporting evidence can be mistaken for product completion, and the repository’s stated “no .mjs/.mts ownership” rule is easy to blur.
- Fix approach: Keep product semantics in TypeScript and classify every remaining `.mjs` command as support-only or migrate it. No support command may be the only proof of runtime behavior.

## Security and Privacy Considerations

**Customer requests are sent to OpenRouter before any visible data-use review:**
- Status: **Verified disclosure gap; legal impact requires review.**
- Risk: `src/modules/customer-request/openrouter-transport.ts` sends the complete `customerJob` and all public capability descriptors to `https://openrouter.ai/api/v1/chat/completions`. The first customer-visible disclosure review in `AeCustomerRequestWorkspace` is framed only as sharing with businesses.
- Public mismatch: `src/routes/privacy.tsx` says asking AE uses a browser session marker but does not disclose the external model processor or explain request-content handling.
- Current mitigation: Payload and response sizes are bounded, temperature is zero, descriptors are treated as untrusted data, and a timeout is enforced.
- Recommendation: Add truthful processor disclosure and data-minimization policy before collection; define retention/provider-routing controls; redact or classify sensitive intent before third-party interpretation where required.

**Public Answer Threads are bearer-link records with no automatic expiry:**
- Risk: `AeHomeComposer` tells customers that anyone with the thread link can open it and that it has no automatic expiry. Customer queries can contain sensitive needs or locations.
- Files: `src/components/ae/chat/AeHomeComposer.tsx`, `src/routes/t.$threadId.tsx`, `src/modules/answer-thread/internal/public-projection.ts`.
- Current mitigation: The disclosure is visible and recent-thread removal is local.
- Recommendation: Add data minimization, deletion/expiry controls, non-enumerable identifiers, and tests that private inquiry/contact material never enters public projections.

**Capability publication and readiness control what the engine may contact:**
- Risk: A compromised owner/admin path can publish endpoints, bind credentials, or influence eligibility/readiness.
- Files: `convex/capabilitySupply.ts`, `convex/capabilitySupplyReadiness.ts`, `src/modules/capability-supply/`, `src/modules/capability-contract/`.
- Current mitigation: Exact contract refs, registration hashes, eligibility hashes, owner/admin authority, readiness probes, audit records, HTTPS/public-target checks, and fail-closed integrity validation exist.
- Recommendation: Preserve server-derived identity, credential indirection, SSRF defenses, revision-bound probes, auditability, and quarantine. Exercise cross-owner and changed-target attacks in durable integration tests.

**External agent authority is strong but operationally brittle:**
- Risk: `/api/v1/requests` requires Clerk API-key auth, the `customer_requests:create` scope, and an HMAC service assertion using `AE_CONVEX_SERVER_FUNCTION_TOKEN`.
- Files: `src/lib/server/customer-request-agent-auth.ts`, `src/lib/server/customer-request-agent-api.ts`, `src/modules/customer-request/service-auth-envelope.ts`, `convex/customerRequestApplication.ts`.
- Current mitigation: Principal, owner, credential, scope, operation, command, timestamp, and signature are bound; agent principals are recorded before use.
- Recommendation: Add key rotation, replay-window observability, revocation tests, and explicit error telemetry without leaking secret or assertion material.

**No Request-specific cost/abuse limiter was found:**
- Status: **Risk.**
- Risk: Each authenticated submit/refine can make a paid external model call and load up to 64 capabilities. No Request-path rate or spend limiter appears in `src/lib/server/customer-request-*`, `convex/customerRequestApplication.ts`, or `src/modules/customer-request/`.
- Recommendation: Add durable per-principal and per-credential quotas, concurrency limits, model-cost telemetry, and retry-after semantics before broad access.

## Performance Bottlenecks

**Every interpretation rebuilds and retransmits the capability descriptor set:**
- Problem: `loadRequestGraph` in `convex/customerRequestApplication.ts` reads eligible supply, then performs a serial internal query for every unique exact contract, projects schemas, and sends the descriptor payload to OpenRouter.
- Bounds: Eligible supply is limited to 64; projected descriptors are capped at 512,000 bytes; OpenRouter timeout is 20 seconds; request body cap is 1,000,000 bytes.
- Measurement: No hosted p50/p95 stage timing or cache-hit metric was found.
- Improvement path: Cache immutable exact-contract descriptors by digest, parallelize bounded independent reads where Convex permits, retrieve candidates before LLM interpretation, and instrument graph-load/model/compile stages separately.

**RoutePlan enumeration is Cartesian:**
- Problem: `compileRoutePlans` in `src/modules/customer-request/compiler.ts` multiplies candidate choices across actions and refuses once combinations exceed 256.
- Impact: A modest graph such as five actions with four candidates each produces 1,024 combinations and becomes `capability_graph_invalid` rather than yielding bounded best routes.
- Improvement path: Use incremental constrained search with deterministic top-k pruning based on fit, cost, data exposure, consequence, trust, liveness, and evidence. Preserve completeness/uncertainty truth when pruning.

**Homepage thread creation can issue 40 readback polls:**
- Problem: `promoteReadableThread` in `src/components/ae/chat/AeHomeComposer.tsx` polls every 250 ms for up to 40 attempts after the stream yields a thread.
- Impact: Up to ten seconds and forty HTTP reads per submission when projection lag or failure occurs.
- Improvement path: Make the stream’s committed-thread event authoritative, use backoff, or subscribe to durable availability.

**Broad Convex collection remains common:**
- Risk: Static inspection found about 50 `.collect()` calls in `convex/`, including registry, discovery, inquiry, notification, observability, and compatibility paths.
- Measurement: No production cardinality or scan budget was found.
- Improvement path: Audit public/request-critical paths for indexed pagination and bounded retention; record scanned-row counts before choosing thresholds.

## Fragile Areas

**RoutePlan schema evolution across four layers:**
- Why fragile: Compiler types, writable conversion, Convex table validators, Convex action return validators, agent Zod schemas, and UI projections must change together.
- Files: `src/modules/customer-request/compiler.ts`, `src/modules/customer-request/internal/convex-v2-schema.ts`, `convex/customerRequestV2.ts`, `convex/customerRequestApplication.ts`, `src/modules/customer-request/agent-contract.ts`, `src/modules/customer-request/customer-projection.ts`.
- Current failure mode: Current source persists routes but drops them from public projections.
- Safe modification: Add a versioned customer route projection and a round-trip contract test before extending preparation or UI.

**Client-only Request identity and recovery:**
- Why fragile: `requestRef`, `agentRef`, current revision, turns, and pending answer live only in React state in `AeCustomerRequestWorkspace`.
- Common failures: Reload, sign-in navigation, new tab, crash, or copied URL loses the Request reference even though a durable GET resume endpoint exists.
- Safe modification: Put an opaque Request reference in a private route/URL or authenticated request index and restore from durable state. Never place private facts in the URL.

**Capability supply freshness can invalidate requests globally:**
- Why fragile: Registry snapshot digests include publication revision, readiness expiry, offering hash, binding hash, and price. `convex/customerRequestV2.ts` revalidates the entire aggregate against current supply.
- Common failures: A readiness refresh or price/publication revision can make a durable Request stale before the customer acts.
- Safe modification: Define which changes invalidate discovery, preparation, RouteMandate confirmation, and future downstream admission separately. Preserve the prior plan as expired evidence rather than collapsing to a generic retry.

**Provider preparation and RouteMandate authority are disconnected boundaries:**
- Why fragile: Checks for exactly one action remain distributed through resume, authorization, comparison, preparation, and prepared-action construction in `convex/customerRequestApplication.ts` and `convex/customerRequestV2Preparation*`. The separate exact RouteMandate lifecycle is not called by that application.
- Common failure: Removing one preparation guard can create partial multi-step behavior, while wiring issuance directly can bypass shared confirmation or leave downstream spend/data budgets unenforced.
- Safe modification: Project and select the exact RoutePlan first, add one shared confirmation command that issues its mandate, then introduce a separate fail-closed admission boundary before any effect. Migrate each stage with executable invariants.

**Cross-cutting product slices share integration seams:**
- Why fragile: Capability supply, multi-capability compilation, governed inquiry sends, provider adapters, routes, tests, and planning authority converge on a small set of Request and Convex modules.
- Impact: A broad change can combine individually incomplete contracts or obscure which slice established a behavior.
- Safe modification: Keep changes ticket-scoped, preserve unrelated state, and verify the combined tree before integration. Never infer release readiness from a focused green test.

## Scaling Limits

**Request graph enumeration:**
- Current capacity: At most 64 eligible supplies in `loadRequestGraph`; descriptor payload at most 512 KiB.
- Limit behavior: Excess supply or descriptor size returns `capabilities_unavailable`, surfaced to the human UI as a generic failure.
- Scaling path: Paginated/retrieval-led candidate selection plus explicit coverage evidence.

**Route alternatives:**
- Current capacity: 256 full Cartesian RoutePlans.
- Limit behavior: Exceeding the cap returns an invalid graph rather than a bounded ranked subset.
- Scaling path: Deterministic top-k graph search with declared pruning and uncertainty.

**Durable aggregate size:**
- Current capacity: Customer Request aggregate is capped at 700,000 serialized bytes in `src/modules/customer-request/compiler.ts` and `convex/customerRequestV2.ts`.
- Limit behavior: Compilation or integrity validation refuses the aggregate.
- Scaling path: Store immutable graph/contract references separately from request-specific state and keep the Request aggregate compact.

**No global Request throughput budget:**
- Current capacity: Undefined; external-model calls are gated by authentication but not by a source-owned per-principal quota.
- Symptoms at limit: OpenRouter cost spikes, 20-second request stalls, provider rate limits, and Convex action pressure.
- Scaling path: Durable quotas, admission control, stage-level timeouts, and cost/latency SLOs.

## Dependencies at Risk

**OpenRouter is a hard availability dependency for every new or refined Request:**
- Risk: Missing `OPENROUTER_API_KEY`, provider errors, invalid JSON, or a 20-second timeout returns `interpreter_unavailable`.
- Files: `convex/customerRequestApplication.ts`, `src/modules/customer-request/openrouter-transport.ts`, `src/modules/customer-request/semantic-interpreter.ts`.
- Impact: Deterministic contracts, registered supply, and the compiler remain unusable when one model broker is unavailable.
- Mitigation path: Add an owned interpreter port with provider failover and a bounded deterministic path for exact structured requests. Do not fall back to keyword logic that can create authority or capabilities.

**Clerk, Convex, Vercel, and deployment revision must all agree:**
- Risk: Human Request calls require Clerk-to-Convex JWT; external agents require Clerk API keys plus the service HMAC; hosted proof requires exact Vercel and Convex revision readback.
- Impact: Configuration drift presents as generic request unavailability.
- Mitigation path: Keep exact-revision readback, add customer-readable dependency status, and distinguish auth, graph, interpreter, and provider failures in operator telemetry.

**Pinned nightly Nitro and fast-moving UI/runtime packages:**
- Risk: `package.json` aliases `nitro` to a dated nightly and uses fast-moving TanStack Start/Router/AI, React 19, Convex, and Astryx packages.
- Impact: SSR, streaming, route generation, headers, authentication propagation, or presentation can regress.
- Mitigation path: Pin exact runtime dependencies, upgrade one subsystem at a time, and run authenticated browser plus hosted Request gates.

## Missing Critical Features

**One canonical customer front door:**
- Missing: The homepage query and `/engine` Request lifecycle are not connected.
- Blocks: The neutral engine changing the product customers actually use.
- Required proof: Submit on `/`, resume the same Request, and observe the same state through human and external-agent surfaces.

**Customer-semantic RoutePlan projection and selection:**
- Missing: RoutePlans do not cross the HTTP/UI boundary.
- Blocks: Legible comparison, exact mandate, multi-step preparation, and route recovery.
- Required proof: A two-step plan displayed without protocol choreography, with declared cost, data use, effects, evidence, expiry, alternatives, and uncertainty.

**Shared RouteMandate confirmation and downstream admission:**
- Present but below the product boundary: Exact RouteMandate compilation, durable issuance/revocation/history, and invalidation on Request or route-generation change exist in `src/modules/customer-request/route-mandate.ts`, `convex/customerRequestRouteMandate.ts`, and `convex/customerRequestRouteMandateLifecycle.ts`.
- Missing: Human and external-agent surfaces do not share a confirmation command, and no production admission layer consumes an active mandate to enforce cumulative spend, data, and effect scope. The historical V2 ApprovalGrant, ActionAttempt, provider-release, outcome, and reconciliation tables are schema-only and intentionally unreachable from production.
- Blocks: A route-bound authority decision becoming safe effectful execution rather than a durable internal object.
- Required proof: The same exact-route confirmation and mandate readback through human and agent surfaces, followed by atomic admission that enforces route expiry, cumulative spend/data/effect scope, idempotency, and fail-closed recovery without reviving retired V2 authority modules.

**Useful registered capability supply:**
- Missing evidence: Source-controlled hosted proof registers two labelled sandbox businesses for `sandbox.reference.lookup`; it does not prove a customer-relevant business category is reachable.
- Blocks: Honest “real business options” claims for arbitrary customer queries.
- Required proof: At least two dissimilar useful capabilities and businesses registered through the normal publication path, with hosted readiness and query coverage. Sandbox remains clearly labelled.

**Human confirmation and durable recovery journey:**
- Missing: The workspace cannot review and confirm an exact RoutePlan into a RouteMandate, and durable Request identity is not recoverable after navigation. Retired approval and attempt controls should remain absent.
- Blocks: A shared stop-and-return authority contract for external agents and customers.
- Required proof: Browser-based route review, exact confirmation, mandate readback/revocation, reload/resume, and later downstream admission states against production-shaped projections.

**Generic transport execution for composite steps:**
- Missing: Capability publication/readiness recognizes AE envelope, OpenAPI HTTP, MCP, and x402, but the current customer Request preparation/execution path is not proven across composite generic adapters.
- Blocks: Neutrality beyond registration and compilation.
- Required proof: Substitute dissimilar businesses and transports with registration/config-only changes and no kernel, caller prompt, Request API, or UI changes.

## Test Coverage Gaps

**Browser tests do not submit a real Request:**
- What's tested: `tests/e2e/a11y/engine-product-a11y.spec.ts` loads `/engine`, fills the textarea, checks the absence of a budget field, and focuses “Explore.”
- What's missing: Clicking Explore, authentication transition, clarification, disclosure, options, prepared action, exact-route confirmation, RouteMandate readback/revocation, and reload/resume. Downstream run/admission coverage remains future work.
- Priority: Critical.

**Workspace tests mock desired responses instead of traversing production handlers:**
- What's tested: `tests/unit/customer-request/customer-request-workspace.test.tsx` supplies hand-authored `fetch` responses.
- Blind spots: It mocks revision editing as successful despite the real Convex conflict and mocks `options_ready` with option arrays rather than the real `preparedAction` shape.
- Priority: Critical.

**Hosted cold-agent proof is intentionally narrow:**
- What's tested: `.github/workflows/kernel-release-gate.yml` seeds exactly two labelled sandbox businesses and asks “Find the cheapest labelled sandbox option,” with a scripted fallback fact. `src/modules/customer-request/hosted-agent-journey.ts` drives the API directly.
- What's missing: Arbitrary customer query coverage, real supply, homepage parity, browser interaction, route display, and composite execution.
- Priority: Critical before customer-value claims; the existing proof remains valid as sandbox contract proof.

**Multi-capability integration does not cross the product boundary:**
- What's tested: `tests/integration/customer-request-v2-multi-capability-route.test.ts` directly constructs two contracts, compiles, commits, and reads back a RoutePlan.
- What's missing: Natural-language interpreter, public API, customer projection, UI, shared exact-route confirmation, RouteMandate readback, downstream admission, generic transport invocation, and recovery.
- Current state: The focused compiler and application proof still stops below HTTP projection and UI. Separate RouteMandate tests prove internal authority semantics, not shared confirmation or execution admission.
- Priority: Critical for the RoutePlan frontier.

**Release source gate omits browser behavior:**
- Evidence: `test:release:source` in `package.json` runs lint, typecheck, unit/integration/type/import/copy/SEO/UI-contract tests and build, but not `test:e2e` or `test:a11y`.
- Risk: A green source release can ship a visually present but nonfunctional customer journey.
- Priority: High; add a small authenticated and anonymous Request browser contract to release qualification.

**No performance or cost budgets cover Request interpretation:**
- Missing: Graph load time, descriptor count/bytes, OpenRouter latency/cost, compile time, route count, durable action latency, and concurrent idempotency SLOs.
- Risk: The engine can become expensive or time out before functional tests fail.
- Priority: High before broad agent access.

**Privacy disclosure parity is untested:**
- Missing: A test that all external processors and recipients used by Ask/Request flows appear in current public privacy copy and authority reviews.
- Risk: Source adds a new external model or provider while human disclosure remains stale.
- Priority: High.

## Overclaim Guardrails

- A clean compiler or persistence test does not prove a customer can see, choose, approve, or run a RoutePlan.
- Exact-revision hosted sandbox proof does not prove useful real supply or customer value.
- A catalog listing is not an eligible capability publication.
- `options_ready` is not product completion while the real prepared-action projection renders as zero options.
- “External agent journey” describes direct API traversal; it does not prove human UI parity.
- “Source complete” must not mean files and validators exist; the vertical customer journey must be executable.
- Do not claim the engine supports a query merely because OpenRouter can interpret it. The graph must contain useful eligible supply and return a legible customer decision.

---

*Concerns audit: 2026-07-14*
*Update as verified defects are fixed, dirty-tree blockers are integrated, or hosted evidence changes.*
