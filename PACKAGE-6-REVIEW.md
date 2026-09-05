# Package 6 consolidated skeptical review

**Review date:** 5 September 2026  
**Implementation reviewed:** uncommitted source in the original dirty `main` checkout  
**Verdict:** **CHANGES REQUIRED. Package 6 is a locally implemented candidate, not a ready or complete release.**

The chosen shape is mostly right and was accepted by Joel in the preceding task: public discovery before connection; an OpenAI Plugin Directory golden path with native Codex, Claude Code and Cursor fallbacks; exactly four anonymous discovery tools; one shared skill; `app.aecon.ai`; and Open-Meteo as the first useful proof Operation. The implementation preserved existing Package 4/5 authority, Invocation, source, attempt and status machinery instead of inventing a workflow or OAuth stack.

It still fails at the joins. Six Provider transition defects can misstate outage, keep a cancelled attempt usable, lose a saved source after a successful MCP connection, erase resume failures into a blank form, or advise a retry when completion is uncertain. Native OpenAI release is separately blocked: the OAuth server ignores the required resource binding, ChatGPT's claimed protected-tool linking path is not represented on the wire, `app.aecon.ai` has no DNS, and no installed plugin, registered connection, listing or same-revision client run exists.

Green unit tests do not close those gaps. The reproduced focused result is 19 files and 105 tests. The repository import gate is still red. No real ChatGPT/Codex Account connection, complete purchase, authenticated Provider journey, published plugin or production Call was proved.

Companion evidence: [requirements baseline](</Users/joelchan/Documents/Coding/App-Dev/live/01. Pre-Implementation/Agentic-Economy/PACKAGE-6-REVIEW-REQUIREMENTS.md>), [implementation review](</Users/joelchan/Documents/Coding/App-Dev/live/01. Pre-Implementation/Agentic-Economy/PACKAGE-6-REVIEW-IMPLEMENTATION.md>) and [native integration challenge](</Users/joelchan/Documents/Coding/App-Dev/live/01. Pre-Implementation/Agentic-Economy/PACKAGE-6-REVIEW-NATIVE-CHALLENGE.md>).

## Highest-impact findings

### P1. Cancel did not cancel the pending AE attempt

Both “Cancel” controls only navigated away (`src/routes/_operator/owner.supply.connections.new.tsx:167-170`, `243-246`). The attempt contract already has `cancelled`, but no reviewed write produced it (`src/modules/capability-supply/internal/supply-funnel/provider-connection-handoff-contract.ts:18-30`). An unexpired pending attempt could still accept manual completion or start MCP OAuth (`provider-connection-handoff.ts:275-286`, `369-377`).

The release requirement explicitly includes cancellation (`docs/guides/package-6-plugin-release.md:136-138`); the maturity requirement demands exact-draft preservation and current-state readback across external handoffs (`research/PACKAGE-6-MATURITY-REQUIREMENTS-RESEARCH.md:134-141`); Journey C requires fresh-process, second-tab and expiry behavior (`research/PACKAGE-6-INVERSE-PREMORTEM.md:445-467`). Joel has now resolved the semantics: cancelling ends the pending AE attempt so the saved handoff link cannot complete; existing saved Provider connections remain untouched.

### P1. Reopening a consumed MCP handoff lost the connected source

The HTTP consumed branch returns connection, environment and draft. The MCP consumed branch returned only the draft (`src/routes/_operator/owner.supply.connections.new.tsx:74-77`, `187-196`). Exact connected-source restoration requires the connection reference (`src/modules/capability-supply/internal/supply-funnel/source-first-owner.ts:373-379`). A user revisiting the durable attempt could therefore land on a fresh Add service form after OAuth had succeeded.

This violates the exact-source/fresh-process requirement in `research/PACKAGE-6-INVERSE-PREMORTEM.md:445-467` and the Package 6 release guide at `136-138`.

### P1. OAuth does not process the protected resource requested by current OpenAI clients

AE publishes protected-resource and authorization-server metadata, but its authorization and token request paths do not read, validate or preserve OAuth `resource` (`src/lib/server/agent-access-oauth-api.ts:325`, `793`, `814`). Current OpenAI authentication guidance requires resource binding through authorization and token exchange. AE's opaque, scoped bearer reduces practical exposure, but does not prove conformance.

