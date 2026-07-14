# Codebase Concerns

**Analysis Date:** 2026-07-14
**Mapped Commit:** `c5bb115e`
**Scope:** Full live repository plus the current dirty shared tree. Source and executable checks establish current state; planning documents and sandbox fixtures do not establish customer reachability.

## Tech Debt

**Two customer-intent applications own overlapping semantics:**
- Issue: `/` starts Answer Thread, while `/engine` and `/api/v1/requests` start Customer Request. Answer Thread owns conversation, registry search, persistence, and recovery independently of the neutral Request aggregate.
- Files: `src/routes/index.tsx`, `src/components/ae/chat/AeHomeComposer.tsx`, `src/modules/answer-thread/`, `convex/answerThreads.ts`, `src/components/ae/customer-request/AeCustomerRequestWorkspace.tsx`, `src/modules/customer-request/`, `convex/customerRequestApplication.ts`.
- Impact: The same words can enter unrelated state machines with different identities, capabilities, authority, and recovery. Improvements to RoutePlans do not change the primary homepage journey.
- Fix approach: Make Customer Request the single durable aggregate. Treat conversation as an input and presentation adapter, as required by `PRODUCT.md`; do not add more domain state to Answer Thread.

**Customer Request contracts are repeated across layers:**
- Issue: Request states and projections are declared separately in Zod, Convex validators, persistence adapters, and UI branches.
- Files: `src/modules/customer-request/agent-contract.ts`, `src/modules/customer-request/internal/convex-v2-schema.ts`, `convex/customerRequestApplication.ts`, `src/components/ae/customer-request/AeCustomerRequestWorkspace.tsx`.
- Impact: A RoutePlan or prepared-action field can reach persistence and HTTP while remaining invisible or unusable in the human UI.
- Fix approach: Keep one owned domain contract and explicit adapters; add aggregate-to-HTTP-to-render contract tests for every customer-visible state.

**Large authority-bearing modules create collision and review risk:**
- Issue: Commands, validation, persistence, projection, and orchestration remain concentrated in a few very large modules.
- Files: `convex/inquiries.ts` (~3,403 lines), `convex/capabilitySupply.ts` (~2,474), `src/modules/inquiries/internal/commands.ts` (~2,141), `src/modules/answer-thread/internal/turn-orchestrator.ts` (~1,819), `src/modules/routing-kernel/internal/kernel.ts` (~1,766), `convex/customerRequestApplication.ts` (~1,674).
- Impact: Small changes cross authority boundaries and collide with concurrent work; local tests can miss incompatible projections.
- Fix approach: Split by durable command/query and domain responsibility while preserving public entrypoints and contract tests. Do not split cohesive code merely to reduce line counts.

**Legacy Request authority remains beside the current V2 contract:**
- Issue: Retired V1 models and compiler behavior remain importable next to the active Request application.
- Files: `src/modules/customer-request/legacy-v1.ts`, `src/modules/customer-request/legacy-compiler-v1.ts`, `src/modules/customer-request/public.ts`.
- Impact: New code can accidentally depend on historical schemas or modernize retired authority as if it were live.
- Fix approach: Keep legacy entrypoints explicitly quarantined, migrate remaining consumers, then move obsolete files to Trash only with repository-owner confirmation.

**Source-completeness tests prove ownership more strongly than connectivity:**
- Issue: Import and source scans establish file presence and dependency direction, not that a customer can complete the lifecycle.
- Files: `tests/imports/customer-request-source-completeness.test.ts`, `src/lib/ui/contract-scans.ts`.
- Impact: Gates can pass while `/`, `/engine`, approval, execution, or recovery remain disconnected.
- Fix approach: Keep architectural scans but name their claims narrowly; pair them with executable vertical tests through the intended HTTP and human surfaces.

## Known Bugs

**Anonymous `/engine` submission accepts input before revealing the auth boundary:**
- Symptoms: The page invites “Start with whatever you know”; the first valid `POST /api/requests` requires a Clerk token and returns `401 missing_auth` for a signed-out user.
- Files: `src/components/ae/customer-request/AeCustomerRequestWorkspace.tsx`, `src/lib/server/customer-request-api.ts`, `src/lib/server/convex-source.ts`.
- Trigger: Open `/engine` signed out, enter a request, and choose “Explore.”
- Workaround: Sign in before using the workspace. The product fix is an explicit auth transition that preserves the entered Request, or a bounded anonymous exploration contract.

