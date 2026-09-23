# Platform architecture and design audit

**Date:** 2026-09-12  
**Mode:** read-only review of the current working tree before E2E/browser/alpha  
**Scope:** platform topology, module boundaries, Convex/domain ownership, Tool discovery, Quote/Call execution, money and supply projections, and HTTP/MCP/CLI parity.

## Architecture map

```text
React/UI, HTTP routes, MCP, CLI, chat
  -> action registry, route contracts, server gateway
  -> Convex source transport and typed wire projection
  -> Convex public/internal functions and generated API/schema
  -> capability-supply, registry, capability-execution, money, authority modules
  -> Provider/x402, payment/treasury, registry and authentication adapters
```

The canonical purchase path is discovery of an admitted current Tool, caller-specific Quote, Call admission and reservation, durable dispatch through the workpool, Provider delivery or uncertainty, then recovery/settlement/projection and status. The external x402 directory is a discovery input; admission/publication creates canonical AE supply. The code keeps this distinction in `convex/capabilityToolCatalog.ts:90-105` and `convex/capabilitySupplyToolQueries.ts:304-353`.

## What is sound and should stay

- The product model is internally coherent. `PRODUCT.md:135-153,157-211,236-267` and `CONTEXT.md:51-61,133-180,199-218` preserve Tool/Offering/Publication/Listing/Source, Customer/Agent/Provider/Seller/payment recipient, authority/funding/purchase, delivery/payment, and purchase resolution as separate facts. The Convex schema reflects those distinctions (`src/modules/capability-execution/internal/convex-schema.ts:287-318,327-385,386-462`).
- Action parity is deliberate. One action declaration fans out through UI/HTTP/agent/chat (`src/modules/common/action.ts:4-21`); registration and call route descriptors are explicit (`src/modules/actions/index.ts:79-193`). Quote and Call contracts share the same action IDs, schemas, retry rules and route metadata (`src/modules/capability-execution/quote.actions.ts:27-90`, `call.actions.ts:34-80`). MCP invokes the same registered action (`src/lib/server/mcp-api.ts:513-557`), while CLI quote/call/recovery use the route contracts (`tools/ae/commands/call.ts:392-476`, `tools/ae/commands/recover.ts:14-106`).
- `createCallApplication` is a useful domain seam: authority, current Tool, idempotency, dispatch and recovery are ports (`src/modules/capability-execution/call-authority.ts:91-156`). The Convex source transport is similarly narrow and test-injectable (`src/lib/server/convex-source.ts:70-95,187-249`; `tests/unit/server/convex-source-seam.test.ts:20-75,180-245`).
- Workpool retries, workload admission, consequence dispatch, canonical digests and source-write fences are justified integrity/evidence controls. Keep them (`convex/marketDispatchWorkpool.ts:1-10`, `convex/workloadCron.ts:59-75,366-412`, `src/lib/deployment/scheduled-workloads.ts:1-32`). They implement the product's bounded evidence and resumability principles rather than speculative infrastructure.

## Findings

### A-1 — Capability-supply public barrel is an internal dependency hub

**Severity:** low · **Class:** design debt · **Readiness:** later · **Confidence:** high

`src/modules/capability-supply/public.ts:281-348,471-516` exports transport adapters, importers, Convex validators, graph/ledger functions and publication commands. Internal code then imports that barrel (`src/modules/capability-supply/internal/publication/draft.ts:8-21`, `src/modules/capability-supply/internal/tool-project.ts:1-15`), while a Convex consumer also enters through it (`convex/capabilitySupplyProjection.ts:23-28`). The dependency ratchet records the resulting non-barrel and barrel cycles as accepted warnings (`.dependency-cruiser.cjs:63-82,91-105`; existing `deps-check.log` is 34/34 and 258/258).

The trigger is any change to a published supply contract or internal importer. A public import can pull implementation modules back into themselves, so ownership is unclear and a small schema/adapter change can affect bundling, Convex code generation and unrelated publication code. No current runtime malfunction was established, so this should be scheduled with related supply work rather than gate alpha. Extract stable value types, Tool refs and wire contracts into leaf `contracts.ts`/`refs.ts` modules; make internal modules import those leaves, and keep transport/importer/Convex schema/command implementations private. Migrate imports in one bounded supply pass, then lower the ratchet after the graph is clean. The tradeoff is a broad import migration and generated-output review, with no product or stored-data change.

### A-2 — Call worker crosses the stated thin Convex host boundary

**Severity:** low · **Class:** design debt · **Readiness:** later · **Confidence:** high

`src/modules/capability-execution/call-runtime.ts:1-48` is a Node worker surface but imports `ActionCtx` from generated Convex code and re-exports Convex-bound worker functions. The Convex host imports it (`convex/capabilityCallWorker.ts:7-17,95-103`), while worker internals import generated `internal`, `ActionCtx` and concrete Convex projections (`src/modules/capability-execution/call-worker/runPreparation.ts:44-52`, `runRelease.ts:14-18`). The interactive path constructs the application around Convex callbacks (`convex/lib/callLifecycle/callActions.ts:591-628`).

This makes the claimed thin host boundary two-way: generated API or Convex runtime changes ripple through execution-owned workers, and standalone worker tests must know host details. No current runtime malfunction was established, so this is related-work cleanup rather than an alpha gate. Move only Convex-bound worker orchestration and adapters behind a `convex/lib/callLifecycle` host boundary (or pass a plain `CallWorkerContext`/port), leaving `createCallApplication` and lifecycle contracts in `src/modules`. Preserve claim/fence, recovery and money semantics. Migration touches imports and Convex-specific tests; it avoids schema and public-contract migration.

