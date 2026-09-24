# `capabilityCallProjection` against the Quote standard

**Verdict: FAIL (checks 1–3); PASS (check 4, for the observed caller paths).** The registration façade is 873 lines (`convex/capabilityCallProjection.ts:1-873`), above the 200-line cap (`tests/imports/convex-facade-size.test.ts:10`), and is explicitly excepted at a pinned 874 lines (`tests/imports/convex-facade-size.test.ts:12-18`). Its only RPC registration is `listAgentSupplyCalls` at `convex/capabilityCallProjection.ts:856-873`; that registration still contains its own source-read, authentication, and listing handler body (`:859-871`). Most of the file instead houses exported worker types and execution/recovery code (`:55-854`). This is an audit, not a proposed refactor.

| Check | Quote | This file |
|---|---|---|
| Root is registration only | yes, ~75 lines (`convex/capabilityQuotes.ts:34-75`) | **No**: 873 lines; exported types `:55-154`, command adapter `:156-209`, recovery projections/persistence `:211-468`, parsing/finalization `:470-854`, inline RPC handler `:856-873`. Exception `tests/imports/convex-facade-size.test.ts:17`. |
| Lib is one concern per file | `convex/lib/capabilityQuotes/*` (`convex/capabilityQuotes.ts:3-32`) | **No**: no `convex/lib/capabilityCallProjection/` folder; existing partial splits are `convex/lib/callLifecycle/terminalProjection.ts:79-97` and `supplyCallsListing.ts:25-65,76-98`, while root retains unrelated concerns `convex/capabilityCallProjection.ts:55-854`. The neighboring `convex/lib/callLifecycle/dispatch.ts:39-55,95-210,268-367,369-427` is also mixed enqueue/claim/receipt projection/finalization, not a one-concern home for this root. |
| src/ imports the root | no (Quote root exports RPCs at `convex/capabilityQuotes.ts:37-75`) | **19 direct importing files**, all under `src/modules/capability-execution/call-worker/` (matrix below); **0 in `tools/`** in the literal `capabilityCallProjection` search. Example runtime import `src/modules/capability-execution/call-worker/brokeredX402.ts:24-31`, type-only import `.../lease.ts:8`. |
| Shared core for every caller | `quoteAction`/`quoteActionCore` (`convex/capabilityQuotes.ts:23-27`; `convex/chatQuote.ts:6,24-32`) | **Yes for the observed call/worker paths, despite wrong placement**: HTTP dispatches `capabilityCalls:call` via `createCallService` (`src/lib/server/call-api.ts:68,86-124`); MCP uses the same service (`src/lib/server/mcp-api.ts:44-46,688-696`); chat calls `canonicalAgentCallCore` (`convex/chatCall.ts:14,154-172`). Public admission hands into that same core (`convex/lib/callLifecycle/authorityHandlers.ts:689-708`); common execution parsing is `parseContractOutput` in the root (`convex/capabilityCallProjection.ts:470-483`) reused by worker and recovery (matrix). HTTP and chat construct distinct surface-specific operation keys (`src/lib/server/call-api.ts:90-109`; `convex/chatTools.ts:464-479`), not duplicate provider-result parsing. No three separate admission/command/parser copies were observed. |

## Concern inventory in the root

The cited **callers** are the importing files in the matrix; internal calls are named separately where germane. “Pure” here means no `ctx` or database access, not that it necessarily has no clock or observable error handling.

