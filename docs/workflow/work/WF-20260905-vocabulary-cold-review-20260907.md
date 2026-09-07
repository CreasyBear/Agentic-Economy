# Vocabulary refactor: cold papercut review — 2026-09-07

**Audit complete; fixes pending. Five waves, fifteen independent cold Luna Max reviewers, eighteen validated finding groups: 1 P1, 13 P2 and 4 P3.** The refactor is not ready for an unqualified clean closeout. The highest-priority finding is the broken owner Tool detail readback; protected late-observation hash material also diverges across the durable implementations.

The register distinguishes direct cutover regressions, omitted propagation, inherited defects and uncertain provenance. It includes source validation and seven local reproductions. No source/test fixes, staging, commits, deployments, data changes or publication were performed. The only existing document change from this audit is a dated pointer in the vocabulary work record; its earlier body is preserved.

## Scope and evidence rules

Reviewed HEAD: `a51e17b221c6b73851c5873502d8150120ef3aad`, including source cutover `3770b43bac9bf3ea11478664ee8249ec4ddf505e` and the earlier refactor changes it builds upon. Reviewers read the current product charter and glossary before source. Unrelated working-tree edits were preserved and not attributed to the refactor; affected dirty paths were checked against committed content where needed.

Tool → Quote → Call is the purchase boundary; generic Action execution remains separate. Protected external protocols, immutable hash/signature material, opaque encodings, historical evidence and established filename exceptions are not cleanup targets merely because they contain older words. A finding requires a concrete active path and consequence. Inherited issues are retained when relevant to the inspected boundary but are not described as newly caused by the rename.

## Priority index

| Priority | Finding groups | Immediate consequence |
| --- | --- | --- |
| P1 | C01 | Available owner Tool detail readback yields a missing Tool and the page throws. |
| P2 — contracts and evidence | C02, C03, C11, C12, C16, C18 | Stale registry/continuation/test/help contracts, nonexistent commands, protected digest mismatch. |
| P2 — functional paths | C04–C09, C13 | Owner money unavailable, x402 onboarding dead end, unfiltered alternatives/hidden search continuation, lost treasury capacity, expiry inconsistency, lost CLI origin. |
| P3 | C10, C14, C15, C17 | Bounded copy/naming drift, media-type inconsistency, Quote discovery classification, dead roadmap links. |

## Confirmed findings

### C01 · P1 · Owner Tool detail response and consumer disagree

**Direct cutover break; confidence 10/10.** `convex/capabilityProviderTools.ts:27` and `:249` validate/return `operation`, while `src/components/ae/offerings/provider-workspace.functions.ts:151` and `:252` consume `tool`. `sourceQuery` supplies a TypeScript assertion, not a runtime field mapping. An available owner response therefore becomes `{ kind: 'available', tool: undefined }`; `src/routes/_operator/owner.supply.$offeringRef.tsx:62` immediately dereferences `tool.offeringRef`.

An owner opening an available Tool detail page hits a rendering error. The parent reproduction passed the source-shaped response through the existing server wrapper: `kind=available`, `hasTool=false`; the route guard dereference throws `TypeError`. This was a local boundary probe, not a live browser or deployed-backend test. Correct the producer and consumer atomically to canonical `tool`, with a regression test coupling the real readback shape to its consumer. Restoring an old API alias is unnecessary.

### C02 · P2 · Provider landing proof reads a retired action prefix

**Cutover omission; confidence 10/10.** `src/lib/server/supply-landing.functions.ts:13` selects `registry.operations.` even though the current registry publishes `registry.tools.*`. `/for-providers` reaches `AeSupplyAgentProof` through this projection and displays an unavailable proof for healthy registered Tool actions. The focused test supplies obsolete producer IDs, masking the mismatch. Correct the selector and fixture together; verify against current registered descriptors. See the Wave 1 market report for the exact caller and fixture inventory.

### C03 · P2 · Stale account continuation and funding descriptors

