# Agentic Economy Goblin Campaign Report

**Date:** 2026-08-13  
**Scope:** current local stack at `http://127.0.0.1:3024`, repository source, CLI, MCP, browser-facing flows, and cross-surface parity  
**Method:** 32 read-only persona/surface scouts: 8 categories × human dialogue/browser, CLI, MCP, and cross-surface parity. Central runtime probes supplied the shared live evidence because sandboxed scouts could not open loopback sockets or the mounted browser.  
**Evidence labels:** `[RUNTIME]` observed on the current local stack; `[SOURCE]` current source read; `[ARTIFACT]` current generated/test artifact; `[INFERENCE]` conclusion not directly exercised.

## Verdict

**No P0 was found. Do not enable live money.**

The current anonymous, free, keyless read path is materially real: operation search, exact detail, compare, inspect-plan, MCP execute, Answer execution, typed refusal, evidence hashes, and natural same-thread CLI continuation all worked. The largest remaining load-bearing defects are narrower and concrete:

1. operation optional inputs still do not control provider calls;
2. the public vocabulary has two competing meanings of “Service,” which can send agents to business catalog reads instead of callable Operations;
3. the operation detail page sends free keyless users into an authenticated Connect → Invoke path;
4. CLI base-URL errors echo query/userinfo secrets into terminal and CI logs;
5. the issued caller-key artifact omits the required origin binding;
6. the supplier entry still routes to the local-business claim flow;
7. supplier settlement remains source-incomplete and intentionally blocked.

## P0 / P1 findings first

### P0

None found.

### P1-1 — STILL OPEN: optional published inputs are ignored while prose claims success

**Evidence:** `[RUNTIME]`, duplicate of PAPERCUTS #126.

- `demand ask "Show me 3 random cat images"` completed with prose **“Here are 3 random cat images”** but the operation outcome contained **10** CatAPI records.
- `demand ask "What is the current Bitcoin price in USD including the 24-hour percentage change?"` completed with price-only output; prose admitted that the requested change was not returned.
- The contract exposes Cat `limit` and CoinGecko `include_24hr_change`; current binding still failed to carry them into the strict operation call.

**Impact:** the system claims contract-valid completion while executing a materially different input. This is an operation truth/evidence defect, not presentation polish.

**Lean fix:** bind every explicit optional input into the selected contract input before execution, validate the final input against the published schema, and make synthesis refuse to claim an omitted requested field.

### P1-2 — NEW: “agent-native Service” means a business portfolio in MCP, but “Agent Service” canonically means one Market Operation

**Evidence:** `[RUNTIME]` + `[SOURCE]`.

- Current `tools/list` exposes both `ae_registry_services_search` and `ae_registry_operations_search` as adjacent anonymous tools.
- `src/modules/registry/internal/service-projection.ts:8-23` calls the business-derived, one-Service-per-business DTO the **canonical agent-native Service**; its endpoint `operationRef` is optional.
- `UBIQUITOUS_LANGUAGE.md:11-13` defines **Agent Service** as the market-facing representation of one admitted Market Operation and explicitly says to avoid a whole Supplier portfolio.
- MCP service actions describe published businesses as agent-native Services; operation actions are the actual exact-ref execution lane.

**Impact:** a cold agent searching for an Agent Service can pick the business/catalog tool and receive catalog-only endpoints or no `operationRef`, then take the wrong action seam.

**Lean fix:** reserve Agent Service for the operation-level projection. Rename the business projection/tool descriptions to published businesses or business catalogs; do not create another DTO.

### P1-3 — NEW: routeable free keyless operation detail instructs authenticated Connect → Invoke

**Evidence:** `[RUNTIME]` + `[SOURCE]`.

