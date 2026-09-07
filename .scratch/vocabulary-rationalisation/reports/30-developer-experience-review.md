# Developer-experience review report — vocabulary rationalisation

Status: Phase 0 assignment gate resolved; implementation/live proof pending
Ticket: [Review the vocabulary refactor for developer and installed-client usability](../issues/30-developer-experience-review.md)
Reviewer: Luna Max / refactor_dx_review
Reviewed at: 2026-09-05 (Australia/Perth)

## Review posture

This is the bounded Phase 0 review of the accepted vocabulary cutover. The
recommended mode is DX POLISH for a CLI/API/MCP platform consumed by a backend
or platform engineer integrating an agent harness. Product direction is
maturity before differentiation, using Locus/Nevermined/Whop as familiar
references; no new product surface is proposed here.

This is a plan review, not an implementation or release gate. The source is
pre-cutover, so current Operation/Commitment/Invocation names and current
generated artifacts are baseline evidence rather than implementation failures.
The current implementation path is explicitly
`registry.operations.search -> operation.inspect -> operation.invoke -> result`
and the approved path is
`registry.tools.search -> tool.quote -> tool.call -> result`. Nothing in this
report treats the target routes, target MCP names, target refs or target
examples as live. Issue 09's canonical document is available; the coordinator's
remaining minor checks/final diff review are separate from this ticket. Live
hosted execution, browser interaction and a real x402 testnet Call were not
reviewed in this bounded pass and belong to later verification/cutover issues.

## Developer persona and first-use journey

I am a platform engineer adding a bounded outside capability to an existing
agent. I want one copyable path: install the compiled `ae` binary, discover a
Tool, obtain a caller-specific Quote, connect the account only when protected
work requires it, make one useful x402-primary Call, and retain one Call
identity through pending, status, delivery, payment and recovery. I should not
have to know AE's internal services, provider credentials, treasury or history.

The intended seven-step journey is:

1. Install the pinned archive and run `ae --version` / `ae doctor --json`.
2. Search a useful existing x402 testnet capability with `ae search ... --json`.
3. Use the retained CLI verb `describe` for anonymous exact Tool detail and its
   public input contract; it is not caller-specific Quote issuance.
4. Complete native MCP/OAuth connection or `ae connect` only when protected
   work requires it.
5. Use the existing `call` command's authenticated Quote -> Call adapter (the
   target action names are `tool.quote` then `tool.call`) with exact authority
   terms.
6. Execute one Call with one stable idempotency key and retain `callRef`.
7. Read status or the bounded Suggested next action; recover the same Call on
   uncertainty and report only the established delivery/payment/purchase facts.

The current packaged README says `ae inspect`, but the executable exposes
`describe`; the machine manifest also advertises `inspect`, `receipt` and
`reuse` as cold-loop commands although none is a root CLI command. This is a
finite CLI/documentation acceptance correction, not a request to promote
`describe` into caller-specific Quote issuance or to add an alias.

## Surface and consumer parity matrix