**Cutover omissions; confidence 10/10.** `src/modules/agent-access/account.actions.ts:365` advertises `operation.status`; `src/modules/money/funding-handoff.actions.ts:197` advertises `operation.invoke`. Neither is registered in the current action registry. Their boundary prose also uses retired invocation/Operation/Mandate language. No current external serializer of the funding `safeContinuations` field was established; that field is latent descriptor debt, while its stale public boundary prose is a confirmed P3 copy omission.

The technical CLI manifest demonstrably emits the stale account continuation and boundary; MCP emits the stale boundary prose. The compact default manifest does **not** emit that continuation. A consumer following the technical guidance selects a nonexistent action. Replace these descriptors with accurate registered continuations and current role language. Funding does not itself grant authority or retry a Call: do not mechanically replace the funding continuation with an automatic purchase instruction. Sources: Wave 1 authority and Wave 2 money reports (deduplicated here).

### C04 · P2 · Owner Agent money views call permanently refusing legacy handlers

**Inherited caller drift in the current boundary; confidence 10/10.** `/agent-access` and `/owner/credit` reach `readAgentCredentialSources`, whose three calls in `src/modules/agent-access/agent-access-console.ts:322` still request USD through the old `MoneyQueryPort`. `src/lib/server/money-query.ts:35` binds those calls to `moneyLedger` handlers; `convex/moneyLedger.ts:88` onwards unconditionally refuse `account_aud_required`. The catch projects `dataState: 'unavailable'` for every bound credential.

The owner cannot obtain balance/activity/usage through this path. Current Agent money reads exist, but require their own Account and Agent authorization; switching an owner consumer directly to them is not established as correct. Resolve the owner-authorized AUD readback contract, then map current Call/Tool activity fields (the old enrichment still reads `operationKey`). Existing injected USD success mocks do not exercise the refusing live boundary. Do not classify intentional Formance stubs themselves as an additional refactor defect.

### C05 · P2 · x402 Add service connection CTA reaches a known rejection branch

**Inherited functional defect; confidence 9/10.** A supported x402 candidate with no connection is offered “Connect service” by `src/components/ae/supply/AeSupplySourceNativeStart.tsx:584`. Its callback reaches `startOwnerSupplySourceConnection`, which rejects every non-OpenAPI source at `src/modules/capability-supply/internal/supply-funnel/source-first-owner.ts:258` and returns “Business unavailable / Return to Tools”.

The advertised source onboarding cannot continue from this CTA. The standalone x402 connections panel is an existing workaround, so this is not a claim that all x402 connection creation is absent. Route the CTA into that supported flow with a resumable draft, or provide accurate explicit guidance. Verify the no-connection branch; no browser or deployment behavior was exercised in this audit.

### C06 · P2 · Tool alternatives link does not request callable alternatives

**Inherited inspector drift retained by the cutover; confidence 10/10.** `src/components/ae/market/tool-detail/tool-inspector-model.ts:50` promises an operational alternative but constructs only `/market?query=...`. The full and compact inspectors share it. The market validator accepts `availability=routeable`, and the shared next-action helper already supplies it. The link can return more unavailable/setup-required Tools. Summaries over 200 characters are also dropped by the query validator.

Use the shared bounded alternative-link projection and assert the actual rendered href. Omitting `window=30d` is not independently a defect: `validateMarketSearch` already defaults the window to 30 days. This qualification narrows the raw UI report.

### C07 · P2 · Empty filtered search page suppresses an available next page

**Inherited functional defect; confidence 10/10.** Health filtering at `src/modules/registry/tool-choice-contracts.ts:202` happens after source pagination in `src/modules/capability-supply/internal/tool-search.ts:257`. A first raw page containing only degraded Tools projects `no_candidates` while `pagination.hasMore` remains true and a later page contains an operational Tool. The CLI search consumer at `tools/ae/commands/search.ts:60` emits its next-page command only for `kind === 'ok'` and instead suggests creating a service request.

The parent reproduction confirms `firstKind=no_candidates`, `hasMore=true`, `secondKind=ok`, `nextPageCommand=null`, followed by `ae request create`. Preserve and expose pagination for filtered empty pages, or establish filtering before pagination within the existing contract. The raw cursor itself was not proved corrupt; the raw report's broader count/cursor claim is not accepted.

