# Data-flow delta — 2026-08-15

**Scope:** dirty tree + post-2026-08-12/14 map drift  
**Evidence ceiling:** source facts only

Companion for map maintainers. `PROMPT-DATA-FLOW.md` has substantial uncommitted edits (still dated 2026-08-12); `IA-DATA-FLOW.md` is unchanged on disk since 2026-08-12.

## Must-update in PROMPT-DATA-FLOW.md

- **Preflight symbol and callsite.** Primary export is `classifyAnswerRequestPreflight` (`src/modules/answer/internal/answer-query-safety.ts`); `classifyAnswerQuerySafety` is a legacy allow/refuse wrapper that drops route/intents/continuation. Orchestrator imports the preflight (`turn-orchestrator.ts`). Dirty PROMPT still names `classifyAnswerQuerySafety` in Flow A1, inventory, and USE rows — retarget to preflight + note wrapper.
- **Expanded Answer read-tool surface.** `ANSWER_READ_TOOL_IDS` now includes `registry.operations.detail`, `.compare`, and `.inspectPlan` (`answer-thread.schema.ts`, `tool-runner.ts`). Actions are defined from shared contracts in `src/modules/registry/operation-action-contracts.ts` and wired through `operations.actions.ts`. Flow A2 diagram/inventory still imply search-only market reads.
- **Interpretation-driven continuation (capability-agnostic).** `resolveKeylessDataAskFromInterpretation` rebinds a frozen operation only when preflight `continuation` is `refine_prior_operation` or `resolve_pending`; NL heuristics and domain-token scoring were removed from `keyless-data-ask.ts`. Flow A1/A5 and operation-continuation inventory should state interpretation authority explicitly.
- **Pending decision + continuation lineage.** New durable shapes: `AnswerPendingDecisionSchema`, `AnswerContinuationSourceSchema`, checkpoint fields for `requestedIntents`, `interpretation`, `pendingDecision`, `continuationSource` (`answer-thread.schema.ts`, `answer-turn-checkpoint.ts`). Dirty PROMPT invariants mention pending state; Flow A3 checkpoint bullets should list the new digest fences.
- **Operation-result privacy gate (pre-projection).** `decideAnswerOperationResultPrivacy` runs before model/stream/durable projection; forbidden key patterns yield `unsafe_output` with opaque evidence refs (`operation-result-presentation.ts`, `answer-tool-use-agent.ts`, `operation-artifacts.ts`). Dirty PROMPT cites presentation/sanitization but not the upstream privacy decision seam — add to Flow A3 and callsite inventory.
- **Multi-intent / one-native-input gate.** `AnswerRequestInterpretation.requestedIntents` is ordered; effect allowed only when one strict contract input covers every intent (`answer-schema.ts`, `answer-tool-use-agent.ts`). Partially in dirty PROMPT A2; tie explicitly to `requestedIntents` schema.
- **Contract input labels.** `labelForContractInput` projects customer annotation labels into tool UX (`contract-input-binding.ts`, `answer-tool-use-agent.ts`). Prompt-harness map should note annotation → model-visible label (not authority).
- **Deleted input composition module.** `operation-input-composition.ts` removed; no replacement import sites. Remove any stale references; input binding now lives in Answer orchestration + strict schema validation paths.
- **x402 settlement verification on operation invoke.** `capabilityOperationInvocationWorker.ts` wires `verifyExactEvmX402Settlement` (`x402-settlement-verifier.ts`), optional `AE_X402_RPC_URLS_JSON` RPC reads, and tri-state settlement (`settled` | `not_settled` | `unknown`) via `x402-payment-signer.ts` / `route-transport-runtime.ts`. Flow B3 x402 bullet and operation-invoke money coupling need settlement-status vocabulary (not just `observed` / `reconciliation_required`).
- **External invocation spend reservations.** New durable `moneyExternalSpendReservations` + internal mutations `reserveExternalInvocationSpend`, `finalizeExternalInvocationSpend`, `reconcileExternalInvocationSpend`, `reverseExternalInvocationSpend` (`money/internal/external-spend.ts`, `money/internal/convex-schema.ts`, `convex/moneyLedger.ts`). Worker reserves before x402 effect and finalizes/reconciles after transport (`capabilityOperationInvocationWorker.ts`). Absent from PROMPT Flow A authenticated path, Flow B3, and money USE row.
- **Operation invoke dispatch uncertainty.** `OperationInvokeDispatchResult` adds `outcome_unknown`; enqueue failures after dispatch may return `reconciliation_required` instead of hard refuse (`operation-invoke.ts`). Add to Flow A2 authenticated invoke seam and recovery taxonomy.
- **Eval packet counts.** Dirty PROMPT already bumps local packet to 13 cases / 22 model requests / 15 tool runs — verify `eval/answer/lib/cases.ts` and `output/eval/answer-suite-report.json` when refreshing Flow C.

## Must-update in IA-DATA-FLOW.md