- Current MCP detail for CoinGecko reported provider auth `keyless`, price `$0`, availability `routeable`, and an `execute` relation with `authentication: none`, surfaces `answerThread,mcp`.
- Anonymous `ae_operation_execute` then returned live Bitcoin data and an evidence hash.
- `src/routes/operations.$operationRef.tsx:179-197` unconditionally renders **Inspect → Connect → Invoke → Status** for every routeable operation, regardless of the current descriptor’s anonymous execute relation.
- `/for-agents` similarly jumps from inspect/compare to authenticated invoke and does not show direct keyless execute.

**Impact:** the authoritative human detail surface asks users to create a credential and enter the gateway path when the exact operation advertises an anonymous safe execution path. Wrong action and excess authority, not merely missing copy.

**Lean fix:** derive the next step from the descriptor navigation. Render anonymous `ae_operation_execute` for eligible free keyless reads; retain Connect → Invoke only for gateway operations.

### P1-4 — NEW: issued caller-key artifact omits required `AE_API_KEY_ORIGIN`

**Evidence:** `[SOURCE]`.

- `AeAssistantInstallFunnel.tsx` copies/exports only `AE_API_KEY` and downloads `{ "key": ... }`.
- `tools/ae/commands/status.ts` and the CLI origin guard require `AE_API_KEY_ORIGIN` for authenticated invoke/status/recover.
- `tests/unit/ui/demand-console.test.tsx:127-130` locks the key-only download; CLI recovery tests explicitly require origin binding.

**Impact:** the visible key-issuance flow can produce a credential that the documented CLI immediately rejects as `agent_access_key_origin_required`.

**Lean fix:** include the canonical origin in the same copied export and downloaded JSON. Reuse the existing CLI credential-origin contract.

### P1-5 — STILL OPEN / DUPLICATE SG-002: supplier entry routes into local-business claim

**Evidence:** `[SOURCE]` plus current seller page observation.

- The supplier-specific homepage door links to generic `/claim`.
- Generic `/claim` asks for trade/suburb/phone/jobs/contact-route business facts.
- The existing `?source=supply` branch correctly asks for Provider identity, Offering source admission, exact price, and Operation control.

**Impact:** a supplier trying to publish a callable Operation is directed into the local-human-service listing path.

**Lean fix:** point the supplier-specific door at the existing supply claim mode. Do not build a third onboarding flow.

### P1-6 — STILL OPEN / ACCEPTED PRA-003: payout source is not implemented

**Evidence:** `[SOURCE]` / current authority ledger.

ADR-034 selected automatic daily full-balance AE-internal supplier settlement, exact reservation before Stripe release, sub-minor carry, and truthful transfer semantics. Source/tests/generated consumers and hosted proof do not yet implement that contract. The release manifest remains intentionally closed.

**Impact:** live value exchange cannot be represented honestly end to end.

**Decision:** keep live money disabled. Implement the selected contract; do not revive fabricated zero thresholds, current-month transfer, manual payout amounts, or demo settlement.

### P1-7 — NEW: CLI echoes secrets embedded in `--base-url`

**Evidence:** `[RUNTIME]` + `[SOURCE]`.

Both invalid-argument and connection-refused paths repeat the raw base URL. Examples containing `?token=TOPSECRET` or `ftp://user:TOPSECRET@host/path` copied `TOPSECRET` into human and JSON output. `tools/ae/lib/args.ts` accepts or rejects the URL, then the top-level CLI interpolates the unsanitized original value.

**Impact:** credentials accidentally supplied in URL query, fragment, or userinfo are copied into terminal, CI, and agent logs.

**Lean fix:** require an origin-only base URL and sanitize every error display to a parsed safe origin or a fixed placeholder; never echo rejected URL input.


## P2 findings

### P2-1 — NEW: same-capability follow-up loses recorded runtime provenance

**Evidence:** `[RUNTIME]` + `[SOURCE]`.

Browser turn 1 showed `Run by AE runtime · 14/08/2026, 09:53:13`. Same-thread Ethereum follow-up used the same CoinGecko operation/candidate/descriptor/binding and fresh result evidence, but rendered `Runtime actor and time were not recorded.`