### C08 · P2 · Second same-custody treasury observation removes Quote capacity

**Inherited adjacent purchase defect; confidence 10/10.** `convex/capabilityQuotes.ts:286` takes two environment observations and uses one only when `observations.length === 1`. `convex/moneyTreasury.ts:41` onwards appends distinct observation references. A routine second observation for the same custody therefore removes the treasury financial subject; an inspected x402 requirement is subsequently refused at `capabilityQuotes.ts:718`.

The local Convex test-harness reproduction used the actual observation writer and financial-subject preparation: first observation has treasury, second same-custody observation does not. No live purchase was attempted. Select the latest valid evidence for the intended active custody while retaining ambiguity checks for genuinely conflicting active identities. Do not delete history as the fix. Deployment activation and external ingestion remain separate gaps.

### C09 · P2 · Expired access grant is accepted by one authentication boundary

**Inherited consistency defect; confidence 9/10, narrowed from raw P1.** `convex/authorityBoundary.ts:205` omits the independent normalized access-grant expiry check. A current-scope bearer binding whose credential remains current but whose grant has expired can still obtain authenticated self readback. The money boundary's `verifyMarketAgentPrincipal` rejects the same state.

The parent reproduction confirms binding accepted and self authenticated, while downstream money admission is refused. This does **not** establish a spending bypass. Issuance normally aligns the expiry timestamps; a natural producer of divergent timestamps was not established. Align expiry enforcement at the shared authentication boundary and cover independent grant expiry without weakening downstream checks.

### C10 · P3 · Current product copy and guidance retain retired terms

**Cutover omissions; confidence 10/10.** These current surfaces retain older ordinary product terms:

| Bounded area | Evidence and qualification |
| --- | --- |
| Owner navigation and accessibility | `src/lib/operator/navigation.ts:64,281` and `AeOperatorSidebar.tsx:117` say “Operations”, while the destination/workspace title says “Tools”. |
| Agent onboarding | `AeAssistantInstallFunnel.tsx:23,33` teaches browse/find an “Operation” after the “Browse Tools” CTA. |
| Public status/support/privacy | `src/routes/status.tsx:27,36,96`, `support.tsx:43`, and privacy routes retain the old noun in ordinary guidance and metadata. |
| Plugin install metadata | `plugins/agentic-economy/.codex-plugin/plugin.json:17,27,28` retains Operation prompts while the skill uses Tool. |
| Current product-role prose | `DESIGN.md:29` and `START_LINE.md:16,44` use Business Principal/Agent Principal where the current product roles are Customer/Agent. |
| Release-job labels | `.github/workflows/kernel-release-gate.yml:83,113` retains Operation-era wording. Internally consistent artifact filenames are not independently runtime defects. |
| Provider CLI naming | `tools/ae/commands/supply.ts:39` retains the **working, explicitly documented** `ae supply operations` verb. No current contract promises `ae supply tools`; this is a naming decision, not a broken advertised command. Any direct rename needs the command, manifest, callers, docs and tests changed together, with no speculative alias layer. |

Correct ordinary product prose and matching tests, preserving Portfolio Offering/Tool distinctions, compatibility route paths, external `operationId`, opaque identifiers and historical evidence. Technical explanations of an Agent Principal can legitimately describe the retained identity model when mapped clearly to the Agent role; they are not blanket rename targets. Raw copy/role P2 findings are downgraded to P3. The linked UI, discovery, documentation, distribution and semantic reports retain the precise bounded inventories.

### C11 · P2 · Release browser/MCP checks still exercise removed cutover contracts

**Cutover verification omissions; confidence 10/10.** `tests/deploy-smoke/chat-browser-staging.spec.ts:65` and adjacent assertions use retired action IDs and old card selectors; the actual card now exposes `data-tool-card`. Some negative selectors are malformed. `tests/e2e/authenticated/multi-agent-lifecycle.spec.ts:407` onwards invokes a retired MCP action name. The same authenticated test at `:294,302` requests obsolete OAuth scopes `market_operations:invoke customer_requests:inspect_only`, which the current normalizer rejects before client registration can meet its expected HTTP 201; `:347` also expects an obsolete token scope. Other UI end-to-end checks assert old public labels (see C10).