This is an implementation and native-release blocker. Resolve it through an officially supported MCP/OAuth integration, then prove the exact canonical resource in actual clients. Do not patch SDK internals or invent an auth tool. See OpenAI's current [plugin authentication guide](https://developers.openai.com/plugins/build/auth) and the [MCP authorization specification](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization).

### P1. The claimed ChatGPT first-protected-tool linking flow is absent from the serialized tool contract

Anonymous `tools/list` intentionally exposes only the accepted four public tools. The high-level registration emits standard annotations but neither per-tool `securitySchemes` nor tool-result `_meta["mcp/www_authenticate"]` (`src/lib/server/mcp-api.ts:276`, `442`). ChatGPT therefore has no protected tool in the public catalogue from which the documented tool-triggered linking flow can begin.

This does not prove all native OAuth is broken. Codex has a separate, plausible `mcp add` then `mcp login` route, and ChatGPT may connect during install or plugin settings. Neither was tested on the same deployed revision. The release must state and prove the actual supported path rather than claiming tool-triggered linking by inference. See OpenAI's [Codex MCP instructions](https://developers.openai.com/codex/mcp/) and [connect-and-test procedure](https://developers.openai.com/plugins/deploy/connect-chatgpt).

### P1. The chosen public origin and public plugin do not exist yet

Every plugin artifact consistently chooses `https://app.aecon.ai`, but that subdomain has no DNS record. Parent-owned live inventory found an existing Git-linked Vercel project serving `www.aecon.ai`; `/api/health` is healthy, `/api/ready` returns 503 because the deployment manifest reports invalid/missing Clerk core configuration, `/api/v1/release` lacks a source revision, and `/llms.txt` still describes a legacy Call path. The apex redirects to `www`; `app` remains unresolved. No cloud state was changed.

No OpenAI registered connection ID, developer scan, installed snapshot, public listing or directory URL is recorded. The chosen plugin shape is supported and accepted; its public existence and behavior are not proved.

### P2. MCP attempt read outage became absence and “start again”

Manual completion preserves `source_unavailable`; MCP OAuth start maps a thrown read to `not_found` (`provider-connection-handoff.ts:275-280`, `369-373`, `808-813`). The page then says the request is gone and recommends starting again (`owner.supply.connections.new.tsx:289-301`). A transient dependency failure is not proof the durable attempt is absent.

### P2. Provider public outage also claimed the market was empty

On loader failure, `/for-providers` returns an error and empty arrays (`src/routes/for-providers.tsx:20-31`). The proof component treats the empty array as authoritative absence and says no Operations are published (`src/components/ae/supply/AeSupplyAgentProof.tsx:26-28`). The local browser showed both messages together. This violates the explicit no-match/outage distinction (`PACKAGE-6-ATOMIC-FEATURE-BUILD-PLAN.md:51-54`; `docs/guides/package-6-plugin-release.md:132`).

### P2. Resume failure silently became a blank Add service form

The Add service loader retains `not_found` and `source_changed`, but the component only passes initial state for `available`; all other resume outcomes disappear (`src/routes/_operator/owner.offerings.new.tsx:29-78`). The durable record may still exist, yet the user sees a fresh form with no explanation or safe next step.

### P2. Completion uncertainty advised retry without current-state readback

Manual connection clears the credential on every result/exception and defaults to “Try again.” A response lost after successful finalization may leave the attempt consumed; a retry then sees `not_found` before it can converge on the result (`owner.supply.connections.new.tsx:99-125`; `provider-connection-handoff.ts:275-286`, `321-355`). The analogous OAuth callback title says “Service not connected” even when the body correctly says AE could not confirm it (`owner.supply.connections.oauth.callback.tsx:61`).

No duplicate Provider effect was reproduced. The defect is the claim and recovery action: re-read the same attempt, redirect on consumed success, offer retry only when existing replay/safety authority proves it safe, and keep uncertainty explicit. A merely `pending` record is insufficient proof while an earlier completion may still be in flight.

## Requirement and task coverage

