# Agentic Economy Goblin Campaign Report

**Date:** 2026-08-14  
**Status:** historical audit-time snapshot; later source remediation supersedes current dispositions. See [`goblin-campaign-report-2026-08-16.md`](goblin-campaign-report-2026-08-16.md) for the subsequent focused rerun.  
**Scope:** current local Agentic Economy source; live browser and MCP surfaces at `http://127.0.0.1:3024`; CLI, owner/supplier, Answer, operation-registry, privacy, recovery, and cross-surface contracts  
**Method:** 32 independent read-only scouts: 8 persona categories × 4 surfaces (`human/browser`, `CLI`, `MCP`, `cross-surface parity`). Sandboxed scouts were told not to substitute curl for browser proof or fixtures for live proof. The mounted central browser supplied shared live browser/MCP evidence where scout sandboxes could not reach loopback or mount `xd://browser`.  
**Evidence labels:** `[RUNTIME]` current local process or persisted local runtime record; `[SOURCE]` current source; `[ARTIFACT]` current machine output/test artifact; `[INFERENCE]` bounded conclusion not directly exercised.  
**Authority:** findings were re-derived from current evidence. The 2026-08-13 report was used only as a historical checklist; stale findings were not copied forward.

## Verdict

**No P0 was found. Keep live money disabled.**

The anonymous free-keyless path is now substantially real and coherent:

- Browser Answer executed `mockster.cat-images` with the exact requested cardinality, then preserved operation/input context in a natural same-thread revision.
- MCP initialized, listed the expected eight tools, searched and inspected current operations, compared two current operations, inspected an aggregate plan, executed CoinGecko with an optional field, rejected caller-supplied transport authority, and survived malformed calls.
- Operation detail and agent guidance now expose direct keyless execution instead of unconditionally forcing Connect → Invoke.
- Earlier result-provenance, optional-count, key-origin, supplier-entry, SSRF, ExternalRun authorization, replay-cleanup, and CLI URL-redaction defects are fixed at the evidence ceilings stated below.

The highest-leverage current failures are narrower:

1. a real local-service request can be classified as an Operation request, bypassing deterministic business retrieval and producing contradictory cross-lane UI;
2. generic CLI action execution ignores the registered surface boundary and the Harness surface policy;
3. supplier connection lifecycle mutations exist in Convex but remain unreachable from the owner product;
4. live settlement/payout remains intentionally unavailable because the selected production contract and operator/legal inputs are incomplete.

## P0 / P1 findings first

### P0

None found.

### P1-1 — NEW: model-selected Operation routing can bypass the deterministic business lane

**Evidence:** `[RUNTIME]` + `[SOURCE]`.

The visible local-business chip/query `I need an emergency plumber near Perth` completed on thread `8d99a246-fc84-4949-a8ba-467b676d47f0`, turn `04c65214-84a1-45e1-b304-e21d3ec382c8`. The persisted interpretation was `route: "operation"`. Browser copy said the Market Operations registry had no match and offered a local-business search, while the same completed surface also rendered no-businesses recovery state. No useful local provider result was returned.

Current orchestration makes the model-selected route authoritative: `src/modules/answer-thread/internal/turn-orchestrator.ts:1392-1411` runs deterministic retrieval only when `state.interpretation?.route !== 'operation'`; an `operation` interpretation goes directly to the operation-focused agent path. `src/modules/answer/internal/answer-response-planner.ts` has deterministic service signals such as `plumber`, but they cannot repair a route after this branch.

**Impact:** the most ordinary local-service task is task-blocking and self-contradictory: the product searches the wrong registry, then asks permission to do the work it should already have done.

**Lean fix:** make the existing deterministic business/service signal an authority-preserving override before the operation bypass, or require a positive capability/Operation signal before accepting the model’s `operation` route. Keep one router; do not add a second retrieval framework.

### P1-2 — NEW: `advanced action` bypasses registered action surfaces and Harness approval

**Evidence:** `[SOURCE]`.

`tools/ae/commands/actions.ts:86-101` resolves any registered action, validates its input, and directly runs `action.run({ context: { caller: 'cli' } })`. It checks `readOnly`/`--allow-write`, but never checks `action.surfaces.includes('cli')` and never passes through Harness approval. `src/modules/harness/approval-policy.ts:103-105` explicitly refuses undeclared surfaces. `src/modules/capability-execution/operation-execute-mcp.actions.ts:71-101` declares `operation.execute` as MCP-only, yet the generic CLI path can call it as a second execution surface.

