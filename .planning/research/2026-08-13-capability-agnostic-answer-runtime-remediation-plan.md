# Goblin Finding Remediation Sprint — Capability-Agnostic Answer and Agent Surfaces

**Date:** 2026-08-13  
**Status:** proposed execution authority; source changes not started  
**Product authority:** `.planning/PROJECT.md`  
**Engineering rules:** `RULES.MD`, `.claude/CLAUDE.md`  
**Domain language:** `UBIQUITOUS_LANGUAGE.md`  
**Runtime evidence:** `goblin-campaign-report-2026-08-13.md`  
**Money authority:** `.planning/adr/ADR-034-supplier-usage-qualified-use-and-payout-spine.md` and `.planning/research/2026-08-12-p0-p1-architectural-remediation-plan.md`

## 1. Decision

Rebase the remediation campaign onto current source and the 32-persona goblin runtime report. Do not execute the previous W0–W6 inventory wholesale: the canonical action graph, full strict action schemas, schema descriptor hashing, all four Operation reads, staged Answer navigation, exact-detail rebind, one-effect execution, CLI compare, CLI inspect-plan, safe Cat links, mixed-intent zero-I/O narrowing, and plain same-thread CLI continuation are already implemented or runtime-green.

The sprint repairs the remaining observed boundaries through incumbent authorities:

```text
structured request interpretation
  -> Operation route wins over business retrieval
  -> current Operation search/detail/rebind
  -> contract-native input binding
  -> one validated recorded input
  -> operation.execute OR operation.invoke
  -> contract-valid result/evidence
  -> one privacy-safe frozen presentation
  -> identical live/replay/CLI projection

registered Actions + Operation navigation
  -> human detail
  -> /for-agents and /SKILL.md
  -> MCP
  -> CLI

existing auth/network/credential/money seams
  -> security repairs
  -> access-mode truth
  -> live money remains disabled
```

No new registry, planner, executor, ledger, workflow, agent runtime, provider table, schema store, credential store, parser framework, privacy journal, or onboarding flow.

## 2. Evidence and methodology

### 2.1 Evidence hierarchy

Every implementation claim must identify its evidence class:

1. **Current source/runtime:** authority for current behavior and defect status.
2. **Official specification or first-party source:** authority for external protocol mechanics.
3. **Pinned mature OSS source:** corroboration for mechanics only.
4. **Inference:** never promoted to a runtime defect without an explicit proof obligation.

Historical plans and PAPERCUTS are leads, not authority. A current-green seam becomes a regression gate, not implementation work.

### 2.2 Work method

For every slice:

1. Reproduce or source-prove the exact defect.
2. Locate the existing fact owner and all consumers.
3. Run the reuse ladder: internal seam → standard library/platform → installed dependency → minimum new code.
4. Change the fact once at its deepest existing seam.
5. Delete superseded branches, copied metadata, and stale assertions; leave no compatibility shim.
6. Prove the changed observable contract, its negative authority/security case, and zero provider I/O on refusal.
7. Run broad gates once, after the vertical smokes pass.

Tests protect behavior, authority, identity, evidence, and failure semantics. They must not assert source text, duplicated registries, or ceremonial call sequences.

### 2.3 One authority per fact

| Fact | Existing authority to retain |
|---|---|
| Action identity, Zod schemas, effects, surfaces | `src/modules/actions/index.ts`, `src/modules/common/action.ts` |
| Operation search/detail/compare/inspect-plan | `operation-action-contracts.ts`, `operations.actions.ts`, capability-supply projection |
| Anonymous free keyless eligibility/execution | `operation.execute`, `operation-execute.server.ts` |
| Authenticated/effectful/keyed/x402 invocation | `operation.invoke`, invocation reservation/control, ProviderConnection lease |
| Strict model tool | selected descriptor schema through AI SDK `tool()`/`jsonSchema()` inside `HarnessRunLoop` |
| Request interpretation and continuation | `AnswerRequestInterpretation`, turn checkpoint/finalization, frozen candidate/rebind |
| Provider result/evidence/replay | executor/invoker plus Answer operation artifacts/checkpoint |
| Network admission | `src/modules/network-guard/public.ts` and guarded transport |
| Admin readback | `convex/authz.ts` |
| Money and settlement | exact money ledger, ADR-034 payout policy |
| Public terminology | `UBIQUITOUS_LANGUAGE.md` plus canonical action/descriptor projections |