| Surface | Current evidence | Approved target / acceptance | Primary owner | State |
| --- | --- | --- | --- | --- |
| HTTP/action registry | `src/modules/actions/index.ts:71-110,152-189` and `src/lib/server/operation-invoke-api.ts` register `registry.operations.*`, `operation.*`, `/api/v1/market-operations/*` and `/api/v1/operations/*`. | Apply the exact public map to `registry.tools.*`, `tool.quote`, `tool.call`, `call.*`, `/api/v1/market-tools/*`, `/api/v1/tools/*`, `/api/v1/calls/*`; preserve method count, auth, media, idempotency and problem envelope. | Issue 19 | Target unimplemented; current source verified. |
| MCP | `src/lib/server/mcp-api.ts:51-60` instructs `ae_registry_operations_*` and `ae_operation_*`; `mcpToolName` is mechanically derived at `src/modules/actions/index.ts:137-149`. | Rename only AE-owned action IDs, letting the same derivation emit `ae_registry_tools_*`, `ae_tool_quote`, `ae_tool_call`, `ae_call_list/status/cancel/reconcile`; retain `/mcp`, `initialize`, `tools/list`, `tools/call`, `DELETE`, structured tool errors and official SDK behaviour. | Issue 19 | Current names verified from source and package manifest; target not live. |
| CLI and package | `tools/ae/cli.ts:38-65`, `tools/ae/commands/manifest.ts:97-283`, `packages/cli/README.md:3-18`; public archive is present. | Retain command verbs (`search`, `list`, `describe`, `compare`, `connect`, `call`, `history`, `status`, `wait`, `cancel`, `recover`, etc.); change public `--supplier` to `--provider` with no old flag alias; align help, errors, next actions, package README and manifest. | Issue 20 | Findings open. |
| Discovery and plugin | `src/modules/discovery/internal/page-markdown.ts:51-83,94-151`, `offering-discovery-file.ts:32-60`, `api-catalog.ts:38-70`, and `plugins/agentic-economy/skills/use-agentic-economy/SKILL.md:8-70` all publish current Operation/Commitment/Invocation names. | Generate the same current contract into API catalogues, manifests, `/SKILL.md`, `/llms.txt`, machine pages and plugin instructions; label pre-cutover examples current and target examples approved-target until issue 19/22 land. | Issue 21 | Findings open. |
| External registry boundary | `src/routes/api.v1.registry.ts:18-44,46-111` is `api-registry:v1`, metadata authority with `all/x402/provider_account` filters. | Keep `/api/v1/registry` external metadata distinct from canonical `registry.tools` and `/api/v1/market-tools/*`; imported records remain non-executable until admission/publication. | Issue 21 | Boundary is present; explicit cutover assertion required. |
| Inputs, refs, modes and scopes | Current quote input is `operationRef`/`input`; call input is `commitmentRef`/`idempotencyKey`; recovery uses `invocationRef`. Current scopes are `market_operations:invoke` and `customer_requests:*`. | Apply exact `toolRef`/`quoteRef`/`callRef` mapping and fixed mode/scope mapping; do not change upstream `operationId`, MCP methods, OAuth fields, x402 fields, opaque IDs or hashes. Quote must not be presented as requiring a reusable spending policy when request authorization is the supported path. | Issue 19 | Current source checked; target decision propagation pending. |
| Errors and recovery | `operation-invoke-api.ts:442-548,570-653` has bounded-body, JSON, validation, auth, status, idempotency and correlation handling, but old labels/refs and one version mismatch. | Preserve problem media, status, `kind`, `code`, `retryable`, `Retry-After`, correlation and unknown-outcome semantics while changing AE-owned labels and actionable next steps to Quote/Call/callRef. | Issue 19 | Three concrete traces below; correction pending. |
| Screens, states and copy | CLI has machine JSON, safe stderr and no token leakage; current copy uses Operation/Invocation. | Issue 24 must keep empty/error/copyable text accessible and distinguish pending, failed, refunded, delivered and purchase-resolution/payment facts without visual redesign. | Issue 24 | Runtime/UI proof unreviewed. |
| Generated artifacts and boundaries | `tools/ae/commands/manifest.ts` derives action routes; `site-manifest.ts:210-315` states it projects from owning lists; `scripts/build-cli.mjs` builds the bundle. | Use existing generators and package/import tests; serialized generation must produce source/dist/public-package parity, with no new checker, dependency, SDK or client hierarchy. | Issue 22 | Source pattern verified; integrated artifact proof pending. |

## Consequential findings

### DX-01 — Installed quickstart must keep anonymous `describe` separate from the Quote flow (P1)

Owner: issue 20 — `20-update-cli-consumers-and-distribution.md`.

Evidence: `packages/cli/README.md:9-18` and the public archive README instruct
`ae inspect "$AE_OPERATION_REF"`; `tools/ae/commands/manifest.ts:145-153`
defines `describe`, and the package help receipt exposes `describe` but no
`inspect`. The existing `tools/ae/commands/describe.ts` is the anonymous
`registry.operations.describe` adapter (target `registry.tools.describe`), not
caller-specific `tool.quote`; the existing `tools/ae/commands/invoke.ts` call
verb owns the authenticated Quote -> Call flow through the action adapter. The
same manifest emits
`coldLoop: ['search','inspect','connect','call','history','wait','receipt','reuse']`
at `tools/ae/commands/manifest.ts:312-318` and the compact manifest repeats
that list, but `receipt` and `reuse` are not executable commands. This is also
visible in the packaged dist: the help command set is
`account, call, cancel, compare, config, connect, describe, doctor, fund,
history, list, manifest, recover, request, revoke, search, status, supply, wait`.