**Editing a Request uses a command that rejects nonzero revisions:**
- Symptoms: The workspace resubmits `/api/requests` with the displayed revision, while the application submit command returns `revision_changed` whenever `expectedRevision` is nonzero.
- Files: `src/components/ae/customer-request/AeCustomerRequestWorkspace.tsx`, `convex/customerRequestApplication.ts`.
- Trigger: Choose “Edit this Request” after receiving any persisted projection and resubmit.
- Workaround: Restart as a new Request. Implement a revision command bound to the same principal, Request identity, and idempotency contract.

**Prepared actions render as an empty option list:**
- Symptoms: `projectPreparedAction` returns `state: 'options_ready'`, `preparedAction`, and no legacy options; `OptionsCard` reads only `projection.options` and `optionSet`.
- Files: `convex/customerRequestApplication.ts`, `src/modules/customer-request/agent-contract.ts`, `src/components/ae/customer-request/AeCustomerRequestWorkspace.tsx`.
- Trigger: Reach provider preparation through the production Request application.
- Workaround: Use the external-agent API. Add a prepared-decision projection and exact approval control to the human workspace.

**RoutePlans cross the HTTP contract but have no human projection:**
- Symptoms: `routes` is present in `customerRequestViewSchema` and `writableView`, but `AeCustomerRequestWorkspace` never reads or renders it; `routes_ready` falls into a generic unsupported message.
- Files: `src/modules/customer-request/agent-contract.ts`, `convex/customerRequestApplication.ts`, `src/components/ae/customer-request/AeCustomerRequestWorkspace.tsx`.
- Trigger: Compile a multi-capability Request that returns `routes_ready`.
- Workaround: Inspect the authenticated JSON response. Add an ordinary-language route comparison and selection state without exposing internal graph vocabulary on the public surface.

**The human Request workspace cannot approve or run a prepared action:**
- Symptoms: HTTP handlers exist for approval and attempts, but the workspace calls neither route.
- Files: `src/routes/api.requests.$requestRef.approval.ts`, `src/routes/api.requests.$requestRef.attempts.ts`, `src/components/ae/customer-request/AeCustomerRequestWorkspace.tsx`.
- Trigger: Reach a prepared action in the human workspace.
- Workaround: The hosted agent journey invokes these operations directly. Add exact decision review, approval, run, and recovery states before claiming human parity.

**Multi-capability Requests cannot enter preparation:**
- Symptoms: preparation and resume paths require `aggregate.plan.actions.length === 1`; multi-action Requests return a route decision but have no exact route selection command.
- Files: `convex/customerRequestApplication.ts`, `src/modules/customer-request/preparation.ts`, `src/modules/customer-request/compiler.ts`.
- Trigger: Submit a Request whose compiled plan has two or more dependent actions.
- Workaround: None through the current application. Bind preparation to a selected immutable RoutePlan and carry per-step authority and recovery.

**The current dirty tree fails TypeScript validation:**
- Symptoms: `npm run typecheck` exits 2 on 2026-07-14.
- Files: `src/modules/provider-integrations/shipping/public.ts`, `src/modules/provider-integrations/shipping/server.ts`, `tests/unit/customer-request/shipping-quote-input.test.ts`.
- Trigger: Run `npm run typecheck` with Node 22 in the current shared tree.
- Workaround: The owner of the untracked shipping slice must export the intended Request type and omit absent exact-optional fields rather than passing `undefined`.

## Security Considerations

**Customer text is sent to a model provider before a human data-use review:**
- Risk: Request prose may contain personal or sensitive facts; interpretation sends the text and registered capability vocabulary to OpenRouter.
- Files: `src/modules/customer-request/openrouter-interpreter.ts`, `src/modules/customer-request/interpreter.ts`, `src/lib/server/customer-request-api.ts`.
- Current mitigation: Bounded request bodies, strict generated-output validation, prompt-injection framing, response-size limits, and deadlines constrain processing.
- Recommendations: Put a clear pre-submit disclosure on the human surface, minimize transmitted fields, and test disclosure parity with actual provider behavior.

**Public Answer Threads are bearer-link records:**
- Risk: Anyone with a valid public thread token may read the projected conversation; customer text can persist without an evident automatic expiry policy.
- Files: `src/modules/answer-thread/internal/public-thread-token.ts`, `src/modules/answer-thread/answer-thread.functions.ts`, `convex/answerThreads.ts`.
- Current mitigation: High-entropy tokens, session-bound writes, bounded turns, and public projection filters.
- Recommendations: Define retention and revocation, disclose link semantics, and avoid carrying new Customer Request history into this legacy store.