- **§3 Money schema inventory.** Add `moneyExternalSpendReservations` row: reservation identity digest, grant/credential/budget linkage, states (`reserved` | `settled` | `released` | `outcome_unknown` | `reversed`), submission/settlement/reconciliation digests (`money/internal/convex-schema.ts`).
- **J4 step 4–6 (operation invoke → money).** Document external-spend reserve/finalize/reconcile/reverse on the invocation worker path before/after guarded x402 transport; link to `convex/capabilityOperationInvocationWorker.ts` and `convex/moneyLedger.ts`. J4 step 5 already mentions `reconciliation_required` — align with invoke `outcome_unknown` dispatch semantics.
- **J5 Customer Request x402 custody.** Route-mandate schema adds optional `reservationRef`, `paymentIdentityDigest`, `paymentSignatureDigest` on custody rows and `x402PaymentReconciliationEvidenceValue` (`route-mandate-convex-schema.ts`). J5 step 4 transport bullet should name reconciliation evidence packet fields.
- **J1 Answer thread.** Thread reservation/checkpoint now carries pending decisions and continuation sources; Answer read tools include market detail/compare/inspect-plan actions (§2 buyer routes + J1 step 3).
- **§2 Public catalog / agent discovery — MCP.** `createAeMcpServer` no longer registers ZodObject-only output schemas on tools; `tools/list` projects full canonical JSON Schema for union outputs (`mcp-api.ts`). `/for-agents` surfaces `MCP_LATEST_PROTOCOL_VERSION` from `src/lib/mcp-protocol.ts` (SDK passthrough).
- **§2 / J8 discovery manifests.** `RegenerateDiscoveryManifestOptions.adapter` is required; `ReadCatalogDiscoveryManifestResult` can return `{ kind: 'hidden', reason: ... }` including `unconfigured` (`discovery/public.ts`, `discovery.functions.ts`). Manifest readbacks are explicit degraded/hidden states, not silent empty manifests.
- **Registry action contracts.** Market operation HTTP/MCP/Answer actions centralize in `operation-action-contracts.ts` with `invocationContract` metadata (material paths, evidence class, invalidation). IA registry/discovery sections citing `operations.actions.ts` should point at the contract module as schema owner.
- **Services API wire semantics.** `registry.actions.ts` / `services-api-projection.ts` descriptions reframed from generic “service” to business-portfolio / external-endpoint-link language (projection-only; no new authority).
- **External run admin gate.** `externalRuns.inspectManifest` and `readReport` now require `read_admin_readbacks` (`convex/externalRuns.ts`) — J8 operator readbacks.
- **§6 USE / money resource row.** Extend taxonomy with external-spend states and x402 `settled`/`not_settled`/`unknown`; RPC URL config is config-gated (`AE_X402_RPC_URLS_JSON`).

## Unchanged / confirmed still accurate

- Convex authority spine, adapter rule, and evidence-class ceiling in both maps remain correct.
- Answer admission bounds (16 KiB body, `x-ae-turn-key`, 25 turns, 30 s lease) and `/api/answer/turn` as non-terminal stream adapter.
- Customer Request compile/preview/mandate/workpool/fence sequence (Flows B1–B3) — structure intact; x402 field additions are additive.
- Harness finalization via `convex/harnessSessions.ts` as source-owned settlement; browser reducer/readback pattern (`turn-stream-session.ts`, `use-answer-turn-lifecycle.ts`).
- OpenRouter as sole model gateway; `maxRetries: 0` on Answer model calls.
- Public market-operation HTTP routes remain read-only inspection (`api.v1.market-operations.*`); contracts do not grant invoke authority.

## Open unknowns (? / not in source)

- `buildSelfDescription` (`answer-thread/internal/self-description.ts`) has no callsites — capability self-description prose is not yet on the Answer data path.
- Live x402 EVM receipt fetch depends on `AE_X402_RPC_URLS_JSON`; without it, settlement verification path availability is config-gated, not proven.
- Aggregate utilization/saturation for external-spend rows, x402 RPC, and expanded Answer read-tool volume: no observation seam (`?`).
- Whether `classifyAnswerQuerySafety` remains a supported public API for non-orchestrator callers beyond the thin wrapper: only `turn-orchestrator` and tests observed importing preflight path.
- Hosted/live certification still requires named revision-bound receipt + durable readback; dirty-tree eval and integration tests are fixture/config classes only.

## Primary paths inspected

- `src/modules/answer/internal/answer-query-safety.ts` — structured preflight + legacy safety wrapper
- `src/modules/answer/internal/keyless-data-ask.ts` — interpretation-bound continuation rebinding
- `src/modules/answer/internal/operation-result-presentation.ts` — privacy decision + safe projection
- `src/modules/answer/internal/contract-input-binding.ts` — annotation label projection
- `src/modules/answer-thread/internal/turn-orchestrator.ts` — preflight-driven phases
- `src/modules/answer-thread/answer-thread.schema.ts` — pending decision, continuation, read tools
- `src/modules/registry/operation-action-contracts.ts` — canonical market read action contracts
- `src/modules/capability-execution/operation-invoke.ts` — `outcome_unknown` / reconciliation path
- `src/modules/capability-supply/route-transport-runtime.ts` — x402 settlement status fields
- `src/modules/capability-supply/internal/x402-payment-signer.ts` — @x402/core 2.18 decode/normalize
- `src/modules/capability-supply/internal/x402-settlement-verifier.ts` — EVM exact settlement guard
- `src/modules/money/internal/external-spend.ts` — reservation identity/state machine
- `src/modules/money/internal/convex-schema.ts` — `moneyExternalSpendReservations` table
- `convex/moneyLedger.ts` — reserve/finalize/reconcile/reverse mutations
- `convex/capabilityOperationInvocationWorker.ts` — external spend + x402 verify wiring
- `src/modules/customer-request/internal/route-mandate-convex-schema.ts` — x402 custody/reconciliation evidence
- `src/lib/server/mcp-api.ts` — MCP tools/list schema projection
- `src/modules/discovery/public.ts` — hidden manifest outcomes
- `convex/externalRuns.ts` — admin authority on manifest/report reads
- `.planning/codebase/PROMPT-DATA-FLOW.md` — dirty diff vs committed (2026-08-12 header)
