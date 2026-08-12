# Goblin Source Remediation Plan

**Date:** 2026-08-11
**Status:** Historical closeout snapshot; superseded for current status by the 2026-08-12 post-remediation re-audit; hosted certification blocked by missing production configuration and an unproduced strict receipt
**Product authority:** [`../PROJECT.md`](../PROJECT.md)
**Audit ledger:** [`../../PAPERCUTS.md`](../../PAPERCUTS.md), WGA-001–WGA-015 plus ENV-001, SG-017, SG-024, and the proof-ledger closeout roots
**Engineering rules:** [`../../RULES.MD`](../../RULES.MD)
**Method:** Brendan Gregg's [USE Method](https://www.brendangregg.com/usemethod.html), applied as an early runtime-resource triage lens—not as a replacement for correctness, security, protocol, or release proof.

## Historical execution outcome — 2026-08-11

- At the 2026-08-11 snapshot, the seven repair systems below were recorded as source-complete. The WGA-001–WGA-015 contracts were recorded as implemented or, for WGA-008, closed as an unsupported inference after source review. SG-017 and the source/local portion of SG-024 were recorded as implemented.
- The dated local proof record under Node 22 included TypeScript, Convex codegen dry-run, lint, production build, the 45-file/312-test integration release suite, the 13-case/15-turn Answer evaluation, and focused operation-executor, CLI-recovery, money, receipt, source-release, and UI-contract checks.
- Production certification was **not** complete. No strict hosted receipt was produced and no live Stripe top-up/charge/payout was attempted. The hosted lane remained fail-closed until the production Convex/Vercel/Clerk/source-write/gateway/Stripe configuration and approved fixtures listed in §8.4 existed.
- The source evidence index in §14 was the pre-repair snapshot that justified this plan. At that time, current status authority was `.planning/PROJECT.md`, `.planning/STATE.md`, `.planning/ROADMAP.md`, the active Wayfinder, this outcome, and the reconciled PAPERCUTS rows. The 2026-08-12 post-remediation re-audit now supersedes the closeout's current-source/status conclusions; the dated evidence is retained.

## 1. Decision and remit

Repair the source and repository so they can implement the fixed Agentic Economy vision. Do not change the founder's vision, GTM, product scope, supplier-onboarding strategy, or launch order. The sequence below is a source-dependency order.

Rationalize the audit into seven repair systems rather than execute fifteen disconnected tickets:

1. **Answer runtime and continuity:** ENV-001, WGA-001, WGA-009.
2. **Public agent contract:** WGA-002, WGA-003, WGA-004, WGA-006.
3. **Invocation recovery projection:** WGA-005, WGA-010, WGA-011.
4. **Authority and provider lifecycle:** WGA-007, SG-017; close WGA-008 as an audited inference unless evidence changes.
5. **Money and hosted proof:** WGA-012, WGA-013, SG-024.
6. **Repository authority and durable evidence:** WGA-014, WGA-015 plus the proof-count/status contradictions.
7. **USE operating checks:** a small errors-first checklist over the resources above, using existing signals and `?` for unknowns. No dashboard or metrics project.

This is a clean cutover. Do not leave compatibility aliases, duplicate DTOs, duplicate route maps, hand-maintained MCP names, a second state machine, a second queue, or a second evidence system.

## 2. Source snapshot — historical 2026-08-11; superseded by the 2026-08-12 re-audit

The source snapshot already had the hard domain kernels: durable invocation refs, idempotent reservation/replay, typed status/cancel/reconcile, exact money, evidence lineage, provider-connection authority, source-write admission, strict SSE terminal semantics, and owner authentication. The goblin failures were chiefly broken convergence and projection:

- local `dev:local` can block before Vite on Convex's interactive upgrade/transfer prompts;
- a failed bare `/t/new` query/draft remains React-memory-only even though the initial client turn key is session-persisted;
- answer persistence and harness finalization are two mutations with a process-death window, and checkpoints reject monotonic step advancement without parent lineage;
- provider revocation enters `revocation_pending` but has no cleanup dispatcher;
- generated Service/UCP/MCP/OAuth/recovery guidance drifts from runtime contracts;
- CLI and owner console hide recovery identity/action surfaces that already exist in the kernel;
- the hosted smoke can accept replay double-metering and writes console noise into a `.json` artifact;
- current-status and proof claims are duplicated across active documents and cite ignored, clone-unavailable evidence.

WGA-008 is not a present security defect on current evidence. Seven WorkTree operations can project caught `Error.message`, but all reachable AE producers inspected emit fixed non-secret tokens; no secret-bearing or attacker-reflective producer was proven. Close it as `audited—no demonstrated exposure`; reopen only with a concrete producer or runtime receipt. Do not add speculative redaction machinery.

## 3. Functional resource map

```text
Browser ask
  -> Answer HTTP admission/rate limit
  -> Convex reservation + checkpoint row
  -> AI SDK stream framing + AE harness/model/tool loop
  -> durable finalization/readback

Cold agent
  -> generated Service/UCP/SKILL/OAuth/MCP/CLI contract
  -> one registered operation gateway
  -> durable invocation/control/attempt rows
  -> provider transport + provider connection authority
  -> exact money ledger + evidence

Owner
  -> Clerk-authenticated source reads/actions
  -> access console activity + invocation recovery

Provider revoke
  -> provider-connection mutation + lease invalidation
  -> transactionally bound existing Workpool cleanup action
  -> cleanup-specific adapter or typed unsupported outcome
  -> existing lifecycle command on the same row

Hosted release
  -> exact deployment readback
  -> owner invocation + MCP replay + control invocation
  -> exact usage snapshots + lifecycle refusals
  -> strict digest-bearing JSON receipt
  -> one immutable GitHub artifact
```

## 4. USE Method application

Gregg's rule is: for every resource, check **utilization, saturation, and errors**. Start with errors because they are cheap and decisive; then utilization and saturation. Low averages do not disprove burst saturation. For unavailable signals record `?`; do not manufacture instrumentation. USE narrows runtime bottlenecks. Authorization, contract parity, idempotency, evidence, and money correctness retain their own gates.

| Resource | Utilization—existing signal | Saturation—existing signal | Errors—existing signal | Findings rationalized |
|---|---|---|---|---|
| Local supervisor, Convex source, answer admission | child ready/exit; successful source call; admitted response | TTY startup block; real 429 + `Retry-After`; backend/DB queue `?` | child exit; `missing_convex_url`; source unavailable; typed 5xx | ENV-001 |
| Answer reservation/checkpoint/SSE/model loop | durable reservation/turn/checkpoint; model/tool timings; accepted frame sequence | stream concurrency/backpressure `?`; checkpoint queue `?` | digest/identity/checkpoint conflicts; missing/duplicate terminal; model/source failure | WGA-001, WGA-009 |
| Shared Workpool and provider cleanup | bound work status and lifecycle | pending/running age; callback grace; provider queue `?` | failed/canceled/missing work; lifecycle `cleanup_required` | SG-017 |
| Operation gateway and recovery | durable invocation state; call duration; credential call counts | pending/reconciliation-required age; provider quota/queue `?` | timeout; idempotency conflict; provider refusal; uncertain outcome | WGA-005, WGA-006, WGA-010, WGA-011 |
| Money ledger | call/paid/free counts, gross spend, balance, activity page | insufficient credit; budget/concurrency limits; unresolved unknown outcomes | charge/refund/reconciliation refusals; replay adds a call | WGA-011, WGA-012, SG-024 |
| MCP/OAuth/public contract renderers | exercised action timings where already present; otherwise `?` | MCP concurrency `?`; OAuth 429 is the only current saturation signal | unknown tool; parser/schema mismatch; auth/source rejection; parity failure | WGA-002–WGA-004, WGA-006, WGA-007 |
| Stripe webhook/top-up/payout resources | to be limited to provider IDs, event counts, ledger projections | unprocessed events/held payouts; quantitative queue `?` until a source-backed signal exists | signature/API/idempotency/apply/payout failure | SG-024 |
| Release readback/receipt/artifact | one readback, one receipt write/read, one upload | endpoint/fs/runner queue `?` | revision mismatch; exact-usage mismatch; JSON/Zod/digest/write/upload failure | WGA-012–WGA-015 |
| WorkTree public error boundary | handler success/failure count `?` | `?` | raw caught message is reachable, but no sensitive producer proven | WGA-008 closeout only |

Go-forward rule: every implementation slice names its resource, captures the cheapest existing error signal before the change, exercises the repaired path, and checks U/S only where source-backed. Instrumentation is added only when a named acceptance criterion cannot otherwise be proved.

## 5. No-handrolling adoption matrix

| Responsibility | Decision | Existing/installed seam | Explicit rejection |
|---|---|---|---|
| Answer SSE framing | Reuse installed | AI SDK 7 `createUIMessageStream` and `createUIMessageStreamResponse`; retain AE data-part parser/terminal semantics | `useChat`, resumable-stream/Redis, a second stream protocol |
| Answer model/tool authority | Retain domain | AE harness + turn orchestrator + reservation/checkpoint/finalization | `ToolLoopAgent`, Convex Agent, Workflow wrapper, second journal |
| Checkpoint concurrency | Reuse platform | one Convex mutation + OCC on the existing reservation row | locks, CAS retry loop, queue, new table |
| Provider cleanup dispatch | Reuse installed | existing Workpool `enqueueAction` + total `onComplete`; MutationCtx subtransaction binds row/work atomically | second Workpool, scheduler loop, fake success |
| Long-lived project workflow | Keep existing only | current `WorkflowManager(components.workflow)` in `projectSpine` | Temporal/runtime dependency; wrapping Answer/provider cleanup in Workflow |
| MCP tool registration/projection | Reuse installed/current | `@modelcontextprotocol/sdk` registration plus `listMcpActions` and `mcpToolName` | hand-maintained name map, alias compatibility layer, JSON-RPC parser |
| Schemas/public contracts | Reuse current | Zod 4 schemas/JSON Schema conversion, action descriptors, typed route constants, Service DTO | second OpenAPI/docs registry, prose scraping, duplicated validators |
| Browser draft recovery | Reuse native | one bounded validated `sessionStorage` record + durable server replay | IndexedDB/store package, second transcript/session store |
| CLI HTTP/output | Reuse current | `callJson`, `requireOk`, `printJson`, `CliFailure`, canonical recovery schemas | SDK/waiter framework, duplicate client model |
| Owner recovery | Reuse current | Clerk owner auth, source actions, canonical worker/recovery result, money activity | agent key in browser, owner recovery state machine/DTO, raw Convex rows |
| Release receipt | Reuse current/platform | Zod 4, `canonicalDigest`, Node 22 `fs/promises`, existing hosted verifier, `actions/upload-artifact@v4` | stdout/`tee` receipt, proof framework, attestation ceremony |
| Exact money | Retain domain | AE exact amount/ledger/reconciliation/payout facts | Stripe balance as AE ledger, floating arithmetic, second billing ledger |
| WorkTree error | Delete proposed work | no current defect established | speculative error registry or broad sanitizer |