**Capability freshness is an authorization boundary:**
- Risk: Stale publications, bindings, eligibility, credentials, or readiness could route data or execution to invalid supply.
- Files: `convex/capabilitySupply.ts`, `src/modules/capability-supply/`, `src/modules/customer-request/action-preparation.ts`, `src/modules/customer-request/approval-grant-v2.ts`.
- Current mitigation: Exact contract digests, expiry checks, readiness evidence, idempotency, immutable approval material, and fail-closed refusal states.
- Recommendations: Preserve checks at preparation and attempt time, expose stale-authority recovery, and never treat registry inventory as routeable supply.

**External-agent writes depend on multiple exact trust controls:**
- Risk: Misconfiguration of Web Bot Auth, Clerk/Convex identity, clearance signing, or scopes can either block valid writes or weaken admission.
- Files: `src/modules/clearance/`, `src/routes/api.agent.tools.ts`, `src/modules/harness/tool-contract.ts`.
- Current mitigation: Signature coverage, pinned tool allowlist, named write scopes, mandate evaluation, replay protection, and typed proof gaps.
- Recommendations: Keep identity separate from authorization; verify unsigned refusal, invalid scope, replay, expiry, and downstream failure in hosted release gates.

## Performance Bottlenecks

**Interpretation rebuilds and transmits capability descriptors:**
- Problem: Each Request interpretation serializes the current eligible contract vocabulary for the external model call.
- Files: `convex/customerRequestApplication.ts`, `src/modules/customer-request/openrouter-interpreter.ts`, `src/modules/customer-request/interpreter.ts`.
- Cause: The model is constrained by a source-owned dynamic vocabulary rather than a stable compact index.
- Improvement path: Cache a digest-addressed descriptor projection with explicit invalidation while preserving exact contract identity and current admission.

**Route enumeration grows combinatorially:**
- Problem: Candidate combinations are enumerated across actions before projection.
- Files: `src/modules/customer-request/compiler.ts`.
- Cause: Cartesian composition of viable supplies; `MAX_ROUTE_PLANS = 256` fails closed after enumeration grows beyond the bound.
- Improvement path: Use bounded incremental search and deterministic top-k pruning based on declared objectives, retaining refusal when completeness cannot be proven.

**Broad Convex reads remain in authority-bearing paths:**
- Problem: Several modules call `.collect()` where collection size can grow with businesses, publications, inquiries, or evidence.
- Files: `convex/capabilitySupply.ts`, `convex/inquiries.ts`, `convex/registry.ts`, `convex/customerRequestApplication.ts`.
- Cause: Some integrity checks and projections scan a logical set rather than using a unique/indexed lookup.
- Improvement path: Add bounded indexed reads and explicit pagination. Keep full-set integrity checks in bounded administrative jobs rather than customer latency paths.

## Fragile Areas

**Request projection evolution:**
- Files: `src/modules/customer-request/agent-contract.ts`, `src/modules/customer-request/internal/convex-v2-schema.ts`, `convex/customerRequestApplication.ts`, `src/components/ae/customer-request/AeCustomerRequestWorkspace.tsx`.
- Why fragile: The same state has persistence, Convex validator, HTTP, external-agent, and human-rendering representations.
- Safe modification: Start with one customer-semantic contract, update adapters together, and prove a real production-shaped response through the UI.
- Test coverage: Unit coverage is broad, but workspace tests mock desired responses and do not traverse the production handler/Convex boundary.

**Capability supply and preparation authority:**
- Files: `convex/capabilitySupply.ts`, `src/modules/capability-supply/`, `src/modules/customer-request/preparation.ts`, `src/modules/customer-request/action-preparation.ts`.
- Why fragile: Currentness, admission, credentials, evidence, cost, data use, and exact contract identity jointly decide whether a step may proceed.
- Safe modification: Preserve deterministic refusal taxonomies and re-check authority at each irreversible transition.
- Test coverage: Sandbox tests prove contract mechanics, not useful production supply or real provider fulfilment.

**Concurrent Inquiry and shipping work:**
- Files: `convex/inquiries.ts`, `src/modules/inquiries/`, `src/modules/provider-integrations/`, related tests.
- Why fragile: These files are modified or untracked in the shared tree and contain authority, privacy, delivery, and receipt work.
- Safe modification: Coordinate ownership, inspect per-file diffs, and keep changes unstaged unless the slice owner explicitly requests integration.
- Test coverage: Current TypeScript failures show the shipping slice is not yet integrated across its public type boundary.