These checks cannot provide valid current hosted acceptance and may fail before reaching their intended behavior. Update them against the current served contracts and then run the relevant browser/authenticated acceptance when its environment is authorized and ready. A source audit of stale tests is not evidence that a hosted check ran, nor a reason to remove substantive acceptance requirements.

### C12 · P2 · Manifest cold loop advertises commands with no runner

**Inherited contract drift; confidence 10/10.** `tools/ae/commands/manifest.ts:317` and `:495` include `receipt` and `reuse` in the cold loop, but `tools/ae/cli.ts:418` onwards registers neither. Parent executions of both source commands with `--json` return exit 1, `INVALID_ARGUMENT / unknown-command`, and `ae help`. Receipt data and reuse as concepts remain valid; it is their placement among executable root commands that fails. Align the loop with actual runners and assert every executable step is registered, without adding unnecessary command infrastructure.

### C13 · P2 · CLI follow-up guidance loses the selected server

**Inherited continuation defects; confidence 10/10.** The three independently actionable areas are `tools/ae/commands/request.ts:65,84,141,169` (creation/refusal, list item and status), `tools/ae/commands/doctor.ts:204,324,417,443,482` (supply/request/balance/Call/reuse diagnostics), and `tools/ae/commands/connect.ts:68,79,106` (timeout and successful connection guidance). They emit bare commands without the selected `--base-url`; many also drop JSON mode. Without a persistent environment override, CLI argument resolution defaults each fresh invocation to the hosted origin, not the last stored connection; a server selected only by `--base-url` is lost.

The parent request-status probe ran with `http://[::1]:3024` and JSON mode but returned `ae request status request:cold`. Following such guidance can query the wrong server or fail the credential's origin check. This is not evidence of credential leakage: existing origin binding remains counterevidence. Existing request-list pagination and doctor connection helpers preserve origin correctly. Apply the existing shell-safe continuation convention consistently across these bounded command areas and verify nondefault-origin follow-through.

### C14 · P3 · JSON purchase adapters do not enforce their declared media-type header

**Current contract inconsistency; introduction uncertain; confidence 10/10.** Quote/Call/recovery route contracts declare required `Content-Type`, while `src/lib/server/call-api.ts:453,506,587` parse bounded JSON without checking it. A parent probe sent valid JSON as `text/plain` through an authenticated Call fixture: the service ran once and the adapter returned HTTP 200. Other Tool-read/funding adapters explicitly enforce JSON media type.

Align the declared and enforced media-type contract, preserving authentication and source admission. No authorization bypass, CSRF exploit, or failure of a valid JSON client was established; this is downgraded from the raw P2 finding. Do not infer an advertised 415 guarantee solely from `requiredHeaders`.

### C15 · P3 · Top-level discovery classifies Quote as a discovery file

**Current projection omission; confidence 9/10.** `src/modules/discovery/internal/site-manifest.ts:444` classifies Call and recovery endpoints but omits the Quote action; `/api/v1/tools/quote` falls through to `discovery_file`. The nested `toolGateway.routes` projection remains correct. A consumer dispatching on the top-level kind cannot distinguish this purchase preparation endpoint from an ordinary API discovery file. Choose the appropriate existing or explicitly approved endpoint kind and test both projections together; do not collapse Quote into Call.

### C16 · P2 · Late-observation hashing changes protected material in one durable port

**Direct earlier refactor regression, retained by the final cutover; confidence 10/10.** `convex/actionExecutionControl.ts:287` now hashes `{ callRef: args.executionRef, ... }`; `src/modules/action-execution/internal/development-durable-port.ts:105` still uses the established `{ invocationRef: input.executionRef, ... }`. The old Convex handler used that historical key too. This is generic Action execution material, not a purchased Call identity.

