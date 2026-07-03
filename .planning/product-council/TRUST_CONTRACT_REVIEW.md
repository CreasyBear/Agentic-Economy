# Trust Contract Review
**Council Lens:** Trust Contract Critic
**Date:** 2026-07-03

## Contract Claims

- AE is a trust and discovery layer for agentic commerce, not an execution marketplace. Its current owned conversion is a qualified inquiry: a human first-contact message for owner review. Sources: `AGENTS.md:9-19`, `PRODUCT.md:9-13`, `PRODUCT.md:32-40`.
- The product must not imply booking, charging, dispatch, settlement, autonomous fulfillment, live availability, quote acceptance, or job acceptance. "Verified" is only allowed when a named standard exists and the listing meets it. Sources: `AGENTS.md:16-19`, `.planning/AI-SPEC.md:26-30`, `.planning/SECURITY-SPEC.md:531-573`, `PRODUCT.md:44-57`.
- Assistants may read, compare, summarize, and route to a next step. They may send a qualified inquiry only when the listing publishes that capability. If a request asks for booking, payment, dispatch, or autonomous execution, AE must state the boundary plainly and route back to the human-safe next step. Sources: `AGENTS.md:21-28`, `PRODUCT.md:67-72`, `.planning/AI-SPEC.md:50-51`, `.planning/ANSWER-AI-CONTRACT.md:13-15`.
- The assistant-exposed action set is intentionally narrow: `registry.search`, `registry.detail`, and `inquiry.submit`. The public answer model is read-only and may use only registry read tools. Sources: `AGENTS.md:38-49`, `.planning/AI-SPEC.md:32-37`, `.planning/AI-SPEC.md:346-356`, `.planning/ANSWER-AI-CONTRACT.md:57-75`.
- Qualified inquiry is the only assistant-exposed write. Owner inbox/read/reply/mark/close actions require owner auth and must not be exposed to external agents. Sources: `AGENTS.md:38-53`, `.planning/AI-SPEC.md:377-389`, `.planning/SECURITY-SPEC.md:304-323`, `.planning/codebase/ARCHITECTURE.md:146-155`.
- Public human surfaces must not label machine internals as "MCP", "callable", "OpenAPI", "agent-native", "DTO", "fixture", or similar architecture vocabulary. `KNOWN` / `UNKNOWN` / `UNAVAILABLE` / `NEXT_STEP` are machine/admin labels, not public human labels. Sources: `AGENTS.md:57-72`, `AGENTS.md:90-92`, `DESIGN.md:62-69`, `PRODUCT.md:76-79`.
- Public projections must be allowlisted and must not leak raw tool inputs, outputs, hashes, prompts, run traces, private owner data, or provider/private authority state. Sources: `.planning/AI-SPEC.md:509-524`, `.planning/SECURITY-SPEC.md:156-187`, `.planning/codebase/ARCHITECTURE.md:156-165`.

## Boundary Evidence

### Assistant tool boundary

Strong evidence. The quiet agent tool IDs are hardcoded to `registry.search`, `registry.detail`, and `inquiry.submit` in `src/modules/harness/tool-contract.ts:25-34`. The answer model tool set is separately hardcoded to `registry.search` and `registry.detail` in the same file. `src/modules/harness/tool-contract.ts:326-341` only exposes quiet tools if the action is both surface-tagged for `agentTools` and allowlisted.

`src/modules/actions/index.ts:22-37` registers only the registry and inquiry actions, and `listAgentToolActions()` filters on the `agentTools` surface. This means `registry.list` is registered for other surfaces but is not exposed as a quiet agent tool. `tests/integration/agent-tools-api.test.ts:7-66` asserts that the quiet tool list includes `inquiry.submit`, `registry.search`, and `registry.detail`, excludes `registry.list`, includes boundaries, and avoids protocol vocabulary.

### Registry read boundary

