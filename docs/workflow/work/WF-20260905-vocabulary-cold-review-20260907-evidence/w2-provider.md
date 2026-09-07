# Wave 2 provider-boundary cold papercut audit

## Scope and method

- Read-only audit of the current provider supply/detail and source-connection flows at HEAD
  `a51e17b22` (the vocabulary refactor under review is `3770b43ba`).
- Read `PRODUCT.md`, `CONTEXT.md`, the x402 onboarding runbook, current source and
  adjacent tests. Traced user-visible triggers through the server-function and source
  query/mutation boundaries.
- The worktree already contained unrelated dirty/deleted user artifacts; no repository
  files were changed.
- Runtime check: Node `v22.22.0`, npm `11.5.1`. No test, compiler, browser, or
  deployment run was performed in this cold pass.

## Confirmed findings

### F1 — P1: Owner Tool detail contract returns `operation`, caller reads `tool`

**Trigger:** An authenticated owner opens an existing Tool detail route,
`/owner/supply/:offeringRef`.

**Evidence and path:**

1. `convex/capabilityProviderTools.ts:23-35,246-257` validates and returns an
   available owner readback with `operation: {...}`.
2. `src/components/ae/offerings/provider-workspace.functions.ts:146-156` types
   that same source query as returning `tool: ProviderWorkspaceInventoryRow`.
   Its handler at `:240-253` passes through `tool: result.tool`.
3. `sourceQuery` is a type-only `makeFunctionReference`
   (`src/lib/server/convex-source.ts:107-111`); this boundary does not runtime-map
   `operation` to `tool`.
4. `src/routes/_operator/owner.supply.$offeringRef.tsx:58-70` treats an available
   result as containing `result.status.tool`, dereferencing
   `result.status.tool.offeringRef` and `.name`.

**Impact:** The backend response is available, so the wrapper returns an available
status with `tool: undefined`. The route then throws while rendering the guard/name
path, before its normal unavailable fallback can help. Every owner attempting to view
an available Tool's detail page is affected.

**Minimal correction:** Make the provider-workspace contract consistent at the source
boundary: have this owner readback validate/return `tool` (the current caller and
route contract), or change both caller and route to `operation` in one atomic change.
Add one source-response/route regression assertion so a real `readOwner` payload
cannot silently pass through with a missing detail object.

**Provenance:** Introduced by the `3770b43ba` Tool/Quote/Call vocabulary refactor:
the current Convex provider query retained `operation` while its provider-workspace
consumer moved to `tool`. The former provider operations backend and owner-operations
consumer both used `operation`, which is consistent with the mismatch being a
cutover omission rather than an intentional public distinction.

### F2 — P2: x402 Add service “Connect service” action is a dead end

**Trigger:** An owner previews an admitted/supported x402 source, selects its candidate,
and has no eligible `x402-fetch:v2` provider connection.

**Evidence and path:**

1. `src/modules/capability-supply/source-preview.ts:573-638` creates the supported
   candidate with authentication `{ kind: 'x402_wallet' }`.
2. `src/components/ae/supply/AeSupplySourceNativeStart.tsx:121-131` requires
   adapter `x402-fetch:v2` and filters eligible connections. With none,
   `:584-585` renders “Connect service”; `:303-322` submits the current x402 source,
   digest, and candidate to `onConnect`.
3. `src/routes/_operator/owner.offerings.new.tsx:67-87` wires that callback to
   `startOwnerSupplySourceConnectionServer`; `src/modules/capability-supply/supply-funnel.functions.ts:168-174`
   forwards it to the owner source connection handler.
4. `src/modules/capability-supply/internal/supply-funnel/source-first-owner.ts:251-259`
   immediately returns `unavailablePreview()` when `data.source.kind !== 'openapi'`.
   That result is an `action_required` response titled “Business unavailable” with
   CTA “Return to Tools” (`:652-665`). No x402 connection attempt or durable
   connection is created.

**Impact:** The explicit Add service CTA tells the owner to connect the selected source,
but the x402 path returns a generic business-unavailable action and loses the flow.
The documented onboarding path also says `/for-providers` → Add Tool → inspect → sign
the seller claim (`X402_SELLER_ONBOARDING.md:40-50`), so a provider following the
advertised path cannot complete x402 admission from Add service.

**Minimal correction:** Route x402 connection requests into the existing x402
inspection/payee-claim connection flow (or return a resumable action that opens that
flow with the exact resource URL, method, candidate, and digest). Preserve the
candidate draft so completion returns to Add service, then add a UI/integration
regression for the no-connection x402 branch.

**Provenance:** Pre-existing provider-boundary behavior introduced by
`2523e271f` (“mature provider operations”) and retained through `3770b43ba`;
it is not caused by the vocabulary refactor.

**Counterevidence:** `src/components/ae/supply/AeOwnerProviderConnections.tsx:413-420,536-611`
does provide a working standalone x402 connection panel and explicitly says to connect
first, then open a Tool. That is a viable workaround and may reflect an intended
ordering. It does not resolve the contradictory Add service CTA, which invokes a
known non-openapi branch and returns the generic dead-end action.

## Remaining uncertainty / intentionally unpromoted leads

- No live browser or deployed flag check was run; F2 is based on the current source
  call chain. If the `httpCredentials` rollout gate is disabled, the same Add service
  path is unavailable even more broadly.
- The x402 eligible-connection filter only matches business and adapter, while the
  standalone connection model also records exact resource/method. That may be a
  second correctness issue, but this pass did not establish a user-visible failure
  because later publication staging performs exact matching.
- Initial candidate-selection closure behavior and x402 source-route method parsing
  were reviewed and are not confirmed bugs.
- Existing tests cover the provider workspace list/summary and standalone x402
  connection onboarding; no test currently couples the owner detail readback shape
  to the Convex `readOwner` payload or exercises Add service → x402 Connect service.