## Scaling Limits

**Request compilation:**
- Current capacity: 64 selections, 128 facts, 700,000 serialized aggregate bytes, and 256 RoutePlans.
- Limit: Larger or more connected plans refuse as unsafe/invalid rather than degrading gradually.
- Scaling path: Bound candidate search earlier, paginate alternatives, and persist compact digest-addressed evidence.

**Customer throughput and model spend:**
- Current capacity: Per-request byte/deadline limits exist; no source-owned global Request quota or cost budget was found.
- Limit: Automated valid submissions can drive external-model cost and Convex work until provider/platform limits intervene.
- Scaling path: Add principal/IP quotas, concurrency budgets, telemetry, and explicit retry-after behavior without weakening authenticated authority.

## Dependencies at Risk

**OpenRouter:**
- Risk: Every new or refined Request depends on an external model response and compatible structured output.
- Impact: Provider latency, outage, model drift, or malformed output blocks Request progress.
- Migration plan: Keep the transport interface replaceable, pin/test model behavior, preserve strict validation, and expose typed retryable failure rather than silently falling back to invented semantics.

**Nightly and fast-moving runtime packages:**
- Risk: The application uses rapidly changing framework/build dependencies and a pinned Nitro nightly.
- Impact: Build, SSR, routing, and deployment behavior can change outside domain code.
- Migration plan: Upgrade in isolated branches with full build, route, browser, and hosted smoke evidence; avoid opportunistic dependency churn during domain work.

## Missing Critical Features

**One canonical customer front door:**
- Problem: `/` and `/engine` remain separate products.
- Blocks: A single resumable Request history and proof that engine improvements reach the primary customer surface.

**Human RoutePlan decision and selection:**
- Problem: RoutePlans reach JSON but not the human projection, and no exact route-selection command exists.
- Blocks: Multi-capability preparation, customer comparison, bounded composite authority, and visible alternatives/recovery.

**Prepared-action approval, run, and inspection in the human UI:**
- Problem: The routes exist but the workspace does not call them.
- Blocks: Human parity with the narrow hosted external-agent journey and any complete customer lifecycle claim.

**Useful production routeable supply evidence:**
- Problem: Registered listings do not prove current contract, offering, binding, eligibility, credential, publication, or readiness records.
- Blocks: Claims that the engine can route real customer jobs or produce useful provider outcomes.

**Composite execution and reconciliation:**
- Problem: Current preparation and attempt logic is single-action shaped.
- Blocks: The target Request → RoutePlan → Approve → Run → Inspect lifecycle for multi-step work.

## Test Coverage Gaps

**Production Request browser journey:**
- What's not tested: Anonymous/auth transition, real submit, clarification, route comparison, prepared decision, exact approval, run, and recovery through production handlers.
- Files: `tests/e2e/`, `src/components/ae/customer-request/AeCustomerRequestWorkspace.tsx`.
- Risk: Mocked component tests can prove desired UI behavior against responses the application never emits.
- Priority: High.

**Homepage persistence failure and migration behavior:**
- What's not tested: Streamed persistence error handling, thread readback, immediate recovery, and eventual cutover from Answer Thread to canonical Request.
- Files: `tests/unit/chat/home-landing-submit.test.tsx`, `src/components/ae/chat/AeHomeComposer.tsx`, `src/modules/answer-thread/internal/turn-orchestrator.ts`.
- Risk: The primary public ask surface can fail or diverge from Request without a vertical gate detecting it.
- Priority: High.

**Multi-capability product boundary:**
- What's not tested: A compiled two-step RoutePlan crossing Convex projection, HTTP schema, human rendering, selection, preparation, approval, execution, and inspection.
- Files: `tests/integration/customer-request-v2-multi-capability-route.test.ts`, `src/modules/customer-request/`, `convex/customerRequestApplication.ts`, `src/components/ae/customer-request/AeCustomerRequestWorkspace.tsx`.
- Risk: Internal graph correctness can pass while the product remains single-action.
- Priority: High.

**Request performance and cost budgets:**
- What's not tested: Capability vocabulary size, route-enumeration latency, aggregate size, model token/cost, and broad-read scaling under realistic supply.
- Files: `src/modules/customer-request/compiler.ts`, `convex/customerRequestApplication.ts`, `convex/capabilitySupply.ts`.
- Risk: Correctness gates pass until real supply causes latency, cost, or refusal cliffs.
- Priority: Medium.

---

*Concerns audit: 2026-07-14*