The parent probe supplies a prior history digest made from the established material to the current Convex handler. The identical command is refused as `command_identity_conflict`; a digest made with the current key instead returns `duplicate`. Same-version retries remain stable. No deployed historical row or real cross-port migration was established, so the finding proves protected-material and replay-boundary divergence, not an observed production outage. Restore consistent established material and add an exact late-observation vector shared by both ports. Do not add a migration or alias layer merely to preserve an accidental hash change.

### C17 · P3 · Roadmap evidence links target removed workspace files

**Documentation cutover regression; confidence 10/10.** `IMPLEMENTATION_ROADMAP.md:157` links to `src/components/ae/offerings/AeOwnerOperationsWorkspace.tsx` and `tests/unit/ui/owner-operations-workspace.test.tsx`, neither present at HEAD. The current files are `src/components/ae/offerings/AeProviderWorkspace.tsx` and `tests/unit/ui/provider-workspace.test.tsx`. Update the two links while preserving the row's explicit limitation that it is not fresh workspace acceptance.

### C18 · P2 · Provider status help and onboarding omit a required Tool reference

**Inherited command-help mismatch republished by the documentation cutover; confidence 10/10; parent finding.** `tools/ae/commands/manifest.ts:207` advertises `supply status <businessRef> [toolRef]` and says it lists or reads Tools; `X402_SELLER_ONBOARDING.md:66` supplies only a Business reference. But `tools/ae/commands/supply.ts:99` requires both references.

The parent ran `npm run -s ae -- supply status business:cold-audit --json`: it exited 1 with `supply-status-usage`, while its own error repeated the misleading optional `[toolRef]` usage. The rejection occurs before authentication or a network request. Correct the help and runbook to supply a Tool for detail, and use the existing inventory command for listing. No new optional-status fallback is needed to satisfy an inaccurate example. This is distinct from literal angle-bracket placeholder copyability.

## Review coverage and raw-report dispositions

All fifteen reviewers used `gpt-5.6-luna` with maximum reasoning and no inherited conversation. Each received the same neutral brief and its assigned boundary, without prior findings. Wave handoffs could overlap while a report was being written; no findings were fed into later reviewers. Each report is a bounded independent pass, not a guarantee that every possible defect was found.

The register above is the deduplicated parent conclusion. Raw reports preserve the original findings, confidence and limitations; where they differ, the dispositions below apply. C18 was found by the parent while validating the reported CLI/runbook paths.

| Wave | Boundary / raw report | Parent disposition |
| --- | --- | --- |
| 1 | [Market/registry](./WF-20260905-vocabulary-cold-review-20260907-evidence/w1-market.md) | MKT-1 → C02; MKT-2 → C07 (narrowed); MKT-3 → C11 |
| 1 | [Authority](./WF-20260905-vocabulary-cold-review-20260907-evidence/w1-authority.md) | F1 → C09 (P2, no spending bypass); F2 → C03 |
| 1 | [Purchase/Quote/Call](./WF-20260905-vocabulary-cold-review-20260907-evidence/w1-purchase.md) | Treasury history → C08; observer integration → gap |
| 2 | [Provider lifecycle](./WF-20260905-vocabulary-cold-review-20260907-evidence/w2-provider.md) | F1 → C01; F2 → C05 |
| 2 | [Money](./WF-20260905-vocabulary-cold-review-20260907-evidence/w2-money.md) | F1 → C04; F2 → C03; F3 → C03 public copy/latent metadata only |
| 2 | [Human UI](./WF-20260905-vocabulary-cold-review-20260907-evidence/w2-human-ui.md) | F1–F3 → C10 (P3); F4 → C06 (window-default claim excluded) |
| 3 | [CLI](./WF-20260905-vocabulary-cold-review-20260907-evidence/w3-cli.md) | CLI-01 → C12; CLI-02–04 → C13 |
| 3 | [HTTP/MCP](./WF-20260905-vocabulary-cold-review-20260907-evidence/w3-http-mcp.md) | Media type → C14 (P3); Quote kind → C15 |
| 3 | [Served discovery/plugin/chat](./WF-20260905-vocabulary-cold-review-20260907-evidence/w3-discovery.md) | D1/D2 → C10; origin/chat ownership → gaps |
| 4 | [Storage/hash/evidence](./WF-20260905-vocabulary-cold-review-20260907-evidence/w4-storage.md) | Late-observation digest → C16 |
| 4 | [Current docs/examples/links](./WF-20260905-vocabulary-cold-review-20260907-evidence/w4-docs.md) | DOC-01 → copyability suggestion; DOC-02/03 → C10 (narrowed); DOC-04 → C17 |
| 4 | [Distribution/CI/release](./WF-20260905-vocabulary-cold-review-20260907-evidence/w4-distribution.md) | Live workflow labels → C10; artifact path/hosted proof → gaps |
| 5 | [Cross-module journeys](./WF-20260905-vocabulary-cold-review-20260907-evidence/w5-journeys.md) | Provider landing → C02; public status → C10 |
| 5 | [Test blind spots](./WF-20260905-vocabulary-cold-review-20260907-evidence/w5-test-blindspots.md) | 1 → C02; 2 → C03 (narrowed); 3/4 → C11, including obsolete OAuth scopes |
| 5 | [Semantic cutover](./WF-20260905-vocabulary-cold-review-20260907-evidence/w5-semantics.md) | 1 → C02; 2 → C10 (working retained verb, P3); 3 → C03 (funding emission claim excluded) |