Acceptance correction: retain `describe` as the anonymous target
`registry.tools.describe` display verb; do not map it to `tool.quote` and do not
add an `inspect` alias. Keep `call` as the retained CLI verb that obtains the
caller-specific Quote and then performs the Call. Remove non-command cold-loop
tokens or express them as result concepts, not commands. Align
`tools/ae/commands/manifest.ts`, `tools/ae/cli.ts`, package README, generated
help and public archive in one source update. Do not add an `inspect` alias.
Verify the existing packaged help and package test after the generator slot is
available, and assert every copyable command resolves to the command set.

### DX-02 — HTTP, MCP and reference mapping needs an explicit cutover assignment (P1)

Owner: issue 19 — `19-cut-over-http-and-mcp-contracts.md`.

Evidence: direct packaged `manifest --technical --json` emitted the current
gateway entries `/api/v1/operations/inspect` (`operation.inspect`,
`ae_operation_inspect`), `/api/v1/operations/call` (`operation.invoke`,
`ae_operation_invoke`), `/api/v1/operations` (`operation.list`,
`ae_operation_list`) and status/cancel/reconcile with `invocationRef`. Its
anonymous entries emitted `/api/v1/market-operations/*` and
`ae_registry_operations_*`; `gateway.scope` was `market_operations:invoke`.
The action registry and official-client test use the same current names.

Acceptance correction: require the owning implementation issue to update the
action/route contracts, schemas, action
descriptions, MCP instructions and official-client/conformance tests using the
fixed map only: `registry.tools.*`, `tool.quote`, `tool.call`, `call.list`,
`call.status/cancel/reconcile`, `/api/v1/market-tools/*`,
`/api/v1/tools/quote`, `/api/v1/tools/call`, `GET /api/v1/calls`,
`/api/v1/calls/{callRef}*`, and `toolRef`/`quoteRef`/`callRef`. Keep MCP names
mechanically derived, `/mcp` methods and all standard protocol fields intact.
The existing `tests/unit/server/mcp-api-official-client.test.ts` and
`tests/imports/operation-surface-conformance.test.ts` are the maintained
acceptance patterns; update them rather than inventing a parallel contract.

### DX-03 — Discovery producers and plugin instructions need one cutover assignment (P1)

Owner: issue 21 — `21-update-discovery-and-plugin-instructions.md`.

Evidence: `page-markdown.ts`, `offering-discovery-file.ts` and the plugin
publish `operation.inspect`, Commitment, Invocation, Operation and old route
names. `site-manifest.ts:210-315` correctly projects route examples and MCP
docs from shared descriptors, but labels/fields at `:376-447` still classify
`operation_read`, `operation_invoke`, `requiresOperationRef` and
`operationInvokeTool`. `api-catalog.ts:42-70` independently filters
`/api/v1/market-operations/*`; a blanket text replacement would either omit
the new anchors or accidentally treat the external registry as the market.

Acceptance correction: require the maintained producers and plugin to update in one
contract-aware pass. Served `/llms.txt`, `/SKILL.md`, `/for-agents`, API
catalogue, site manifest, examples and plugin must agree on Tool -> Quote ->
Call -> result, current/target state, auth, scopes, input/reference fields and
recovery. Keep the API catalogue anchor list derived from
`DiscoveryPublicSurfacePaths` and route descriptors. Add an explicit existing
route assertion that `/api/v1/registry` remains `api-registry:v1` metadata and
never becomes executable merely because it contains registry in its path.

### DX-04 — Authority mode and scope propagation needs one contract owner (P1)

Owner: issue 19 — `19-cut-over-http-and-mcp-contracts.md`.

Evidence: current `src/modules/agent-access/contract.ts` defines
`inspect_only`, `approve_each`, `bounded_mandate`, `full_yolo` and
`market_operations:invoke`; `tests/unit/discovery/cli-distribution.test.ts:29-33`
and the official MCP fixture expect those exact strings. The current MCP
adapter chooses required mode at `src/lib/server/mcp-api.ts:442-484`, while
the CLI advertises the old scope in `tools/ae/cli.ts:89-115`. A partial rename
would make OAuth challenges, `tools/list`, CLI help and connection results
disagree.

Acceptance correction: require the contract owner to propagate the fixed
AE-owned values exactly:
`inspect_only` -> `read_only`, `approve_each` -> `approval_required`,
`bounded_mandate` -> `spending_policy`, `full_yolo` ->
`unrestricted_test_only`, `mandate_eligible` -> `policy_eligible`, and
`market_operations:invoke` -> `market_tools:call`, with corresponding
`customer_requests:` suffixes. Keep `offline_access` and OAuth standard
fields. Exercise read-only, approval-required and spending-policy challenges
through existing MCP/CLI tests. `market_supply:manage` appears in current
provider setup but has no replacement in the approved mapping; preserve that
namespace until the coordinator explicitly decides otherwise, while changing
the public `--supplier` flag/copy under issue 20 to `--provider` with no alias.