## 3. Access-mode model: unkeyed, keyed, and x402

“Keyless,” “keyed,” and “x402” are not one axis.

| Axis | Modes | Authority |
|---|---|---|
| Caller authority | anonymous / AE caller key | action authentication and Principal grant |
| Provider transport | keyless / ProviderConnection credential / x402 payment | admitted binding plus current lease/custody |
| Commercial rail | free / AE-internal charge / provider-direct x402 | immutable Operation payment material and money policy |

Rules:

1. Anonymous `operation.execute` remains limited to admitted, zero-price, keyless, read-only HTTP Operations with no financial or external-state effect. It has no public HTTP or CLI alias.
2. `operation.invoke` owns authenticated grants, budgets, ProviderConnection credentials, effects, idempotency, cancellation, reconciliation, and x402 payment. Neither execution seam falls back to the other.
3. Provider API credentials remain server-side opaque references. Caller-key origin and Provider credentials are separate facts.
4. x402 payer custody is not a Provider API credential. Current `x402-fetch:v2` has no Provider-credential field; an endpoint that additionally requires one needs a separately admitted transport contract, not a hidden header.
5. x402 `PAYMENT-RESPONSE` is settlement evidence, not output validity or Qualified Use. AE still validates the admitted output and records its own evidence.
6. Bazaar entries, prices, quality counters, and 402 challenges are discovery/transport observations, never supplier identity, readiness, spend authority, completion, or settlement truth.

Live money remains disabled. This sprint may exercise x402 fixtures and pre-payment refusal/reconciliation only; it must not send a paid live smoke or claim hosted settlement.

## 4. Reference transfer decisions

### 4.1 x402 Foundation v2

Pinned research authority: `x402-foundation/x402` commit `2d23a1656263e9a9cabed85419e2f18fea3dc039`, accessed 2026-08-14. AE remains on installed `@x402/core`, `@x402/evm`, and `@x402/extensions` 2.18.0; an upgrade is a separate compatibility decision.

| Mechanic | Verdict | AE application |
|---|---|---|
| `PAYMENT-REQUIRED`, `PAYMENT-SIGNATURE`, `PAYMENT-RESPONSE` codecs and exact EVM signing | Adopt | Reuse installed x402 packages at the current signer/transport seam. |
| Client/server/facilitator actor separation | Adapt | Supplier hosts the resource; AE is a controlled paying client; facilitator does not replace AE authority or evidence. |
| Payment identifier extension | Adapt | Bind it to AE’s durable invocation/attempt identity; never substitute a TTL cache for AE idempotency. |
| Fetch wrapper automatic 402 retry | Reject for durable effects | It hides retry timing. AE must mark `possibly_submitted` before the paid request and reconcile unknown outcomes without blind retry. |
| Bazaar discovery | Adapt as an import hint | Feed the existing tri-state admission/provenance flow; never make discovery executable by itself. |
| Hosted facilitator/server packages inside AE | Reject | AE does not host supplier runtimes or replace its invocation/money seams. |

### 4.2 agentic.market

Public observations accessed 2026-08-14: its API projects one portfolio-shaped `Service` with flat `endpoints[]`, method, parameters, x402 price/network/scheme, provider merchandising, and quality counters; its validator runs deterministic required/advisory preflight and paid-call simulation; Bazaar indexing requires no account/API key.

