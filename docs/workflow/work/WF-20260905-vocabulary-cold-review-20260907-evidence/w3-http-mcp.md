# Wave 3 — HTTP/MCP machine-contract review

Scope: cold review of HTTP and MCP action admission/authentication, schemas and
envelopes, route adapters/DTO projections, Call consequences and recovery
guidance, and their boundary tests. Reviewed HEAD
`a51e17b221c6b73851c5873502d8150120ef3aad` (source refactor commit
`3770b43bac9bf3ea11478664ee8249ec4ddf505e`). No source or test files were
changed and no broad test/compiler run was performed.

## Inspected boundaries

- HTTP Call/Quote/recovery adapters and service projection in
  `src/lib/server/call-api.ts`.
- HTTP route bindings in `src/routes/api.v1.tools.quote.ts`,
  `src/routes/api.v1.tools.call.ts`, `src/routes/api.v1.calls.ts`, and the
  templated status/cancel/reconcile routes.
- Canonical route/action contracts and schemas in
  `src/modules/capability-execution/{call-entry,quote.actions,call.actions,call-history.actions,call-recovery.actions,call-contracts}.ts`.
- MCP admission, tool registration, structured result/error envelopes, and
  Streamable HTTP handling in `src/lib/server/mcp-api.ts`.
- Action registry and route/schema projections in `src/modules/actions/index.ts`
  and `src/modules/discovery/internal/{tool-contract,site-manifest}.ts`.
- Boundary tests in `tests/unit/server/{call-api,call-recovery-api,mcp-api-protocol,mcp-api-tools-list,mcp-api-call-recovery,mcp-api-official-client}.test.ts`,
  `tests/unit/routes/tool-call-route-binding.test.ts`, and
  `tests/unit/discovery/site-discovery-manifest.test.ts`.

## Confirmed findings

### P2 — JSON POST adapters accept a body whose media type the advertised contract rejects

- **Confidence:** 9/10.
- **Location and motivating code:**
  `src/modules/capability-execution/call-entry.ts:16-57` declares
  `requiredHeaders: ['Authorization', 'Content-Type']` for Call and each
  JSON recovery POST. `src/modules/capability-execution/quote.actions.ts:84-92`
  declares the same for `tool.quote`. The adapters then read and parse the
  body without checking the header:

  ```ts
  // src/lib/server/call-api.ts:453-475
  const bounded = await readBoundedRequestText(request, MAX_CALL_BODY_BYTES)
  ...
  rawBody = JSON.parse(bounded.text) as unknown
  const parsed = toolQuoteAction.schema.safeParse(rawBody)
  ```

  The same omission exists for `handleToolCallPost` at `:506-538`, and
  `parseRecoveryBody` at `:587-614` parses cancel/reconcile JSON without a
  content-type gate.
- **Trigger/caller path:** An authenticated caller sends valid JSON to
  `POST /api/v1/tools/quote`, `POST /api/v1/tools/call`, or
  `POST /api/v1/calls/{callRef}/{cancel|reconcile}` with
  `Content-Type: text/plain` (or no `Content-Type`). The route files delegate
  directly to these handlers; there is no route-level middleware that checks
  this header.
- **Observable impact:** After authentication succeeds, the request is treated
  as a valid Tool/Call/recovery request and can reach the injected service or
  production source admission, even though the canonical route contract tells a
  machine client that JSON `Content-Type` is required. Clients that use the
  advertised 415 boundary for retry or negotiation receive a normal validation
  or service response instead. This also makes the protected gateway differ
  from the existing JSON Tool-read/funding adapters, which return
  `415 UNSUPPORTED_MEDIA_TYPE` for the same input (`src/lib/server/tool-read-request.ts:19-27`,
  `src/routes/api.v1.funding.quote.ts:35-39`).
- **Evidence/reproduction:** Construct a `Request` for one of the above paths
  with a valid schema body and `Content-Type: text/plain`, pass the test
  `authenticate` and a recording `callService` used by
  `tests/unit/server/call-api.test.ts:50-60`, and the code path reaches
  `service.quoteTool`/`service.callTool`; no branch examines
  `request.headers.get('content-type')`. The existing tests only construct
  these requests with `content-type: application/json`.
- **Minimal correction direction:** Add one shared JSON media-type admission
  check to every JSON POST adapter before body parsing/service dispatch and
  return the existing problem shape with status 415, kind
  `UNSUPPORTED_MEDIA_TYPE`, and code `invalid_content_type`. Add narrow wrong,
  missing, and parameterized JSON media-type cases for Quote, Call, cancel, and
  reconcile. Keep authentication and source-write admission semantics aligned
  with the chosen ordering.
- **Provenance:** Current contract/adapter omission is present at HEAD; whether
  the mismatch was introduced by the refactor or carried from an earlier
  handler is uncertain. It is a current cutover defect because the route
  contracts now advertise the header as required.