### DX-05 — Three error/recovery paths need explicit plan-level correction (P1)

Owner: issue 19 — `19-cut-over-http-and-mcp-contracts.md`.

1. Quote/inspection path: `handleOperationInspectPost` at
   `src/lib/server/operation-invoke-api.ts:442-488` returns 413
   “The Operation inspection body is too large”, `invalid_json`, and
   `invalid_request` detail `operation.inspect:v1`. The owning action declares
   `operation.inspect:v2` in `operation-commitment.actions.ts`, so the current
   error detail already disagrees with its action contract. After cutover this
   must name the target Quote/Tool contract version chosen by issue 19 and
   identify the safe correction (valid `toolRef`/input or the returned next
   action), while retaining the problem envelope and correlation header.
2. Call path: `handleOperationInvokePost` at
   `operation-invoke-api.ts:490-565` preserves invalid JSON/schema handling,
   result-invalid vs source-unavailable mapping, telemetry and unknown-outcome
   semantics. Its current 409/idempotency and retry behaviour is the right
   maintained pattern, but messages/codes/details must say Call and `quoteRef`
   where AE-owned, not Operation/Commitment. A pending or unknown result must
   continue to direct the caller to the same `callRef` status/recovery path,
   never a fresh Call.
3. Recovery path: `parseRecoveryBody` at
   `operation-invoke-api.ts:570-653` rejects oversized/invalid JSON bodies,
   mismatched body/path `invocationRef` (`invocation_ref_mismatch`) and old
   `operation.cancel:v1`/`operation.reconcile:v1` contracts; status rejects an
   invalid ref at `:655-720`. Map the path and body to `callRef`, retain the
   mismatch safety check and stable idempotency key, and make the next action
   `call.status`/`call.reconcile` without ever charging or creating a second
   Call.

Acceptance correction: use the existing `cold-loop.test.ts` cases for malformed
JSON/detail, origin/auth rejection, pending -> status, idempotency conflict,
unknown/recovery and no duplicate provider effect. Assert target labels and
fields at the boundary; do not redesign the problem envelope or introduce a
second error framework.

### DX-06 — Generated and installed artifact parity needs an explicit later gate (P1)

Owner: issue 22 — `22-regenerate-shared-artifacts.md`.

Evidence: `scripts/build-cli.mjs:14-32` emits one bundled executable, while the
checked-in `packages/cli/dist/ae.js` and
`public/downloads/agentic-economy-cli-0.1.0.tgz` still emit the old action IDs,
routes, MCP names, scopes and refs. Read-only hashes at review time were:

```text
packages/cli/dist/ae.js                         97ba80774349782a8930fa15a277027bf51436d4140a5b53346c8bb5fb45beea
public/downloads/agentic-economy-cli-0.1.0.tgz  013999404d1514f629e114def2b20bb8309959b8c2f312cb7858059a992b4222
```

This is expected pre-cutover state, not a claim that the checked-in artifact
is independently broken or a reason to block Phase 0 dispatch. It becomes a
release blocker if source, generated
manifest, dist, public tarball and plugin diverge after owners land changes.

Acceptance correction: serialize the existing build/pack slot, then use the
existing package/import/conformance/discovery tests plus a finite parity receipt
covering command set, routes, action IDs, derived MCP names, scopes, refs,
README and package digest. Do not hand-edit generated output or claim target
routes live from a source build alone.

### DX-07 — CLI package verification has a Node-runtime policy conflict (P2, coordinator decision required)

Owner: issue 22 — `22-regenerate-shared-artifacts.md`.

Evidence: project runtime is Node `v22.22.0`, npm `11.5.1`; root/package pins
require Node 22 for project commands and children. `packages/cli/package.json:14-20`
declares `node: ">=20"`, and `scripts/test-cli-package.mjs:37-43,198-215`
uses `npm exec --yes --package=node@20` and `node@22` to download temporary
runtimes. This review did not run `npm run test:cli-package`; no compatibility
assertion was weakened.

Acceptance correction: Joel/coordinator must decide whether an explicitly
scoped installed-client compatibility matrix is allowed as an exception to the
project command-runtime rule. If not, run the package check under installed
Node 22 while preserving any separately required package compatibility
assertion; do not silently reduce the Node 20/22 assertion and do not use a
temporary runtime for ordinary project commands. `npm run test:imports` also
invokes `build:cli`, so its generated writer needs the serialized integration
slot.