Strong evidence. `registry.search` and `registry.detail` are declared read-only and agent-tool exposed in `src/modules/registry/registry.actions.ts:230-280`. Their summaries and boundaries explicitly say they return public catalog facts only, do not book, charge, dispatch, or send inquiries, and do not confirm availability, quotes, or job acceptance.

Execution also stays literal: `tests/integration/agent-tools-api.test.ts:136-207` asserts `registry.search` returns public catalog results and does not auto-correct a misspelled suburb. That supports the contract that assistants should not invent or broaden provider facts.

### Qualified inquiry write boundary

Partial evidence. `inquiry.submit` is declared as the only quiet assistant write in `src/modules/inquiries/inquiry.actions.ts:96-114`. Its summary frames the write as a human first-contact inquiry for owner review, and its boundaries explicitly deny booking, charging, dispatch, autonomous fulfillment, availability confirmation, quote acceptance, and job acceptance.

The write path is admission-gated. `src/routes/api.agent.tools.ts:68-75` invokes the harness with `allowWrites: true`, but `src/modules/harness/approval-policy.ts:121-142` requires a source-write declaration and admission for writes. The inquiry server function creates a `public_inquiry` admission in `src/modules/inquiries/inquiry.functions.ts:275-316`, and the Convex mutation requires that scope in `convex/inquiries.ts:601-617`.

The weak point is semantic, not structural. `src/modules/inquiries/inquiry.actions.ts:63-85` describes `body` as a brief request with no booking/payment intent, but the schema and command path do not appear to reject booking/payment/dispatch language inside the body. `src/modules/inquiries/internal/commands.ts:280-289` rejects empty/long bodies and unsafe future-surface client fields, while the public action does not pass such fields. If an external assistant submits "book this for 3pm and take payment" as the body, AE should still only create an inquiry, but the product contract says the assistant-exposed write should refuse that request before recording it.

### Owner-only action boundary

Strong evidence. Owner inquiry operations are not registered in `src/modules/actions/index.ts:22-27` and are explicitly handled as server functions in `src/modules/inquiries/inquiry.functions.ts:249-273`. Convex owner read paths call `readCurrentOwner(ctx)` in `convex/inquiries.ts:663-782`, and owner write paths require both `owner_inquiry` source-write admission and owner auth in `convex/inquiries.ts:813-1001`.

The local E2E bypass in `src/modules/inquiries/inquiry.functions.ts:755-757` is acceptable only as test/dev machinery. Launch proof should show it cannot be enabled in production.

### Public answer boundary

Mostly strong, with one routing gap. The public answer thread schema limits answer tool IDs to registry reads in `src/modules/answer-thread/answer-thread.schema.ts:28-29`. `src/modules/answer-thread/internal/tool-runner.ts:64-74` refuses unknown, unregistered, or non-read-only tools, and `src/modules/answer-thread/internal/tool-runner.ts:89-105` runs answer tools with `allowWrites: false`.

The answer prompt reinforces the trust boundary in `src/modules/answer/internal/answer-llm-prompts.ts:27-39`: call registry tools before naming providers, do not invent providers, do not claim booking/payment/dispatch, and do not use public epistemic labels. The answer gate checks unsupported epistemic labels, prompt-injection upgrades, overclaim phrases, and boundary copy in `src/modules/answer/internal/answer-gate.ts:27-60`.

Evidence persistence and projection are intentionally separated. `src/modules/answer-thread/internal/turn-orchestrator.ts:240-249` fails closed if persistence/finalization fails after captured output, and `src/modules/answer-thread/internal/turn-orchestrator.ts:465-535` persists the turn, tool calls, and harness run before terminal completion. `tests/integration/answer-tool-calls.test.ts:136-186` asserts public thread projection strips raw tool calls, inputs, result hashes, harness run details, and tool IDs.

The routing gap: `src/modules/answer-thread/internal/follow-up-intent.ts:35-48` returns `refine_search` for first-turn queries before checking booking/payment/dispatch patterns. In prior-thread follow-ups, `tests/integration/answer-turn-intent-routing.test.ts:210-234` proves "book now and pay today" becomes unsupported and bypasses the agent. The same guarantee is not obvious for a first-turn booking/payment request.