## 6. Target contracts

### 6.1 Answer turn finalization, draft, and replay

Collapse the current two-mutation `persistReservedAnswerTurn → finalizeAnswerTurnHarnessRun` sequence into one `harnessSessions:finalizeReservedAnswerTurn` Convex mutation, reusing the existing harness batch-validation/session helpers. The caller carries the admission's `expectedGeneration`, includes it in the finalization args and finalization digest, and computes the turn row, tool rows, final evidence, harness journal entries, answer digest, and finalization digest before the write; the mutation requires current state `reserved`, exact generation, reservation/request/session/thread/turn identity, inserts or exact-replays the answer/tool/harness material, advances the harness session, and changes the reservation only from current `reserved` to `finalized` after exact generation/checkpoint identity validation in one transaction. Delete the committed `answer_persisted` intermediate state and the obsolete split mutations/callers. A lost response is resolved by exact replay of the same finalization digest; a different answer, tool record, harness entry, or digest conflicts. The terminal SSE frame is sent only after this mutation returns accepted/replayed. This removes the process-death window where a durable answer existed but the harness and reservation never finalized. Before removing the enum literal, run a read-only count of existing `answer_persisted` rows and fail the cutover if nonzero; repo rules forbid a compatibility path or automatic migration. Disposable local data may be explicitly reset only with owner consent; non-disposable rows require an explicit preserve/delete decision, never silent reinterpretation.

Persist one versioned, bounded record under one existing-feature key in `sessionStorage`:

```ts
type PendingAnswerTurnDraft = Readonly<{
  version: 1
  query: string
  clientTurnKey: string
  searchContext?: string
  threadId?: string
}>
```

Write before POST. Rehydrate on bare `/t/new` when no URL query supersedes it. Reuse the same `clientTurnKey` and same-origin session cookie. Clear only after durable terminal readback and route promotion, or explicit user discard. Retain across abort, disconnect, pending, and retryable error. Storage failure remains a typed/non-destructive client error; it must not create a second server identity.

Keep AI SDK stream framing and AE's strict terminal parser. Do not implement generic stream resumption: atomic server finalization plus reservation/checkpoint replay owns restart recovery.

### 6.2 Monotonic checkpoint CAS with lineage

Extend the existing checkpoint envelope with `parentCheckpointDigest?: string`. Step 1 requires no parent. Every later step requires `parentCheckpointDigest` to equal the currently stored checkpoint digest. The digest covers generation, reservation/request/turn identity, step ordinal, parent digest, selected operation/tool history, bounded model/tool records, and serialized checkpoint payload.

On the existing answer reservation row:

| Current | Incoming | Result |
|---|---|---|
| no checkpoint | valid current generation/identity step 1 with no parent | persist |
| step `s` | step `s+1`, same generation/identity, parent = current digest, valid digest | atomically replace |
| step `s` | same step and digest | replay |
| step `s` | same step/different digest, missing/wrong parent, skipped step, lower step | conflict |
| any | wrong owner/request/generation, malformed, stopped, settled | existing typed refusal |

The agent carries the accepted checkpoint digest forward as the next parent. A fresh worker reads the latest checkpoint, reconstructs the bounded prior tool/model prefix, and begins only at `s+1`; it never replays earlier tools. Parent-digest lineage prevents concurrent forks at `s+1` and later even when both payloads are individually valid.

Replace the current resumed prose-only branch in `answer-tool-use-agent.ts`. Each checkpoint also carries the route/intent, selected operation/tool ID plus authoritative descriptor/source digest, prior assistant/tool messages, and executed tool-call ID + canonical input/result digests. On resume, re-read the descriptor from the canonical source and require the same authority digest; drift/unavailability returns typed `checkpoint_source_changed` without executing another tool. Seed the AI SDK continuation with the bounded prior messages/results and continue the normal tool loop at `s+1`. The tool runner exact-replays a checkpointed call result by call/input digest and refuses a changed duplicate, so model repetition cannot repeat the external call. A checkpoint after every accepted tool makes a deterministic two-tool resume executable rather than prose-only.

Implement the same contract in all three current ports: `convex/answerThreads.ts`, `tests/helpers/answer-thread-test-port.ts`, and the local-E2E port in `src/modules/answer-thread/answer-thread.functions.ts`. Convex OCC is the production concurrency primitive. Do not add a checkpoint table, queue, or workflow.

### 6.3 One public operation contract graph

Do not create a docs registry. Project from these existing owners:

- `ServiceEndpointDto` for `ae.access: 'external'`, authentication, and execution vocabulary;
- `listMcpActions()` + `mcpToolName()` for actual MCP names;
- existing action Zod input/output schemas + `describeActionForAgent()`;
- one leaf public-route contract containing invoke/status/cancel/reconcile methods and path templates, consumed by handlers and renderers;
- current OAuth validators/constants and installed MCP OAuth schemas where they cover the wire shape;
- existing OAuth metadata builders.

The resulting SKILL/UCP/site manifest/CLI manifest must emit the actual `ae_operation_invoke` name, the four REST operation routes, exact scopes/media types/header precedence, exact outcome unions, and request/response examples that round-trip the runtime parser. Delete `ae.access:'open'` and all hand-maintained MCP/recovery name arrays. Bump the manifest schema version if its wire shape changes; do not preserve the stale shape.

### 6.4 OAuth source-read authority

Change `agentAccessOAuth:getGrantByHash` to require the same source-write admission material already used by `getGrantByRef`. The trusted server store computes a bounded operation key and supplies the admission. Direct unauthenticated hash reads fail; the admitted server path succeeds. Keep public client metadata reads public. Do not add another auth mechanism.

OAuth protocol implementation must reuse installed `@modelcontextprotocol/sdk` public schemas/handlers only where the final SDK-reuse gate below proves framework and feature parity. AE keeps its durable Convex grants, owner consent, device flow, PKCE, one-time delivery, and source-write authority. Unsupported SDK features must not be advertised.

### 6.5 CLI recovery model

```text
ae invoke <operation-ref> '<json>' --idempotency-key <key> [--wait]
ae status <invocation-ref>
ae cancel <invocation-ref> --idempotency-key <key>
ae reconcile <invocation-ref> --idempotency-key <key> --evidence '<json>'
```

- Default invoke returns the canonical accepted/terminal result; waiting is explicit and bounded.
- Human mode may generate a key, but writes it to stderr before network I/O.
- `--json` requires an explicit key so stdout remains exactly one JSON value and process death is recoverable.
- Timeout/unknown transport exits nonzero with bounded recovery detail: `operationRef`, `invocationRef` when accepted, `idempotencyKey`, status path, and retry hint. Never relabel uncertainty as refusal.
- All success/domain outputs reuse canonical action schemas. RFC 9457/CLI failure envelopes remain transport/auth/schema failures only.

### 6.6 Owner recovery projection

Extend `CreditActivityView` with existing `invocationRef` and `attemptRef`; the money usage schema already stores them. Update both the in-memory mapper and real `convex/moneyLedger.ts:listCreditActivity` projection. Do not copy evidence into money tables.

Extend the canonical found-status contract with optional latest `effectGeneration` and retain `evidenceHash` as the evidence digest. Change every owner in one cutover: `OperationInvokeStatusResult`, its action Zod schema, Convex validator, worker projection, and the reconciliation-required mapping that currently drops `result.evidence.effectGeneration`.

Make `operation.status` actually observational as its `readOnly:true` action contract claims. Split the bounded row/control/result projection from worker recovery so status performs no lease transition, money mutation, provider call, retry, or reconciliation. Before deleting the current status writes in `convex/capabilityOperationInvocationWorker.ts:1119-1179`, move each exact convergence case to its authoritative write path: worker `completeWork`/dispatch completion projects canonical retryable/cancelled/terminal/reconciliation-required/invalidated outer state; retryable no-release money reconciliation and dispatch/work/attempt clearing occur idempotently there; explicit cancel owns cancelled+money convergence; explicit reconcile owns evidence-driven terminal convergence. Same-key invoke replay may dispatch only after completion has reset a retryable row. Add a failure-injection test for completion after inner commit/before outer projection and an idempotent repair mutation invoked by completion—not GET status—to repair that crash window. Pure status then reads inner control plus outer/result with inner canonical state taking precedence and never repairs on read.

Clean-cut the strict public reconciliation-evidence schema to the existing canonical `ReconciliationEvidence`: retain required kind/version/evidenceRef/source/invocationRef/attemptRef/effectGeneration/resolution/observedAt/digest and add bounded optional `operationRef`, `inputDigest`, `requestDigest`, `providerIdentity`, `paymentIdentifier`, `transportObservationDigest`, and `paymentObservationDigest`. Use that one schema in action, HTTP/MCP, CLI, owner source action, and Convex validator; x402 fields reach the existing worker verifier instead of being rejected at the edge.

Add Clerk-owner authenticated source actions beside the existing approval seam. They authorize `invocationRef` against persisted `ownerId`, then delegate pure status or explicit cancel/reconcile using the persisted invocation principal/credential identity. Durable owner recovery remains available after the issuing agent grant rotates or disappears; authority is owner-of-record plus invocation/effect identity, not a fresh bearer grant. Missing auth, absent row, and cross-owner access are indistinguishable not-found. The browser never receives an agent bearer key or raw invocation row.

Load pure status lazily when a relevant activity row expands to avoid a 50-row N+1 read. Render only bounded refs, state, latest effect generation, charge state/exact amount, and evidence digest. State-gate actions to the existing control rules:

- awaiting authority: existing approve/deny plus pure status; `deny` is the only pre-authorization cancellation path;
- authorized/retryable/leased before release: pure status + cancel;
- in progress: pure status only;
- reconciliation required/outcome unknown: pure status + validated reconciliation evidence only; no retry or blind cancel;
- terminal/cancelled/invalidated: read-only;
- insufficient credit: top-up path, never reconcile.

### 6.7 Provider cleanup convergence

Keep one provider-connection lifecycle and row. Reuse the already-mounted `customerRequestRouteWorkpool`; do not add another component, scheduler loop, caller DTO, or parallel state machine. Installed Convex `MutationCtx.runMutation` is a same-transaction subtransaction, so `enqueueAction(ctx, ...)` plus the provider-row work-ID patch commit/rollback together exactly like the current invocation dispatcher.

`revokeOwner` enters `revocation_pending`, derives a stable revocation identity and cleanup attempt/command ID, and drains every active/issued lease before cleanup. Invalidate the current bounded 1,000-row batch; if another remains, enqueue a continuation on the same Workpool with its own bound work ID/context and keep `revocation_pending`. Repeat until zero, then enqueue exactly one cleanup action with `retry:false`. A row `workId`/authority check plus Convex OCC makes concurrent/replayed enqueue exact-replay; no separate dedupe layer.