### DX-08 — Useful x402 Call and state copy need a bounded, non-weather acceptance example (P2)

Owner: issue 27 — `27-reconcile-current-documentation.md`.

Evidence: the package README and generated discovery loop use `weather
forecast` plus `--input '{"city":"Perth"}'` (`packages/cli/README.md:12-17`,
`offering-discovery-file.ts:48-58`, `page-markdown.ts:133-141`). The maintained
cold-loop fixture uses `bitcoin price` but its fixture result is `free_tier`
(`tests/unit/market-terminal/cold-loop.test.ts:577-597`), so it is useful
journey evidence but not proof of the approved x402-primary testnet Call.

Acceptance correction: replace the weather-proxy copy with one useful x402
testnet Call drawn from an existing maintained fixture/Package 5 acceptance
record when the live-QA owner selects it; do not invent a provider or add a
playground/free tier. Keep exact target/current labels, show the Quote -> Call
-> result/usage/status sequence, and retain separate pending, failed, refunded,
delivered and purchase-resolution/payment facts. Issue 24 owns screen copy;
issue 27 owns current documentation. This finding asks for no new analytics or
feature.

## Eight-pass assessment (plan coverage; source/package bounded)

Scores are plan/acceptance coverage, not a claim that pre-cutover source is
broken or that the target is implemented. Expected current names receive no
defect score by themselves. Runtime portions explicitly marked unreviewed are
not claimed as passes.

| Pass | Score | Evidence-based assessment |
| --- | ---: | --- |
| 1. First-use / TTHW | 5/10 | The retained `describe` versus authenticated call-mediated Quote flow is now explicit, but package README/cold-loop acceptance must be corrected. Competitive target remains 2–5 minutes to a useful x402 Call; actual hosted TTHW is unmeasured. |
| 2. Core workflow / errors | 7/10 | Stable CLI verbs, idempotency, origin binding, structured problems and status/recovery patterns are named. The plan must require the declared Quote v2 error/version and target fields to propagate. |
| 3. Discoverability / copyability | 5/10 | Central manifest/action descriptors are a good pattern, but the owning tickets need finite parity requirements for package, plugin, page markdown, llms and API catalogue. |
| 4. Cross-surface consistency | 5/10 | Current source, emitted dist/tarball and official-client tests consistently describe the pre-cutover contract. Target parity is correctly deferred to implementation/generator owners; the cold-loop command list needs a finite correction. |
| 5. Migration / cutover clarity | 7/10 | No legacy users and no aliases are appropriate for this one-shot AE-owned cutover. Current-vs-target labelling is present in product docs and must be carried into the assigned public surfaces. |
| 6. Package/runtime boundaries | 7/10 | One compiled binary, blocked imports, native MCP setup and pinned project runtime are strong. Node20 downloaded-runtime verification needs a coordinator decision. |
| 7. Familiar maturity / outside references | 6/10 | Product correctly prioritises familiar Locus/Nevermined/Whop behaviour and existing official protocols. No new SDK, hierarchy, onboarding design or free tier is justified by this refactor. |
| 8. Evidence / feedback | 4/10 | Existing conformance, official-client, cold-loop and package integrity tests are strong maintained patterns. No live hosted/x402 proof or TTHW measurement was in this bounded Phase 0 review; issue 34/35 must own that later. |

The original review result was “dispatch corrections required”: the
implementation plan was coherent, but DX-01 through DX-08 still needed finite
ticket assignment. That assignment state is superseded by the bounded
re-review below; the finding text remains the evidence for the later owners.

## Phase 0 re-review — assignment receipt

Reviewed after clean checkpoint `645a348421479510432db4bdc630ed306acd18d8`
and the coordinator/queue corrections. This pass checks only whether each
consequential planning finding has a finite owner and verification path. It
does not re-review source, generated artifacts, hosted execution, UI runtime or
live x402 proof.