`operation-artifacts.ts:304-363` reconstructs presentation only from a preceding `registry.operations.detail` record in the current turn. Continuation rebinds the frozen prior operation without emitting a fresh detail record.

**Lean fix:** carry frozen presentation metadata with continuation evidence or derive it from the frozen selected candidate. Do not reread mutable catalog state or fabricate a timestamp.

### P2-2 — STILL OPEN / ACCEPTED PRA-006: public ExternalRun reads need only `runId`

**Evidence:** `[SOURCE]`.

`convex/externalRuns.ts` still exposes `inspectManifest` and `readReport` without identity, role, ownership, or source-read admission. They reveal provider participation, run window, failed gates, and final decision.

**Lean fix:** internalize the reads or reuse existing admin/owner/source-read authorization. Preserve one authorized projection.

### P2-3 — STILL OPEN / ACCEPTED PRA-007: runtime SSRF deny-list parity omits `198.18.0.0/15` and `fec0::/10`

**Evidence:** `[SOURCE]`.

The shared runtime `BlockList` omits IPv4 benchmarking addresses; static and runtime checks omit deprecated IPv6 site-local addresses. A supplier hostname resolving there can pass readiness/invocation guards.

**Lean fix:** add both ranges to the shared network guard and parity tests. Keep one deny-list owner.

### P2-4 — NEW: agent-facing HTML omits plan inspection and the MCP first-use procedure

**Evidence:** `[SOURCE]` + `[RUNTIME]` MCP inventory.

- `/for-agents` says plan inspection is anonymous, but the rendered anonymous steps contain search, inspect, compare, and raw handshake—no inspect-plan command.
- The page has no MCP endpoint, initialize, tools/list, tools/call, or first operation-search instruction.
- `/SKILL.md` names MCP tools but still does not teach initialize/tools/list/tools/call or distinguish business search from Market Operation search.

**Lean fix:** derive one inspect-plan row and one compact MCP card from the registered actions: `POST /mcp`, initialize → tools/list → `ae_registry_operations_search`; label services search as business-only.

### P2-5 — NEW: live MCP `tools/list` is context-heavy

**Evidence:** `[RUNTIME]` + `[ARTIFACT]`.

- Correct initialize response was 378 bytes in the helper envelope.
- Current `tools/list` helper envelope was **334,668 bytes** for eight anonymous tools. The envelope includes pretty wrapper duplication, so it is not a raw-wire byte claim; the independent current source projection artifact was still 98,186 raw bytes, with output schemas dominating.
- The inventory itself is correct and deterministic.

**Impact:** a cold MCP model pays a large context cost before one useful call; business-catalog schemas occupy the same initial inventory as the operation path.

**Lean fix:** keep strict input schemas and runtime output validation, but make the list projection compact/operation-first and defer bulky output schemas where the protocol/client permits. Do not hand-maintain a second action registry.

### P2-6 — NEW: operation detail labels Provider/business as “Supplier” and provenance mode as “Publisher”

**Evidence:** `[SOURCE]`.

`operations.$operationRef.tsx` labels `operation.business` as Supplier and `operation.provenance.publisher`—an enum such as `ae_curated_external`—as Publisher. Canonical terms define Provider as the registered Business, Supplier as a portfolio rollup, and Publisher as an authenticated identity.

**Lean fix:** label the business link Provider; label the enum Publication authority/source mode unless a real Publisher identity is available.

### P2-7 — NEW: CLI help accepts misspelled commands and invents usage

**Evidence:** `[RUNTIME]` parser path + `[SOURCE]`.

`serach --help --json`, `demand aske --help --json`, and `advanced doctro --help --json` exit 0 with `kind: HELP` and invented usage for the typo. Plain unknown execution does fail, but machine-help clients are told the typo is valid.

**Lean fix:** validate the command path before help projection and include the existing command inventory/suggestion. No new parser.

### P2-8 — NEW: command-specific text help falls back to root help

**Evidence:** `[RUNTIME]`.