| Area | Status before fixes | Evidence and remaining gap |
|---|---|---|
| P6-01 MCP metadata and four public tools | **Partial** | Four anonymous tools and byte bounds pass locally. Current OpenAI resource binding and tool-triggered linking fail/are absent; actual clients unproved. |
| P6-02 saved Provider candidate/manual binding | **Demonstrated locally** | Owner, source and environment checks and additive draft ref are covered. No real Provider/source journey. |
| P6-03 handoff preservation and exits | **Partial; confirmed defects** | Cancel, consumed MCP return, resume failure and completion uncertainty defects. |
| P6-04 Operation status/next action | **Partial** | Shared eight-state projector and bounded continuation pass locally; live source transitions and lost resume guidance remain. |
| P6-05 plugin and shared skill | **Partial** | Local scaffold validates and `/SKILL.md` shares one source. No registered/installed/published snapshot. |
| P6-06 public agent entry | **Partial** | Accepted OpenAI-first shape and fallback copy exist. First useful result and native connection are unproved. |
| P6-07 Provider fit/content | **Partial** | Copy covers fit/effects/timing caveats. Outage produces a false empty-market claim. |
| P6-08 support and disclosure | **Partial** | Private email is primary and local UI checks pass. Mailbox receipt/ownership and full accessibility remain unverified. |
| P6-09 language parity | **Partial** | Most touched surfaces preserve Operation/Provider/Account/authority distinctions. Outage, resume and uncertainty wording still collapse states. |
| P6-10 canonical origin | **Blocked** | `app.aecon.ai` absent; existing `www` deployment is not ready and has no source revision. Joel must decide `www` versus `app` before deployment mutation. |
| P6-11 same-revision clients | **Blocked** | No ChatGPT, Codex, Claude or Cursor native proof. |
| P6-12 publisher/listing/install | **Blocked** | Publisher, legal/support readiness, connection registration, listing and public install absent. |

| Journey | Status before fixes | What is proved / missing |
|---|---|---|
| Public discovery, real match, no-match, outage | **Partial** | Local schemas and parity tests exist. Provider public page collapses outage into empty; no deployed real candidate/no-match run. |
| Public-to-connected agent | **Blocked** | Copy and endpoint exist. Native install/auth/intent preservation/first useful result unproved. |
| Authority versus funding | **Demonstrated in local contracts** | Connection is access only; inspection and funding remain separate. Actual authenticated refusal/funding journey not rerun live. |
| Inspect, Invoke, uncertainty recovery | **Partial** | Static and inherited tests preserve Commitment/Invocation and prohibit blind retry. No same-revision external uncertainty journey. |
| Provider saved-source/manual/OAuth | **Partial; confirmed defects** | Direct callback path is stronger; cancellation, consumed return, read outage, silent resume and completion uncertainty fail. |
| Provider expiry/second tab/wrong Account | **Partial / unverified** | Owner/source/environment checks exist. Complete browser/fresh-process branches not proved. |
| Status and one next action | **Partial** | Shared projection passes focused tests. Lost resume and uncertainty produce false or missing guidance. |
| First useful result | **Blocked** | Joel accepted Open-Meteo in the prior plan; the later release guide names a free reference echo that proves mechanics only. Neither is proved deployed here. |
| Plugin/native fallbacks | **Blocked** | Package shape is valid locally. Origin, auth, registration, listing and actual clients remain open. |
| Support/copy/accessibility | **Partial** | Keyboard and compact local checks only. Screen-reader/status, 320px at 200% zoom and mailbox delivery unproved. |
| Rollout/production/commercial boundary | **Correctly blocked** | Package 4 is not closed; Package 5 external gates remain; no production payment or publication claim is allowed. |

## Right questions and decisions

The prior task establishes Joel's accepted choices: OpenAI directory first, exactly four anonymous tools, one shared skill, `app.aecon.ai`, `support@aecon.ai`, Open-Meteo proof, and native fallback clients. The review does not reopen those choices merely because they are below the charter.

Joel has also resolved cancellation: end the pending AE attempt; do not alter an existing saved connection.

Decisions still requiring Joel:

1. **Canonical public origin:** preserve accepted `app.aecon.ai`, or adopt the already deployed `www.aecon.ai`. OAuth resource/audience, plugin manifests, callbacks and generated commands must use one answer. No domain change is authorised by this report.
2. **First useful proof if Open-Meteo is unavailable:** restore same-revision Open-Meteo evidence or approve a replacement useful admitted Operation. The reference echo cannot silently substitute for usefulness.
3. **Supported clients/builds:** which exact ChatGPT, Codex, Claude Code and Cursor versions earn a public support claim after real-client proof.

Whether four anonymous tools becomes a long-term cross-version promise is a later API-lifecycle consideration. It does not block Package 6.