### A-3 — Provider-obligation projection has competing writers

**Severity:** medium · **Class:** design debt · **Readiness:** before alpha · **Confidence:** high

`moneyProviderObligations` is the economic source with its own state and evidence, but dispute/reversal mutations also patch `capabilityCallProjections` directly (`convex/moneyProviderObligations.ts:104-121,331-349,378-429`). The call projection writer independently reads the obligation and writes the duplicated fields (`convex/lib/callLifecycle/dispatch.ts:984-997,999-1046`), and the projection schema stores `providerObligationState` beside delivery and payment (`src/modules/capability-execution/internal/convex-schema.ts:287-318`).

The trigger is any dispute, reversal, resolution or ordinary call projection update. Convex internal mutations are transactional, and the inspected money paths patch both rows in one mutation; the projection writer also re-reads the obligation, so this review found no current ordering that produces a stale row. The design still makes correctness depend on every money path remembering a second table, and a future path can drift or be overwritten by a later rebuild. Give the call projection owner a typed internal command for obligation-state projection, or derive the provider state from the obligation source at read time and remove the duplicate field. Keep Provider obligation separate from Charge, delivery and settlement. A command preserves indexed read performance but adds a directed cross-domain call; read derivation reduces writers but adds a join/read cost. This is a migration-safe schema/ownership change, not a demonstrated transaction failure.

### A-4 — Tool discovery freshness is sourced from the wrong projection

**Severity:** medium · **Class:** defect · **Readiness:** before E2E · **Confidence:** high

`src/modules/registry/tools.actions.ts:26-48` says market Tool list/search read `registrySearchDocuments` and derives freshness/cursor scope from `capabilitySupplyProjection:latestReconcileBusinessSupplyProjectionsCompletion`; lines `99-136` attach that result to every page. The actual current path is `src/modules/capability-supply/tool-source.ts:19-25` -> `convex/capabilityToolCatalog.ts:90-101` -> `convex/capabilitySupplyToolQueries.ts:304-353`, which searches current `capabilityPublications` and hydrates Tools. `convex/workloadCron.ts:483-486` shows reconcile invokes `rebuildAllBusinessSupplyProjections`; that rebuild reads current publications and writes only `registrySearchDocuments` (`convex/capabilitySupplyProjection.ts:250-302,330-343`). It does not advance the publication/catalog data that the Tool query actually reads.

Thus a live Tool result can be marked `absent` when no business sweep has completed, or `stale` after three hours, even while current publication search succeeds. More concretely, page one scopes its opaque cursor to completion time (`tools.actions.ts:52-76`); a business-only rebuild changes that time without changing `capabilityPublications`, so the next page is rejected as a foreign/stale cursor by `decodeMarketToolsCursor`. The existing route test only mocks the completion query and search result independently (`tests/unit/server/tool-market-routes.test.ts:77-112`); it does not exercise the real publication-vs-business-document linkage. Track freshness against a real publication/Tool-catalog generation or completion signal, or remove the field and cursor coupling until one exists; update the comment and add a contract test covering the source. A generation signal costs a small metadata write/read; removal changes a public response/cursor contract but is simpler. No economic state needs migration.

### A-5 — MoneyQueryPort couples unrelated read roles and advertises unsupported methods

**Severity:** medium · **Class:** design debt · **Readiness:** later · **Confidence:** high

`src/modules/money/public.ts:1-3,513-523` exposes a Convex `PaginationOptions` type and combines customer credit, credit activity, credential usage, Provider earnings and payout status in one port. The only current action-execution caller needs key usage (`src/modules/action-execution/execution-public.ts:175-189`), while the Convex adapter implements the first three and deliberately throws for the latter two (`src/lib/server/money-query.ts:39-84`). Tests must fill those unused methods with throwing stubs (`tests/unit/action-execution/execution-public.test.ts:118-134`).

Split role-specific query ports (at minimum usage, customer credit and Provider payout/earnings), compose them in adapters, and keep framework pagination types at the server boundary. This gives each caller a truthful capability and limits change amplification as Provider console work lands. The tradeoff is a typed adapter migration; no data or public commercial meaning changes, so it can follow alpha unless unsupported earnings/payout paths become active.

## Coverage and limits

Inspected product/CONTEXT/guidelines, module boundary manifest and dependency ratchet; `src/modules` common/action registry, capability-supply, capability-execution, registry and money; Convex call lifecycle, worker, projections, catalog, supply projection, money obligations, workload/crons/workpool; source transport, Call API/MCP adapters, HTTP route contracts and CLI quote/call/recovery; and the existing audit scope and check logs. The review traced representative discovery→Quote→Call→dispatch→recovery and money/projection flows. It did not audit every source line or every UI/component, external adapter, generated file, or historical document. Browser/E2E, hosted Convex, live Provider/payment calls and production deployment were not run. Concurrent edits to `src/start.ts`, `src/lib/deployment/validate-boot-env.server.ts` and `src/components/ae/supply/AeSupplySourceNativeStart.tsx` were not part of these findings.

## Checks

- Runtime pin observed: Node `v22.22.0`, npm `11.5.1`.
- Existing `docs/improvements/2026-09-12/platform-audit/deps-check.log` observed, not rerun here: no-circular `0/0`, capability-supply internal `34/34`, barrel `258/258`.
- No npm checks, tests, browser/runtime checks or network calls were run by this read-only audit; engineering owns those checks.