**Impact:** action registration metadata is not an enforceable authority boundary. Any present or future action can become CLI-reachable through a maintenance command despite declaring another surface; write classification is not a substitute for authentication, admission, or surface policy.

**Lean fix:** reject actions whose registered surfaces omit `cli`, then route allowed actions through the existing Harness approval seam. Keep the dedicated authenticated `invoke` gateway restriction.

### P1-3 — STILL OPEN / duplicate SG-016: provider connection lifecycle is not reachable from the owner product

**Evidence:** `[SOURCE]`.

The owner operation page can read provider connection options and manage source/admission/readiness/publication. The `src/` product exposes only `readOwnerProviderConnectionsServer`; there are no owner callbacks for connect, reconnect, rotate, revoke, or cleanup retry. Ownership-checked mutations already exist in `convex/capabilityProviderConnections.ts` (`connectX402Owner`, `reconnectOwner`, `rotateOwner`, `revokeOwner`, `retryOwnerCleanup`).

**Impact:** a supplier cannot establish or maintain the authority that keyed/x402 Operations depend on without calling internal Convex functions outside the product.

**Lean fix:** project the existing mutations into the authenticated owner surface with current owner/revision fencing. Do not build a parallel connection subsystem.

### P1-4 — ACCEPTED RELEASE BLOCKER: live settlement/payout remains source-incomplete and intentionally refused

**Evidence:** `[SOURCE]` + `[ARTIFACT]`.

The shared live-money gate still returns `live_money_gate_open` while six operator/legal decisions and Stripe readiness remain open. The final source release gate was correctly closed at the production deployment-manifest check; no paid/x402 request or settlement was attempted in this audit.

**Impact:** AE cannot honestly claim end-to-end paid use, Qualified Use settlement, supplier accrual, or payout.

**Decision:** keep live money disabled. Finish the ADR-034/PRA-001–003 source contract, operator/legal policy values, production manifest, and hosted proof; do not weaken the gate or fabricate a zero-price/zero-threshold demo.

## P2 findings

### P2-1 — NEW: machine contract projections omit or misstate canonical action metadata

**Evidence:** `[RUNTIME]` + `[SOURCE]`.

Live MCP `tools/list` returned exactly eight tools and strict input schemas, but no tool exposed `outputSchema`. `src/lib/server/mcp-api.ts:254-300` registers title, description, input schema, and annotations, then separately validates `action.outputSchema`; it never registers the output schema. The installed MCP SDK explicitly supports `outputSchema` and validates `structuredContent` when present (`node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.d.ts:153-158`, `mcp.js:87-94,185-203`).

The same drift appears in other projections:

- `src/modules/discovery/internal/site-manifest.ts:76-87,405-423` omits action ID, contract version, and output schema from operation-read endpoint entries;
- `tools/ae/commands/manifest.ts:103-130` omits the direct-keyless execute output schema;
- `src/modules/registry/operation-action-contracts.ts:41,85-88` describes array-valued `operationRefs`/`mappingRefs` as `type: 'object'`, while canonical schemas require arrays.

**Impact:** agents cannot pre-validate successful results or reliably reconcile action descriptions with wire contracts. Multiple hand-written projections can drift even while execution remains correct.

**Lean fix:** project ID/version/input/output metadata from the registered action descriptor everywhere. Pass the existing output schema to MCP registration; delete hand-typed metadata that the canonical schema already owns.

### P2-2 — NEW: CLI public-read adapters do not consume the full canonical contract

**Evidence:** `[SOURCE]`; live CLI success path was `RUNTIME_UNVERIFIED` after the local stack exited.

- `tools/ae/commands/search.ts` and `inspect.ts` print any 2xx body from `requireOk` without `safeParse` against canonical output schemas; compare/inspect-plan do validate outputs.
- Operation search accepts `limit`, `cursor`, and filters and returns `pagination.nextCursor`, but the CLI exposes only positional query text.
- Canonical compare accepts one to four refs; the CLI requires two to four.

Canonical AE routes validate their own outputs, so this did not create a current-server runtime failure. The CLI intentionally accepts arbitrary `--base-url`, however, and presently treats malformed 2xx HTML/JSON from a proxy or stale deployment as successful machine output.

**Impact:** automation cannot traverse a complete search result set and can silently accept a non-canonical success body.