`recover --help` and `demand ask --help` exit 0 but print root help. JSON error paths contain exact usage; human help does not explain recovery evidence or where to obtain it, and help uses `reconcile` vocabulary while the CLI command is `recover`.

**Lean fix:** route text and JSON help through the same command metadata.

### P2-9 — PARTIAL / DUPLICATE #128/#130: source truth improved, live routeability does not

**Evidence:** `[RUNTIME]` + `[SOURCE]`.

- Explicit Wikipedia now honestly reports no routeable operation instead of misrouting to weather. That part of #128 is fixed.
- Harmless nonsense no longer receives the physical-harm accusation, but it still falls into the business registry (`No businesses match ...`), so the business/Operation dispatch boundary is only partially improved.
- ipify source now says `Get AE runtime public IP` and labels output `AE runtime public IP`, fixing the false browser-user attribution in source/tests.
- Current live operation search/Answer could not find ipify at all, despite the curated publication existing in source. `What is my public IP?` and `What is the public IP address of the AE runtime?` both returned no applicable Market Operation.

**Lean fix:** repair seed/deployment routeability for the existing ipify publication; keep the corrected AE-runtime attribution.

### P2-10 — SOURCE/INFERENCE: live SSE can project arbitrary operation output before durable privacy validation

**Evidence:** `[SOURCE]`, not a demonstrated secret leak.

The orchestrator emits snapshot artifacts—including full operation outcome—before persistence. The UI renders bounded raw JSON as text. Durable public-projection forbidden-key scanning therefore cannot protect the pre-persist SSE path if an admitted output schema legitimately contains credential-like field names.

**Lean fix:** apply the same output-key/privacy projection before both live emission and persistence. Do not add a UI-only redaction that diverges replay.

## Historical PAPERCUTS #120–#133 disposition

| Item | Current disposition | Evidence |
|---|---|---|
| #120 FX quote misbinding | **GREEN / fixed in current run** | `[RUNTIME]` 500 USD → EUR returned 433.50 EUR at rate 0.867. |
| #121 Clerk/Convex Node import stall | **Maintenance blocker, not re-exercised** | Historical environment finding; current stack was already running. |
| #122 orphaned Convex child | **STILL OPEN maintenance** | `[RUNTIME]` supervised restart again left the Convex backend; it was verified and stopped manually after audit. |
| #123 TimeoutOverflow warning flood | **Not re-exercised** | No project-wide gate was run. |
| #124 mixed-operation false unavailability | **GREEN for the stated acceptance boundary** | `[RUNTIME]` weather+FX explicitly narrowed before provider I/O: “choose one result”; it did not falsely claim the other routeable capability unavailable. Multi-op composition remains unavailable but the current response is honest. |
| #125 capability follow-up | **PARTIAL** | `[RUNTIME]` CoinGecko plain follow-up is fixed. `[SOURCE]` continuation still carries identity/schema, not prior optional input; weather/cat shape variants were not all rerun. |
| #126 optional inputs | **STILL OPEN / accepted** | `[RUNTIME]` requested 3 cats → 10 outputs; requested 24h change → price only. |
| #127 safe keyless auto-call | **GREEN in current FX/Cat cases** | `[RUNTIME]` both executed without permission prompt and returned evidence. |
| #128 wrong registry/misroute | **PARTIAL** | Wikipedia is now honest unavailable; nonsense still falls into business search. |
| #129 accusatory safety refusal | **GREEN for harmless nonsense case** | `[RUNTIME]` no physical-harm accusation and zero provider I/O. Classifier-unavailable branch not forced. |
| #130 ipify user attribution | **Source-fixed, runtime routeability blocked** | `[SOURCE]` AE-runtime labels; `[RUNTIME]` no routeable ipify found. |
| #131 CLI compare failure | **GREEN / rejected as current defect** | `[RUNTIME]` CLI and MCP CoinGecko+Frankfurter compare: `kind: ok`, two operations, seven facts. Mixed routeable+setup-required unavailability is honest. |
| #132 CLI natural follow-up | **GREEN / fixed** | `[RUNTIME]` plain `--thread-id` completed Ethereum with same operation identity and fresh evidence. |
| #133 Cat result projection | **REJECTED_OVERSTATED as “must render images”** | `[RUNTIME]` Cat outcome carried a safe `Cat image link` annotation; `[SOURCE]` intentionally forbids automatic remote image loading and renders a no-referrer link with raw JSON behind Technical details. Quantity binding remains #126. |