### P3 — Top-level cold discovery mislabels the Tool Quote endpoint as a generic discovery file

- **Confidence:** 8/10.
- **Location and motivating code:** `buildEndpoints` includes every
  `callRouteExamples()` route, including `tool.quote`, at
  `src/modules/discovery/internal/site-manifest.ts:377-426`. Its labels already
  special-case the same action as a Tool at `:379-385`:

  ```ts
  `${route.actionId === TOOL_QUOTE_ACTION_ID ? 'Tool' : 'Call'} ${route.actionId}`
  ```

  But `kindFor` at `:444-458` only recognizes
  `CALL_ROUTE_CONTRACT.call/status/cancel/reconcile`; it has no
  `TOOL_QUOTE_ACTION_ID` branch. Therefore `/api/v1/tools/quote` falls through
  to `path.startsWith('/api/')` and is emitted as `kind: 'discovery_file'`.
- **Trigger/caller path:** A cold machine consumer reads `/.well-known/ucp`
  and dispatches on `endpoints[].kind` to locate the Tool → Quote → Call path.
  The Quote endpoint is present in `manifest.toolGateway.routes`, but its
  top-level endpoint projection is classified as a generic file.
- **Observable impact:** Consumers using the compact/top-level endpoint index
  can skip or treat the Quote route as an ordinary discovery artifact, obscuring
  the required Quote-before-Call sequence. The nested route list remains
  correct, so this is a projection inconsistency rather than a 404 or direct
  authorization failure.
- **Evidence/reproduction:** `buildSiteDiscoveryManifest({ canonicalBaseUrl:
  'https://ae.test/', now: ... }).endpoints` follows the shown branch order;
  `callRouteExamples()` supplies `/api/v1/tools/quote`, while no earlier branch
  returns a Quote-specific or Tool-gateway kind. The manifest test verifies the
  nested `toolGateway.routes` array at
  `tests/unit/discovery/site-discovery-manifest.test.ts:225-252`, but never
  asserts the top-level Quote endpoint kind.
- **Minimal correction direction:** Add an explicit canonical Quote kind (or
  the project-approved gateway kind) to the endpoint enum and `kindFor`, then
  assert the top-level Quote mapping alongside the nested route projection.
  Preserve the separate Tool Quote and Call identities.
- **Provenance:** Present at HEAD; likely an omitted branch from the route
  projection refactor, but exact introduction point was not established.

## Uncertain leads and verification gaps

1. `src/routes/api.v1.tools.quote.ts:1-24` hardcodes the route path and POST
   method instead of importing `TOOL_QUOTE_ROUTE_CONTRACT`, while the Call route
   uses `CALL_ROUTE_CONTRACT` (`src/routes/api.v1.tools.call.ts:5-17`). There is
   no direct Quote route-binding test; the only binding test is
   `tests/unit/routes/tool-call-route-binding.test.ts`. Current literals match,
   so this is a drift/testability gap rather than a confirmed runtime bug.
2. Existing Call/Quote/recovery HTTP tests cover valid JSON and schema/auth
   behavior but have no wrong or missing media-type cases. A narrow regression
   test would make the P2 finding executable; no broad test run was needed for
   this review.
3. MCP registration and official-client tests consistently expect
   `structuredContent: { result: output }` and omit MCP `outputSchema`
   (`src/lib/server/mcp-api.ts:299-356`,
   `tests/unit/server/mcp-api-official-client.test.ts:77-110`). This appears to
   be an intentional compact envelope contract, and no MCP consumer in the
   inspected boundary was found that requires direct output, so it is not
   reported as a finding.
4. MCP authentication/admission paths were traced through
   `actionRequiringAuthenticationForRequest` and the buyer/supply tools-list,
   Call, recovery, and official-client tests. No confirmed scope or anonymous
   exposure defect remained in the inspected paths.

## Counterevidence considered

- The nested `toolGateway.routes` projection correctly includes
  `TOOL_QUOTE_ROUTE_CONTRACT`, and `callRouteExamples()` validates each route
  example against its registered action schema. This limits the manifest issue
  to the top-level `endpoints[].kind` projection.
- `readToolReadRequest` and funding Quote do enforce JSON media type, but neither
  is on the Call/Quote handler path and neither supplies an implicit middleware
  for it. `sourceWriteAdmissionFromRequest` derives origin/body digests and does
  not inspect `Content-Type`.
- MCP's JSON-RPC transport intentionally lets the installed SDK own JSON-RPC
  media/session handling; the P2 finding concerns the separate HTTP Tool/Call
  adapters whose own route contracts explicitly require `Content-Type`.

Confirmed findings: 2. Uncertain leads/gaps: 4.