### Public copy and public machine vocabulary

Strong evidence on current public surfaces inspected. `src/routes/about.tsx:29-40` says AE can compare, summarize, and send a qualified inquiry when available, while explicitly denying booking, payments, dispatch, and confirmed availability. `src/routes/about.tsx:195-207` repeats that businesses decide whether and how to respond. `src/routes/help.tsx:68-71` states users do not book or pay through AE and must confirm timing, price, and availability with the business.

Copy tests cover a wide public surface. `tests/copy/phase1-banned-copy.test.ts:7-20` scans routes, AE components, copy, catalog, discovery, SEO, generated files, and public assets, and `tests/copy/phase1-banned-copy.test.ts:22-50` expects no unsupported capability claims. `tests/copy/claims-register.test.ts:184-196` scans route/API/discovery/SEO source surfaces and expects no claim violations. `tests/copy/discovery-overclaim.test.ts:10-24` keeps discovery output free of unsupported protocol/action/payment claims while allowing negative `callable=false` and `paymentRequired=false`.

One caution: `src/routes/developers.discovery.tsx` contains internal vocabulary appropriate to operator/developer discovery work, but it is protected by `operatorRouteOptions` and noindex handling in `src/routes/developers.discovery.tsx:12-23`. If that route becomes public marketing, it would violate the human-surface vocabulary contract.

### Prompt-injection and owner-authored data boundary

Strong evidence in discovery. `tests/integration/discovery-prompt-injection.test.ts:11-61` mutates owner-authored service/capability text with script, "callable=true", "paymentRequired=true", and "verified" payloads, and asserts public manifests do not upgrade trust or capability state. `tests/integration/discovery-prompt-injection.test.ts:63-83` keeps `llms.txt` free of owner summaries, markup, bidi payloads, and owner disclosure text.

### Billing and business-action boundary

No assistant exposure found in the action registry. `src/modules/actions/index.ts:22-27` does not register billing or business-action actions for quiet agents. Planning and tests keep later money/action claims out of public copy unless phase-owned/source-owned contexts apply: `tests/copy/phase4-protected-action-claims.test.ts:20-48`, `tests/copy/phase6-business-action-claims.test.ts:38-65`, and `tests/copy/claims-register.test.ts:71-89`.

This area remains high-risk because the vocabulary is easy to misread. Public product copy should keep billing/business-action evidence framed as unavailable, internal, owner/admin, or source-local until there is explicit launch authority.

## Overclaim Scan

- No major current public human overclaim was found in the inspected `about` and `help` surfaces. They repeatedly state the safe boundary and avoid booking/payment/dispatch claims.
- `inquiry.submit` has the most important trust gap: the descriptor says to refuse booking/payment/autonomous execution, but the runtime path does not visibly reject a booking-shaped inquiry body. This can make the only assistant write accept wording the contract says it should refuse. Files: `src/modules/inquiries/inquiry.actions.ts:63-85`, `src/modules/inquiries/inquiry.actions.ts:96-114`, `src/modules/inquiries/internal/commands.ts:280-289`.
- First-turn answer requests that ask to book/pay/dispatch may search rather than immediately boundary-refuse because intent classification checks `priorQueryCount === 0` before boundary/action patterns. File: `src/modules/answer-thread/internal/follow-up-intent.ts:35-48`.
- The generated-answer overclaim gate is narrower than the security spec. `src/modules/answer/internal/copy-guard-patterns.ts:5-12` catches phrases like "book now", "booking confirmed", "pay now", "payment required", "callable endpoint", "agent-native", "autonomous agent", and "dispatch now". `.planning/SECURITY-SPEC.md:553-571` requires broader negative coverage, including scheduling, quote acceptance, order placement, guaranteed response, direct execute, MCP mutation/callable, autonomous marketplace, wallets, agent checkout, and several payment-rail claims.
- There is policy drift in action documentation. `src/modules/common/action.ts:4-19` still says one action declaration fans out to every surface, while `src/modules/actions/index.ts:1-12` says owner/admin/provider/telemetry exceptions remain route/server-function exceptions. `.planning/codebase/CONCERNS.md:19-23` flags the same mismatch. This is not a current exposure bug, but it is a future trust-footgun.
- `/api/agent/tools` correctly schema-checks and harness-routes tool calls, but it has no obvious route-local rate limit/origin guard in `src/routes/api.agent.tools.ts:43-75`. `.planning/codebase/CONCERNS.md:65-69` flags public write route hardening as incomplete. Source-write admission is meaningful, but launch should not rely on descriptor honesty alone for an external assistant write endpoint.
- Source-write admission signs nonce/correlation data in `src/modules/security/source-write-admission.ts:59-129`, but `.planning/codebase/CONCERNS.md:71-75` notes there is no replay store. Current inquiry domain behavior reduces blast radius, but the trust contract should require explicit replay/idempotency proof for public writes before wider assistant exposure.
- Internal/developer surfaces contain architecture language. That is acceptable only while protected and noindexed. Files: `src/routes/developers.discovery.tsx:12-23`, `src/routes/developers.discovery.tsx:71-96`.