| Finding | Assigned finite correction and verification | Re-review result |
| --- | --- | --- |
| DX-01 | Issue 20 owns anonymous Tool `describe`, mediated Quote -> Call `call`, `--provider` with no alias, and README/manifest/help/archive parity; use the existing CLI-distribution/package checks. | Assigned |
| DX-02 | Issue 19 owns the fixed HTTP/MCP/action/ref map, derived MCP names, stable methods/auth/problem envelopes and existing official-client/conformance checks. Its coordinator assignment also covers `supply.tools.list:v1`, `/api/v1/supply/tools/list`, the matching route filename and `toolsList` dispatch key, while preserving supply verbs, count, auth and envelope behavior. | Assigned |
| DX-03 | Issue 21 owns derived discovery/plugin producers, the `tool-contract.ts` move and active release-tooling filename/import propagation; its producer paths are handed to issue 22's sole root-package writer. Existing discovery/typecheck/release checks remain the verification path, and `/api/v1/registry` stays metadata-only. | Assigned |
| DX-04 | Issue 19 owns the exact authority mode/scope map, preservation of `market_supply:manage`, and protected OAuth/MCP/x402 values; existing scope and MCP/CLI checks are the verification path. | Assigned |
| DX-05 | Issue 19 owns Quote/Call/recovery errors, target refs, stable idempotency and no-duplicate-Call behavior while retaining the existing problem envelope; existing cold-loop, recovery and conformance cases are the verification path. | Assigned |
| DX-06 | Issue 22 owns serialized generation/build/pack, source/dist/public-package parity and the finite import/conformance/discovery receipts; it is the sole root `package.json` writer and does not hand-edit generated output. | Assigned |
| DX-07 | Issue 22 and Joel own the explicit installed-client Node 20/22 compatibility decision. `test:cli-package` remains unrun, unwaived and unweakened; ordinary project commands remain on Node 22/npm 11.5.1. | Explicit open decision; not unassigned |
| DX-08 | Issue 27 owns current documentation consuming one useful existing x402 fixture; issues 20/21/22 carry the no-weather constraint and issue 24 owns screen copy. Later owners provide runtime/live proof; no new fixture or behavior is invented here. | Assigned; fixture/runtime proof pending |

The assignment gate is therefore resolved: no unassigned consequential DX-01
through DX-08 planning finding remains. The Node 20/22 choice is intentionally
still open with Joel/issue 22, not silently waived. The queue's independent
residual path/topology corrections remain with their stated owners and are not
reopened by this review.

## Deliberately out of scope

No new SDK, browser playground, free tier, onboarding redesign, codemod,
compatibility alias, CLI hierarchy, weather proxy, analytics framework or
custom checker is proposed. The existing MCP SDK, OAuth device flow, x402
fields, package/build/import/conformance tests and Markdown Wayfinder remain
the evidence path. Upstream `operationId`, MCP methods, OAuth/x402 fields,
opaque identifiers, hashes, signatures, financial namespaces, generic IAM
roles, Provider/Seller/payment-recipient distinctions and portfolio Service
records remain protected.

## Verification receipts and limitations

- `node --version` -> `v22.22.0`; `npm --version` -> `11.5.1`.
- `node packages/cli/dist/ae.js --help --json` and the same executable streamed
  from the public tarball returned the command set listed in DX-01.
- `node packages/cli/dist/ae.js manifest --technical --json` returned the old
  action/path/MCP/scope mapping listed in DX-02.
- `sha256sum` recorded the dist and public tarball digests in DX-06.
- Source, plugin, route, action, package and maintained-test anchors were read
  within the ticket allowlist, with only bounded caller traces expanded where
  required for the error and scope findings.
- Baseline supplied by issue 08 remains context: typecheck pass; unit 4,041
  pass; integration 1,083 pass / 4 skips; standards 26 existing failures.
- `npm run test:cli-package` was intentionally not run because its Node20/22
  temporary-runtime loop conflicts with the project runtime policy pending the
  coordinator decision. `npm run test:imports` was not run because it invokes
  the generated CLI writer and requires the serialized integration slot.
- No live deployment, hosted target route, browser flow, x402 testnet Call or
  UI accessibility runtime was verified here; these are later issue 32/34/35
  responsibilities, not closure requirements for this plan review.

## Closure conditions

Issue 30 is resolved for the Phase 0 assignment gate because issues 19–22 and
27 now carry the finite owner-linked corrections and verification paths. This
does not claim implementation, generated parity, hosted/UI execution or live
x402 proof; those remain with the owning implementation and later
verification/cutover issues. The Node 20/22 compatibility-matrix decision must
remain explicit and must not weaken assertions or violate the Node 22 project
runtime rule.

**UNRESOLVED DECISIONS:**
- Joel/coordinator must decide whether the scoped installed-client Node 20/22
  compatibility matrix is allowed; it remains unrun and unwaived.