## Verification gaps, unconfirmed leads and explicit exclusions

| Item | Disposition and what would resolve it |
| --- | --- |
| Installed CLI Node 20/22 matrix; published/hosted package identity; data/hosted/live-client acceptance | Still open as recorded in the existing source closeout. The audit stays on Node 22 and does not infer the pending Node 20 test-only exception or any deployment authorization. Local pack equality and source checks are not exact hosted/published revision proof. |
| Treasury observation ingestion | No repository runtime caller of the observer/writer was found. Confirm the intended external operator/activation process before declaring a missing integration a refactor defect or adding a scheduler/service. Separate from the confirmed repeated-observation bug C08. |
| Consumed Quote replay after Quote expiry | Source checks expiry before replay; the intended relationship between an unexpired purchase Quote and retrying an already accepted Call needs a contract decision and focused behavior evidence. Not a confirmed defect in this audit. |
| Independently expired access grant | C09 proves an inconsistent allowed row state; issuance usually aligns related expiries and no natural divergent-expiry producer was established. Do not convert the finding into a claim of successful unauthorized spending. |
| Public `/SKILL.md` origin substitution | Builder ignores origin options and returns the packaged skill, whose links use production. Tests deliberately require package parity. Decide whether this is a canonical-production pointer or host-relative asset before changing that contract. |
| Chat recovery and anonymous-to-authenticated context | Chat may intentionally present host/CLI continuations rather than own recovery or persist the larger conversation. No product requirement establishing the alternative was found. Do not add orchestration, tools or memory merely to close a speculative gap. |
| Money view/schema drift | Older `CreditAccountView.accountId` and `ProviderEarningsView.truncated` differences lack a confirmed current producer/consumer failure. They remain leads, not additional findings. |
| x402 connection eligibility | UI filtering by business/adapter could be narrower, but publication staging performs exact checks. No additional observable wrong-connection acceptance was established. |
| Release smoke `sourceWriteRequest.targetPath` | The old `/api/v1/release/operation-gateway` value may be signed/evidence context rather than an HTTP route. Trace the validator before changing it. Internally consistent artifact filenames alone do not break the workflow. |
| Shell placeholder copyability | Unsubstituted `<toolRef>` / `<businessId>` can be parsed as shell redirection. These conventionally mean “replace this value”; no failure with properly substituted values was established. Quoted variables plus explicit substitution instructions would improve copyability. Raw documentation P2 is not promoted. The ignored local `tools/ae/README.md` is not a tracked finding. |
| CLI device verification URI and transport recovery guidance | The bounded reviewer did not establish the supported URI policy or a violated machine-output requirement. No opener exploit or broken recovery guarantee is claimed. |
| Quote route literals and compact MCP output | Current literals match their contract; the compact `{ result: output }` MCP envelope is deliberate and tested. Missing additional tests alone is not a product defect. |
| Prior standards/parallel-timeout/React Doctor results | Preserve the recorded failed/advisory outcomes. This audit neither fixes nor relabels them as passing. |