## Assistant Safety Readiness

- Read: **Strong.** Registry read tools are explicitly read-only, allowlisted, and tested. They return public catalog facts and do not mutate. Evidence: `src/modules/registry/registry.actions.ts:230-280`, `src/modules/harness/tool-contract.ts:25-34`, `tests/integration/agent-tools-api.test.ts:136-253`.
- Compare: **Strong.** Follow-up routing can reuse frozen providers without new tool calls, and public projections keep raw evidence private. Evidence: `tests/integration/answer-turn-intent-routing.test.ts:147-181`, `tests/integration/answer-tool-calls.test.ts:136-186`.
- Summarize: **Partial.** The LLM prompt and gate are boundary-aware, and tool use is read-only. However, overclaim pattern coverage is narrower than the security spec, and the current tool-use answer path needs launch proof that evals cover the live model behavior. Evidence: `src/modules/answer/internal/answer-llm-prompts.ts:27-39`, `src/modules/answer/internal/answer-gate.ts:27-60`, `src/modules/answer/internal/copy-guard-patterns.ts:5-12`, `.planning/ANSWER-AI-CONTRACT.md:327-333`.
- Route to next step: **Partial.** Deterministic boundary and unsupported follow-up flows are strong after a prior turn, but first-turn booking/payment/dispatch queries can be routed as searches. Evidence: `tests/integration/answer-turn-intent-routing.test.ts:184-234`, `src/modules/answer-thread/internal/follow-up-intent.ts:35-48`.
- Qualified inquiry: **Partial.** It is correctly the only assistant-exposed write, and it is source-write/admission/target gated. It is not yet contract-complete because the server path does not visibly reject booking/payment/dispatch/autonomous intent in the message body. Evidence: `src/modules/inquiries/inquiry.actions.ts:96-114`, `src/modules/inquiries/inquiry.functions.ts:275-316`, `convex/inquiries.ts:601-661`.
- Owner-only actions: **Strong.** Owner inbox/thread/reply/mark/close operations require owner auth and source-write admission and are not in the quiet agent tool registry. Evidence: `src/modules/actions/index.ts:22-27`, `src/modules/inquiries/inquiry.functions.ts:249-273`, `convex/inquiries.ts:663-1001`.
- Public human trust posture: **Strong with watchpoints.** Core public surfaces inspected are boundary-honest and copy scans are broad. The watchpoint is keeping developer/internal vocabulary out of public marketing and keeping later billing/business-action copy phase-gated. Evidence: `src/routes/about.tsx:29-40`, `src/routes/help.tsx:68-71`, `tests/copy/phase1-banned-copy.test.ts:7-50`, `tests/copy/phase6-business-action-claims.test.ts:38-65`.