Derive/persist `cleanupRequestDigest = canonicalDigest({ revocationRef, cleanupAttempt, connectionRef, expectedAuthorityGeneration, expectedAuthorityDigest, adapterId })`; authority digest already binds the opaque locator, so no locator/secret enters args. Extend the existing cleanup command directly:

```ts
type RecordProviderConnectionCleanupResultCommand = Readonly<{
  commandId: string
  expectedAuthorityGeneration: number
  expectedAuthorityDigest: string
  workId: string
  requestDigest: string
  outcome: 'detached' | 'revoked' | 'already_revoked' | 'unsupported' | 'provider_refused' | 'outcome_unknown'
  responseDigest?: string
  reasonCode?: string
  evidenceRefs: readonly string[]
}>
```

Work args/context contain connection ref, command ID, work ID only where Workpool supplies it to `onComplete`, expected generation/digest, and request digest. The action reads the matching opaque locator via a cleanup-only internal query, recomputes the digest, selects the persisted adapter, catches **every** provider exception before Workpool can log it, strips provider text, and returns a strict bounded outcome; it never throws provider material. `onComplete` is total/non-throwing: success validates the bounded result; failed/canceled/malformed maps to `outcome_unknown` using context's persisted request digest and bounded local evidence only. It calls the existing cleanup-result transition and never reads/stores/logs Workpool `result.error`.

The cleanup-result mutation performs exact `lastCommandId/lastCommandDigest` replay first. Otherwise it requires current row work ID, lifecycle `revocation_pending|cleanup_required`, generation, authority digest, cleanup command ID, and request digest; stale callbacks fail. Convergence is domain-enforced:

| Command outcome | Domain proof | Lifecycle/local locator |
|---|---|---|
| `detached` | current row is exactly the canonical `x402-fetch:v2` credential-less/no-remote-revocation binding; otherwise refuse | `revoked`, clear locator |
| `revoked` | current binding has an admitted cleanup contract and authenticated bounded success evidence | `revoked`, clear locator |
| `already_revoked` | admitted protocol defines authenticated response as idempotent absence/revocation | `revoked`, clear locator |
| `unsupported` | no admitted cleanup adapter/contract | `cleanup_required`, retain locator |
| `provider_refused` | authenticated definitive refusal; bounded code only | `cleanup_required`, retain locator |
| `outcome_unknown` | timeout/network/5xx/malformed/missing config, Workpool failure/cancel, process loss, or unclassified result | `cleanup_required`, retain locator |

On applied terminal `revoked|cleanup_required`, clear current work/command/request fields and retain existing last-command/digest for exact late-callback replay. Expose owner-authenticated `retryOwnerCleanup` beside `revokeOwner`; client supplies only connection ref + owner command identity. It authorizes persisted owner/business and derives every adapter/authority field. It first checks the bound Workpool status: pending/running remains bound; a finished/missing work item is not replaced until a bounded callback grace deadline has elapsed and the row is still nonterminal. Then it increments cleanup attempt, derives a new AE command/work ID while retaining the stable provider revocation idempotency identity, and atomically enqueues/rebinds. Old callbacks fail work-ID equality. Retry is allowed only for current local `detached|unsupported` behavior or a future adapter whose admitted contract proves provider idempotency/retrieval.

Current adapters remain narrow:

- Canonical credential-less `x402-fetch:v2` has no remote revocation primitive; domain-authorized `detached` invalidates AE leases/authority and is never called provider revocation.
- Every other current binding without a persisted cleanup contract returns `unsupported` and retains its locator in `cleanup_required`.
- A future OAuth/provider adapter requires persisted target/method/protocol, server-held auth, bounded parser, stable provider identity, and exact outcome mapping. Never infer RFC 7009/cleanup targets from operation URLs.
- Never weaken active invocation credential resolution or expose a generic credential lookup.

### 6.8 Real Stripe boundary without a second ledger

Add the official `stripe` Node SDK plus official `@stripe/stripe-js` and `@stripe/react-stripe-js`. Use Stripe's recommended Checkout Sessions API with the Payment Element: `ui_mode:'elements'` and `CheckoutElementsProvider` from `@stripe/react-stripe-js/checkout`. Do not mount Elements or implement checkout state by hand. One server-only adapter implements narrow Stripe boundaries; Stripe owns API serialization, authentication, signature verification, and payment-method state. AE remains the money, evidence, idempotency, allocation, and reconciliation authority.

Clean-cut the current ports to the exercised contracts; do not pretend Connect currently covers Transfers:

```ts
type CreditPaymentSession = Readonly<{ evidence: CreditPaymentEvidence; clientSecret: string }>
type CreditPaymentPort = Readonly<{
  createOrRecoverCreditPayment(input: CreditPaymentRequest & { boundExternalRef?: string }): Promise<CreditPaymentSession | MoneyRefusal>
  readCreditPayment(input: { externalRef: string; idempotencyKey: string }): Promise<CreditPaymentSession | MoneyRefusal>
}>
type ConnectAccountPort = Readonly<{
  createConnectAccount(...): Promise<...>
  createOnboardingLink(...): Promise<...>
  readConnectAccount(input: { businessId: string; stripeAccountId: string }): Promise<ConnectAccountEvidence | MoneyRefusal>
}>
type PayoutTransferPort = Readonly<{
  createOrRecoverTransfer(input: PayoutTransferRequest & { boundExternalRef?: string }): Promise<PayoutTransferEvidence | MoneyRefusal>
  readTransfer(input: { externalRef: string; idempotencyKey: string }): Promise<PayoutTransferEvidence | MoneyRefusal>
}>
```

The omitted `...` in the retained Connect methods means their current exact signatures remain; implementers do not invent a new generic provider interface. `PayoutTransferRequest` contains only payout/command identity, destination account ID, exact amount/currency, input digest, and stable scoped idempotency key. `PayoutTransferEvidence` contains provider `stripe`, transfer ID, exact destination/amount/currency, `pending|succeeded|failed|outcome_unknown`, request/evidence digests, and observed time. `CreditPaymentEvidence`/durable rows exclude the client secret. `CreditPaymentSession` is server-only and returns the secret only to the authenticated owner over `Cache-Control:no-store`; it never enters Convex args/rows, logs, analytics, receipts, or domain digests.

**Top-up flow**

1. Authenticated owner reserves `moneyTopupCommands` before provider I/O with command ref, AE amount, fee, charge amount, account/principal, input digest, AE idempotency key, and state. The command ref is included in Stripe metadata/client reference.
2. `createOrRecoverCreditPayment` sends one byte-identical `mode:'payment'`, `ui_mode:'elements'` Checkout Session create request with exact one-time line item, currency, AE command metadata, return URL, and scoped Stripe idempotency key. If a bound Session ID exists it retrieves that Session. If create succeeded but its response/bind was lost, the server reissues the identical create with the **same** key within Stripe's documented idempotency retention and recovers the original response/ID, then binds it. Any request-material change conflicts. After the retention window, an unbound command stays `outcome_unknown` pending a matching signed webhook/manual provider evidence; no new key/Session is created.
3. Bind Session ID/evidence before returning `clientSecret`. Browser confirmation/return is non-authoritative and uses `CheckoutElementsProvider`.
4. Replace `CreditTopupWebhookEvent` with a strict `StripeMoneyWebhookEvent` union: paid/failed/expired Checkout observations plus `account.updated`. Every variant includes event ID/type/created time/payload digest and exact provider object identity. Checkout variants include command ref, Session ID, payment ID when present, status, exact amount/currency, and metadata digest. Account variants include Stripe account ID; readiness facts come from exact account retrieval, not the event payload alone.
5. Route verification uses bounded raw body plus Stripe `constructEvent`. The trusted server then calls a named source-admitted Convex action `moneyLedger:applyVerifiedStripeEvent`, deriving an existing source-write HMAC assertion from event/payload digest. That action verifies source admission and invokes internal mutations; only it may set the internal `providerSignatureVerified:true` proof bit. Delete any public/injected caller that can supply that literal.
6. Paid success accepts only `checkout.session.completed` with `payment_status:'paid'` or `checkout.session.async_payment_succeeded`. Retrieve/expand the exact Session and validate event ID/digest, command metadata, mode, payment status, amount, currency, and payment reference. Because the command ref was durable before create, a webhook racing the Session-bind response may atomically bind the matching Session and apply credit. If the command is temporarily unavailable, return retryable 503 with `Retry-After`; do not map `credit_topup_pending` to permanent 409. A 2xx is returned only for applied/replayed/explicitly irrelevant events.
7. `moneyStripeEvents` owns event ID+payload-digest replay/conflict. Apply exactly one top-up transaction/account version increment; credit equals requested credit, while Session total includes the separately recorded fee. A success is immutable. Failed/expired observations update only a non-succeeded command after exact Session readback; stale failure cannot overwrite paid success, and a later exact paid readback may converge a prior uncertain/failed observation to succeeded under the same command.
8. Recovery with a bound Session uses `readCreditPayment`; unbound recovery uses the create-or-recover rule in step 2 or a matching signed event. Same event/command replays; no second Session or credit.

**Connect readiness**

1. Implement least-capability Stripe recipient configuration and persist one exact `(businessId,currency,stripeAccountId)` binding. Hosted onboarding link return never marks readiness.
2. `account.updated` is signature-verified, event-ID/payload-digest replay protected, and followed by `readConnectAccount`. Persist last event ID, payload digest, provider object digest, observed time, and account row version. The transition uses CAS and the retrieved current object so an out-of-order event cannot downgrade or fabricate readiness; same ID+digest replays, same ID+different digest conflicts, stale row version retries readback rather than overwriting.

**Payout transfer**

1. `beginPayoutTransfer` validates eligibility/idempotency, persists exact payout/account/amount/request digest/provider idempotency identity, and moves only to `transfer_pending`; it neither debits accrual nor produces `paid`.
2. `createOrRecoverTransfer` submits the exact Stripe Transfer request. On a lost response it reissues the byte-identical request with the same scoped Stripe idempotency key to recover the original response/ID, then retrieves that ID and validates destination/amount/currency. Any material mismatch conflicts. After the provider idempotency-retention window with no ID/evidence, remain `outcome_unknown`; never use a new key or blind second transfer.
3. Add `transfer_succeeded` to payout policy. `completePayoutTransfer` alone accepts verified transfer identity/evidence and atomically debits exact provider accrual while moving `transfer_pending|outcome_unknown → paid`. Same command/transfer/evidence replays; mismatch conflicts. Delete the current path where `releasePayoutAccrual` reaches paid before provider I/O.
4. Definitive provider refusal/failure returns `transfer_pending` funds to the appropriate held state without debit. Add an authenticated exact `not_released|failed` reconciliation transition from `outcome_unknown` back to held; success from unknown uses `transfer_succeeded`; continued ambiguity remains unknown. Every path is idempotent and no second transfer request is issued.
5. Preserve conservation after every transition: buyer debit = supplier gross accrual = provider net accrual + AE rake; provider net = paid out + held. Stripe objects are foreign evidence, never the AE ledger.

