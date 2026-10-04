# Human and Agent onboarding: reference check and edge cases

Reviewed 4 October 2026. Scope: an existing Agent in Codex, Claude Code or Cursor initiates setup; the Customer follows live platform progress; completion requires a real Tool result and receipt. This checks the current local implementation, including the uncommitted onboarding changes. It does not establish deployed interoperability.

**Current outcome:** all findings below have been fixed locally. The platform now follows one exact request before issuance, its owned Agent, and a selected original Call through access changes and recovery. Original review findings are retained below as the rationale. Fixture and native Ledger evidence establishes the listed contracts; deployed interoperability remains unverified.

## Reference comparison

These are current official documents, not hands-on evaluations or comparative performance measurements. The AE implications below are design conclusions.

| Reference | Documented pattern | Implication for AE |
| --- | --- | --- |
| [OpenRouter OAuth](https://openrouter.ai/docs/guides/overview/auth/oauth) | Browser approval followed by code exchange for a user-controlled key; separate headless flow; suggested versus required workspace selection. | Keep authorization distinct from successful Agent authentication. Confirm the Account the Agent will act through. Offer an appropriate remote-terminal handoff. |
| [Composio connected accounts](https://docs.composio.dev/kb/guide/platform-connected-accounts) and [authentication](https://docs.composio.dev/docs/authentication) | Explicit connection lifecycle and user/account identity; automatic refresh; a fresh connection link when refresh fails. One user can have several upstream accounts. | Retain Agent identity through token changes; distinguish an expired setup link from an expired installed credential. Display the intended Account and connection. |
| [Clerk OAuth](https://clerk.com/docs/guides/configure/auth-strategies/oauth/how-clerk-implements-oauth) | Explicit consent, PKCE, device authorization and Organization selection. Dynamic client names are supplied by registrants; Clerk cautions about misleading names. | A familiar client name does not authenticate a harness. Show the registered destination and exact permissions. Preserve explicit ownership and replacement selection. |
| [Auth0 asynchronous authorization](https://auth0.com/docs/get-started/applications/configure-client-initiated-backchannel-authentication) | Separate initiating and approving devices, a bounded request lifetime and a recognizable approval message. Its CIBA implementation requires a confidential first-party client. | Use request correlation and clear pending/expired states. Public harness setup should retain its existing PKCE/device flows; this reference does not justify replacing them with CIBA. |
| [Nevermined MCP integration](https://nevermined.ai/docs/integrations/mcp) | OAuth integration with explicit sandbox/live selection. The guide documents why relying on the browser's last environment can authorize the wrong tier. | Environment must agree across discovery, request, approval, token exchange and execution. AE's existing mismatch refusals are valuable and must survive UI simplification. |
| [Locus quickstart](https://docs.paywithlocus.com/quickstart) | Start from the Agent's skill instructions, complete human setup and choose spending controls. Sandbox responses are identified as simulated. | Keep setup in the existing Agent task; label simulations and keep funding separate from authority. AE's agreed completion criterion requires actual delivery evidence. |
| [MCP authorization specification, 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization) | Clients send a resource indicator even when the authorization server does not support it. Servers must verify that tokens were issued for their resource; public-client refresh tokens rotate. | Verify recipient binding explicitly or demonstrate the equivalent guarantee through canonical credential admission. An ignored resource alone does not prove a token can access another service. |

## Confirmed workflow findings

### P1 — Live progress starts after admission, not at the Agent's request

The Agents route accepts caller, selected Tool and setup mode, and polls admitted Agents. It has no consent locator to observe the particular pending grant. Native OAuth consent has its own request and recovery screens, but that request is not carried into one continuous live platform view.

Before approval, the Customer cannot follow that particular Agent through pending, issuance, denial, expiry and token exchange on the Agents page. This is a direct gap in the requested experience.

Evidence: [Agents route search](</Users/joelchan/Documents/Coding/App-Dev/live/01. Pre-Implementation/Agentic-Economy/src/routes/_operator/agent-access.tsx:13>), [admitted Agent directory](</Users/joelchan/Documents/Coding/App-Dev/live/01. Pre-Implementation/Agentic-Economy/convex/lib/agentAccess/directory/reads.ts:53>), [live observation hook](</Users/joelchan/Documents/Coding/App-Dev/live/01. Pre-Implementation/Agentic-Economy/src/components/ae/agent-access/home/useAeAgentAccessHome.ts:106>). Existing [consent read](</Users/joelchan/Documents/Coding/App-Dev/live/01. Pre-Implementation/Agentic-Economy/src/lib/server/agent-access-consent.functions.ts:12>) and [consent page](</Users/joelchan/Documents/Coding/App-Dev/live/01. Pre-Implementation/Agentic-Economy/src/components/ae/agent-access/authorize/AeAgentAccessAuthorizePage.tsx>) are the starting points.

Required behavior: follow the specific verification/consent locator, then its admitted Agent, then its original Call. An anonymous device request must not appear in every Customer's directory. Opening the exact verification link and establishing the appropriate authenticated access must precede observation.

### P1 — Credential or authority changes hide the original Call

The progress projection checks current connection and authority before observing Calls, then filters Calls to the current credential. In controlled fixtures:

| Change | Required observation | Actual observation |
| --- | --- | --- |
| Replace credential while its original Call runs | Original Call remains running | Authorized; no Call reference |
| Replace credential while its original Call needs recovery | Original Call remains recoverable | Authorized; no Call reference |
| Reduce future authority to Browse only while a Call runs | Original Call remains visible, with reduced authority shown separately | Browse only; no Call reference |

The commercial Call remains recorded. The failure is in the progress view: it can offer a first-use instruction while an earlier purchase still needs observation or recovery. No duplicate charge was demonstrated.

Evidence: [first-use projection](</Users/joelchan/Documents/Coding/App-Dev/live/01. Pre-Implementation/Agentic-Economy/src/modules/agent-access/first-use.view-model.ts:40>). Its [existing tests](</Users/joelchan/Documents/Coding/App-Dev/live/01. Pre-Implementation/Agentic-Economy/src/modules/agent-access/first-use.view-model.test.ts>) currently require old-credential Calls to disappear; those assertions need a revised contract.

Required behavior: anchor observation to the original owned Call, with current credential health and future purchase authority shown independently. Simply removing the credential filter would let an unrelated historical result count as current progress. The [progress component](</Users/joelchan/Documents/Coding/App-Dev/live/01. Pre-Implementation/Agentic-Economy/src/components/ae/agent-access/home/components/HomeResumeToolSection.tsx:14>) also derives authentication from Call observation and must respect that distinction.

### P2 — Reporting windows can remove delivery or ongoing work from progress

Two backend fixture probes reproduced distinct boundaries:

- A Call created just before 1 October and delivered just after it had a stored receipt. The October read returned that Call as finished, but omitted its receipt-bearing terminal projection. First-use progress therefore cannot establish delivery through this read.
- An ongoing Call followed by 50 newer Calls disappeared from liveCalls, which selects only the latest 50 rows.

Monthly activity correctly follows its reporting contract. Reusing that slice as the evidence for a specific onboarding attempt causes the failure.

Source inspection also found a coverage coupling: above 10,000 monthly projections, usage becomes unavailable. That turns the whole Agent detail partial/unavailable, and background refresh discards the new snapshot even if live Call facts were successfully read. This third case was traced through source, not exercised with 10,001 inserted rows.

Evidence: [monthly bounds](</Users/joelchan/Documents/Coding/App-Dev/live/01. Pre-Implementation/Agentic-Economy/src/modules/agent-access/agent-access-console.ts:164>), [period and recent Call reads](</Users/joelchan/Documents/Coding/App-Dev/live/01. Pre-Implementation/Agentic-Economy/convex/lib/capabilityExecution/callProjection/ownerAgentReadback.ts:150>), [usage coverage projection](</Users/joelchan/Documents/Coding/App-Dev/live/01. Pre-Implementation/Agentic-Economy/src/modules/agent-access/agent-access-console.ts:280>), [discarded partial refresh](</Users/joelchan/Documents/Coding/App-Dev/live/01. Pre-Implementation/Agentic-Economy/src/components/ae/agent-access/home/useAeAgentAccessHome.ts:114>).

Required behavior: read the watched owned Call independently of monthly usage and recent-list pagination. A failed usage summary should label that summary unavailable while retaining fresh, authoritative Call progress.

### P2 — Approval was presented as an established connection; corrected

The successful consent POST rendered “Connected” and promised a signed-in connection. Its approved response proves the approval decision, not that the harness exchanged the credential or authenticated.

The [consent outcome](</Users/joelchan/Documents/Coding/App-Dev/live/01. Pre-Implementation/Agentic-Economy/src/components/ae/agent-access/authorize-form/components/ConsentOutcomeView.tsx:34>) now says “Access approved” and directs the Customer to authenticated access and Tool evidence. Existing [consent tests](</Users/joelchan/Documents/Coding/App-Dev/live/01. Pre-Implementation/Agentic-Economy/tests/unit/routes/agent-access-authorize.test.tsx:369>) now check this distinction, including duplicate activation and Provider access.

## Original protocol observation

### P2 — Explicit resource binding is not implemented

A valid fixture authorization request with resource=https://different.example/mcp returned HTTP 302 to consent and created one grant. The [authorize handler](</Users/joelchan/Documents/Coding/App-Dev/live/01. Pre-Implementation/Agentic-Economy/src/lib/server/agent-access-oauth-api.ts:188>) does not read that field; token handling does not carry it through either.

This is not proof of a cross-service or cross-Account exploit. AE verifies API-key state, deployment environment and canonical admission, and [credential projection matching](</Users/joelchan/Documents/Coding/App-Dev/live/01. Pre-Implementation/Agentic-Economy/src/lib/server/agent-access-principal.ts:16>) checks credential, application, environment and authority agreement. Those controls may supply an equivalent intended-recipient guarantee; that equivalence has not been established here.

Close this with a precise supported-resource contract and observable tests for foreign recipients and equivalent canonical admission. Do not silently change all public credential semantics based on the authorization-request probe alone.

## Contract applied to this implementation

Implementation authorized by Joel on 4 October: fix all findings. The technical design review uses the agreed product decisions without another interview. Thesis: one owned request and its original Call remain observable while access changes independently. Integrity is strong when consent, access and delivery remain distinct. The main risks are ambiguous attempt selection, stale owner/target responses and loss of receipt evidence. Keep the existing OAuth and execution state machines; cut a separate onboarding database or orchestration layer. Existing indexed records and read-only polling bound both cost and blast radius.

Type design: Call progress carries an independent access state; delivered requires receipt evidence. Request progress is a sanitized discriminated result, with ownership refusal distinct from source outage. Complexity cost: an exact-Call read, an exact credential-to-owned-Agent lookup and a request observation concern. Benefit: no history scans, credential-generation coupling or parallel state authority. Keep these boundaries for their real UI callers; extend existing registrations rather than add a service or dependency.

Failure contract: source outages are recoverable and retain confirmed observations with a delay marker; ownership refusal clears them; invalid resource or locator input is rejected before writes. Observation has the strong no-commercial-mutation guarantee; security rate counters remain separate. Consent issuance and token delivery remain non-idempotent operations protected by their existing grant CAS, issuance key and delivery claim; new progress reads never invoke those mutations. Verify duplicate/concurrent approvals and interrupted exchanges through the existing fixtures, plus exact-Call reads under rotation, period changes and history overflow.

Requires: a specific consent locator or owned Agent, and the original Call once a purchase exists. References select observations; authenticated server ownership grants access.

Ensures: the Customer sees recorded setup, authentication, authority, Call and receipt facts, with unavailable or delayed evidence identified. Rotation, revocation, reporting periods and unrelated purchases cannot remove the watched Call.

Invariant: approval is not authentication; funding is not authority; settlement is not delivery. Observation creates no purchase. An uncertain purchase retains its Call identity and cannot become an invitation to purchase again.

On violation: reject mismatched ownership or environment; preserve confirmed Call evidence through an outage; show an explicit recoverable state. An expired setup request requires a fresh connection request while existing Calls remain independently observable.

The minimum design is two visible groups: current access, and this Call's progress. Reuse consent and Call records. A separate persisted orchestration system would add another state authority without solving ownership or receipt evidence.

## Original review evidence

The final nine-file suite passed 185 tests after the copy change. It exercises:

- Exact owner and environment binding, registered redirect destinations, PKCE, narrowed Tool permissions and safe default authority.
- Concurrent approval reservations, repeated activation, MFA cancellation, denial and expired grants.
- Lost secret delivery, refresh rotation, lost refresh commit responses and interrupted refresh delivery.
- Planned versus compromised credential replacement, stable Agent identity and shared capacity.
- Live queued/running/receipt observation, delayed reads, backoff, hidden-tab resumption, pagination and discarding an old response after Agent selection changes.
- Uncertain delivery/payment and missing receipts retaining recovery state within the current credential/window.

Those guarantees do not close the newly reproduced cross-generation and window cases.

Acceptance still needed: a stopped harness after approval; two simultaneous setup requests; a Customer switching Accounts mid-consent; expired verification links versus expired installed credentials; exact original Call continuity through revocation, rotation and funding handoffs; a previous result for the same Tool versus this attempt; and native OAuth in deployed Codex, Claude Code and Cursor, including remote-terminal callbacks. Keep one primary next action and the client/Account/Tool context visible so the Customer does not have to reconstruct the handoff. This cognitive review was source-based; visual quality and focus behavior were not reassessed through screenshots.

Validation commands used Node 22/npm 11.5.1:

- npm test -- src/modules/agent-access/first-use.view-model.test.ts src/components/ae/agent-access/home/useAeAgentAccessHome.test.ts src/components/ae/agent-access/authorize-form/components/ConsentOutcomeView.test.tsx tests/unit/routes/agent-access-caller-continuation.test.tsx tests/unit/routes/agent-access-authorize.test.tsx tests/unit/server/agent-access-oauth-api.test.ts tests/unit/agent-access-oauth-state.test.ts tests/unit/convex/agent-credential-replacement.test.ts tests/unit/convex/capability-call-projection.test.ts --no-file-parallelism — 185 passed.
- npm run check — passed.
- Two temporary acceptance-probe files — six assertions failed with the observations recorded above. Five concern workflow continuity; the sixth expresses a proposed explicit-resource rejection contract. The temporary files were removed.

The authenticated browser lifecycle assertions were aligned with the corrected consent copy; that hosted suite was not run. No external purchase, hosted credential issuance, deployment, merge or release gate was performed. Provider, identity and deployment boundaries in fixture checks remain unverified against their hosted services.


## Implemented resolutions and acceptance evidence

| Finding | Final behavior | Observable evidence |
| --- | --- | --- |
| Pre-admission visibility | Consent exposes **Follow live onboarding** with its exact locator. The owned platform view observes pending, issuing, approved, exchanging, exchanged, denied and expired states. It resolves an issued credential to a durable owned Agent; no anonymous grant directory or new workflow store. | Request-to-Agent controller test, pending-request route test, exact-locator pure reader tests; ownership and environment refusals; two request locators cannot share stale evidence. |
| Cross-generation Call loss | Call identity is explicit in the URL and owner query. Current access is a separate fact. Rotation, Browse only downgrade, expiry and revocation cannot hide the original Call. Several unresolved Calls require a selection; historical success cannot complete a new attempt. | First-use model cases for exact receipts, missing receipts, uncertain payment/delivery, old credentials, revoked/expired access and simultaneous Calls. The backend directory journey proves both replaced and revoked keys map only to their original owned Agent. |
| Reporting-window loss | Exact Call and receipt reads use indexed identity outside monthly reports. Pending and uncertain work have separate bounded reads, so 50 newer terminal Calls cannot displace them. A usage-cap failure labels usage unavailable while current Call/access facts still update. | Backend test with 60 newer terminal Calls and a receipt from a Call created 40 days earlier; foreign Account/Agent reads return missing. Source adapter test supplies usage_window_too_large and verifies the exact receipt remains visible without private source fields. |
| Premature completion | Approval, exchange, current authentication and Tool delivery remain separate. Completion requires the selected Call's delivered result and receipt; missing terminal projection is shown as recording, without a second purchase. | Consent copy, repeated activation, first-use and native MCP result/receipt tests. |
| Foreign OAuth resource | Explicit resource must match the canonical resource advertised in AE protected-resource metadata (the canonical base URL, with normal URL serialization). Omission preserves legacy device clients using the single AE audience. Foreign, fragment-bearing, user-info and duplicate values are rejected before grant insertion, claims or token delivery. | Authorize/device/token rejection tests, canonical-host serialization and alias-host tests. Existing canonical admission tests reject different credential, Account, application, environment, authority and scopes; source outage is a retryable refusal. This proves the fixture boundary, not remote Clerk behavior. |
| Recovery ergonomics | Same-target outages retain confirmed facts with delayed updates and backoff; owner refusal clears observations. Consent and pending requests do not depend on unrelated directory reporting. Callback state survives the live link and sign-in. Funding instructions recover existing Calls and only procure when no Call exists. | Hidden-page/resumption, coalescing, stale-target, delayed-bootstrap, initial directory outage, callback and funding-return tests. |
| Locator privacy | Owner request reads are private/no-store, the view uses no-referrer, and telemetry filters both camelCase and protocol-form verification locators. References remain selectors rather than permission. | Redaction test preserves business phase while removing grant/device/user/authorization codes; response and page headers are explicit. |

Skill conclusions checked against the final implementation: contract enforcement keeps ownership at the server, requires receipt evidence and preserves Call identity. Error recovery belongs to the existing consent and Call machines; observations issue no credentials and retry no purchase. Existing CAS/issuance keys/delivery claims remain intact. Type design couples request observations to their exact locator and keeps current access independent from Call state. Complexity review keeps three indexed read boundaries and one typed UI concern for real callers; there is no new service, database state or dependency. The cognitive review keeps the client/environment visible, puts request references behind disclosure and gives one primary action per state. Visual structure reuses existing responsive Arc panels and controls; this change was not reassessed in a hosted authenticated browser.

No backend/public storage schema changed. The owner-only Convex query and optional exact-Call read argument are additive; the API-kind baseline includes the registered query. No deployment, merge or release gate was performed. Live external Provider and Clerk behavior, remote-terminal callbacks and deployed Codex/Claude Code/Cursor OAuth remain acceptance work.


Final verification, Node 22 / npm 11.5.1:

- `npm run check` — passed, including frontend/Convex types, zero dependency cycles, module/registration fences and TypeScript standards.
- `npm run build` — passed; server build syntax verified across 468 modules. Existing vendored bundler directive warnings remain non-fatal.
- Focused suite below — 18 files / 312 tests passed.
- `AE_FORMANCE_INTEGRATION=true npm test -- tests/integration/capability-call-money-matrix.test.ts --no-file-parallelism` — 10 native Ledger tests passed. The MCP first-use fixture observes the exact owned Call from acceptance to actual output and receipt, and replay does not purchase twice. Provider/CDP and identity edges in this fixture are simulated; the local Ledger is native.
- `git diff --check` — passed. No deployment, merge or release gate.

```sh
NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm test -- \
  src/modules/agent-access/first-use.view-model.test.ts \
  src/components/ae/agent-access/home/useAeAgentAccessHome.test.ts \
  tests/unit/routes/agent-access-caller-continuation.test.tsx \
  tests/unit/routes/agent-access-console.test.ts \
  tests/unit/convex/capability-call-projection.test.ts \
  tests/unit/server/agent-access-oauth-api.test.ts \
  tests/unit/server/agent-onboarding-request.test.ts \
  convex/agentAccessPrincipals.test.ts \
  tests/unit/routes/agent-access-authorize.test.tsx \
  src/components/ae/agent-access/authorize-form/components/ConsentOutcomeView.test.tsx \
  tests/unit/routes/funding-return-route.test.tsx \
  tests/unit/agent-access-oauth-state.test.ts \
  tests/unit/convex/agent-credential-replacement.test.ts \
  tests/unit/server/agent-access-auth.test.ts \
  tests/unit/server/mcp-api-official-client.test.ts \
  tests/unit/server/mcp-api-protocol.test.ts \
  tests/unit/server/mcp-api-tool-call.test.ts \
  tests/unit/observability/private-route-safety.test.ts \
  --no-file-parallelism
```
