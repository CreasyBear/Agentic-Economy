# Agent experience RFC: one journey across agents and surfaces

Date: 23 September 2026  
Version: 2
Status: proposed, review gate pending  
Decision owner: Joel  
Scope: Wave 1 design of the shared contracts, journey handle, authenticated chat stream and MCP picker. This is a design, not an assertion that these paths work today.

## 1. Problem

A buyer agent can find a Tool, but the public search contract returns candidates without a suitability verdict; the CLI, MCP and chat then add different continuations. Authenticated durable chat is Clerk-owner-only, while an agent key can purchase through other surfaces. The MCP surface projects 36 registered actions, sends duplicate text and structured output, and leaves the agent to reconstruct refs and authority across steps (`src/modules/registry/tool-choice-contracts.ts:105-139`; `src/modules/chat/search-presentation.ts:34-49`; `convex/chatMessages.ts:72-83`; `src/modules/actions/index.ts:88-166`; `src/lib/server/mcp-api.ts:492-506,573-580`; `agent://FrictionJourneyScout/report`). Cold agents received irrelevant fiat-FX matches, an opaque Weather Current input and unauthenticated quote refusals without a body-level connection path (`agent://ColdCliAgent/report`; `agent://ColdHttpAgent/report`; `agent://ColdMcpAgent/report`). No paid purchase was established by those probes.

**Thesis:** keep domain authority where it is. Project one compact, typed journey contract into HTTP, CLI, MCP and chat, and make every interruption carry an actionable continuation. Do not turn a recommendation, Tool description or stream into spending authority.

## 2. Goals and non-goals

### Goals

- An agent receives relevant, compact search results, an explicit `noMatch` otherwise, and a citable fast recommendation; it requests full detail only when needed.
- An authenticated principal can move from search or exact Tool ref to Quote, authorised Call, receipt and recovery without inventing the next identifier or replaying uncertain spend.
- An agent API key can operate its own durable chat thread and budget. Clerk remains an optional authenticated caller, not a prerequisite for a key-authenticated turn.
- HTTP, MCP, CLI and chat project the same refs, states, problems and `next[]` actions without inventing extra domain state. Provider actions remain behind provider authority.
- Keep a future provider agent's service identity, task and payment obligations distinct without building A2A transport.

### Non-goals