## Green runtime proof

### Answer / CLI

- Bitcoin Answer: complete, CoinGecko, real value, exact `operationRef`, result digest, and evidence hash.
- Plain same-thread Ethereum follow-up: complete with same operation/candidate/descriptor/binding and fresh evidence.
- FX: 500 USD → 433.50 EUR, Frankfurter, complete.
- One CatAPI image: complete with structured output and `Cat image link` annotation.
- Mixed weather+FX: explicit no-I/O narrowing, not a fabricated partial completion.

### Canonical operation reads

Current routeable refs:

- CoinGecko: `operation:v1:3e80c2a3a9b09f6a53b90856f1e077e173b2a151c6bc2530fe3478b76b2d8b31`
- Frankfurter: `operation:v1:c27948cae4c5a1fe18333b72e026c62ef7c9a3396fd0022a8df9c059ccd93a9e`

CLI and MCP compare returned `kind: ok`, two operations, seven facts. MCP inspect-plan returned exact refs, known `$0` maximum cost, five public data-use pointers, one `query_release/data_release` effect, and expiry. CLI inspect-plan returned the same semantic result; its ephemeral plan ref differed as expected because expiry participates in plan identity.

### MCP

Correct initialize:

- HTTP 200
- protocol `2025-06-18`
- server `agentic-economy/1.0.0`
- `tools.listChanged: true`

Anonymous `tools/list` returned exactly:

1. `ae_registry_services_list`
2. `ae_registry_services_search`
3. `ae_registry_detail`
4. `ae_registry_operations_search`
5. `ae_registry_operations_detail`
6. `ae_registry_operations_compare`
7. `ae_registry_operations_inspectPlan`
8. `ae_operation_execute`

Exact CoinGecko execute returned `bitcoin.usd = 63480` with evidence hash `sha256:8d8b821c3d5067e56948670920533358f9d1a593c158b980ad16e388c9176899`. Empty input returned typed `refused/input_invalid`.

Malformed-survival checks:

- unknown method → JSON-RPC `-32601 Method not found`;
- unknown tool → HTTP 200 tool result with `isError: true`, `MCP error -32602: Tool ... not found`;
- forged canonical-shape ref → typed `refused/operation_not_found`;
- subsequent `tools/list` remained HTTP 200 with eight tools.

No provider credential, endpoint, method, header, payment, or effect override is caller-controlled in the anonymous executor; current source validates descriptor eligibility and input before network I/O.

## 32-persona coverage matrix