| Mechanic | Verdict | AE application |
|---|---|---|
| Flat endpoint-first cards with method, schema/parameters, price and network | Adapt | Project from existing Market Operations and business/catalog DTOs; retain `operationRef`, digests, evidence, availability and authority. |
| Deterministic preflight with named required/advisory checks | Adapt | Present existing admission/refusal facts clearly in the current supply funnel. Do not add a validator framework. |
| Automatic Bazaar indexing after a paid call | Reject as admission | AE requires exact source admission, provenance, readiness and owner control. |
| Quality counters as execution authority | Reject | Counters may merchandise; they cannot establish readiness or completion. |
| One business portfolio called an Agent Service | Reject | AE reserves Agent Service for one admitted Market Operation. |

### 4.3 AI SDK, MCP, and OSS

Installed authority: `ai@7.0.44`, `@modelcontextprotocol/sdk@1.30.0`, Zod 4.4.3. LangGraphJS commit `841466e06077c255c71df15b0c55c25ece251baa` was read only as corroboration.

- Keep `HarnessRunLoop`; AI SDK `prepareStep`, `activeTools`, `toolChoice`, `stopWhen`, `tool()` and `jsonSchema()` are loop mechanics, not AE authority.
- Use a normal strict selected-operation `tool()` closed over the verified ref. Do not use a free-form generic executor or TypeScript-unknown `dynamicTool()` for an admitted schema.
- Keep Convex reservation/checkpoint/digest fences. Do not adopt ToolLoopAgent, WorkflowAgent, LangGraph, or a second checkpoint store.
- Keep the installed MCP SDK, canonical action registry, strict input schemas, call-time output validation, and typed boundary errors.
- MCP has no standard deferred-schema registry. `outputSchema` is optional in `tools/list`; if omitted to reduce context, exact Operation output schema remains available from Operation detail and validation remains server-side.

## 5. Rebased finding inventory

| Root | Status | Disposition |
|---|---|---|
| P1-1 / #126 optional inputs ignored | Accepted, blocking | Wave A contract-native input fidelity. |
| P1-2 Service vocabulary conflict | Accepted | Wave C projection/copy correction; no new DTO. |
| P1-3 keyless detail points to invoke | Accepted | Wave C derive next action from descriptor navigation. |
| P1-4 key artifact lacks origin | Accepted, security-adjacent | Wave B reuse CLI origin contract. |
| P1-5 supplier door enters generic claim | Accepted link defect; supply flow already exists | Wave C change only the door to existing supply mode. |
| P1-6 PRA-003 settlement incomplete | Accepted, separately governed | Wave M remains blocked on ADR-034/operator/legal inputs; live money off. |
| P1-7 CLI raw URL secret echo | Accepted, first security fix | Wave B origin-only parsing and safe diagnostics. |
| P2-1 continuation provenance missing | Accepted | Wave D freeze presentation at completion and carry it forward. |
| P2-2 PRA-006 ExternalRun reads | Accepted | Wave B reuse admin readback authority. |
| P2-3 PRA-007 SSRF ranges | Accepted | Wave B extend the one BlockList owner. |
| P2-4 agent HTML/MCP procedure gaps | Accepted, `/SKILL.md` inspect-plan premise partly stale | Wave C fix HTML and MCP bootstrap only. |
| P2-5 MCP list context | Accepted, measurement-driven | Wave E omit optional bulky output schemas; retain strict inputs/call validation. |
| P2-6 Provider/Publisher labels | Accepted | Wave C canonical terms. |
| P2-7/P2-8 CLI help defects | Accepted, one root | Wave C one command metadata path. |
| P2-9 ipify | Attribution fixed; routeability open | Wave E repair seed/deployment readiness only. |
| P2-10 pre-persist output privacy | Source/inference, credible | Wave D one projector before both stream and persistence. |
| Business fallback for Operation/nonsense asks | Partial open | Wave A make structured Operation route precede business retrieval. |
| Compare, inspect-plan, safe Cat link, mixed-intent narrowing, plain continuation | Green/stale/rejected | Regression gates only. |