| Concern / root range | Exported symbols and kind | Observed callers |
|---|---|---|
| Re-exported already-separated projections `convex/capabilityCallProjection.ts:45-53` | `canonicalTerminalOutcome` (pure mapper, original `convex/lib/callLifecycle/terminalProjection.ts:79-97`); `listAgentSupplyCallsHandler` (ctx-bound query helper, original `convex/lib/callLifecycle/supplyCallsListing.ts:76-98,100-175`) | `canonicalTerminalOutcome`: `brokeredX402.ts:24-31`, `charge.ts:5-11`, plus root `:528-534,589-596,640-641,665,764,793,836`; no direct importer of the `listAgentSupplyCallsHandler` re-export found in the direct-root import census. Root registration calls its imported helper at `:866-871`. |
| Dispatch, settlement, recovery contracts `convex/capabilityCallProjection.ts:55-154` | `OpenDispatch`, `ContractOutputValidation`, `ChargeSettlementResult`, `WorkerAcceptedCharge`, `CanonicalPort`, `RecoveryRow` (types); private `WorkerRecoveryResult`, `RecoveryAttempt`, `RecoveryOuterProjectionOptions` (`:140-154`) | `OpenDispatch`: base-worker import declarations at `src/modules/capability-execution/call-worker/brokeredX402.ts:24-31`, `charge.ts:5-11`, `runPreparation.ts:34-40`, plus the type-only worker rows in the matrix; `ChargeSettlementResult`: `charge.ts:5-11`, `runRelease.ts:15`; `RecoveryRow`: `recovery/contracts.ts:8`, `convex/lib/callLifecycle/statusControl.ts:1`. Other exported types feed root function signatures `:156-157,179,215-218,354-359,485-497`. |
| Command adaptation and Convex port `convex/capabilityCallProjection.ts:156-209` | `toCallDispatchCommand` (pure mapper, `:156-177`); `canonicalPort` (ctx-bound `runMutation`/`runQuery` adapter, `:179-209`) | `runPreparation.ts:34-40` uses both; `charge.ts:5-11`, `brokeredX402.ts:24-31`, `recovery/loading.ts:25-27` use `canonicalPort`. Root uses mapper `:432` and port `:500`; unlike pure mapper, port executes Convex actions at `:192-207`. |
| Read-only/public recovery results `convex/capabilityCallProjection.ts:211-352` | `recoveryNotFound` `:211-213`, `projectPureCallStatus` `:215-245`, `cancelledRecoveryResult` `:247-262`, `retryableRecoveryResult` `:264-277`, `projectPersistedRecovery` `:279-316`, `reconciliationResult` `:327-352`; private `recoveryOuterState` `:318-325` | `convex/lib/callLifecycle/statusQuery.ts:7`, `convex/capabilityCallWorker.ts:32-35`, `convex/moneyX402ResponseActions.ts:11`; recovery imports itemized below. `reconciliationResult` is no-ctx but reads the current clock on fallback (`:336-338`). |
| Recovery and dispatch persistence `convex/capabilityCallProjection.ts:354-468` | `projectRecoveryOuter` (mutation `:354-414`); `readCanonicalSnapshot` (async port reads `:416-421`, not a pure projection); `finalizeCallDispatch` (builds command and invokes mutation `:423-439`); `projectReconciliationRequired` (mutation `:441-468`) | `projectRecoveryOuter`: recovery files and `convex/moneyX402ResponseActions.ts:11`; `readCanonicalSnapshot`: `brokeredX402.ts:24-31`, `runPreparation.ts:34-40`, `runRelease.ts:15`; `finalizeCallDispatch`: `brokeredX402.ts:24-31`, `charge.ts:5-11`, internally `:524,585,637,661,760,789,823`; `projectReconciliationRequired`: `runPreparation.ts:34-40`. |
| Contract-output parsing and terminal result decisions `convex/capabilityCallProjection.ts:470-679` | `parseContractOutput` (pure input parse/validation with degrade fallback `:470-483`); `projectOuterResult` (ctx-bound qualified-use mutation `:617-636`, finalization `:485-679`) | Parser imported by `brokeredX402.ts:24-31`, `runRelease.ts:15`, `recovery/reconciliation.ts:9-17`, `recovery/x402.ts:20`, `convex/moneyX402ResponseActions.ts:11`; root also calls at `:499`. Terminal projection imported by `runRelease.ts:15`. |
| Seller-onboarding canary outcome/receipt `convex/capabilityCallProjection.ts:681-854` | `projectSellerOnboardingCanaryResult` (ctx-bound branch construction and finalization `:686-854`) | `runRelease.ts:15`; root itself calls `finalizeCallDispatch` at `:760,789,823`. |
| Provider-safe listing RPC `convex/capabilityCallProjection.ts:856-873` | `listAgentSupplyCalls` (`query` registration **and inline handler**), imports validator and helper from `convex/lib/callLifecycle/supplyCallsListing.ts:25-65,100-175` | External Convex RPC registration; handler calls `requireSourceRead` `:860`, `verifySupplyAgentPrincipal` `:863`, and listing helper `:866`. |

## Importer → symbol matrix

Each line is a **direct import or re-export from `convex/capabilityCallProjection.ts`**; path:line points to the import declaration. `type` marks type-only symbols, even when mixed into runtime imports. Shared prefix in the next two tables: `src/modules/capability-execution/call-worker/`.