Preserve the live-money compliance gate. Missing counsel signoff or partial/mode-mismatched Stripe configuration fails before provider call or ledger mutation. Add Stripe secret/webhook/publishable/Connect requirements to the existing deployment manifest.

Evidence ceilings are explicit:

- Stripe test mode proves SDK Checkout/Elements/webhook/Connect/Transfer mapping, idempotent create-or-recover behavior, event ordering/replay, and pure canonical transitions. The production `assertLiveMoneyReady` gate stays closed; test events do not claim production-gated ledger credit.
- A non-production full-ledger certification is allowed only through an explicit deployment-scoped test-money policy owned by the existing live-money gate, unreachable when `NODE_ENV=production`, and labelled test evidence.
- Real credit/payout/conservation closure requires the live-money block in the same hosted receipt, with counsel/configuration/spend gates open and actual Stripe object readback.

### 6.9 Strict hosted release receipt

Define/export one `GatewayProductionSmokeReceiptSchema` in `tools/release/operation-gateway-production-smoke.ts`. Reuse `exactAmountSchema`, canonical operation result/usage schemas, `PublicOperationAuthentication`, and add strict `CreditActivityViewSchema`, `KeyUsageViewSchema`, `CreditAccountViewSchema`, and `ProviderEarningsViewSchema` beside those public types in `src/modules/money/public.ts`; Convex return validators remain platform-required mirrors. Delete loose smoke-only schemas.

Every digest/ref uses the existing bounded canonical ref/digest schemas; every amount below is `ExactAmount` validated by `exactAmountSchema`; counts/generations are nonnegative/positive safe integers as appropriate. Exact wire projections:

```ts
type StrictCallReceipt = Readonly<{
  transport: 'http' | 'mcp'
  serviceId: string
  principalDigest: string
  operationRef: string
  invocationRef: string
  attemptRef: string
  terminalState: 'completed'
  effectGeneration: number
  inputDigest: string
  outputDigest: string
  evidenceDigest: string
  usageDigest: string
  charge: { activityRef: string; chargeState: 'free_tier' | 'paid'; grossAmount: ExactAmount; priceDigest: string }
}>
type StrictLiveTopupReceipt = Readonly<{
  topupCommandRef: string; buyerPrincipalDigest: string; checkoutSessionDigest: string; paymentObjectDigest: string
  stripeEventId: string; stripePayloadDigest: string; transactionRef: string
  creditAmount: ExactAmount; processingFee: ExactAmount; chargeAmount: ExactAmount
  buyerBalanceBefore: ExactAmount; buyerBalanceAfter: ExactAmount; replayAdditionalCredits: 0
}>
type StrictOperationChargeReceipt = Readonly<{
  controlInvocationRef: string; controlAttemptRef: string; buyerPrincipalDigest: string; supplierBusinessId: string; activityRef: string; transactionRef: string
  buyerDebit: ExactAmount; supplierGrossAccrual: ExactAmount; aeRake: ExactAmount; providerNetAccrual: ExactAmount
}>
type StrictLivePayoutReceipt = Readonly<{
  payoutRef: string; payoutCommandId: string; supplierBusinessId: string; payoutAccountRef: string; stripeAccountDigest: string; stripeTransferDigest: string; transferEvidenceDigest: string
  providerNetAmount: ExactAmount; providerHeldBefore: ExactAmount; providerHeldAfter: ExactAmount
  providerPaidBefore: ExactAmount; providerPaidAfter: ExactAmount; replayAdditionalDebits: 0
}>
type StrictConservationReceipt = Readonly<{
  buyerDebit: ExactAmount; supplierGrossAccrual: ExactAmount; aeRake: ExactAmount
  providerNet: ExactAmount; paidOut: ExactAmount; held: ExactAmount
}>
type GatewayProductionSmokeReceipt = Readonly<{
  schemaVersion: 1
  kind: 'operation_gateway_production_smoke'
  status: 'passed'
  observedAt: string
  deployment: { sourceRevision: string; vercelDeploymentId: string; vercelUrl: string; productionUrl: string; convexDeploymentId: string; convexUrl: string }
  smokeOwnership: { runId: string; namespace: 'ae-release-smoke'; businessId: string; offeringRef: string; publicationRef: string; ownerPrincipalDigest: string }
  discovery: {
    ownerServiceId: string; ownerOperationRef: string; ownerAuthentication: PublicOperationAuthentication
    controlServiceId: string; controlBusinessId: string; controlOperationRef: string; controlAuthentication: PublicOperationAuthentication
    ownerAuthority: { publicationRef: string; sourceDigest: string; contractDigest: string; bindingId: string; bindingDigest: string }
  }
  calls: { ownerHttp: StrictCallReceipt; ownerMcpReplay: StrictCallReceipt; controlHttp: StrictCallReceipt }
  usage: {
    baseline: KeyUsageView; afterOwner: KeyUsageView; afterReplay: KeyUsageView; final: KeyUsageView
    ownerActivity: CreditActivityView; controlActivity: CreditActivityView; replayAdditionalMeteredCalls: 0
    buyer: { baseline: CreditAccountView; afterOwner: CreditAccountView; afterReplay: CreditAccountView; afterControl: CreditAccountView }
    supplier: { baseline: ProviderEarningsView; afterControl: ProviderEarningsView; afterPayout: ProviderEarningsView }
  }
  money: { topup: StrictLiveTopupReceipt; operationCharge: StrictOperationChargeReceipt; payout: StrictLivePayoutReceipt; conservation: StrictConservationReceipt }
  refusals: { withdrawnOperationCode: string; revokedKeyCode: string }
  claimBoundary: 'one_smoke_owned_publication_one_owner_operation_one_paid_control_operation_one_live_topup_one_live_payout'
  receiptDigest: string
}>
```

`CreditActivityView` clean-cut adds `invocationRef`, `attemptRef`, and existing usage `priceDigest`; it does **not** copy provider evidence into money tables. Activity joins a call by invocation/attempt/operationKey/priceDigest/amount. The call's evidence digest comes from canonical operation status/readback. `operationCharge` binds the paid **control** invocation—current smoke owner publication is intentionally keyless/zero-price—to exact buyer debit, supplier accrual, rake, and provider net ledger entries. The owner/control calls, top-up command, and debit share `smokeOwnership.ownerPrincipalDigest`; `controlActivity.businessId`, `discovery.controlBusinessId`, accrual entry, `operationCharge.supplierBusinessId`, `payout.supplierBusinessId`, and the persisted payout-account/Stripe-account binding must all identify the same configured eligible control supplier. Same-amount rows from another principal/business cannot satisfy the receipt. Production supplier views must have `evidence:'source'` and `truncated:false`.

`verifyHostedCustomerRequestRelease` returns strict release readback including non-optional Convex URL/ID. The smoke treats configured Convex URL only as bootstrap, requires exact equality with returned identity, and instantiates all subsequent `ConvexHttpClient` reads against the returned URL. Public Services proves distinct service/operation/auth classes. Source/contract/binding digests come from the authenticated authoritative owner-publication readback, not from `ServiceEndpointDto`, and are tied to the public operationRef/publicationRef.

The smoke may mutate/withdraw only a disposable run-owned publication. Require reserved namespace `ae-release-smoke`, authenticated smoke owner/principal, configured smoke business/offering IDs, and a unique run ID in the operation/publication identity. Refuse any pre-existing publication, offering owner mismatch, non-smoke namespace, or publication not created by this run. Failure cleanup may touch only the exact run-created publication; never reuse/withdraw an ordinary production offering/publication.

Execution order and assertions:

1. Verify deployment/Convex identity and create/prove the run-owned publication plus distinct public owner/control services.
2. Under explicit spend consent, run one minimal live Checkout top-up; bind signed event/Stripe object digests to exact AE credit and prove event replay adds `0` credit.
3. Snapshot strict key usage, buyer credit, supplier earnings, and activity. Invoke the zero-price owner operation over HTTP; require canonical completed result and exactly one joined activity row.
4. Replay identical owner operation/key/input over MCP; require the same invocation/attempt/input/output/evidence/usage digests, no new activity, identical buyer/supplier snapshots, unchanged paid/free/gross totals, and literal `replayAdditionalMeteredCalls:0`.
5. Invoke the paid provider-backed control operation with a distinct key. Join its exact activity/ledger rows and prove buyer debit = supplier gross accrual = provider net accrual + AE rake.
6. Release that eligible supplier accrual through the two-phase payout; bind retrieved live Transfer digest/evidence to exact held/paid deltas, prove payout replay adds `0` debit, and prove provider net = paid out + held.
7. Withdraw only the run-owned owner publication and prove exact refusal; revoke the smoke key and prove exact refusal.

Receipt output is immutable. `--receipt` must resolve beneath repository `output/release/`; reject any other path and any existing destination. Write a same-directory temp with `open(...,'wx')`, fsync/close, publish with exclusive atomic `link(temp, destination)` (fail on `EEXIST`), and remove only that owned temp. Build without `receiptDigest`, compute `canonicalDigest` over exactly those fields, strict-parse, write, read back, require one JSON value plus whitespace EOF, reparse, and recompute. Stdout is human progress only.

Add `tools/release/validate-operation-gateway-production-smoke-receipt.ts` and package command `test:release:hosted:gateway:validate -- <receipt-path>`. It accepts exactly one positional path, performs no network/provider calls and no writes, reads UTF-8, requires one strict JSON value/whitespace EOF, validates the shared schema and digest, and exits nonzero on argv/path/read/JSON/schema/digest/trailing-byte failure. Workflow calls this `tsx` entrypoint directly; it does not parse an npm wrapper's stdout.

Ordinary CI runs schema/writer/negative fixtures and never spends. In `.github/workflows/kernel-release-gate.yml`, the existing main-push hosted job must not call this live smoke. Add a separate `workflow_dispatch` input `confirm_live_spend:boolean` default false and exact fixture/amount inputs; the live job has `if: github.event_name == 'workflow_dispatch' && inputs.confirm_live_spend == true`, production environment approval, code-enforced amount cap, and no schedule/PR/push path. It invokes smoke with `--receipt`, independently validates, and uploads that one JSON once with `actions/upload-artifact@v4`; no `tee`, stdout capture, duplicate upload, attestation, or proof dashboard.

## 7. Ordered implementation sequence

The ordering below is source-dependency order. It is not product sequencing. Within a wave, slices may run concurrently against the stated contracts.

### Wave 0 — Establish a truthful executable baseline

#### 0A. Repair the local launcher

**Files:** `tools/dev/local-dev.mjs` and its focused tests.

**Change:** Add the installed Convex CLI's `--local-force-upgrade` to the managed local launcher. Installed source proves force/non-TTY chooses data **transfer**, not reset; this removes both interactive prompts. Parent timeout/failure must terminate both Convex and Vite process trees and report the failing child. Never reset/delete default local data. If transfer exposes a genuinely retired/schema-incompatible dataset, use the already-proven isolated `/tmp` backend procedure rather than weakening validators or wiping it.