**Lean fix:** reuse the canonical input/output schemas in the thin CLI adapters; expose the existing pagination fields; align compare cardinality. No new client framework.

### P2-3 — NEW: Answer replay drops compare facts and inspect-plan meaning

**Evidence:** `[SOURCE]`.

Canonical compare/inspect-plan results carry per-field source/time validity and aggregate plan identity, refs, mappings, maximum cost, data use, effects, and expiry (`src/modules/capability-supply/operation-projection.ts:487-552`). Answer can call compare/inspect-plan, but `src/modules/answer/internal/operation-artifacts.ts:163-179` only extracts descriptor-bearing `found.operation` or `ok.items/operations`; comparison facts and inspect-plan summaries are discarded. `AnswerOperationCandidate` has no comparison-fact or inspect-plan artifact shape.

**Impact:** after Answer compares or inspects a plan, replay/share cannot show which sourced facts or aggregate policy meaning grounded the prose without rereading mutable registry state.

**Lean fix:** persist one bounded public comparison/plan artifact from the already-validated tool result. Do not expose private model requests, endpoint/credential data, internal selection digests, or raw tool logs.

### P2-4 — NEW: imported web-claim links are not constrained to safe HTTPS URLs

**Evidence:** `[SOURCE]`.

`WebDiscoveryClaimSchema` accepts `websiteUrl` and `sourceUrl` as arbitrary strings (`src/modules/answer/answer-schema.ts:12-19`). Web discovery only checks that `sourceUrl` exactly matches a citation and trims `websiteUrl` (`src/modules/storefront/internal/business-enrichment.ts:235-250`). `src/components/ae/services/AeImportedClaims.tsx:41-63` renders both directly as target-blank anchors. This differs from Operation result links, which reject non-HTTPS, credential-bearing, control-character, and bidi-tainted URLs.

**Impact:** an untrusted/model-produced `javascript:`, `data:`, credential-bearing, or misleading URL can become a clickable product link. This is source-proven but not runtime-exploited in this audit.

**Lean fix:** reuse the existing validated HTTPS-link helper before storing/projecting claims; omit invalid links rather than repairing them in JSX.

### P2-5 — STILL OPEN / duplicate P2-6 + SG-004/SG-013: owner and operation vocabulary misstates domain stages

**Evidence:** `[SOURCE]`.

`src/routes/operations.$operationRef.tsx` labels `operation.business` as **Supplier** and the `provenance.publisher` mode enum as **Publisher**. Canonical language defines the registered business as Provider, Supplier as the portfolio rollup, and Publisher as an authenticated publishing identity.

Owner supply copy also conflates distinct stages: “Publish your service,” “set a price, test it, and go live,” “Admit your API,” and “Published services” imply that description, admission, publication, readiness, and assistant availability are one event. Source behavior correctly keeps these gates distinct.

**Impact:** users cannot tell who provides the Operation, who authorized publication, or whether an admitted/published item is actually routeable.

**Lean fix:** relabel existing fields and stages. Do not add DTOs or another onboarding flow.

### P2-6 — NEW: public builder guidance can target the wrong deployment and assumes an invoke continuation

**Evidence:** `[SOURCE]`.

Public funnel/SKILL/page-markdown examples use bare `npm run -s ae -- ...` commands. The CLI defaults to hosted `https://agentic-economy-phi.vercel.app` unless an environment base URL is already set, while a builder may be reading a local `/for-agents` page from `127.0.0.1:3024`. Guidance also says to continue to Connect when direct keyless execute is absent, although a current detail can be inspect-only with no invoke relation.

**Impact:** a builder can unknowingly search a different deployment, or be told to request authority for an Operation that advertises no invoke path. Origin binding protects authenticated keys from cross-origin use, but anonymous reads can still silently target the wrong registry.

**Lean fix:** render commands with the request-derived canonical base URL or an explicit environment setup line; say “invoke only when detail advertises invoke.”

### P2-7 — NEW: settled queries remain in the composer

**Evidence:** `[RUNTIME]` + `[SOURCE]`.

After the successful cat follow-up, the enabled composer still contained `Make it three instead.`. `AeAnswerPromptInput.submitQuery()` trims and submits local `value` but never clears it; `setValue` runs only on change/chip selection (`src/components/ae/chat/AeAnswerPromptInput.tsx:126-154,305-307`).