## 6. Sprint DAG

```text
Wave B1 CLI URL safety ───────────────┐
Wave B2 key origin ──────────────────┤
Wave B3 ExternalRun auth ────────────┤
Wave B4 SSRF parity ─────────────────┤
                                      ├─> Wave F verification
Wave A route + input fidelity ──> Wave D frozen presentation/privacy ─┤
Wave C action-derived surfaces ──> Wave E MCP/ipify ──────────────────┘

Wave M ADR-034 settlement is independent and release-blocking; it never joins
live smokes until its own policy/source/hosted gates are satisfied.
```

Waves A, B and C may run concurrently after owners re-read their current files. Wave D depends on A’s exact recorded input/outcome shape. Wave E follows C because it changes generated agent guidance/MCP projection contracts. Broad verification runs once after all source slices.

## 7. No-discretion implementation contracts

### Wave A — Make the requested Operation and input authoritative

**Covers:** P1-1, remaining business/Operation dispatch leakage, continuation optional-input carryover.  
**Owners:** `src/modules/answer/internal/answer-query-safety.ts`, `src/modules/answer-thread/internal/turn-orchestrator.ts`, `src/modules/answer-thread/internal/follow-up-intent.ts`, `src/modules/answer/internal/answer-tool-use-agent.ts`, `src/modules/answer/internal/contract-input-binding.ts`, `src/modules/answer/internal/keyless-data-ask.ts`, and existing Answer tests.

1. Make `AnswerRequestInterpretation.route === 'operation'` bypass `retrievalFirstTurnPath`; business retrieval and legacy `classifyFollowUpIntent` may remain downstream business presentation helpers but cannot select, reuse, or route an Operation.
2. Keep the existing selected strict AI SDK tool as the single model-owned input-filling step. Supply it with the original query, ordered requested intents, optional prior validated input for `refine_prior_operation`, the current strict schema, property descriptions, and `customerAnnotations`.
3. Keep `contract-input-binding.ts` contract-derived: labels and a post-tool-call coverage check only. It may use schema-owned field names, labels, pointers, and descriptions to identify explicitly requested fields, but it must not infer values, maintain aliases/defaults, parse provider semantics, or invoke a second model.
4. Canonically validate the single tool-emitted input. If a contract-derived requested field is absent or input is invalid/unrepresentable, clarify with `customerAnnotations` labels or refuse before provider I/O. Published examples remain illustrative teaching values and never become defaults or authority.
5. Record the exact validated input before the effect. Tool record, checkpoint, executor/invoker request, input digest, continuation state, and evidence must agree byte-for-byte after canonical serialization.
6. A continuation may alter only fields present in the same current Operation schema; unrelated follow-ups start new interpretation and never reuse the prior Operation.
7. Grounded prose may claim a requested optional result only when the recorded input/result supports it; otherwise it clarifies or states the omission honestly.
8. Preserve search/detail/rebind, one effect, checkpoint, replay, explicit structured selection and all existing authority gates. Remove only reachable heuristic Operation authority, not safety/rebind helpers.

**Acceptance:**

- “Show me 3 random cat images” records `limit: 3`, returns three records, and says three.
- “Bitcoin in USD including 24-hour percentage change” records `include_24hr_change: true` and either returns that field or honestly refuses/qualifies; it cannot silently return price-only completion.
- “Make it five” on the Cat continuation preserves the frozen Operation and changes only `limit`.
- An unrelated follow-up performs no prior-Operation call.
- Published examples do not populate absent optional fields.
- Operation-routed harmless nonsense does not execute business search or provider I/O.

**STOP:** a second model fill, provider-specific ID table/regex/default, inferred value outside the strict tool input, input mutation after checkpoint, second provider effect, business fallback, or model-trusted unvalidated input.