Questions the implementation had to answer through evidence rather than assumption:

- Which OpenAI connection path actually works: install/settings, resource-level login, or protected-tool linking?
- Does every protected request preserve the exact OAuth resource/audience?
- Does an outage remain unavailable across human and machine surfaces, never empty/not-found?
- Can every Provider branch resume from only the stable attempt/draft reference after restart?
- What changed, what did not, who can act, and is retry safe for every non-terminal state?
- Are local delivery, deployed readiness and public release labelled as three different evidence states?

## Keep, remove, correct

Keep the four public tools, one shared skill, official plugin/native-client shape, Package 4 Commitment/Invocation recovery, Package 5 source readers and durable attempts, one Provider status projector, current action/reason/continuation owners, and explicit external gates.

Do not add a new installer, auth tool, OAuth/PKCE implementation, Provider workflow, draft store, lifecycle, error taxonomy, copy system, docs platform, ticketing system, demo catalogue, or retry engine. Do not copy Whop, Locus or Nevermined account/status ontology. The verified local Whop and Locus corpora support a narrow mature pattern: official hosted ceremony, stable resource identity, authoritative readback, distinct connection/authority/funding states, and resumable current status (`.planning/whop-docs/WHOP-SCAVENGE-PAPERCUTS.md:381-597`, `2211-2371`, `3395-3549`; `.planning/locus-docs/LOCUS-SCAVENGE-PAPERCUTS.md:135-239`, `291-394`, `594-749`).

Current Nevermined primary documentation independently supports only a narrower point used here: authentication keys are environment-bound, authorization/payment validation is a separate check that does not consume credits, and settlement occurs after successful service processing. That reinforces AE's separation of connection, authority/payment viability and delivery; it does not supply AE's lifecycle or justify new machinery. See Nevermined's [current five-minute setup](https://nevermined.ai/docs/integrate/quickstart/5-minute-setup) and [current Agents API](https://nevermined.ai/docs/api-reference/typescript/agents).

Correct the six transition defects using existing attempt/draft/source/status authorities. Correct OAuth resource handling and tool-auth metadata only through a supported integration. Correct claims at the evidence boundary: “four anonymous public tools,” “local plugin candidate,” “deployed” only after readiness, and “public” only after an installed listing works.

## Minimal remediation sequence

| Order | Atomic task | Owner/dependency | Acceptance behavior | Exact proof needed |
|---:|---|---|---|---|
| 1 | End a pending AE attempt on Cancel | Provider handoff; Joel semantics resolved | Cancelled link cannot complete/start OAuth; existing connection untouched | Existing route/integration tests extended with cancel then late manual/OAuth action and authoritative `cancelled` readback |
| 2 | Make consumed MCP return match direct callback/HTTP return | Provider route | Reopened consumed attempt restores exact source and selected candidate | Route test follows rendered link into Add service and sees same connection/environment/draft |
| 3 | Preserve outage and uncertainty | Handoff/source authority | Read outage keeps same attempt; completion rereads current state; retry appears only when existing replay/safety authority establishes it, because `pending` alone is insufficient; OAuth title does not claim failure when unknown | Tests for source-unavailable start, lost response after consumed success, explicitly safe replay, and callback uncertain copy |
| 4 | Render resume failures explicitly | Add service route | `not_found`, `source_changed`, expired and cancelled never look like a clean new form | Route/component black-box tests for each tagged resume state and one safe action |
| 5 | Separate Provider outage from empty market | Public Provider route/component | Outage alert suppresses empty/count claims; honest available-empty still renders empty | Existing landing test extended with unavailable and available-empty branches; local browser check |
| 6 | Resolve official OpenAI auth integration | MCP/OAuth owner; depends on official supported API | Exact canonical resource accepted/echoed/validated; actual claimed connection path has required metadata/challenge | Protocol tests plus OpenAI scanner and same-revision ChatGPT/Codex runs; no SDK patch |
| 7 | Verify the changed cone | Lead | Each changed transition passes without weakening four-tool budgets or authority | Exact affected tests first, then the existing repository checks required for the changed dependency cone; retain the original 105-test result as baseline rather than reporting it as post-fix proof unless rerun |
| 8 | Resolve origin and deployment readiness | Joel + operator; after local fixes | One origin serves ready app, release revision, MCP/OAuth/legal/support routes | DNS/TLS/readiness/release readback and same-revision redacted deployment evidence |
| 9 | Native/public closure | Business/integration owner | Installed plugin and fallbacks complete public result, connection, authority refusal, useful Call, recovery, revoke/reconnect | Exact client builds, inputs/results, scanner, publisher/listing/install evidence; Package 4/5 gates remain explicit |