**Acceptance:** Under exact Node 22, ordinary `npm run dev:local` reaches both Convex readiness and Vite readiness without a prompt, or exits bounded with the real child error; SIGINT leaves neither child running. This closes ENV-001 only when the live route is exercised, not when the launcher unit test passes.

#### 0B. Record baseline failures

Run the existing focused contracts before edits: answer turn, answer agent/checkpoint, OAuth, MCP, operation recovery, provider connection, money, CLI, manifest projection, and release-smoke schema. Capture only command/outcome/source revision in the implementation change or CI receipt—not a new report file.

### Wave 1 — Close authority and durable-convergence defects

#### 1A. Protect OAuth hash reads

**Files:** `convex/agentAccessOAuth.ts`, `src/lib/server/agent-access-oauth-store.ts`, existing OAuth tests.

Apply §6.4. Reuse the source-write admission helper; delete direct public hash read. Preserve device/user-code polling, one-time delivery, PKCE, client metadata, and bounded token errors.

**Acceptance:** unauthenticated/direct hash read fails; admitted server store succeeds; cross-source and tampered admission fail; token issuance/replay/expiry/revocation tests remain green.

#### 1B. Make Answer finalization atomic and checkpoints monotonic

**Files:** `src/modules/answer-thread/internal/answer-turn-finalization.ts`, `src/modules/answer-thread/internal/answer-tool-use-agent.ts`, its canonical descriptor resolver/tool runner, `src/modules/answer-thread/internal/turn-orchestrator.ts`, `src/modules/answer-thread/answer-thread.functions.ts`, `convex/answerThreads.ts`, `convex/harnessSessions.ts`, `tests/helpers/answer-thread-test-port.ts`, existing checkpoint/finalization/agent/local-E2E port tests.

Apply §§6.1–6.2. Replace split answer/harness persistence with one finalization mutation and clean-cut every source/test/local-E2E caller. Add expected-generation finalization, parent-digest step lineage in all three checkpoint ports, and descriptor-bound normal tool-loop continuation on resume. No second checkpoint table, queue, or workflow.

**Acceptance:** a two-tool turn reaches step 2 and atomically terminal/finalized persistence; injected process loss before the finalization mutation leaves no partial answer and same-key retry completes; injected lost response after commit exact-replays the finalized turn/harness without duplicate rows; no durable `answer_persisted` intermediate remains; a stopped or generation-stale reservation conflicts and cannot finalize. Same-step replay is idempotent; stale/lower/skipped/wrong-parent/different-digest writes refuse; two concurrent forks cannot both advance; a fresh worker revalidates the descriptor digest, seeds prior results, resumes the normal loop at the latest checkpoint, and performs zero prior external calls; descriptor drift fails before a new tool call.

#### 1C. Make provider cleanup converge

**Files:** `src/modules/capability-supply/provider-connection.ts`, `src/modules/capability-supply/internal/convex-schema.ts`, `convex/capabilityProviderConnections.ts`, new `convex/capabilityProviderConnectionCleanup.ts`, existing `convex/customerRequestRouteWorkpool.ts` instance, owner provider-connection server seam for `retryOwnerCleanup`, and focused domain/Workpool callback tests.

Apply §6.7 using the existing Workpool and MutationCtx same-transaction enqueue/binding. The new file contains the strict action + total `onComplete`; `revokeOwner` owns work-ID/request-digest binding and the existing cleanup-result command owns convergence. Do not add a component, credential vault, connector registry, inferred URL, or scheduler loop.

**Acceptance:** explicit credential-less x402 cleanup returns authenticated local `detached`, reaches `revoked`, clears its locator, and is not described as remote provider revocation; every undeclared connection class reaches `cleanup_required` and retains its locator; replayed already-pending revocation has one transactionally bound Workpool job; owner retry is authorized/state-gated and replaces only a terminal failed/canceled/missing job; cleanup uses a distinct command ID; missing/canceled/failed Workpool jobs, malformed bounded result, mismatched request digest, illegal `detached`, and stale job/token/generation/authority fail closed; >1,000 active leases paginate to zero before cleanup; no secret/provider error text enters args, rows, logs, or receipts. A protocol-specific test adapter proves `revoked|already_revoked|provider_refused|outcome_unknown` classification, but real remote success is not claimed until an admitted provider cleanup contract is exercised.

#### 1D. Close or delete the unproved `raw Error.message` finding

Reproduce WGA-008 with a concrete current producer/attacker-controlled secret. If reproduced, project an existing bounded refusal code at `workTree` source and Convex boundaries. If no concrete producer exists, close WGA-008 as unsupported inference and make no source change. Do not add a speculative global sanitizer.

### Wave 2 — Make the basic Answer task finish and recover

#### 2A. Stabilize server lifecycle and 503 semantics

**Files:** `tools/dev/local-dev.mjs`, current local env propagation, and existing Answer route/rate-limit tests. Touch `src/routes/api.answer.turn.ts` or `src/lib/server/rate-limit.ts` only if the configured live reproduction proves a source classification bug.

- Start Vite only after Convex is ready; do not keep advertising readiness after a child dies.
- Preserve the existing Convex-backed HTTP rate-limit mutation. Supply the current Convex URL/admin/source configuration through the launcher; use the existing explicit local-E2E bypass only in its declared non-production mode. Do not replace cross-instance admission with a process-local queue or silently bypass it.
- Preserve 429/`Retry-After` for a real rate-policy refusal. Missing/misconfigured/unavailable Convex source remains an honest typed 5xx before reservation; model/provider failure remains a typed post-reservation terminal/recoverable outcome.

**Acceptance:** configured local source plus declared local auth mode lets a one-turn Ask reach a typed terminal frame; repeated same-key submission replays; forced rate policy produces 429; missing Convex URL produces the current typed configuration failure; killed Convex/model dependency produces an honest source/terminal error. No test-only admission bypass is reachable in ordinary production configuration.

#### 2B. Persist and resume the client draft

**Files:** `src/components/ae/chat/AeChat.tsx`, `src/modules/customer-request/agent-navigation.ts`, existing chat/browser tests.

Apply §6.1. Retain URL-query initialization as highest precedence; add the validated stored-draft fallback that preserves a manually entered bare `/t/new` ask. Preserve explicit new-question/discard behavior.

**Acceptance:** submit on bare `/t/new`, abort/reload before terminal, reload, and continue with the same visible query and `clientTurnKey`; no second reservation/turn appears; terminal success clears the draft; explicit discard clears it.

#### 2C. Browser-smoke the real user path

Under Wave 0's local runtime: submit a normal ask, observe `/t/new → /t/<threadId>`, at least one operation/tool trace when appropriate, terminal prose, durable readback after reload, Stop acknowledgement, and same-key replay. Also terminate the Answer worker after checkpoint 1 of a deterministic two-tool scenario, restart it, and prove it resumes at checkpoint 2 without repeating tool 1 or creating a second turn. This is the minimum proof for ENV-001/WGA-001/WGA-009; unit tests alone do not close them.

### Wave 3 — Derive every public contract from runtime owners

#### 3A. Create the leaf operation route contract

**Files:** `src/modules/capability-execution/operation-invoke-entry.ts`; `src/routes/api.v1.operations.execute.ts`, `api.v1.operations.$invocationRef.ts`, `api.v1.operations.$invocationRef.cancel.ts`, `api.v1.operations.$invocationRef.reconcile.ts`; `src/modules/capability-execution/operation-invoke.ts:OperationInvokeStatusResult`; `operation-recovery.actions.ts:operationInvokeStatusResultSchema` plus canonical reconciliation evidence schema; `src/modules/capability-execution/internal/convex-schema.ts:statusResultValue`; `convex/capabilityOperationInvocations.ts:readInvocationStatus`; `convex/capabilityOperationInvocationWorker.ts:recover/completeWork` plus the new pure projection/repair symbol; action registry and focused route/recovery tests.

Define invoke/status/cancel/reconcile method/path/media/header contracts once and consume them in handlers and projections. In this packet, clean-cut the canonical status result through its TypeScript type, Zod action schema, Convex validator, worker/read projection, and reconciliation mapping so optional latest `effectGeneration` is available everywhere; make status a pure read matching `readOnly:true`. This is a data contract, not a generic router framework.

#### 3B. Generate skill, UCP, manifest, and CLI descriptions

**Files:** `src/modules/discovery/internal/agent-skill.ts`, `src/modules/discovery/internal/site-manifest.ts`, `src/modules/discovery/internal/discovery-files.ts`, `src/modules/registry/internal/service-projection.ts`, `src/modules/registry/internal/services-api-projection.ts`, `src/modules/registry/registry.actions.ts`, `src/modules/actions/index.ts`, CLI manifest/action renderers.

Apply §6.3. `ae.access` accepts/emits only the actual DTO enum; direct keyless execution and gateway execution remain distinct. Delete hand-copied `ae_operation_*` arrays and the invalid `open` guidance.

#### 3C. Align OAuth protocol documentation with validators

Use the final SDK adoption matrix from §9. Render actual device authorization/token/client registration/token endpoint payloads and exact OAuth error vocabulary from the validator/handler schemas. Do not document routes/features the app does not expose.

**Acceptance for Wave 3:** a single table-driven conformance test enumerates runtime route/tool/action/schema owners and asserts generated surfaces resolve to them; every emitted example passes the runtime parser; no unknown MCP tool is generated; no public guidance says `ae.access:'open'`; operationRef and direct-URL recipes cannot be confused.

### Wave 4 — Expose existing recovery to real operators

#### 4A. CLI recovery

**Files:** `tools/ae/commands/invoke.ts`, new command files only where the current one-command-per-file CLI convention requires them, `tools/ae/cli.ts`, existing output/manifest helpers and CLI tests.

Apply §6.5 using existing `OperationInvokeService` schemas and RFC 9457/CLI output helpers. Do not build a second client framework or call action internals in-process.

**Acceptance:** accepted→status→terminal; accepted→cancel; reconciliation-required→validated reconcile→terminal; timeout prints actionable durable identity; process restart recovers with the printed invocation/key; `--json` is one parseable value; human mode keeps progress/errors on stderr.

#### 4B. Owner console recovery

**Files:** `src/modules/money/public.ts`, `src/modules/money/internal/query-projections.ts`, `convex/moneyLedger.ts`, the Wave 3 canonical status type/schema/validator/pure read projection, `src/lib/server/operation-invoke-api.ts`, owner source functions beside the existing approval functions, `src/modules/customer-request/agent-access-console.ts`, `src/components/ae/console/AeAgentOperatorConsole.tsx`, operator route, focused auth/projection/component tests.

Apply §6.6. Reuse existing status/cancel/reconcile worker and approval seam. Do not expose provider endpoint/input/credentials or add polling by default.