| Category | Human/dialogue/browser | CLI | MCP | Cross-surface parity |
|---|---|---|---|---|
| Buyer | Core Bitcoin and follow-up useful; continuation provenance missing | Natural same-thread follow-up fixed | Discover → detail → execute → evidence green | Identity/auth/price/effects align; human detail takes wrong auth path |
| Seller | Supplier CTA still enters generic local-business claim | Correctly excludes owner-only seller mutation; consumer loop only | No seller owner/payout tools—honest auth boundary | Supplier/Provider/Publisher terms and entry path need correction |
| Builder | `/for-agents` omits inspect-plan/MCP procedure | Search/inspect/compare/plan green; manifest large but machine-readable | Correct tools, generic execute schema, very large list payload | Registered actions mostly align; HTML/UCP guidance projections lag |
| Agent | Human setup misses plan and origin binding | Exact operation loop and typed JSON green | Canonical operation inventory and safe keyless execution green | Direct-keyless mode is present in machine contract but absent in human path |
| Human | Useful structured result; keyboard contracts source-backed; provenance delta live | Human help/recovery copy is weak | No human MCP onboarding despite working endpoint | Terminology/action labels can send users to wrong seam |
| Idiot | Empty/over-limit/fake selection guards source-green | Malformed inputs typed/no stack; typo-help accepts bogus commands | Unknown/forged inputs fail without poisoning server | Equivalent invalid refs use different protocol envelopes/codes; no authority leak found |
| Collaborative | Follow-up identity reuse works; optional input carryover remains weak | Current compare/follow-up green | Compare/inspect-plan green; aggregate plan is disclosure, not execution handoff | Pending/comparison/continuation metadata projections are incomplete |
| Adversarial | React text/bidi/telemetry redaction source-green; no live XSS found | Malformed JSON redacts secrets; override attempts fail closed in source | Unknown/forged inputs typed; server survives | PRA-006/PRA-007 remain open; pre-persist output privacy is source-only risk |

## Rejected or overstated candidates

- **No seller actions in anonymous MCP/CLI:** correct boundary. Seller publication, readiness, connection, earnings, and payout are owner-authenticated product functions, not anonymous tools.
- **Anonymous keyless execution does not exist:** false. Current MCP executed CoinGecko and returned literal output/evidence.
- **All current compare calls fail:** false. Current all-routeable CLI and MCP pairs pass. A routeable + setup-required pair should be unavailable.
- **Cat result must auto-load third-party images:** rejected. Safe clickable result links are the deliberate privacy boundary; automatic media fetch is not required.
- **Different live Bitcoin values across browser/CLI/MCP are inconsistent:** rejected. Values were captured at different times; exact operation identity and evidence were preserved.
- **CLI JSON is too detailed:** rejected as a defect. `--json` intentionally exposes exact schema/digests; human-readable completion remained understandable.
- **Seller absence from buyer CLI/MCP is a missing integration:** rejected. The problem is owner product reachability/entry, not anonymous mutation authority.
- **MCP unknown-tool HTTP 200 is a security defect:** not promoted. It is an SDK tool-error envelope, survives cleanly, and does not invoke a handler; protocol ergonomics can be standardized later.
- **Inspect-plan without mappings is executable composition:** rejected. Current contract is an aggregate read-only preview. It should not be advertised as an execution handoff unless mappings/sequence exist.

## Ordered repair sequence

1. Keep live money disabled; implement ADR-034 before any settlement proof.
2. Stop CLI URL-secret echo: accept origin-only base URLs and sanitize every invalid/network error.
3. Fix contract input binding (#126): Cat quantity and CoinGecko optional change first, then generic continuation input carryover.
4. Make operation detail project the current execution mode; expose anonymous direct-keyless instead of unconditional Connect → Invoke.
5. Resolve Service vocabulary at the source projection/tool descriptions; operation-level Agent Service, business-level business catalog.
6. Include `AE_API_KEY_ORIGIN` in the issued key artifact and route the supplier CTA to existing supply mode.
7. Preserve continuation presentation metadata so live and replay provenance stay truthful.
8. Close PRA-006 and PRA-007 with existing auth/network seams.
9. Repair ipify routeability while preserving AE-runtime attribution.
10. Derive `/for-agents` inspect-plan/MCP steps from registered actions; compact MCP list projection.
11. Fix CLI command-path help and terminology labels.

## Test and environment notes

- Read-only audit: no credentials, paid action, publication, account creation, production mutation, or provider-owned effect was attempted.
- No project-wide test/lint/build gate was run; the deliverable is a runtime/source audit, not a code change.
- Sandboxed scouts could not reach loopback or mount `xd://browser`; those failures were classified as environmental and never promoted to product defects. Central probes supplied all claims labeled `[RUNTIME]`.
- The audit Vite process and the verified orphaned local Convex backend were stopped after evidence capture.