### Wave B — Close immediate security and credential boundaries

#### B1. CLI origin-only base URL and safe diagnostics

**Owners:** `tools/ae/lib/args.ts`, `tools/ae/cli.ts`, `tools/ae/lib/output.ts`, `tools/ae/commands/status.ts`, and existing CLI error/recovery tests.

Use platform `URL`; accept only HTTP(S) origin-only values (loopback HTTP remains allowed by existing policy). Keep a safe origin for diagnostics; rejected/unparseable input becomes a fixed placeholder. Never echo raw userinfo, query, fragment, path, token, idempotency key, or transport error URL, including `recoveryTransportFailure`. Do not reuse the broader telemetry sanitizer as a CLI formatter and do not add a URL package.

**Acceptance:** human and JSON invalid/network/recovery errors contain no `TOPSECRET` or raw idempotency key for userinfo/query/fragment cases; valid configured origins still connect; error kind/code remain stable.

#### B2. Complete the caller-key artifact and make the install funnel mode-honest

**Owners:** `src/components/ae/console/AeAssistantInstallFunnel.tsx` and existing UI tests.

Reuse the CLI contract: copied shell exports and downloaded JSON include `AE_API_KEY` and the exact canonical `AE_API_KEY_ORIGIN`. In the same funnel, present anonymous direct-keyless as a distinct no-key MCP lane and Connect → Invoke as the authenticated lane; do not imply every Operation requires a caller key. Do not expose Provider credentials or create a new key format.

**Acceptance:** a freshly issued artifact is accepted by authenticated CLI origin checks without manual repair; wrong origin still fails before sending Authorization; direct-keyless guidance does not require or issue a key.

#### B3. Authorize ExternalRun reads

**Owners:** `convex/externalRuns.ts`, `convex/authz.ts`, and existing ExternalRun authorization tests.

Apply the existing `resolveAdminAuthority({ db: ctx.db, auth: ctx.auth }, 'read_admin_readbacks')` pattern before manifest/report lookup. Preserve source-write guards and the current projection. Do not invent owner access without an existing ownership relation.

**Acceptance:** anonymous, non-admin, revoked and suspended callers receive no fields even for a valid `runId`; active admin readback is unchanged; unknown-run behavior is reachable only after authorization.

#### B4. Complete the shared SSRF deny-list

**Owners:** `src/modules/network-guard/public.ts`, static transport admission only where needed, existing network/parity tests.

Add `198.18.0.0/15` and `fec0::/10` to the one runtime BlockList; add static `fec0::/10` parity. Preserve all-address DNS validation, mapped IPv4 handling and redirect revalidation.

**Acceptance:** literal, DNS, mapped, mixed-public/blocked and redirect targets perform zero fetch for the two ranges; representative public IPv4/global IPv6 remain accepted.

### Wave C — Derive every human/agent next step from registered truth

**Covers:** P1-2/3/5 and P2-4/6/7/8.  
**Owners:** `src/routes/operations.$operationRef.tsx`, `src/modules/registry/internal/service-projection.ts`, `src/modules/registry/registry.actions.ts`, `src/routes/for-agents.tsx`, `src/modules/discovery/internal/agent-skill.ts`, `src/modules/discovery/internal/page-markdown.ts`, `src/modules/discovery/internal/offering-discovery-file.ts`, `src/modules/discovery/internal/site-manifest.ts`, `src/content/brand-copy.ts`, `tools/ae/cli.ts`, `tools/ae/commands/manifest.ts`, `tools/ae/README.md`, and their existing route/discovery/CLI tests.

1. Operation detail branches on exact `operation.navigation`:
   - anonymous `execute` relation: show the MCP direct-keyless path and no Connect/Invoke instruction;
   - authenticated `invoke` relation: retain Connect → Invoke → Status; expose Recover only after canonical `reconciliation_required`/`outcome_unknown`, using the recorded invocation/evidence and original idempotency identity;
   - unavailable: show no executable CTA.