**Acceptance:** owner can inspect and state-valid recover one invocation; status is a pure read with no provider/money/control mutation while completion/explicit repair converges every formerly status-owned transition; wrong owner and signed-out caller get indistinguishable not-found; stale reconciliation effect generation is refused while a rotated/missing issuing grant does not strand owner recovery; explicit action refreshes the same row to terminal/updated state; 50-row list does not trigger 50 status reads.

### Wave 5 — Attach Stripe to the canonical money kernel

Wave 5 requires Wave 1 authority fixes and current money invariants, but may otherwise proceed independently of public-contract rendering.

#### 5A. Official SDK and one server adapter

**Files:** `package.json`/lockfile, new server-only `src/lib/server/stripe-money-provider.ts`, current `src/modules/money/internal/ports.ts`, `src/modules/money/server.ts`, deployment manifest/env validation, focused adapter tests.

Add only the official packages named in §6.8. Verify Stripe SDK support for the exact API version/account mode before pinning it. One adapter maps Checkout Session, webhook, Connect, and Transfer SDK objects into the cleaned narrow ports in §6.8 and strict domain observations. Keep every Stripe Node import server-only and every browser SDK import confined to the top-up component; no generic payment-provider layer.

#### 5B. Durable top-up reservation and verified Checkout webhook

**Files:** existing top-up domain, clean-cut `StripeMoneyWebhookEvent`/handler, Convex money command/event schema and `moneyLedger:applyVerifiedStripeEvent` source action/internal mutations, `src/routes/api.stripe.webhook.ts`, `src/modules/money/server.ts`, authenticated owner top-up function, `AeCreditTopUpPanel.tsx`, focused crash/webhook/UI tests.

Make reservation durable before provider I/O; implement create-or-recover by command/idempotency metadata, transient secret retrieval, webhook-before-bind convergence, and bounded unknown after provider idempotency expiry. Render with `CheckoutElementsProvider`. Replace the PaymentIntent event with the strict Checkout+account union. Wire Stripe `constructEvent` to the named source-admitted action; retry temporary pending with 503/`Retry-After`; remove publicly supplied verification literals. Preserve exact amount/fee/session/event ordering/replay/conflict rules.

#### 5C. Connect readiness and two-phase payout

**Files:** cleaned `ConnectAccountPort`/new `PayoutTransferPort`, current Connect/payout domain/policy, Stripe account event/readback schema, existing money Convex module/schema, owner payout UI/server seam, deployment manifest, focused ordering/conservation/recovery tests.

Implement §6.8 Connect event ID/digest/CAS/readback flow. Replace one-step `releasePayoutAccrual` with `beginPayoutTransfer` and `completePayoutTransfer`; add `transfer_succeeded` and unknown→held exact-not-released reconciliation; implement create-or-recover/read through `PayoutTransferPort` so provider I/O occurs only between transitions. Keep live gate closed until counsel and full configuration evidence are accepted.

**Acceptance for Wave 5:**

- Adapter/test-mode proof: official SDK creates/retrieves the same Checkout Session under the stable idempotency key; Payment Element confirms; the SDK verifies representative signed Checkout webhook payloads; paid/failed/expired events map to the strict union; duplicate event replays and altered duplicate conflicts in the pure/isolated money contract. This does **not** claim the production-gated Convex ledger credited while Stripe mode is `test`.
- Optional non-production certification deployment: if the existing live-money gate gains the explicit production-unreachable test-money policy described in §6.8, one test Checkout credits that deployment's ledger exactly once and is labelled test evidence.
- Connect test account: owner completes hosted onboarding and readiness changes only after verified event plus exact account readback.
- Payout adapter/policy: `beginPayoutTransfer` leaves funds held and state `transfer_pending`; only verified `transfer_succeeded` debits once and reaches `paid`; same identity cannot double-pay; provider refusal retains funds; forced ambiguous response becomes unknown and exact retrieval/reconciliation converges without a second transfer.
- Existing exact-money, charge/refund/reconciliation/conservation suites remain green.
- Missing/partial/mode-mismatched configuration and absent counsel block before network or ledger mutation.

### Wave 6 — Replace release theater with one strict receipt

#### 6A. Define the canonical receipt schema and writer

**Files:** `tools/release/operation-gateway-production-smoke.ts`, `src/modules/money/public.ts`, existing smoke tests, canonical operation invoke schemas, exact-money/digest helpers.

Apply §6.9. Export `GatewayProductionSmokeReceiptSchema`, strict `StrictCallReceipt`, the atomic file writer/readback verifier, and the standalone validator entrypoint from the smoke/schema owner. Add the four shared strict money view schemas named in §6.9 beside their canonical types; define every strict call/money projection exactly; remove loose smoke-only usage/result schemas. The validator is the separate file in 6C, not an export-only pseudo-entrypoint.

#### 6B. Bind every receipt field to hosted readback

**Files:** `tools/release/operation-gateway-production-smoke.ts`, `tools/release/verify-customer-request-release.ts`, Wave 5 Stripe adapter/money readbacks, existing release readback and smoke tests.

Return the strict hosted release readback instead of discarding it. Capture its revision/deployment identity, public Services identities/auth classes plus authoritative owner-publication source/contract/binding digests, canonical HTTP/MCP/control call results, strict before/after money activity, and the live top-up/operation-charge/payout/conservation block. Compare replay and exact per-invocation/activity/Stripe-object evidence as specified; do not infer success from config, aggregate counts, redirect returns, or `callCount >= N`.

#### 6C. Simplify the hosted workflow

**Files:** `.github/workflows/kernel-release-gate.yml`, `tools/release/validate-operation-gateway-production-smoke-receipt.ts`, `package.json` validator command.

Delete `tee` and npm-wrapper JSON capture. Keep ordinary CI source-only. Add the explicit manual, production-environment-approved live job from §6.9; only that job may invoke the smoke with required `--receipt output/release/operation-gateway-production-smoke.json`, run the exact one-argument no-network validator directly, and upload one receipt via `actions/upload-artifact@v4`. Use the existing release manifest/revision check; do not add a schedule, PR trigger, attestation, or second receipt.

**Acceptance:** a clean hosted process writes one JSON file; independent parse/digest verification passes; returned deployment/revision match; run-owned publication guard passes; owner/control calls are terminal; exact zero-price owner replay adds zero activity/metering/account change; the paid control row reconciles exactly to buyer/supplier/rake deltas; one minimal live top-up and payout bind verified Stripe object digests to exact AE entries, replay adds zero movement, and conservation holds; withdrawal and revocation refuse. Negative fixtures fail for malformed/trailing output, replay overmetering, stale deployment, wrong revision, missing/mismatched digests, wrong invocation linkage, duplicate activity, aggregate-only usage, top-up/payout replay movement, conservation mismatch, test-mode evidence in the live block, and a second uploaded receipt. Hosted execution waits for explicit spend/production consent and declared owner/control/money/configuration prerequisites; source schema/writer tests do not.

### Wave 7 — Reconcile repository authority and audit state

**Files:** `.planning/PROJECT.md`, `.planning/STATE.md`, `.planning/ROADMAP.md`, active Wayfinder status, `PAPERCUTS.md`, only current docs that made exact changed claims.

- Make `PROJECT.md` the sole current status/evidence-ceiling authority. Replace stale counters/revision IDs elsewhere with links or historical labels; preserve dates/history honestly.
- Update generated public guidance from Wave 3, not hand-edited prose copies.
- Close PAPERCUTS rows only at their proof ceiling: source-fixed, locally exercised, Stripe-test certified, or hosted certified. Never mark hosted money/payout/value exchange resolved from unit or local evidence.
- Archive or delete redundant generated Markdown only when it has no active consumer; do not perform a vanity Markdown-count cleanup.

**Acceptance:** current status sources do not contradict each other; every closed WGA/SG row links to the code/command/receipt that proves its stated ceiling; a fresh clone can run source gates without ignored local artifacts or `agent://` history.

## 8. Verification and evidence ladder

### 8.1 Focused source gates

Run under the repository-required Node 22:

1. existing TypeScript check and Convex codegen dry-run after each Convex/schema wave;
2. focused unit files for answer reservation/checkpoint, OAuth grant/client/source admission, MCP naming/parity, operation invoke/recovery, provider connection cleanup, money exactness/conservation/webhook, CLI output, and release receipt;
3. scoped lint on changed files;
4. existing kernel-retirement/import-boundary/TypeScript-standard gates where the changed module participates.

Add a test only for a new observable contract. Do not add source-text tests, mock-only plumbing tests, dashboard snapshots, or a broad duplicate suite. External adapter tests use Stripe's SDK test mode/fixtures at the adapter boundary; canonical money tests remain pure.

### 8.2 Runtime gates

| Gate | What it proves | What it does not prove |
|---|---|---|
| exact-Node local stack | launcher lifecycle and current source deployability | hosted revision/payment |
| browser Answer smoke | ask→thread→terminal→reload/replay/Stop | arbitrary model/provider reliability |
| CLI local smoke | durable identity and recovery ergonomics | hosted bearer policy |
| provider cleanup local smoke | lifecycle convergence/fail-closed behavior | undeclared remote revocation |
| Stripe test mode | SDK serialization, signed Checkout event mapping, idempotent Session/Transfer retrieval, Elements/Connect behavior, and pure money transitions | production-gated Convex credit, live funds/compliance |
| hosted gateway receipt with live-money block | exact deployed discovery/invoke/replay/meter/revoke/withdraw plus one live top-up/charge/payout and conservation lane | general customer value, all providers, or market-wide success |

### 8.3 Closure mapping

| Finding | Minimum honest closure | Current disposition |
|---|---|---|
| ENV-001 | local launcher reaches Convex+Vite and browser route under exact Node 22 | source-fixed/local-verified |
| WGA-001 | reload/abort resumes the same durable ask/turn key without duplicate turn | source-fixed/local-verified |
| WGA-002 | generated Service access/execution/credential-owner guidance equals canonical DTO and examples parse | source-fixed/local-verified |
| WGA-003 | generated MCP names equal `mcpToolName(listMcpActions())` | source-fixed/local-verified |
| WGA-004 | generated OAuth registration/device/token payloads validate and the device flow executes | source-fixed/local-verified |
| WGA-005 | CLI emits/accepts the invocation idempotency key before network I/O and restart reuses it | source-fixed/local-verified; explicit caller key is emitted to stderr before network I/O |
| WGA-006 | generated invoke/status/cancel/reconcile REST docs parse and focused route smoke passes | source-fixed/local-verified |
| WGA-007 | unauthenticated hash read fails; admitted server flow succeeds | source-fixed/local-verified |
| WGA-008 | reproduced bounded projection fix, or ledger row closed as unsupported inference | closed—unsupported inference; no secret-bearing producer established |
| WGA-009 | two-tool/fresh-process monotonic checkpoint proof | source-fixed/local-verified |
| WGA-010 | CLI status/cancel/reconcile scenarios pass after timeout/restart | source-fixed/local-verified |
| WGA-011 | owner-auth status/action/cross-owner/N+1 behavior passes plus browser exercise | source-fixed/local-verified |
| WGA-012 | hosted receipt proves exact per-invocation usage and zero-meter replay | source-fixed/local receipt contract; hosted proof blocked |
| WGA-013 | CI independently parses and uploads the exact strict receipt | source-fixed/local parser/workflow; hosted artifact unproduced |
| WGA-014 | one current status authority; stale files historical or linked | source-fixed by repository-authority reconciliation |
| WGA-015 | receipt carries source revision/readback; current status no longer cites inaccessible reports as proof | source-fixed/local contract; hosted receipt unproduced |
| SG-017 | lifecycle converges to `revoked` or honest `cleanup_required` for every current connection class | source-fixed/local-verified |
| SG-024 | source-fixed after official adapter + strict Checkout event + two-phase payout tests; optional non-production test-ledger certification labelled as such; only the live-money block in the same hosted receipt closes real payment/payout | source-fixed/local-verified; live-money certification blocked |