Protected upstream `operationId`, MCP/OAuth/x402 fields, opaque prefixes, established canonical/hash/signature material, external financial namespaces and historical document bodies are excluded from lexical cleanup. Generic IAM Principal/Account/Business records remain distinct from Customer/Agent roles, and Offering/Publication/Listing/Source/Provider connection remain distinct from Tool. Ordinary active copy is evaluated separately. Some raw reviewer prose is broader than these rules; the parent dispositions and confirmed register control the accepted scope.

## Verification performed for this audit

Fresh check: `NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run typecheck -- --pretty false` exited 0, with zero diagnostics and zero affected files. Runtime: Node 22.22.0 / npm 11.5.1.

Seven focused local probes reused existing Vitest fixtures and transformed the test module in memory. They did not edit repository tests, contact production or deploy Convex. Each selected probe passed its assertion of the reported bad behavior; unrelated tests were deliberately skipped by the name filter. These are reproduction receipts, not regression fixes or a new green acceptance suite.

| Probe | Observed result | Finding |
| --- | --- | --- |
| Owner Tool readback | Wrapper returns available with no Tool; guard dereference throws | C01 |
| Health-filtered pagination | Empty first page still has more; CLI omits next-page command and suggests a service request | C07 |
| Treasury history | Same custody: first observation gives treasury; second removes it | C08 |
| Independent access-grant expiry | Binding/self authentication accepted; downstream money admission refused | C09 |
| Request continuation | Selected IPv6 origin and JSON mode omitted from returned status command | C13 |
| Wrong media type | Authenticated text/plain JSON request reaches Call service; HTTP 200 | C14 |
| Late-observation digest | Established digest replay refused as identity conflict; current digest replay duplicates | C16 |

Source CLI invocations `npm run -s ae -- receipt --json` and `npm run -s ae -- reuse --json` both exited 1 with `unknown-command`, confirming C12. The additional source command `npm run -s ae -- supply status business:cold-audit --json` exits 1 with `supply-status-usage` despite advertising optional `[toolRef]`, confirming C18 before any authentication/network request. Compact/technical source manifest reads confirm C03/C12; only relevant excerpts are retained to avoid archiving a large generated manifest. Other findings have explicit source/caller traces in their raw reports and parent validation notes.

The earlier broad source verification is retained as recorded evidence in [the vocabulary work record](./WF-20260905-vocabulary.md), not rerun wholesale for this documentation-only audit: 4,093 sequential unit tests passed; 1,091 integration tests passed with four skipped; types/imports/SEO/UI/lint/build-integrity checks passed. The default parallel aggregate had seven five-second CLI timeouts, and the same five files plus full unit suite passed sequentially without changing limits. TypeScript standards still fails on its 26-finding baseline. The commit-hook React Doctor advisory was 74/100 with 116 warnings. Source acceptance is not installed-package, hosted, data-cutover or production proof.

## Recommended repair order

1. Repair the owner detail producer/consumer contract and protected late-observation hash material, with narrow tests crossing those boundaries.
2. Resolve the concrete functional paths: owner money readback, Provider x402 connection handoff, alternatives/search pagination, treasury history and independent expiry enforcement. Keep inherited issues visibly separate from rename regressions.
3. Correct executable CLI/action guidance and current release-test consumers, using real registered contracts and nondefault-origin continuations.
4. Finish bounded copy, discovery metadata and documentation-link corrections. Keep any public schema choice explicit; avoid broad lexical replacement or new compatibility layers.

Fixes, staging, commits, deployment, data changes and publication remain unperformed. The review deliverables document the work for the subsequent fix pass.

## Retained evidence and preservation

The [evidence index](./WF-20260905-vocabulary-cold-review-20260907-evidence/README.md) links the raw reports, probe receipts, source-manifest excerpts and preservation summary. Probe source is retained as text evidence to avoid adding a test runner or changing project test discovery. All pre-existing source/test files and unrelated working-tree changes remain unchanged.