2. Label the registered Business link **Provider**. Label provenance enum **Publication authority/source mode** unless a real Publisher identity is present.
3. Reserve **Agent Service** for one admitted Market Operation. Rename business-level action descriptions and guidance to **published businesses** or **business catalog/portfolio**. Retain the existing DTO and distinct business actions.
4. Change only the supplier-specific homepage door to the existing `source=supply` claim mode. Do not create flow three.
5. `/for-agents` renders the already-registered inspect-plan row, direct-keyless distinction, and a compact MCP procedure: `POST /mcp` → `initialize` with the installed SDK's `LATEST_PROTOCOL_VERSION` → `notifications/initialized` → `tools/list` → `tools/call ae_registry_operations_search`. Label business search as business-only; never copy a protocol-version literal into guidance.
6. `/SKILL.md` already has inspect-plan/direct-keyless; add only the missing MCP lifecycle/business distinction through its existing generator.
7. Validate CLI command/group path before help projection. Invalid typos return typed invalid arguments, never `HELP`/exit 0. Valid text and JSON help derive from the same existing command metadata; `recover` explains evidence/recovery and `demand ask` explains thread continuation.
8. Keep CLI inspect-plan, compare and direct-keyless manifest guidance as existing behavior.

**Acceptance:** free keyless detail never asks for a caller key; keyed/x402 detail never offers anonymous execute; routine authenticated guidance stops at Status, while Recover appears only for a recorded reconciliation/unknown outcome with its original identity; supplier CTA lands in supply mode; canonical vocabulary is consistent across HTML/MCP/CLI; typo help fails; valid command help is command-specific.

### Wave D — Freeze truthful presentation and enforce one privacy projection

**Covers:** P2-1 and P2-10.  
**Owners:** `src/modules/answer/internal/answer-tool-use-agent.ts`, `src/modules/answer/internal/operation-artifacts.ts`, `src/modules/answer/internal/operation-result-presentation.ts`, `src/modules/answer-thread/answer-thread.schema.ts`, `src/modules/answer-thread/internal/answer-turn-checkpoint.ts`, `src/modules/answer-thread/internal/turn-orchestrator.ts`, `src/modules/answer-thread/internal/answer-turn-finalization.ts`, `src/modules/answer-thread/internal/public-projection.ts`, `src/components/ae/artifacts/AeGenerativeAnswer.tsx`, and focused grounding/stream/replay tests.

1. Freeze presentation at completion from the exact selected descriptor and effect record: operation/source labels, actor, observed time, output schema digest and output annotations.
2. Carry that presentation with frozen outcome/continuation evidence. Replay and continuation never reread mutable registry state and never fabricate time.
3. Run one bounded operation-result privacy decision immediately after the recorded effect and before any model grounding or prose generation. Grounding receives only the safe projection; an unsafe result skips grounding and emits only the generic typed failure while retaining the recorded effect for authorized recovery/readback.
4. Reapply the same decision before final snapshot emission and persistence so prose, SSE, owner/share views, frozen evidence and `readTurnToolCalls` cannot diverge. Preserve evidence/digests; do not add a UI-only redactor or second result DTO.
5. Keep the existing generic scalar/object/array renderer, safe annotated HTTPS links, escaping, and the single thread-level ARIA live announcement. Do not add a competing status region.

**Acceptance:** continuation retains `ae_runtime` and the original recorded observation/presentation facts; live and replay message parts are identical; a `{ token: 'TOPSECRET' }` fixture appears in no prose, SSE, owner/share projection, frozen evidence, checkpoint, or `readTurnToolCalls`; the provider effect remains recorded; resume performs zero second provider call.

### Wave E — Compact MCP honestly and restore ipify routeability

#### E1. MCP context

**Owners:** `src/lib/server/mcp-api.ts`, `src/modules/actions/index.ts`, the discovery projection files named in Wave C, and `tests/unit/server/mcp-api.test.ts`.