### 8.4 Production proof preconditions

The hosted lane fails closed until all exist:

- explicit production consent and exact canonical Convex/Vercel target;
- Node 22 runtime;
- Clerk owner/browser auth and separate gateway issuance/consumer secrets;
- current Convex deployment and public release manifest;
- configured model/provider source and fresh owner OpenAPI source material;
- Stripe mode-matched secret, publishable key, webhook secret, Connect configuration, and accepted legal/compliance gate for live money;
- provider cleanup contracts/secrets only for providers claimed remotely revocable;
- manual production-environment approval, `confirm_live_spend:true`, provisioned operator/supplier money accounts, a discoverable provider-backed control operation, and the hard-capped live amount for the receipt run.

Missing prerequisites block certification, not source implementation. Never turn them into a bypass.

## 9. Required library reuse decisions

### 9.1 Installed `@modelcontextprotocol/sdk@1.30.0`

**Decision:** adopt its public shared OAuth schemas as wire-shape parsers; reject its Express server/router/handlers for AE. This reuses the standard without displacing AE's Web `Request → Response`, source-write authority, owner consent, device flow, Clerk issuance, durable Convex CAS, scopes, or one-time delivery.

Use explicit public `.js` imports only:

```ts
import {
  OAuthClientMetadataSchema,
  OAuthClientInformationSchema,
  OAuthClientInformationFullSchema,
  OAuthMetadataSchema,
  OAuthProtectedResourceMetadataSchema,
  OAuthTokensSchema,
  OAuthErrorResponseSchema,
} from '@modelcontextprotocol/sdk/shared/auth.js'
```

| SDK surface | Decision | Reason |
|---|---|---|
| shared client/metadata/token/error schemas used by current routes | reuse for first-pass/output wire validation | public Zod schemas; reduces copied RFC shape without advertising a revocation route |
| `clientRegistrationHandler` | reject | Express/body-policy/store contract differs; AE needs HTTPS/loopback, public-client, scope, source-write, rate, and durable ID policy |
| authorization/token handlers/provider | reject | Express; authorization code/refresh only; no owner consent authority, Clerk issuance, AE CAS, or one-time delivery |
| device authorization | unavailable | SDK token handler intentionally does not add device grants; AE keeps current flow |
| `mcpAuthRouter`/metadata router | reject | Express and hard-coded endpoint/grant/auth metadata would misstate AE routes/device support |
| bearer middleware | reject | Express `AuthInfo` scope/expiry check lacks AE owner/application/environment/lifecycle/source authority |
| `redirectUriMatches` | retain only after a separate equivalence proof | it relaxes loopback port matching; must not silently weaken AE's exact stored redirect contract |
| OAuth error schema/classes | optional wire validation/mapping only | keep AE body caps, Retry-After, problem details, and typed availability errors |

SDK schemas are loose structural validators, not policy gates. Every registration parse is followed by existing AE semantic checks. Metadata output retains exact AE endpoints, device extension, scopes, and bearer method, then validates structurally. Do not import `@modelcontextprotocol/sdk/server/auth` (no public barrel), use extless paths, add Express as a direct dependency, or adopt an SDK OAuth store.

**Acceptance:** module import probe succeeds through the explicit `.js` path; generated metadata and registered-client bodies pass SDK schema plus AE policy; invalid redirects/scopes/auth modes still fail; device pending/slow-down/approval/token delivery remains unchanged; no SDK Express handler/router is reachable.

### 9.2 Installed Convex workflow/workpool components

- Answer checkpoint: use Convex row/OCC CAS; no Workflow, because recovery is deterministic row persistence, not a multi-action orchestration.
- Existing `WorkflowManager`: retain for Project Spine only; do not migrate unrelated Answer/provider/money state into it.
- Existing shared `Workpool`: reuse for provider cleanup. MutationCtx nested enqueue is in the caller transaction; bind returned work ID on the same row. Catch action errors and make `onComplete` total; `retry:false` unless an admitted provider contract proves idempotency.
- Existing rate limiter: retain for declared HTTP/source admissions. Do not use it as a durable workflow or substitute a process-local semaphore for cross-instance authority.

### 9.3 Stripe

Use official `stripe`, `@stripe/stripe-js`, and `@stripe/react-stripe-js`. Reject hand-written HTTP, signature parsing, event schemas, and manual Element lifecycle. Reject Convex Billing (wrong domain: subscriptions/customer billing, not AE exact-use ledger/Connect payout), x402 for fiat top-ups, a generic payment provider factory, and a second ledger.

### 9.4 Native/platform reuse

- `sessionStorage` for same-tab draft continuity; no IndexedDB/store package.
- `AbortSignal`, `crypto.randomUUID`, canonical digest/exact-money/RFC 9457 helpers already in repo.
- GitHub `actions/upload-artifact@v4` for one receipt; no custom artifact uploader/attestation.
- Stripe SDK idempotency and object retrieval for foreign-effect recovery; AE idempotency remains canonical domain identity.

## 10. Work packets, dependencies, and ownership

| Packet | Primary files/symbols | Depends on | May run with | Observable acceptance |
|---|---|---|---|---|
| P0 local runtime | `tools/dev/local-dev.mjs` `main/runConvex/runVite` | none | P1/P2/P3 source work | exact-Node local Convex+Vite/abort proof |
| P1 OAuth source read | `convex/agentAccessOAuth.ts:getGrantByHash`; `agent-access-oauth-store.ts:getGrantByHash` | source-write helper | P2/P3/P4 | direct read refused; admitted token flow passes |
| P2 Answer durability | atomic turn/harness finalization plus checkpoint lineage in Convex/source/local-E2E/test ports | none | P1/P3/P4 | crash-before/lost-response exact replay; two-step/fork/fresh-worker proof |
| P3 provider cleanup | provider row/cleanup command, `capabilityProviderConnections`, existing Workpool action/total callback | P1 authority shape | P2/P4 | x402 local detach converges revoked; undeclared class cleanup_required; one bound Workpool job |
| P4 WGA-008 disposition | WorkTree source/query projection | concrete reproduction | P1/P2/P3 | bounded fix or evidence-backed ledger closure only |
| P5 Answer server lifecycle | local launcher, Answer route, rate-limit seam | P0 | P6 after draft contract fixed | typed terminal/429/503 distinctions |
| P6 Answer client recovery | `AeChat`, agent navigation | §6.1 contract | P5 | bare `/t/new` reload resumes same key |
| P7 operation contract graph | exact Wave3A route/type/Zod/Convex/worker symbols plus action registry | none | P5/P6/P8 | pure-status/convergence and method/path/name/schema parity proof |
| P8 public projections | skill/site/discovery/registry/CLI manifest generators | P7, P1 SDK decision | P3/P5/P6 | all output derived and examples parse |
| P9 CLI recovery | invoke/status/cancel/reconcile commands | P7 | P10 | restart recovery/one-JSON proof |
| P10 owner recovery | money activity projection, source auth actions, console | P7 | P9 | owner-only state-gated browser recovery |
| P11 Stripe adapter/top-up | official deps, server adapter, cleaned Credit/Connect ports, new PayoutTransferPort, Checkout command/event/webhook/UI | money invariants, source auth | P8/P9/P10 | test-mode SDK/event/idempotency proof; no false production-ledger claim |
| P12 Connect/payout | account event/readback CAS plus begin/create-or-recover/complete payout transitions and Convex/UI | P11 | receipt schema work | readiness; no debit before verified transfer; one-transfer reconciliation |
| P13 strict receipt | production smoke/schema/writer, strict usage/live-money projections, release workflow | schema work: P7; hosted run: P11/P12 live wiring, provisioned operator+supplier accounts, payment-attempt port, live-money gate, fresh owner OpenAPI source material, discoverable provider-backed control operation, explicit spend/production consent | schema/writer work may run with P11/P12 | strict file parses/digests; hosted lane proves zero-meter replay and one live top-up/charge/payout conservation lane |
| P14 authority cleanup | PROJECT/STATE/ROADMAP/Wayfinder/PAPERCUTS/current docs | all relevant packets | none | no contradictory current claims; evidence ceilings exact |

### File-level coordination rules

- One owner at a time for `convex/schema.ts`, `convex/answerThreads.ts`, `convex/capabilityProviderConnections.ts`, `src/modules/money/public.ts`, `src/modules/actions/index.ts`, `package.json`, and `.github/workflows/kernel-release-gate.yml`.
- Exported symbol changes require references before edit and clean cutover across every caller. No compatibility aliases.
- Provider cleanup and money workers agree on the existing pool instance/mount before either changes `convex/convex.config.ts`.
- Public projection work consumes P7 contracts; it never invents provisional strings in parallel.
- Repository authority cleanup is last so status cannot outrun code.

### Focused test anchors

Prefer extending these existing behavior suites:

- Answer: `tests/unit/answer-thread/answer-turn-checkpoint.test.ts`, `answer-harness-operation.test.ts`, `tests/integration/answer-turn-session-auth.test.ts`, `answer-turn-ui-stream.test.ts`, `answer-rate-limits.test.ts`;
- OAuth: `tests/unit/server/agent-access-oauth-api.test.ts`, `tests/unit/routes/oauth-store-wiring.test.ts`, `oauth-metadata.test.ts`, `tests/unit/agent-access-oauth-state.test.ts`;
- MCP/operation: `tests/unit/server/mcp-api.test.ts`, `operation-invoke-api.test.ts`, `tests/unit/capability-execution/operation-invoke*.test.ts`;
- generated contracts: `tests/seo/agent-skill.test.ts`, `tests/unit/registry/services-api-projection.test.ts`;
- provider cleanup: `tests/unit/capability-supply/provider-connection.test.ts` plus one Convex worker contract;
- money: `tests/unit/money/stripe-adapter.test.ts`, `stripe-webhook.test.ts`, `tests/unit/convex/money-ledger-reconciliation.test.ts`, `tests/integration/supplier-money-readback.test.ts`;
- CLI: `tests/unit/market-terminal/cli-errors.test.ts` plus recovery command behavior;
- receipt: `tests/unit/release/operation-gateway-production-smoke.test.ts`.