**Impact:** the next follow-up can accidentally append to or resend stale intent.

**Lean fix:** clear the controlled value only after submission is accepted; preserve it on validation or transport failure.

## P3 papercuts

1. **Unknown CLI command reflection.** `tools/ae/cli.ts` interpolates the raw unknown command token into human/JSON errors outside the shared sanitizer. Existing URL and JSON secret redaction is green; redact/bound this token as well.
2. **Supplier CLI discoverability.** The root manifest/README correctly avoids anonymous owner mutations, but gives no handoff to `/for-providers` or authenticated `/owner/supply` for publication, connection, earnings, or payout state.
3. **MCP operation-first ordering.** The eight-tool inventory is compact (10,469–10,470 raw bytes), but business reads occupy the first three positions and Operation search starts fourth. Descriptions now distinguish business catalogs from callable Operations; treat ordering as ergonomics, not authority failure.
4. **Inspect-plan wording.** “Ephemeral bounded operation composition” can be read as executable composition. Current behavior is an aggregate read-only preview with inspect-only navigation and no execute/invoke continuation.

## Current live proof

### Browser Answer: exact optional input and natural continuation

Thread: `4b786092-ad36-46e2-8610-2ff1aa17a26f`  
Operation: `operation:v1:5d962d5814fa4acd8c2667e874c388c43f0629e80f8a02b39b506a040aa6584f` (`mockster.cat-images`)

Turn 1:

- turn: `345b65cb-c652-463a-a8f2-592d603f0739`
- query: `Show me exactly two cat images.`
- executed input: `{ "count": 2 }`
- visible result: exactly two records; one safe `Cat image link` annotation; routeable/keyless; USD 0
- visible provenance: `Run by AE runtime · 14/08/2026, 16:54:31`
- evidence hash: `sha256:be954199c9b4be7ce167a7e491d73637066cfbaa4e886132e9a2f94805c70f3f`
- result digest: `sha256:2278ce5c35da4347f23b9f1aee0abd05cb44d2d77c1b80889eba0e20294ac19c`

Turn 2:

- turn: `4c598740-4a9b-47b1-bfe3-c5240dbab0f4`
- query: `Make it three instead.`
- executed input: `{ "count": 3 }`
- visible result: exactly three records on the same thread and Operation
- visible provenance: `Run by AE runtime · 14/08/2026, 16:55:26`
- evidence hash: `sha256:a71a5238b72758ee24b416abe5f8d50eef95fe9d89418495ee961db586f4a35d`
- result digest: `sha256:c05c966ae96613b83783e0d6ea9a00f24399f4420312891cfccb52fc0805f41f`

This fixes the previously demonstrated cat-count and continuation-provenance defects for this exact shape. It does not prove every optional field on every Operation.

### Live MCP protocol and authority boundary

`POST /mcp` initialize returned HTTP 200 and protocol `2025-11-25`. `tools/list` returned these eight anonymous tools in order:

1. `ae_registry_services_list`
2. `ae_registry_services_search`
3. `ae_registry_detail`
4. `ae_registry_operations_search`
5. `ae_registry_operations_detail`
6. `ae_registry_operations_compare`
7. `ae_registry_operations_inspectPlan`
8. `ae_operation_execute`

Current routeable refs:

- CoinGecko: `operation:v1:3e80c2a3a9b09f6a53b90856f1e077e173b2a151c6bc2530fe3478b76b2d8b31`
- Frankfurter: `operation:v1:c27948cae4c5a1fe18333b72e026c62ef7c9a3396fd0022a8df9c059ccd93a9e`

Live CoinGecko execute input:

```json
{"ids":"bitcoin","vs_currencies":"usd","include_24hr_change":true}
```

Live result: Bitcoin USD `62856`, 24-hour change `-1.333561333900495`, evidence hash `sha256:7c0a9c676b5ee264d33923f06c8dd4adf2b9001c67411cdb9a57319f621b9dee`.

Top-level `endpointUrl`, `method`, and `credentialRef` overrides failed MCP input validation with `-32602`. The same authority-shaped fields nested under `input` produced typed `refused/input_invalid`. A subsequent `tools/list` returned the same eight tools.

Live compare returned `kind: ok`, two Operations, and seven facts. Inspect-plan returned both refs, no mappings, known USD 0 maximum cost, five data-use rows, one data-release effect, and inspect-only navigation. Empty `operationRefs` returned `-32602`; the server remained healthy.