Keep exact names/order from `listMcpActions`, strict canonical input schemas, runtime output validation, and typed errors. Omit optional bulky `outputSchema` from `tools/list` rather than inventing deferred-schema RPC; Operation detail remains the exact output-contract read. Keep business tools but describe them as business catalog actions and put the Operation loop first in guidance.

**Acceptance:** raw `tools/list` bytes are recorded before/after and decrease because optional output schemas are absent; deterministic inventory and strict inputs remain; valid/invalid `tools/call` outcomes and zero-call malformed/forged cases remain green.

#### E2. ipify
**Owners:** `src/modules/capability-supply/curated-cluster-a-publications.ts`, `src/modules/capability-supply/internal/graph/read-probe-target.ts`, `convex/capabilitySupplyOperations.ts`, `src/modules/capability-execution/operation-execute.actions.ts`, and existing capability publication/readiness/execution integration tests.

Diagnose why the current publication is absent from `listKeylessExecutable`; correct seed/deployment material or schema-valid `inputExamples` at the source. Never weaken readiness, immutability, or eligibility and do not change the corrected **AE runtime public IP** attribution.

**Acceptance:** a fresh local seed lists, searches and executes ipify with current readiness/evidence; any contract digest drift uses the project’s legitimate reset/version policy, not an identity bypass.

### Wave M — Settlement release blocker

PRA-003 remains governed by ADR-034 and the existing architectural remediation plan. This sprint does not restate or weaken that contract. No live-money flag, payout proof, x402 paid smoke, fabricated threshold, current-month transfer, manual amount, or demo settlement may be added. Hosted value-exchange certification remains blocked until the exact source, operator/legal policy, deployment identity and receipt gates are green.

## 8. Verification

### Changed-contract tests

Run the smallest existing suites covering each slice:

- Answer selection/input/checkpoint/result presentation/stream-replay;
- operation detail and discovery/skill guidance;
- CLI arguments/errors/help/key-origin;
- ExternalRun authorization;
- network guard and static/runtime parity;
- MCP list/call projection;
- capability publication/readiness/execution for ipify;
- existing x402 challenge/reconciliation/signer and ProviderConnection projection tests.

Required negative proofs: malformed or unbound input, unrelated continuation, forged/stale ref, wrong key origin, secret-bearing URL, unauthorized ExternalRun read, blocked DNS/range/redirect, forbidden output key, malformed MCP request, and x402 challenge mismatch all cause zero unintended provider/effect calls. Malformed JSON/schema, unknown MCP tool, and forged protected authority produce bounded typed SDK errors with no action/provider call, stack, Authorization value, URL secret, or protocol-internal exception. Retained Provider/x402 fixtures must prove that raw Provider credentials and `AE_X402_PAYMENT_PRIVATE_KEY` enter no public projection, invocation/payment row, evidence, checkpoint, SSE, CLI or MCP output; only opaque references, digests, custody and signature evidence may persist, and `x402-fetch:v2` keeps its Provider credential reference null.

### Fresh local vertical smokes

Under Node 22 with a fresh seeded local stack:

1. Cat `limit=3` initial turn and “make it five” continuation; inspect exact recorded input/result/evidence and replay.
2. CoinGecko 24-hour-change request; verify requested input and grounded output/refusal.
3. Operation detail: one anonymous keyless descriptor and one authenticated/keyed fixture show different action paths.
4. CLI invalid/network URL errors with secret-bearing inputs show no secret; issued key artifact works with its bound origin.
5. MCP initialize/list/Operation search/detail/execute returns real keyless output/evidence after the compact list projection.
6. ipify returns the AE runtime public IP only after current readiness qualification.

Do not send a paid x402 request.

### Final gates, once

Run under the repository’s Node 22 runtime:

1. focused changed-contract suites;
2. the existing `npm run gate:release` once; it already owns Convex codegen, lint, typecheck, unit/integration/type/import/standards/UI/eval/build gates;
3. browser-drive the changed operation detail, `/for-agents`, key artifact and supplier door.

Fixture, local-live and hosted evidence remain separately labelled. An unrelated/environmental failure is recorded at its earliest reproducible boundary; no assertion or gate is weakened.

## 9. Explicit non-goals

- No new action registry, public contract graph, agent runtime, planner, executor, journal, ledger, checkpoint store or message store.
- No ToolLoopAgent, WorkflowAgent, LangGraph or OpenAI Agents migration.
- No generic model-facing `operation.execute`/`operation.invoke` record tool.
- No public anonymous HTTP execute route or CLI execute alias.
- No provider-specific Answer aliases, regexes, defaults, semantic tables or arithmetic framework.
- No mandatory compare/inspect-plan ceremony and no multi-Operation effect batching.
- No automatic remote image loading.
- No x402 facilitator/server adoption, silent x402 package upgrade, blind paid retry or live paid smoke.
- No new Provider credential/KMS store.
- No new Service DTO or third supplier onboarding flow.
- No privacy redaction that changes evidence identity or differs between live and replay.
- No live money until ADR-034 and hosted release gates are complete.

## 10. Completion criteria

The remediation sprint is complete only when current evidence shows all of the following:

1. Explicit optional inputs survive request → validated input → checkpoint → invocation → evidence → prose.
2. Structured Operation routing cannot fall into business retrieval, and unrelated follow-ups cannot reuse the prior Operation.
3. Anonymous keyless, authenticated keyed and x402 paths remain distinct and are presented correctly.
4. CLI diagnostics cannot echo caller-supplied URL secrets; issued caller keys include their exact origin.
5. ExternalRun reads require existing admin authority and the shared network guard blocks the two missing ranges.
6. Continuation presentation is frozen and truthful; live/replay operation results use one privacy-safe projection.
7. Agent Service/business catalog/Provider/publication-source terms are consistent; supplier entry uses the existing supply flow.
8. `/for-agents`, `/SKILL.md`, MCP and CLI teach the same action-derived Operation loop without copied authority.
9. MCP context is smaller without weakening strict inputs or call-time output validation.
10. ipify is routeable from a fresh legitimate seed and reports the AE runtime, not the browser user.
11. Targeted tests, typecheck, Convex codegen, the existing release gate and browser/local smokes pass under Node 22, or the earliest unrelated/environmental blocker is recorded honestly.
12. Live money remains disabled and no paid x402 or settlement claim is made.

## 11. External sources

Accessed 2026-08-14:

- [x402 specification and source](https://github.com/x402-foundation/x402/tree/2d23a1656263e9a9cabed85419e2f18fea3dc039)
- [x402 client/server flow](https://docs.x402.org/core-concepts/client-server)
- [x402 facilitator](https://docs.x402.org/core-concepts/facilitator)
- [x402 schemes](https://docs.x402.org/schemes/overview)
- [x402 Bazaar extension](https://docs.x402.org/extensions/bazaar)
- [x402 v1→v2 migration](https://docs.x402.org/guides/migration-v1-to-v2)
- [Agentic Market public guidance](https://agentic.market/llms.txt)
- [Agentic Market services API](https://api.agentic.market/v1/services)
- [Agentic Market search API](https://api.agentic.market/v1/services/search?q=exa&limit=1)
- [Agentic Market validator](https://agentic.market/validate)
- [Coinbase x402 discovery guidance](https://docs.cdp.coinbase.com/x402/seller/get-discovered)
- [AI SDK tool calling](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling)
- [AI SDK agents: configuring call options](https://ai-sdk.dev/docs/agents/configuring-call-options)
- [MCP tools specification](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)
- [MCP pagination](https://modelcontextprotocol.io/specification/2025-11-25/server/utilities/pagination)