| Importer | Symbols consumed |
|---|---|
| `brokeredX402.ts:24-31` | `canonicalTerminalOutcome`, `canonicalPort`, `readCanonicalSnapshot`, `finalizeCallDispatch`, `parseContractOutput`; type `OpenDispatch` |
| `call-execution-gates.ts:32` | type `OpenDispatch` |
| `charge.ts:5-11` | `canonicalPort`, `canonicalTerminalOutcome`, `finalizeCallDispatch`; types `ChargeSettlementResult`, `OpenDispatch` |
| `lease.ts:8` | type `OpenDispatch` |
| `runPreparation.ts:34-40` | `canonicalPort`, `projectReconciliationRequired`, `readCanonicalSnapshot`, `toCallDispatchCommand`; type `OpenDispatch` |
| `runRelease.ts:15` | `parseContractOutput`, `projectOuterResult`, `projectSellerOnboardingCanaryResult`, `readCanonicalSnapshot`; type `ChargeSettlementResult` |
| `x402Authorization.ts:29` | type `OpenDispatch` |
| `x402Route.ts:10` | type `OpenDispatch` |
| `x402Settlement.ts:18` | type `OpenDispatch` |
| `recovery/cancellation.ts:6-13` | `cancelledRecoveryResult`, `projectPersistedRecovery`, `projectPureCallStatus`, `projectRecoveryOuter`, `reconciliationResult`, `recoveryNotFound` |
| `recovery/contracts.ts:8` | type `RecoveryRow` |
| `recovery/expiry.ts:4-7` | `projectPersistedRecovery`, `recoveryNotFound` |
| `recovery/index.ts:3` | `recoveryNotFound` |
| `recovery/loading.ts:25-27` | `canonicalPort` |
| `recovery/managedSigning.ts:10-13` | `projectPersistedRecovery`, `recoveryNotFound` |
| `recovery/preSubmission.ts:10-15` | `projectPersistedRecovery`, `projectRecoveryOuter`, `recoveryNotFound`, `retryableRecoveryResult` |
| `recovery/reconciliation.ts:9-17` | `projectPersistedRecovery`, `projectPureCallStatus`, `projectRecoveryOuter`, `reconciliationResult`, `recoveryNotFound`, `retryableRecoveryResult`, `parseContractOutput` |
| `recovery/status.ts:3-7` | `projectPersistedRecovery`, `projectPureCallStatus`, `recoveryNotFound` |
| `recovery/x402.ts:20` | `parseContractOutput` |

Convex-side consumers (four direct references, plus the requested dispatch qualification):

| Importer | Symbols consumed |
|---|---|
| `convex/capabilityCallWorker.ts:32-35` | **re-exports** `projectOuterResult`, `projectPureCallStatus` |
| `convex/moneyX402ResponseActions.ts:11` | `parseContractOutput`, `projectRecoveryOuter`, `reconciliationResult` |
| `convex/lib/callLifecycle/statusControl.ts:1` | type `RecoveryRow` |
| `convex/lib/callLifecycle/statusQuery.ts:7` | `projectPersistedRecovery`, `projectPureCallStatus` |
| `convex/lib/callLifecycle/dispatch.ts:16,47-54,369-409` | **No direct import of root**. It imports `materializePurchaseResolutionRecord` from the sibling lib and declares its own same-named projection shape; the root's `finalizeCallDispatch` calls `internal.capabilityCalls.finalizeDispatch` (`convex/capabilityCallProjection.ts:423-439`), whose handler reaches dispatch finalization via the call lifecycle (`convex/lib/callLifecycle/dispatch.ts:369-409`). This is an indirect execution relationship, not an additional import. |

### Duplicate check: dispatch vs purchase-resolution materializer

**Confirmed structural duplication with a semantic qualification.** Both modules independently export the same seven-field `CallDispatchProjectionShape`: `convex/lib/callLifecycle/dispatch.ts:41-54` and `convex/lib/callLifecycle/purchaseResolutionMaterialize.ts:14-26`. Both independently define `accountReceiptFromProjection`, extracting `result.receipt` and accepting only `commercialModel === 'account_aud'`: `dispatch.ts:268-275`, `purchaseResolutionMaterialize.ts:40-44`. They are **not literally identical functions**: dispatch returns `{ receipt, accountReceipt }` to retain any receipt (`dispatch.ts:268-275,319-348`); the purchase-resolution version returns only the account receipt (`purchaseResolutionMaterialize.ts:40-44,68-82`). The shared account-receipt selection is duplicated, but the additional dispatch receipt output has a distinct consumer.