### Current source/release evidence before the read-only rerun

After remediation and before this report-only audit:

- Answer/continuation focused suites: 3 files, 41 tests passed.
- Conformance: 24 files, 390 tests passed.
- Money-gate tests: 2 files, 11 tests passed.
- Typecheck passed.
- Convex codegen dry run passed.
- Lint, unit, integration, contract, and production build suites passed inside the source release gate.
- The outer release gate correctly failed closed at the incomplete production deployment manifest. No hosted-deployment claim was made.

The 32-scout rerun itself was read-only and skipped formatters, project-wide tests, servers, and mutating calls as required.

## Previous report disposition

| 2026-08-13 item | Current disposition | Current evidence ceiling |
|---|---|---|
| P1-1 optional inputs ignored | **FIXED_GREEN for tested cat count and direct MCP CoinGecko optional field** | Browser count 2 → 3; MCP `include_24hr_change:true`. Natural Answer 24-hour-change wording was not rerun. |
| P1-2 Service ambiguity | **FIXED_GREEN at MCP/action descriptions** | Business tools now explicitly say business portfolio/catalog, not Agent Service/Operation. Operation/supplier UI vocabulary remains P2-5. |
| P1-3 free keyless detail forces Connect | **FIXED_GREEN** | Detail/agent guidance now branches to direct keyless MCP execution. |
| P1-4 key artifact lacks origin | **FIXED_GREEN** | Copied/downloaded artifact includes `AE_API_KEY_ORIGIN`; UI test covers it. |
| P1-5 supplier door enters generic claim | **FIXED_GREEN** | Homepage provider door uses `/claim?source=supply`; global “List your business” remains intentionally local-business. |
| P1-6 payout source incomplete | **STILL OPEN / accepted blocker** | P1-4 above. |
| P1-7 CLI URL secret echo | **FIXED_GREEN** | Query/userinfo/fragment probes returned origin-only generic errors with no dummy secret. |
| P2-1 continuation provenance loss | **FIXED_GREEN for live cat continuation** | Fresh `ae_runtime` timestamp and fresh result/evidence digests on turn 2. |
| P2-2 ExternalRun reads lack auth | **FIXED_GREEN** | Current queries require admin readback authority; negative/positive tests exist. |
| P2-3 SSRF range parity | **FIXED_GREEN** | Shared guard includes `198.18.0.0/15`, `fec0::/10`, and mapped-address handling with tests. |
| P2-4 agent HTML omits inspect-plan/MCP lifecycle | **SOURCE_FIXED; MCP lifecycle LIVE_GREEN** | `/for-agents` contains inspect-plan/direct-keyless and initialize → initialized notification → tools/list → tools/call. HTML browser read itself was not independently rerun. |
| P2-5 `tools/list` 334 KB | **REJECTED_OVERSTATED as raw wire size** | Current raw live body is about 10.5 KB. New issue is omitted output schema, not size. |
| P2-6 Provider/Supplier/Publisher labels | **STILL OPEN** | P2-5 above. |
| P2-7 typo help accepts invented commands | **FIXED_GREEN** | Current direct Node 22 probes return `INVALID_ARGUMENT`. |
| P2-8 text help falls to root | **FIXED_GREEN** | Command-specific recover/demand/inspect-plan help now renders. |
| P2-9 ipify routeability/attribution | **FIXED_GREEN for MCP** | Live MCP ipify returned AE runtime public IP `49.194.141.68` with evidence. Answer/browser ipify was not rerun. |
| P2-10 pre-persist unsafe output | **SOURCE_FIXED in current reachable Answer path** | Privacy projection precedes model/tool record/snapshot and is rechecked during artifact building. No live secret-leak probe was run. |
| #125/#126 cat continuation/count | **FIXED_GREEN for exact tested shape** | Exact persisted inputs and visible record counts 2 → 3. |
| #127 safe keyless auto-call | **GREEN for current Cat and MCP cases** | Zero permission prompt for eligible free read-only execution. |
| #128 wrong registry | **PARTIAL / superseded by P1-1** | Explicit operation/business descriptions improved; real plumber query still entered Operation route. |
| #130 ipify attribution | **SOURCE_FIXED and MCP LIVE_GREEN** | AE-runtime label plus real MCP result. |
| #131 compare failure | **MCP LIVE_GREEN; CLI RUNTIME_UNVERIFIED** | MCP compare succeeded; stack was unavailable for a fresh CLI compare. |
| #132 plain CLI follow-up | **SOURCE_FIXED; current CLI RUNTIME_UNVERIFIED** | Natural CLI path sends only query + optional thread ID; post-stack CLI call received typed 503. |
| #133 cat result projection | **REJECTED_OVERSTATED as “must auto-render remote images”** | Safe clickable no-referrer link and structured records are intentional; automatic remote fetch remains forbidden. |