## 11. Rejected alternatives

| Alternative | Rejection |
|---|---|
| Narrow the product/vision or choose a launch wedge | Explicitly outside this source-remediation plan; the architecture must support the fixed vision |
| Add a second registry, route manifest, docs DSL, or action catalog | Existing DTO/action/route owners already contain the truth; derive views |
| Adopt Convex Agent/Workflow for Answer turns | Current durable reservation/checkpoint/finalization semantics are stronger and already integrated; fix the CAS |
| Process-local retry queue/semaphore | Cannot own cross-process identity or recovery; current failure proves it is hostile |
| Generic resume endpoint/stream framework | Server idempotent replay plus one `sessionStorage` draft is sufficient |
| SDK Express OAuth router | Framework mismatch and feature/policy loss; shared schemas are the reusable part |
| Hand-written Stripe HTTP/signatures/Elements | Mature official SDKs exist; violates no-handroll |
| Convex Billing or a second money ledger | Does not model AE Qualified Use, exact money, supplier accrual, evidence, and reconciliation |
| Direct PaymentIntent integration | Stripe recommends Checkout Sessions + Payment Element for less application-owned checkout logic; no current AE invariant requires the lower-level API |
| Automatic provider revocation URL inference | Credential leak/SSRF risk and no standards proof; explicit trusted adapter only |
| Second Workpool or unbounded cleanup/payout retry | Existing Workpool already binds under MutationCtx; external effects may repeat, so retry only with stable identity/provider idempotency proof |
| Artifact attestation, proof dashboard, second ledger/receipt | Process proof inflation; one strict source-linked receipt is enough |
| Backward-compatible stale names/access values | Repo rules require clean cutover; stale callers must fail during migration |
| Broad Markdown purge | File count is not behavior; delete only unconsumed contradictions/redundancy |

## 12. Risks and fail-closed responses

| Risk | Required response |
|---|---|
| Local old deployment is incompatible | explicit official force-upgrade or isolated backend; never weaken schema or delete user data silently |
| Model/provider unavailable | durable accepted turn remains recoverable; honest typed terminal/503; no fake answer |
| Client storage unavailable | no new identity; surface recoverable client state and retain server key in memory |
| Concurrent checkpoint writers | Convex OCC + strict `s+1` parent-digest lineage; only one fork advances |
| SDK schema is loose or omits device fields | use only as structural layer; AE policy/extension remains authoritative |
| Provider cleanup outcome ambiguous | `cleanup_required`, retain opaque locator, no auto-retry |
| Stripe request times out after effect | `outcome_unknown`, retrieve exact object/event before any repeat |
| Webhook replay/tamper | SDK signature + event ID/payload digest/object/amount/metadata checks + atomic apply |
| Payout succeeds before local debit | transfer pending/unknown; retrieve exact transfer, then debit once; never issue another transfer blindly |
| Owner recovery leaks another principal | persisted owner authorization, indistinguishable not-found, bounded projection |
| Generated contract drifts | build/projection fails table-driven parity test against runtime owners |
| Hosted receipt claims wrong revision | public release readback mismatch fails the gate |

## 13. Definition of done

**Execution status:** source implementation is complete. Local gates cover the source and non-production parts of items 1–6 and 8–10. Item 7—and the real-money clause in item 6—remains externally blocked and unproved. Do not call the platform production-certified until the exact hosted receipt is produced and independently parsed.

This plan is complete only when all are true:

1. Exact Node 22 local stack starts and the real Answer path completes, reloads, stops, and replays without systemic 503 or duplicate turns.
2. Answer turn/harness finalization is one transaction; checkpoints have strict parent-digest lineage and are fresh-worker recoverable without prior tool replay.
3. OAuth hash reads require source admission; actual OAuth/device/MCP payloads and names are derived/validated against current schemas and handlers.
4. REST and MCP expose the same canonical operation recovery family; CLI and authenticated owner UI can use it with durable identities.
5. Provider revocation converges to `revoked` or an honest actionable `cleanup_required`; no secret crosses worker/log/receipt boundaries.
6. Official Stripe SDK test-mode Checkout/Connect/Transfer adapters, strict event mapping, idempotency, two-phase payout, and unknown-outcome recovery pass without claiming production-gated ledger credit; the live-money block in the same hosted receipt proves real money.
7. One hosted release receipt proves exact deployed revision, owner/control discovery, invoke, same-key replay with zero extra metering, exact usage/ledger readback, one live top-up/charge/payout with zero-movement replay and conservation, withdrawal, and revocation. CI parses and uploads that exact object.
8. Current repository status authorities and PAPERCUTS reflect the precise proof ceiling. No closure depends on an ignored report, `agent://` transcript, environment label, aggregate count, or source-only inference.
9. Focused tests, Convex codegen, scoped lint, typecheck, and applicable existing release gates pass on the final clean source snapshot.
10. No compatibility shim, second state machine/registry/ledger, hand-written protocol/Stripe machinery, fake provider/payment response, or unsupported production claim remains.

The final user-visible proof is not this plan. It is: a buyer asks; an admitted supplier operation is discovered and invoked; durable identity survives interruption; exact delivery/evidence/usage is read back; the buyer is charged once; the supplier accrues and receives one payout; a fresh process reads the complete result; revocation and withdrawal fail closed.


## 14. Source evidence index

This plan was derived from the then-current pre-implementation source, not ledger prose alone. The table below is historical problem evidence, not current status; `.planning/PROJECT.md` owns the current proof ceiling.

| Seam/finding | Pre-implementation evidence |
|---|---|
| Local launcher | `tools/dev/local-dev.mjs:9-22,35-71,86-140` starts Convex before Vite, requires Node 22, and lacks an explicit official force-upgrade path; the exact-Node baseline reached Convex's old-backend interactive prompt and never started Vite |
| Answer 503 | `src/routes/api.answer.turn.ts:89-117` maps admission/source errors before durable reservation; current live attempt returned typed 503 `queue_unavailable` |
| Browser reload loss | `src/components/ae/chat/AeChat.tsx:82-105,322-332,746-770` keeps `newChatDraft`/`liveTurn` in React state and session-persisted initial key only; manually entered bare `/t/new` has no query recovery |
| Answer split finalization | `answer-turn-finalization.ts:223-235` persists the answer, then `:238-286` separately finalizes harness evidence; `turn-orchestrator.ts:942-1043` performs those calls in distinct persist/report steps, leaving a committed `answer_persisted` crash window |
| Checkpoint conflict | `convex/answerThreads.ts:389-445` rejects a different generation/step/digest rather than allowing validated monotonic advancement; test port duplicates this contract |
| Service access mismatch | `src/modules/registry/internal/service-projection.ts:22-63` and `services-api-projection.ts:187-236` emit canonical `external`; `src/modules/discovery/internal/agent-skill.ts:53-56` currently teaches `open` |
| MCP name mismatch | `src/modules/actions/index.ts:123-131` derives `ae_${action.id.replace(/\./g,'_')}`; `src/modules/discovery/internal/site-manifest.ts:227-243` and agent prose contain copied names |
| OAuth source read | `convex/agentAccessOAuth.ts:12-20,98-110` exposes grant-by-hash without the source-write admission required by sibling reads; `src/lib/server/agent-access-oauth-store.ts:220-228` consumes it |
| OAuth protocol shape | `src/lib/server/agent-access-oauth-api.ts` owns bounded Web Request handlers, PKCE/consent/device/token delivery; installed `@modelcontextprotocol/sdk/dist/esm/shared/auth.js` exposes structural schemas, while `server/auth/handlers/token.js` supports authorization-code/refresh only and server handlers/router are Express-based |
| Existing REST recovery | `src/lib/server/operation-invoke-api.ts:450-499` exposes invoke/status/cancel/reconcile; `src/modules/capability-execution/operation-recovery.actions.ts:18-102,148-270` owns canonical status/cancel/reconcile schemas/actions |
| CLI recovery gap | `tools/ae/commands/invoke.ts:55-89,129-157` has invocation identity and a 60-second poll but discards it on timeout; `tools/ae/lib/output.ts:103-105` is the sole JSON printer |
| Owner projection gap | `src/modules/money/public.ts:286-305` defines activity/usage views without all recovery identity; `src/modules/money/internal/query-projections.ts:98-115` projects activity; `AeAgentOperatorConsole.tsx:110-185` renders aggregate/activity state without invocation recovery actions |
| Provider cleanup dead end | `convex/capabilityProviderConnections.ts:923-946` begins revocation and invalidates leases without dispatch; `src/modules/capability-supply/provider-connection.ts:343-370` preserves the opaque credential locator; `recordCleanupResult` exists as the convergence command |
| Existing Workpool | `convex/capabilityOperationInvocationWorker.ts:582-590` and `convex/customerRequestRouteExecution.ts:119-147` demonstrate existing `enqueueAction`/`onComplete`/retry contracts; installed `@convex-dev/workpool@0.4.9` is already declared |
| Money kernel vs adapter | `src/modules/money/internal/ports.ts:3-45` defines Stripe-shaped payment/Connect ports; `topup.ts:52-119` owns exact top-up/idempotency; `stripe-webhook.ts:8-52` owns bounded verified-event application; `package.json:70-128` has no Stripe SDK; `AeCreditTopUpPanel.tsx:8-24` is setup-refusal-only |
| Payout kernel | `convex/moneyLedger.ts:780-850` currently applies the release transition and debits account accrual in one mutation before any Stripe transfer adapter is wired; `payout-policy.ts:120-160` separates `transfer_pending` from later reconciliation but has no explicit verified `transfer_succeeded` action |
| Hosted proof defects | `tools/release/operation-gateway-production-smoke.ts:766-850` invokes HTTP/MCP and `:813-825` uses aggregate usage; `.github/workflows/kernel-release-gate.yml:219-231` pipes npm output through `tee` into a JSON-named artifact |
| Repository authority drift | `.planning/PROJECT.md:3-5,117-120`, `.planning/STATE.md:59,112-116`, `.planning/ROADMAP.md:18,195`, and active Wayfinder status disagree on current revision/completion/evidence ceiling |
| WorkTree inference | `src/lib/server/work-tree-agent-api.ts:290-297` can project caught error text; no current secret-bearing producer was established, so WGA-008 remains a disposition gate rather than planned machinery |

External pattern sources used only as mechanics references: AI SDK 7 installed docs/source for UI streams and tool loops; installed Convex Workpool/Workflow README/source for enqueue/callback/retry/OCC behavior; installed MCP SDK 1.30.0 public exports/source for OAuth adoption limits; Stripe's official Checkout Sessions + Payment Element, webhook signature, Connect, idempotency, and transfer semantics; GitHub's official artifact action; Brendan Gregg's USE Method. External products and libraries do not replace AE domain authority.