No A2A host, proxy, Agent Card crawler, ecosystem adapters, AP2 signer, crypto escrow, automatic multi-turn charging, dispute oracle or push infrastructure. No per-Operation MCP tools, auto-funding, owner approval by model prose, or refund-on-cancel. Do not imply MCP Tasks, durable replay of an HTTP connection, or a live provider execution from a successful catalogue lookup ([A2A](https://a2a-protocol.org/v1.0.0/specification/); `local://ax/ExtA2aMarket.md:29-41`; `src/modules/capability-execution/call-recovery-contracts.ts:62-91`).

## 3. Reference patterns adapted

| Documented pattern | AE adaptation, and what is not taken |
|---|---|
| [Exa search and answer](https://exa.ai/docs/reference/search), [OpenAI search citations](https://developers.openai.com/api/docs/guides/tools-web-search) | Return ranked `results[]` and recommendation with cited Tool refs and text spans. Fast Jev verdict is required; deep LLM synthesis SHOULD cite returned refs only. No external search pricing or guarantee of provider fitness. |
| [AI SDK UI message stream](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol), [resume guidance](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-resume-streams) | Reuse stream framing for authenticated HTTP turns; translate parts into stable AE NDJSON events in `ae chat`. Next turn, in-flight reconnection and Call cancellation are separate. Do not hand-roll SSE or claim stream replay in Wave 1. |
| [MCP tools and annotations](https://modelcontextprotocol.io/specification/2026-07-28/server/tools), [GitHub toolsets](https://github.com/github/github-mcp-server/blob/main/docs/server-configuration.md) | Small role-filtered workflow picker, outputSchema plus structuredContent, short text. Tool annotations inform presentation but never grant financial authority. Protocol errors remain JSON-RPC; execution refusals are `isError` tool results. |
| [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457), [A2A task states](https://a2a-protocol.org/v1.0.0/specification/#413-taskstate), [AP2 evidence](https://ap2-protocol.org/ap2/specification/#dispute-evidence) | Reuse one Problem Details model; align AE work states exactly with A2A states, but keep payment status independent. No AP2 mandate or claim of A2A conformance. |

## 4. Application context and source seams

| Owner | Existing seam reused | Proposed responsibility |
|---|---|---|
| Registry / decision-engine | Candidate schemas (`src/modules/registry/tool-choice-contracts.ts:40-59,76-139`); Jev rerank without cutoff (`src/modules/registry/tools.actions.ts:120-141`); source-filtered search currently reconciles publications (`convex/capabilityToolCatalog.ts:105-131`). | Registry owns public search and moves ingestion outside queries; chat consumes its verdict. |
| Actions / domain owners | Registry projection and action metadata (`src/modules/actions/index.ts:88-166`); quote continuation (`src/modules/capability-execution/quote.ts:32-99,112-150`); branded Call/Quote refs and total parsers (`src/modules/capability-execution/call-contracts.ts:59-80`); public Tool ref (`src/modules/capability-supply/public.ts:17-20,59-65`). | Action adapters own shared journey projection; execution owns Quote/Call and their existing authority, not an adapter-owned payment engine. |
| Security / error projection | Canonical `ProblemKind`, default status and `buildProblem` (`src/lib/errors.ts:13-50,108-163`); current agent-key resolver validates credential, scopes and principal (`src/lib/server/agent-access-auth.ts:126-215`). | Reuse Problem Details and real key principal; put continuation extensions in projection, not a parallel error model. |
| Chat / Convex | Clerk-owner send and scheduled-generation authority (`convex/chatMessages.ts:72-146,173-189`); saved messages and deltas (`convex/chatGenerate.ts:47-69`); existing chat Quote/Call paths (`convex/chatTools.ts:393-445`). | Extend admission/ownership to a key principal bound to its own threads; stream persisted turn changes through the existing chat engine. |
| Transports | Anonymous proxy's bounded request, correlation and response body forwarding (`src/routes/api.chat.anonymous.ts:112-174`); MCP scope filtering and registration (`src/lib/server/mcp-api.ts:428-590`); CLI error translation (`tools/ae/cli.ts:534-613`). | HTTP, CLI and MCP are projections. None becomes a second authority or action registry. |

`src/modules/module-boundaries.ts:77-107` fixes import direction and the entry-surface ratchet is 229 (`tests/imports/module-boundaries-ratchet.test.ts:27-45`). Registry owns the **public** search schema, action and read-only `RegistryNextAction` in its existing entries; HTTP already validates the registry action output, MCP invokes it, and CLI/chat must migrate to that same wire (`src/routes/api.v1.market-tools.search.ts:9-31`; `src/modules/registry/tools.actions.ts:120-141`; `src/lib/server/mcp-api.ts:545-561`). Shared cross-domain journey/events extend existing `src/modules/actions/contract.ts`. Chat-only admission/stream contracts replace the small `src/modules/chat/clarify-card.ts` entry with `agent-turn.contracts.ts`, migrating its two consumers. Manifest entries stay at 229; only justified principal-account dependency edges change (`src/modules/module-boundaries.ts:96,99,102`; `src/modules/chat/clarify-card.ts:1-18`; `src/modules/chat/tool-card.ts:2`; `convex/chatTools.ts:29-34`). `ProblemDetails` remains in `src/lib/errors.ts`.

## 5. Shared contract set: search, problems and events (M6)

**MUST:** Search returns `matched | degraded | noMatch | unavailable`, with source completeness (`partialResults`, `freshness`) independent of ranking. `matched` has ≥1 suitable result and a cited fast Jev recommendation; `degraded` has coherent lexical results, a reason and no recommendation after Jev timeout/error. `noMatch` preserves pagination and says `page` or `exhausted`; incomplete coverage is explicitly qualified. Jev `clarify` with none ≥0.5 and all-below-threshold pages become noMatch; near misses never count as matches. Remove the two-currency-token lowered gate, match currency codes whole-token and exclude rate-limit metadata from searchable capability text. Default cards target ~100 tokens; `detail:'full'` expands. Indicative prices are not Quotes. **SHOULD:** Authenticated, rate-limited deep synthesis during alpha cites returned refs only (`src/modules/registry/tools.actions.ts:120-141`; `src/modules/registry/tool-reranker.ts:92-103,181-190`; `src/modules/capability-supply/internal/tool-search.ts:80-136,627-635`; `src/modules/registry/tool-choice-contracts.ts:117-139`).

**MUST:** Problem Details retain validated RFC 9457 `type/title/status/detail/instance` plus `kind/code/retryable/requestId/next[]`. CLI JSON projects only **validated** fields (and `exitCode`); drop untrusted remote extensions. Validate every `next[]` URL against the configured AE origin or a deliberate allowlist before HTTP, CLI or MCP projects it; never promote remote prose to authority. MCP `isError` carries the same validated problem in structured content. 401/403 offers safe auth/consent continuation; authentication-source outage denies admission with retryable `UNAVAILABLE`, never false 401/connect (`src/lib/errors.ts:108-163,275-299`; `src/lib/server/agent-access-auth.ts:167-188,204-214`; [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457)).

**MUST:** A2A-aligned `WorkState` maps 1:1 to `submitted | working | input-required | auth-required | completed | failed | canceled | rejected` for **Turn and Call tasks only**. Tool readiness and Quote commitment remain domain statuses. Each event has durable ID, correlation and sequence; Turn has thread context, Call has CallRef and independent payment state, with thread context only when chat-originated. Receipts are artifacts, not proof of accepted delivery ([A2A](https://a2a-protocol.org/v1.0.0/specification/#413-taskstate); `local://ax/ExtA2aMarket.md:29-39`).

```ts
// Proposed public wire: src/modules/registry/tool-choice-contracts.ts;
// next actions are registry-owned; no registry -> actions dependency.
type RegistryNextAction =
  | { action: 'describe'; args: { toolRef: PublicToolRef }; authority: 'public' }
  | { action: 'next-page'; args: { query: string; cursor: string }; authority: 'public' }
  | { action: 'broaden'; args: { query: string }; authority: 'public' }
type SearchResult = Readonly<{
  toolRef: PublicToolRef; title: string; summary: string; matchReason: string;
  readiness: 'ready' | 'unverified' | 'unavailable';
  entitlement: 'public' | 'requires_auth' | 'not_entitled';
  price: { kind: 'indicative'; label: string }; next: readonly RegistryNextAction[]
}>
type SearchMeta = {
  partialResults: boolean; freshness?: SupplyProjectionFreshness;
  pagination: z.infer<typeof toolCatalogPaginationSchema>; next: readonly RegistryNextAction[]
}
type SearchEnvelope =
  | (SearchMeta & { kind: 'matched'; query: string; results: readonly [SearchResult, ...SearchResult[]];
      recommendation: { mode: 'fast' | 'deep'; engine: string; text: string;
        citations: readonly { toolRef: PublicToolRef; span: { start: number; end: number } }[] } })
  | (SearchMeta & { kind: 'degraded'; query: string; reason: string;
      results: readonly [SearchResult, ...SearchResult[]] })
  | (SearchMeta & { kind: 'noMatch'; query: string; scope: 'page' | 'exhausted';
      results: readonly []; nearMisses: readonly SearchResult[];
      reason: string; suggestions: readonly string[] })
  | (SearchMeta & { kind: 'unavailable'; reason: 'source_unavailable' | 'capacity_exceeded';
      results: readonly [] })

// Proposed cross-domain types: existing src/modules/actions/contract.ts.
type ThreadRef = Brand<string, 'ThreadRef'>
type TurnRef = Brand<string, 'TurnRef'>
type JourneyRef =
  | { kind: 'tool'; ref: PublicToolRef } | { kind: 'quote'; ref: QuoteRef }
  | { kind: 'call'; ref: CallRef } | { kind: 'turn'; ref: TurnRef }
type WorkState = 'submitted' | 'working' | 'input-required' | 'auth-required'
  | 'completed' | 'failed' | 'canceled' | 'rejected'
type EventBase = { eventId: string; correlationId: string; sequence: number; state: WorkState }
type JourneyEvent =
  | (EventBase & { kind: 'turn'; turnRef: TurnRef; contextId: ThreadRef })
  | (EventBase & { kind: 'call'; callRef: CallRef; contextId?: ThreadRef;
      payment: 'not_requested' | 'pending' | 'paid' | 'refunded' | 'outcome_unknown';
      receiptArtifactRef?: string })
type JourneyProblem = ProblemDetails & Readonly<{
  requestId: string; retryable: boolean; next: readonly JourneyNext[]
}>
```

Registry owns the public `SearchEnvelope` and derives `RegistryNextAction` from `src/modules/registry/next-action.ts:8-30`; `JourneyNext` includes that narrower union. HTTP keeps validating the upgraded registry action/schema, MCP registers its upgraded outputSchema, and CLI/chat consume the same result. No second actions-owned search envelope or registry → actions dependency (`src/routes/api.v1.market-tools.search.ts:9-31`; `src/lib/server/mcp-api.ts:545-580`).

## 6. Journey handle, direct procurement and status (RC1)

**MUST:** Every response carries typed `next[]`. One authenticated `status` returns a Tool, Quote, Call or Turn snapshot and continuation, bound to the buyer principal for every ref kind. Anonymous callers use public `describe` for Tool details. Call status uses `requireSourceRead` snapshot, not nonce-burning write admission via `capabilityCalls.admit` (`src/lib/server/call-api.ts:199-225`; `convex/lib/callLifecycle/callRecoveryActions.ts:301-324`; `convex/lib/callLifecycle/admission.ts:34-41`).

**MUST:** Both `tool.procure` variants require caller body `idempotencyKey`. Atomically bind `(principal, key, material digest)` before Quote; same material replays, changed material conflicts. Exact ref skips search/describe, not budget, consent or Quote/Call. Persist refs/key before external dispatch; pending/unknown retain original CallRef and status `next[]`, never become refusal (`src/modules/capability-execution/procure.ts:3-74`; `src/modules/capability-execution/procure-engine.ts:267-402`).
Post-dispatch `refused_after_dispatch` retains known CallRef/key/`next[]`; pre-dispatch `refused` carries key/`next[]` but invents no refs. Terminal projection preserves known Call handles (`src/modules/capability-execution/procure.ts:24-74`).

```ts
// Proposed: src/modules/capability-execution/procure.ts.
type ToolProcureInput =
  | { kind: 'need'; need: string; maxSpendAud?: string; idempotencyKey: string }
  | { kind: 'exact'; toolRef: PublicToolRef; input: Record<string, JsonValue>;
      maxSpendAud: string; idempotencyKey: string }
type ProcureResult =
  | (Extract<ToolProcureResult, { status: 'delivered' | 'remedied' }> & {
      callRef: CallRef; quoteRef: QuoteRef; idempotencyKey: string;
      next: readonly JourneyNext[] })
  | (Extract<ToolProcureResult, { status: 'refused' }> & {
      phase: 'pre_dispatch'; callRef?: never; quoteRef?: never;
      idempotencyKey: string; next: readonly JourneyNext[] })
  | { status: 'refused_after_dispatch'; code: string; detail: string;
      quoteRef: QuoteRef; callRef: CallRef; idempotencyKey: string;
      next: readonly JourneyNext[] }
  | { status: 'pending' | 'outcome_unknown'; quoteRef: QuoteRef; callRef: CallRef;
      idempotencyKey: string; next: readonly JourneyNext[] }
// Proposed cross-domain continuation: existing src/modules/actions/contract.ts.
type JourneyNext =
  | RegistryNextAction
  | { action: 'quote'; args: { toolRef: PublicToolRef; input: Record<string, JsonValue> }; authority: 'agent_key' }
  | { action: 'call'; args: { quoteRef: QuoteRef; idempotencyKey: string }; authority: 'agent_key' }
  | { action: 'procure'; args: ToolProcureInput; authority: 'agent_key' }
  | { action: 'status'; args: { ref: JourneyRef }; authority: 'same_principal' }
  | { action: 'connect'; args: { url: string; pollHandle: string }; authority: 'human_owner' }
  | { action: 'approve'; args: { callRef: CallRef; url: string }; authority: 'human_owner' }
  | { action: 'provide-input'; args: { taskId: TurnRef; fields: readonly string[] }; authority: 'same_principal' }
type JourneyStatus =
  | { kind: 'tool'; ref: PublicToolRef; readiness: SearchResult['readiness']; next: readonly JourneyNext[] }
  | { kind: 'quote'; ref: QuoteRef; principalRef: PrincipalRef; toolRef: PublicToolRef;
      state: 'committed' | 'refused' | 'expired' | 'consumed';
      consumedCallRef?: CallRef; expiresAt: number; maxSpend: string;
      currency: string; next: readonly JourneyNext[] }
  | { kind: 'call'; ref: CallRef; principalRef: PrincipalRef;
      recovery: CallStatusResult; workState: WorkState; next: readonly JourneyNext[] }
  | { kind: 'turn'; ref: TurnRef; principalRef: PrincipalRef;
      workState: WorkState; next: readonly JourneyNext[] }
```

`next[]` comes from validated refs; auth poll handles contain no key. Status/search/describe remain queries, never nonce-burning admission/recovery. Move source-filtered `facilitatorDiscovery.reconcile` to background/explicit ingestion (`convex/capabilityToolCatalog.ts:105-131`). A timed-out Call retains its key/ref, not fresh purchase (`tools/ae/lib/call-recovery-journal.ts:138-160`).

**Amendment A-3, 23 September 2026.** S3 found no authorised, non-mutating buyer Quote status read: `readForCall` requires an invocation idempotency key and exposes invocation material; admin status is admin-only (`convex/capabilityQuotes.ts:65-69`; `convex/lib/capabilityQuotes/readForCall.ts:11-18,62-75`; `convex/adminConsoleObjects.ts:30-38,75-76`; `convex/lib/adminConsole/registrars.ts:38-44`). Add pure query `convex/capabilityQuotesStatus.ts` with `convex/lib/capabilityQuotes/statusQuery.ts`: `requireSourceRead` plus same-principal authority using the D14 resolver pattern (`convex/lib/callLifecycle/statusQuery.ts:29-35`). Return only `{quoteRef, toolRef, state: committed|refused|expired|consumed, consumedCallRef?, expiresAt, maxSpend, currency}`; never invocation material.

## 7. Authenticated streaming turn and `ae chat` (M7, RC2)

**MUST:** `POST /api/v1/chat/turns` accepts an agent key or Clerk, binding principal/account to the durable thread. Key turns carry real credential/application/environment/scopes/grant, revalidated at Quote and Call; Clerk resolves separate owner authority, never a synthetic credential (`convex/chatMessages.ts:72-146,173-189`; `convex/chatTools.ts:276-284,393-445`).

**MUST:** Stream AI SDK UI parts `data-ae-state`, `data-ae-quote`, `data-ae-receipt`, `data-ae-problem`. Turn failure never terminalises an uncertain Call; emit CallRef, unknown payment and status continuation. `ae chat`: TTY or AE NDJSON (`start`, `text-delta`, `reasoning-summary`, `tool-call`, `tool-result`, `quote`, `receipt`, `finish`, `error`), `--continue`, `--thread <id>`, Ctrl-C/DELETE. Disconnect neither replays nor refunds. Cursor resume SHOULD follow in Wave 2 (`convex/chatGenerate.ts:47-69,90-113`; [AI SDK stream](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol)).

```ts
// Chat-only contract: src/modules/chat/agent-turn.contracts.ts replaces
// clarify-card.ts in the manifest and migrates both consumers.
type ChatPrincipal =
  | { kind: 'agent_key'; principalRef: PrincipalRef; accountRef: AccountRef;
      authority: { credentialId: string; applicationRef: string; environment: string;
        scopes: readonly string[]; grantRef: string } }
  | { kind: 'clerk'; principalRef: PrincipalRef; accountRef: AccountRef;
      authority: { kind: 'resolved_owner_authority' } }
type TurnAdmission =
  | { kind: 'accepted'; threadId: ThreadRef; turnId: TurnRef; principal: ChatPrincipal }
  | { kind: 'auth-required' | 'input-required'; problem: JourneyProblem }
type ChatDomainPart =
  | { type: 'data-ae-state'; value: JourneyEvent }
  | { type: 'data-ae-quote'; value: { quoteRef: QuoteRef; maxSpendAud: string; expiresAt: number } }
  | { type: 'data-ae-receipt'; value: { callRef: CallRef; artifactRef: string } }
  | { type: 'data-ae-problem'; value: JourneyProblem }
type ChatCliEvent = Readonly<{ threadId: ThreadRef; turnId: TurnRef; sequence: number }> & (
  | { type: 'start' | 'finish'; state: WorkState }
  | { type: 'text-delta' | 'reasoning-summary'; text: string }
  | { type: 'tool-call' | 'tool-result'; toolRef: PublicToolRef; payload: unknown }
  | { type: 'quote'; quoteRef: QuoteRef }
  | { type: 'receipt'; callRef: CallRef; artifactRef: string }
  | { type: 'error'; problem: JourneyProblem }
)
type CancelTurnResult =
  | { kind: 'stopped'; turnRef: TurnRef; inFlightEffects: readonly [] }
  | { kind: 'in_flight'; turnRef: TurnRef; inFlightEffects: readonly { callRef: CallRef }[] }
```

Reserve `(principal, clientTurnId, materialDigest)` atomically before thread creation; identical material replays, changed material conflicts. Check persisted cancel fence before Quote/Call; retain in-flight CallRefs. Turn status is principal-bound. Credentials stay out of prose/stream (`convex/chatMessages.ts:99-145`; `convex/chatGenerate.ts:78-101`; `convex/chatTools.ts:249-284`).

**Amendment A-1, 23 September 2026.** S4 found no principal attribution, TurnRef, sequence or reservation (`src/modules/chat/internal/convex-schema.ts:5-18`; `convex/chatMessages.ts:72-80,101-145`). Add `chatTurns`: `turnRef`, `threadId`, `principalKind: agent_key | clerk_owner`, `principalRef`, credential locator refs, `clientTurnId`, `materialDigest`, `state: WorkState`, per-thread `sequence`, `promptMessageId`, `cancelRequestedAt` fence, `createdAt`, `updatedAt`; indexes `by_principalRef_and_clientTurnId`, `by_threadId_and_sequence`, `by_turnRef`. `chatThreads` gains optional `principalKind`/`principalRef`; absent reads as `clerk_owner`/`ownerId`, without migration. One mutation reserves before thread creation. Delta read joins persisted agent deltas by `promptMessageId` with sequence cursor.

**Amendment A-2, 23 September 2026.** S4 lacks trusted Quote/Call entrypoints: Quote runs `quoteAction.ts:25-28` → `prepareFinancialSubjects.ts:58-59`; Call runs `authorityHandlers.ts:629-635` → `admitCall.ts:31-32`, both require source-write (`convex/lib/capabilityQuotes/quoteAction.ts:25-28`; `convex/lib/capabilityQuotes/prepareFinancialSubjects.ts:58-59`; `convex/lib/callLifecycle/authorityHandlers.ts:629-635`; `convex/lib/capabilityQuotes/admitCall.ts:31-32`). Split each into unchanged public `requireSourceWrite` wrapper and shared core taking verified authority. Internal-only entrypoints accept `TrustedChatAuthority` (`kind:'agent_key'`, DB-revalidated credential/application/environment/scopes/grant, `turnRef`) and call core after cancellation-fence recheck. Never self-mint sourceWrite. Security/idempotency review required before commit.

## 8. MCP picker, role sets and contract-quality gate (M10, D12)

**MUST:** MCP lists workflow tools by role: `discover = search, describe, compare`; `buy = quote, call, procure, status`; `account = whoami, balance, activity`; `provider = separate provider toolset`, listed only with provider authority. Read-only mode is `discover + account`, without write tools. Anonymous clients receive only public subsets. Operations are result data, never registered tools. `buy.procure` accepts the same `kind:'need' | 'exact'` input as capability-execution; exact refs skip search/describe but still bind Quote internally. Recheck authority at execution, not only tools/list (`src/modules/actions/index.ts:134-166`; `src/lib/server/mcp-api.ts:492-559`; `src/modules/capability-execution/procure.ts:3-16`; [MCP tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)).

**MUST:** Each exposed tool publishes `outputSchema` matching `structuredContent`; text content is at most a one- or two-line summary, never duplicated JSON. Execution problems use `isError: true` and the common problem in structured content; malformed JSON-RPC/protocol requests stay protocol errors. Every spend or side-effect annotation reflects actual effect and replay semantics, and is never trusted as an authorisation check. The current paginated tools/list entry omits `outputSchema` even when registration attempts one; both paths must converge (`src/lib/server/mcp-api.ts:428-467,472-489,516-580`; `src/modules/capability-execution/procure.actions.ts:40-65`; [MCP tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)).

**MUST, D12:** Admission refuses an Operation whose description promises a specific argument or simple natural-language input while its executable schema is an unconstrained opaque record without a real `inputExamples` instance that passes the admitted input schema. Alternatively admit a constrained schema that names the implied fields. The Weather Current description says to pass a city name, but its published `query` object does not name a city field (`agent://ColdMcpAgent/report`; `agent://ColdHttpAgent/report`). Examples must be validated against the *versioned* published contract and cannot be a guessed runtime adapter. This gate applies to new and republished Operations; existing contradictory listings need correction through normal publication/review, not an adapter-only magic city mapping. **SHOULD:** describe returns one validated example and a short readiness/price distinction with a full-detail opt-in (`src/modules/registry/tool-choice-contracts.ts:141-168`; `local://ax/ExtA2aMarket.md:33-35`).

```ts
// Proposed picker projection: existing src/modules/actions/contract.ts.
type PickerRole = 'discover' | 'buy' | 'account' | 'provider'
type PickerTool =
  | { role: 'discover'; action: 'search' | 'describe' | 'compare' }
  | { role: 'buy'; action: 'quote' | 'call' | 'procure' | 'status' }
  | { role: 'account'; action: 'whoami' | 'balance' | 'activity' }
  | { role: 'provider'; action: ProviderActionId }
type PickerMode = 'read_only' | 'buyer' | 'provider'
type AdmissionQuality =
  | { kind: 'admitted'; schemaRef: string; inputExamples: readonly JsonObject[] }
  | { kind: 'refused'; code: 'opaque_input_without_valid_example' | 'description_schema_mismatch';
      field: string; next: readonly JourneyNext[] }
```

The admission gate belongs to capability-supply's publication/validation seam; the sketch above is the action-facing readback, not permission for actions to inspect supply internals (`src/modules/module-boundaries.ts:92,99`; `src/modules/capability-supply/supply-publication-v2.ts:45-80`). Provider scope and account scope remain independent; do not show buyer Call because a provider credential can publish.

## 9. CQS, idempotency and error taxonomy

| Case | Work and certainty | Caller continuation |
|---|---|---|
| Invalid input/ref | `INVALID_ARGUMENT`, stable `invalid_input` or `malformed_ref`; no work. Named invalid field in Problem Details. | Correct data, do not invent a replacement ref (`src/lib/errors.ts:13-50,108-163`). |
| Absent or inaccessible resource | `NOT_FOUND` for a genuinely absent public Tool; 401 `UNAUTHENTICATED` or 403 `PERMISSION_DENIED` for private principal/scope, without leaking presence. | Safe connect/device URL and poll handle or owner approval; recheck principal and grant after continuation (`src/lib/server/agent-access-auth.ts:126-215`). |
| No suitable capability | `noMatch`, an ordinary search outcome, not an HTTP error and not unrelated hits. | Bounded broaden/request suggestions (`src/modules/registry/next-action.ts:21-30`). |
| Budget exceeded | `RESOURCE_EXHAUSTED` with stable domain code; no payment before authorisation. | Fund or reduce spend, then obtain a fresh Quote (`src/lib/errors.ts:241-248`). |
| Consent or quote expiry | `FAILED_PRECONDITION`; `input-required` where human approval can continue. | Approve with explicit ceiling or obtain a fresh Quote; spending beyond ceiling needs fresh consent (`src/modules/capability-execution/quote.ts:42-55,112-150`). |
| Rate/source/auth-source outage | `RESOURCE_EXHAUSTED` or retryable `UNAVAILABLE`; an auth-source outage denies admission but is not a 401. | Retry read; recover a command by its original handle/key rather than creating a new Call (`src/lib/errors.ts:34-50`; `src/modules/capability-execution/call-recovery-contracts.ts:62-91`). |
| Commit uncertain | State remains `working` or recovery-required with payment `outcome_unknown`, not failed or canceled solely because transport ended. | Poll `status` using the original Call ref; never issue fresh spend automatically (`src/modules/capability-execution/call-recovery-contracts.ts:62-91`). |
| Unexpected invariant fault | `INTERNAL`, redacted detail, request ID; preserve durable state. | Correlate support, never expose provider payloads or secrets (`src/lib/errors.ts:13-50`). |

Search, describe, compare, status and message reads MUST be query-only, including no audit writes or nonce burning. Quote may commit a bounded, expiring commitment; Call/procure and turn start/cancel are commands. Each mutating intent gets a principal-bound durable idempotency key: same material returns its stored result/handle, changed material refuses; a timed-out answer is not permission to submit a new key. Payment status is independent of work status, including after cancellation. A Quote MUST carry scope, maximum spend, currency, turn/time limits, expiry and partial-delivery terms when a conversational priced task exists; extra turns or spending beyond its ceiling demand a fresh quote and consent. For today's atomic Operation, do not fabricate a multi-turn tariff (`src/modules/capability-execution/quote.ts:112-150`; `local://ax/ExtA2aMarket.md:29-39`).

## 10. Threat model and A2A-readiness

| Threat | Control and durable evidence |
|---|---|
| Agent-key chat spends as a Clerk owner, or crosses to another principal's thread | Resolve key and scope on every turn/command/read; bind principal and account to thread and scheduled authority, recheck current grant/budget at Quote and Call. Owner approval is an `input-required` continuation, never an agent impersonation (`src/lib/server/agent-access-auth.ts:126-215`; `convex/chatMessages.ts:173-189`; `src/modules/agent-access/policy.ts:49-103`). |
| Provider description or tool result injects a new action, endpoint, price or privilege | Treat descriptions and model prose as untrusted data; `next[]` comes from registered action metadata and validated server facts. Inputs are checked against published schema; no model-created URL can become an approved OAuth or payment destination (`src/modules/actions/index.ts:134-166`; `src/modules/registry/tool-choice-contracts.ts:141-168`). |
| Repeated streamed turns or hidden provider follow-up exceeds budget | Bind one principal, ceiling, operation version and idempotency identity to each payable Call; no automatic multi-turn charge. New quote and fresh consent beyond the maximum; bounded per-turn tool count does not substitute for monetary policy (`convex/chatTools.ts:249-268,393-445`; `local://ax/ExtA2aMarket.md:29-39`). |
| Retry, stream disconnect, cancel or duplicate command loses payment certainty | Original Call ref and idempotency key persist; read-only status and reconciliation distinguish payment unknown from work failure. Cancellation only requests stopping work and never asserts reversal of released effects (`src/modules/capability-execution/call-recovery-contracts.ts:62-100`; `agent://FrictionJourneyScout/report`). |
| Credential, buyer data or dispute material leaks in search/stream/MCP | Scope private results, avoid secrets in `next[]`, bound result size and retain only refs/redacted evidence in stream. Preserve quote, consent, artifacts, charge and dispute evidence in domain records; never equate paid with delivered or accepted (`local://ax/ExtA2aMarket.md:35-39`). |

Provider/service identity remains distinct from an Operation or A2A skill. A2A `contextId` corresponds to a thread, task ID to one bounded work item/Call; typed state transitions carry durable IDs. Future artifacts can be partial or final, but an intermediate artifact is not automatically an accepted deliverable. Four terminal states remain distinct (`completed`, `failed`, `canceled`, `rejected`) and payment state remains orthogonal. These are compatibility invariants, not a claim to host A2A today ([A2A specification](https://a2a-protocol.org/v1.0.0/specification/); `local://ax/ExtA2aMarket.md:7-13,29-41`; `src/modules/registry/internal/services-api-projection.ts:39-57`).

## 11. Sliced implementation plan and ownership

Implement only after the seven-lens RFC review and Joel's design sign-off. Slices have **disjoint files**; within a slice, the named owner changes its tests and callers. Sequencing below means a consumer waits for the named contract, not that independent owners edit the same file. No new authority store is justified by this RFC.

| Slice | Named owner and exclusive files | Deliverable / gate |
|---|---|---|
| S1 Registry search | Search owner: `src/modules/registry/tool-choice-contracts.ts`, `tools.actions.ts`, `tool-reranker.ts`, `next-action.ts`, `src/modules/capability-supply/internal/tool-search.ts`, `convex/capabilityToolCatalog.ts`, `src/routes/api.v1.market-tools.search.ts`, focused tests | Upgrade the existing public action/output schema in place; direct HTTP search validates that action. Search reads a snapshot only; move source-filtered reconciliation to an explicit ingestion command or background owner, never mutation on query. Matched/degraded/noMatch, page/exhausted and partial/freshness are independent. MCP, CLI and chat consume the wire in S4/S6/S7. STOP if the reconciliation owner differs. |
| S2 Shared action contract | Actions/manifest owner: existing `src/modules/actions/contract.ts`, `src/modules/actions/index.ts`, `src/modules/module-boundaries.ts`, focused tests | Compose registry `RegistryNextAction` with Quote/Call continuations and invoke the shared `JourneyNext` projection from action results and transport adapters, not a parallel search model; declare principal-account dependency edges and replace chat `clarify-card.ts` entry with `agent-turn.contracts.ts` without increasing the 229-entry ratchet. Depends on S1. |
| S3 Execution and status | Execution owner: `src/modules/capability-execution/procure.ts`, `procure-engine.ts`, `procure.actions.ts`, `src/lib/server/call-api.ts`, `convex/lib/callLifecycle/callRecoveryActions.ts`, new Call snapshot read, `convex/capabilityQuotesStatus.ts`, `convex/lib/capabilityQuotes/statusQuery.ts`, focused tests | Exclusive `procure-engine.ts` owner. A-3: implement pure, same-principal, `requireSourceRead` Quote status without invocation material. Reserve procure key/material before Quote; preserve original CallRef/key/next on all post-dispatch results, no invented pre-dispatch refs. Replace Call status mutation admission with read snapshot/native recovery; never collapse nonterminal work into refusal. |
| S4 Chat state | Chat/Convex owner: `src/modules/chat/internal/convex-schema.ts`, `convex/chatMessages.ts`, `convex/chatThreads.ts`, `convex/chatGenerate.ts`, `convex/chatTools.ts`, `convex/lib/capabilityQuotes/quoteAction.ts`, `prepareFinancialSubjects.ts`, `admitCall.ts`, `convex/lib/callLifecycle/authorityHandlers.ts`, `src/modules/chat/clarify-card.ts` → `agent-turn.contracts.ts`, `src/modules/chat/tool-card.ts`, focused tests | A-1: add `chatTurns`, legacy-safe thread principals, atomic reservation and promptMessageId/sequence delta read. A-2: own Quote/Call public-wrapper/shared-core split, internal-only TrustedChatAuthority entrypoints and pre-core cancellation fence; security/idempotency review before commit. Revalidate key authority; Turn failure leaves uncertain Call intact. Migrate clarify consumers and S1 search. Depends on S2/S3. |
| S5 HTTP turn | HTTP adapter owner: `src/routes/api.v1.chat.turns.ts`, authenticated chat server handler, Turn status/cancel routes and focused route tests | Agent-key or Clerk turn, correct SDK UI stream and domain parts, correlation, auth-source outage as retryable `UNAVAILABLE`, 401/403 continuation and explicit DELETE cancellation. Consume S4 without editing Convex files. |
| S6 CLI | CLI owner: `tools/ae/commands/chat.ts`, `tools/ae/commands/search.ts`, `tools/ae/cli.ts`, `tools/ae/lib/output.ts`, CLI-focused tests | TTY, NDJSON, continuation/thread selection and cancel; search consumes S1 registry result, with no invented continuation. Preserve validated RFC 9457 fields only, and allow `next` URLs solely at the configured AE origin or an allowlist. Consume S5 transport. No share of files with other slices. |
| S7 MCP picker | MCP owner: `src/lib/server/mcp-api.ts`, MCP-focused tests | First verify the complete provider action/authority set; STOP if the intended role mapping omits a required action. Then implement role sets, `need/exact` procure, status, outputSchema and concise structured output. Consume S2/S3. |
| S8 Admission quality | Supply-admission owner: publication validator and input-example/schema contract files under `src/modules/capability-supply/`, **excluding S1-owned `internal/tool-search.ts`**, plus focused admission tests | Refuse D12 mismatch at admission/republication; repair Weather Current via real validated source contract, never guessed fields. Independent of S3-S7 after S2 wire decision. |

Integration owner alone updates route/OpenAPI parity and public discovery documentation for the new chat/status operations after S5-S7 land; those files are outside every slice above (`docs/designs/2026-09-23-agent-experience-audit.md:43-46`; `src/modules/discovery/internal/openapi-document-builder.ts:21-82`). Behavioural acceptance is a cold agent journey: no-match FX, constrained Weather input, authenticated exact-ref Quote/Call or honest refusal, status/receipt recovery, chat streamed through key principal, TTY/NDJSON parity and MCP role visibility. No claim of paid success without an actually observed charge and delivery.

## 12. Open questions and review gate

1. **Thread ownership:** `chatThreads.ownerId` is an account ref; S4 verifies safe Clerk-row principal attribution before key access (`convex/chatMessages.ts:52-69,101-104`).
2. **Quote status:** S3 verifies an authorised read; none was established here (`src/modules/capability-execution/call-recovery-contracts.ts:62-91`).
3. **Turn identity:** S4 verifies a persisted TurnRef and event sequence, distinct from thread and paid Call (`convex/chatMessages.ts:72-80`; `convex/chatGenerate.ts:63-68`).
4. **Provider set:** S7 verifies all provider workflows and authority before narrowing the MCP listing (`src/modules/actions/index.ts:113-127`; `src/lib/server/mcp-api.ts:492-506`).
5. **D12 repair:** Obtain a source-verified Weather Current input example or constrained field schema before re-admitting it; no live weather Call or valid `city` key was established by the cold probes (`agent://ColdCliAgent/report`; `agent://ColdMcpAgent/report`).
6. **FX catalogue supply:** The Frankfurter FX Operation is a sandbox-only fixture (`convex/devSeedFixtures.ts:163-240`). Production coverage needs a separately admitted, provider-backed FX Operation; search improvements cannot supply missing capacity. Keep an explicit noMatch until then (`agent://ColdHttpAgent/report`; `agent://ColdMcpAgent/report`).

The review gate applies design-review, type-driven-designer, module-secret-auditor, bounded-context-auditor, cqs-auditor, idempotency-guardian and error-strategist. Review must verify module imports, canonical ref parsers, current Quote read authority, thread attribution and an exact-ref procure path before implementation. This RFC remains proposed until that gate passes (`docs/designs/2026-09-22-admin-console-rfc.md:82-93,111-113,316-337`; `skill://ae-rfc-gate-design-exercise`).