## 32-scout matrix

| Category | Human/browser | CLI | MCP | Cross-surface parity |
|---|---|---|---|---|
| Buyer | **GREEN** via central live Cat 2 → 3 flow; sandbox browser blocked | **BLOCKED_ENV**, shared Answer proof green | **GREEN** live exact detail/execute/evidence | **MIXED**: core identity/input/proof green; business lane and vocabulary open |
| Seller | **SOURCE_GREEN/MIXED**: supply entry fixed; labels open; sandbox browser blocked | **MIXED/BLOCKED_ENV**: no owner handoff; no mutation attempted | **GREEN** anonymous inventory honestly excludes seller writes | **MIXED**: auth/revision fences green; stage vocabulary and connection lifecycle open |
| Builder | **MIXED**: source guidance fixed; deployment-target wording open; sandbox browser blocked | **MIXED/BLOCKED_ENV**: help/manifest green, live cold loop unavailable | **MIXED**: protocol/input behavior green; output contract absent | **MIXED**: registered-action drift and CLI surface bypass |
| Agent | **GREEN** via shared live capability execution; own browser blocked | **MIXED/BLOCKED_ENV**: machine help stable; live server unavailable | **GREEN** live navigate → detail → execute/refusal | **MIXED**: kernel authority green; machine projections and business route open |
| Human | **GREEN/MIXED** via shared Cat/browser; business chip red | **MIXED/BLOCKED_ENV**: text errors/help readable; live result unavailable | **GREEN** cold MCP chain using public guidance | **MIXED**: operation labels and supply stage language open |
| Idiot | **SOURCE_GREEN/BLOCKED_ENV**: no new browser failure promoted | **SOURCE_GREEN/BLOCKED_ENV**: invalid inputs fail closed | **GREEN** malformed/unknown tool survival | **GREEN**: transport-specific error envelopes are intentional, not parity bugs |
| Collaborative | **GREEN** via shared same-thread Cat refinement | **SOURCE_GREEN/BLOCKED_ENV**: natural path needs only thread ID | **GREEN/MIXED**: compare/plan live; output schema absent | **MIXED**: Answer drops compare/plan artifacts |
| Adversarial | **SOURCE_GREEN/BLOCKED_ENV**: escaping, telemetry, result-link privacy green; imported claim URL risk open | **MIXED**: URL redaction green; unknown-token reflection remains | **GREEN** live forged-authority refusal and survival | **GREEN/MIXED**: authority/privacy remediations green; no live paid/hosted proof |

## Rejected or unverified claims

- **No hosted certification.** All live evidence is local.
- **No paid/provider-credential/x402 proof.** Live money remained disabled; zero unintended effects occurred.
- **CLI typed 503 after the stack exited is not a product finding.** It is an honest availability result. CLI compare/continuation success remains runtime-unverified in this rerun.
- **MCP protocol envelope differences are not parity defects.** HTTP problem details, MCP `-32602`, CLI local validation, and typed domain refusals occur at different syntax/authority layers and are internally consistent.
- **No-mapping inspect-plan is not executable composition.** It is an inspect-only aggregate preview.
- **MCP execute need not duplicate all detail metadata.** Exact detail is the precondition and owns price/publication provenance; execute owns operation identity, literal output, and evidence hash.
- **Answer-private replay fences must not become caller authority.** Candidate, binding, checkpoint, model-request, endpoint, credential, and transport internals remain private.
- **Operation result links are safe.** The open link issue is limited to imported web claims, which bypass the Operation link validator.
- **The local Vite process later exited amid repeated Clerk middleware errors.** The exact triggering request was not isolated, so this is recorded as an environment/runtime-stability observation rather than promoted as a proven root finding.

## Cleanup

The central browser, Vite, and local Convex audit processes are stopped. Ports `3024` and `3210` were unreachable after shutdown. No production mutation, account creation, publication, payment, provider credential use, or paid call was performed.