## Honest validation inventory

- Reproduced the release guide's focused command: `npx vitest run tests/seo tests/unit/server/mcp-api-tools-list.test.ts tests/unit/server/mcp-api-official-client.test.ts tests/unit/server/mcp-api-protocol.test.ts tests/integration/provider-connection-attempts.test.ts tests/unit/capability-supply/source-first-owner.test.ts tests/unit/routes/owner-provider-connection-handoff-route.test.ts tests/unit/capability-supply/supplier-operation-status.test.ts tests/unit/ui/supplier-operation-detail.test.tsx tests/unit/ui/agent-door-page.test.tsx tests/unit/ui/supply-funnel-landing.test.tsx tests/unit/routes/support-route.test.tsx tests/unit/routes/sign-in-single-account-exit.test.tsx tests/unit/routes/sign-up-neutral-account-entry.test.tsx tests/unit/discovery/page-markdown.test.ts --no-file-parallelism` -> **19 files, 105 tests passed**.
- `npm run test:imports` -> **48 passed, 1 failed**. The failure reports four unregistered internal imports in two unchanged Package 5 test files. Attribution is verified; the gate remains red and unwaived.
- Parent bounded transition command: `npx vitest run tests/unit/capability-supply/source-first-owner.test.ts tests/unit/routes/owner-provider-connection-handoff-route.test.ts tests/unit/capability-supply/supplier-operation-status.test.ts tests/unit/ui/supplier-operation-detail.test.tsx tests/unit/ui/supply-funnel-landing.test.tsx tests/unit/ui/agent-door-page.test.tsx --no-file-parallelism` -> **6 files, 30 tests passed in 4.14 s**. The local browser also reproduced the Provider outage/empty contradiction.
- Prior documented Playwright check: four keyboard/375/1440 checks passed. It does not prove screen-reader behavior, 320px/200% zoom, authentication or Provider continuation.
- Static/native review inspected plugin tree, shared skill, MCP tiers, OAuth metadata/authorization/token paths and installed SDK serialization. No heavy native tests were run.

External blockers are literal: `app.aecon.ai` unresolved; canonical origin decision pending; existing `www` deployment not ready and source revision unconfigured; OpenAI resource/tool-auth integration unresolved; no registered connection, publisher verification, listing or install; support/legal/reviewer readiness unverified; Package 4 and Package 5 external/commercial gates open.

## Post-fix addendum

The findings above describe the original implementation before authorized atomic fixes.

### Provider outage versus empty market: source and jsdom fix verified

`AeSupplyLanding` now renders the “What agents can inspect” proof section only when `sourceError` is absent. The existing available-empty branch still renders “No Operations are published yet”; the unavailable branch renders the outage and suppresses both the empty claim and proof heading. The change uses the route's existing `sourceError` fact and adds no local status or duplicate catalogue authority.

The existing `tests/unit/ui/supply-funnel-landing.test.tsx` was extended with the unavailable branch. Worker-reported command: `npx vitest run tests/unit/ui/supply-funnel-landing.test.tsx` -> **1 file, 3 tests passed in 867 ms**; worker diff check passed.

A temporary normal-auth local server then exercised the actual `/for-providers` loader outage in the browser. The accessibility tree contained the truthful unavailable message and contained neither “No Operations are published yet” nor the “What agents can inspect” proof section. `/support` rendered the private/current-state guidance and keyboard Tab reached the skip link; `/for-agents` rendered the public entry. The temporary server was stopped afterward. This closes the source, jsdom and local-browser portions of the original Provider outage finding.

The configured browser surface did not provide a compact viewport, so no new compact-screen evidence is credited. These checks were public and unauthenticated; they do not prove Provider sign-in, native account connection or any external client journey.

### Provider handoff and recovery transitions: source and focused tests verified

The authorized transition changes use the existing attempt, source and connection authorities:

- Cancel now invokes the owner-bound cancellation mutation and waits for authoritative state. A cancelled pending AE attempt refuses later manual finalization and later MCP preparation; it creates no saved connection. Cancelling an already consumed attempt leaves its existing saved connection unchanged.
- A reopened consumed MCP attempt now returns connection, environment and draft together, so the destination loader can restore the same connected source and selected draft.
- Pending, cancelled and expired source inputs restore the exact saved source descriptor without restoring a connection, readiness result or candidate. The Provider must explicitly run “Find Operations,” which rechecks current source state.
- A failed resume now renders current guidance instead of silently becoming an unexplained fresh form.
- MCP start read failures remain `source_unavailable` rather than `not_found`.
- Manual completion uncertainty rereads the same attempt using stable keys. It redirects when authoritative state shows consumption and does not infer failure from a lost response. The OAuth callback heading is neutral when completion cannot be confirmed.

Current source anchors: [owner cancellation mutation](</Users/joelchan/Documents/Coding/App-Dev/live/01. Pre-Implementation/Agentic-Economy/convex/capabilityProviderConnectionAttempts.ts:541>), [handoff cancellation and outage mapping](</Users/joelchan/Documents/Coding/App-Dev/live/01. Pre-Implementation/Agentic-Economy/src/modules/capability-supply/internal/supply-funnel/provider-connection-handoff.ts:237>), [route cancellation/readback](</Users/joelchan/Documents/Coding/App-Dev/live/01. Pre-Implementation/Agentic-Economy/src/routes/_operator/owner.supply.connections.new.tsx:52>), [explicit resume failure](</Users/joelchan/Documents/Coding/App-Dev/live/01. Pre-Implementation/Agentic-Economy/src/routes/_operator/owner.offerings.new.tsx:78>) and [neutral callback uncertainty](</Users/joelchan/Documents/Coding/App-Dev/live/01. Pre-Implementation/Agentic-Economy/src/routes/_operator/owner.supply.connections.oauth.callback.tsx:64>).

Independent adversarial review confirmed the owner boundary still rejects foreign access and the restored inputs do not fabricate connected/readiness/candidate state. One bounded limitation remains: repeating MCP start may return a conflict rather than recover the earlier external OAuth redirect because each start creates fresh OAuth state. Reload alone does not restart external authentication. Cancellation ends AE finalization; it cannot revoke secret/token material already created by an external service.

Final implementation-lane verification:

- `npx oxlint convex/capabilityProviderConnectionAttempts.ts src/components/ae/supply/AeSupplySourceNativeStart.tsx src/modules/capability-supply/internal/supply-funnel/provider-connection-handoff-contract.ts src/modules/capability-supply/internal/supply-funnel/provider-connection-handoff.ts src/modules/capability-supply/internal/supply-funnel/source-first-owner.ts src/modules/capability-supply/provider-connection-handoff.ts src/modules/capability-supply/supply-funnel.functions.ts src/routes/_operator/owner.offerings.new.tsx src/routes/_operator/owner.supply.connections.new.tsx src/routes/_operator/owner.supply.connections.oauth.callback.tsx tests/integration/provider-connection-attempts.test.ts tests/unit/capability-supply/provider-connection-handoff.test.ts tests/unit/capability-supply/source-first-owner.test.ts tests/unit/routes/owner-provider-connection-handoff-route.test.ts --deny-warnings` -> **PASS**, zero output.
- `npm run typecheck -- --pretty false` -> **PASS**.
- `npx vitest run tests/integration/provider-connection-attempts.test.ts tests/unit/capability-supply/provider-connection-handoff.test.ts tests/unit/capability-supply/source-first-owner.test.ts tests/unit/routes/owner-provider-connection-handoff-route.test.ts` -> **PASS, 4 files / 27 tests in 1.67 s**. The only diagnostic was the runtime's invalid `--localstorage-file` warning.
- `git diff --check` -> **PASS**.
- `npm run test:imports` -> **FAIL, 10 files passed / 1 failed; 48 tests passed / 1 failed**. It reports the same four baseline Package 5 white-box imports: `tests/unit/capability-supply/openapi-preflight.test.ts:8` and `tests/unit/release/package5-reference-provider.test.ts:12-14`. No new violation was reported.

This focused result does not replace or imply a rerun of the original Package 6 baseline of **19 files / 105 tests passed**.

These changes close the confirmed local transition defects at source and focused-test level. They do not address OAuth `resource`, OpenAI tool-auth metadata, native client acceptance, canonical origin, deployment readiness, publisher/listing/install evidence, Package 4/5 external gates or the repository import failure.