Overall readiness: **Partial for launch.** The architecture is trust-aware and much stronger than ordinary "agent marketplace" copy. The non-negotiable gap is that the only assistant-exposed write still needs a hard semantic boundary check, not only descriptive boundaries.

## Red Lines Before Launch

1. Add a server-side semantic boundary gate for `inquiry.submit` and/or the shared public inquiry command. It must refuse booking, payment, dispatch, autonomous fulfillment, quote acceptance, job acceptance, and live-availability confirmation intent before recording an inquiry. Cover `/api/agent/tools` and the human inquiry route if they share the path. Files to prove: `src/modules/inquiries/inquiry.actions.ts`, `src/modules/inquiries/inquiry.functions.ts`, `src/modules/inquiries/internal/commands.ts`, `convex/inquiries.ts`, `tests/integration/agent-tools-api.test.ts`.
2. Fix first-turn answer routing so booking/payment/dispatch/autonomous requests boundary-refuse before search or model generation. Add tests for first-turn `POST /api/answer/turn` queries such as "book now and pay today" and "dispatch them tonight." Files to prove: `src/modules/answer-thread/internal/follow-up-intent.ts`, `tests/integration/answer-turn-intent-routing.test.ts`.
3. Broaden generated-answer overclaim guards to match `.planning/SECURITY-SPEC.md:553-571`, not only the current short phrase list. Include scheduling, quote acceptance, order placement, guaranteed response, direct execute, MCP/callable mutation, autonomous marketplace, wallet/agent checkout/payment rail, and unsupported verification language. Files to prove: `src/modules/answer/internal/copy-guard-patterns.ts`, `src/modules/answer/internal/answer-gate.ts`, `tests/copy`, `tests/integration`.
4. Provide launch proof for `/api/agent/tools` abuse hardening: rate limiting, request-size limits, origin/source-write validation, auditability, and replay/idempotency handling for the public write. If nonce replay is intentionally deferred, document the compensating control and scope. Files to prove: `src/routes/api.agent.tools.ts`, `src/modules/security/source-write-admission.ts`, `src/lib/server/source-write-admission.ts`, `convex/sourceWriteAdmission.ts`.
5. Resolve the action-contract documentation mismatch so future contributors know which actions fan out to machine surfaces and which owner/admin/provider operations intentionally remain server-function exceptions. Files to align: `src/modules/common/action.ts`, `src/modules/actions/index.ts`, `AGENTS.md`, `.planning/codebase/ARCHITECTURE.md`.
6. Produce current-head launch evidence for the answer path. The contract in `.planning/ANSWER-AI-CONTRACT.md:500-503` calls for deterministic production default until eval proof, while current code comments say the deterministic synthesizer is gone and tool-use LLM is primary in `src/modules/answer/internal/llm-config.ts:27-35`. The synthesis should decide whether this is accepted as the new contract or still a launch blocker.
7. Keep internal vocabulary out of public human surfaces by adding or maintaining route-aware scans that distinguish operator/admin/dev pages from public marketing pages. The protected `developers.discovery` route is acceptable only if the auth/noindex boundary remains true. Files to prove: `src/routes/developers.discovery.tsx`, `tests/copy/claims-register.test.ts`, `tests/integration/developer-discovery.test.ts`.

## Council Questions

1. Should AE reject any booking-shaped inquiry body at the source, or is "I would like to book if available" an allowed qualified inquiry as long as the receipt never claims a booking? The current contract says refuse; product may need a precise edge-case rule.
2. Is the current tool-use LLM answer path accepted for launch, or must deterministic search synthesis return before public launch until the eval gate is formally passed?
3. What is the canonical action policy for contributors: "one action fans out to every surface" or "only explicitly registered public machine actions fan out, with owner/admin/provider exceptions kept route-local"?
4. What public/agent vocabulary will be allowed for future billing and business-action proof without implying AE supports payment, dispatch, autonomous execution, or marketplace settlement?
5. What proof level is required before external assistants are invited to use `/api/agent/tools`: tests only, route-level abuse controls, production telemetry, replay protection, or all of the above?
