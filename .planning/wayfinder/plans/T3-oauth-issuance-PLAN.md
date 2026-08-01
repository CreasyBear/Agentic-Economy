# T3 — Soar-shaped OAuth/device-code issuance

## Context

Ticket `.planning/wayfinder/tickets/T3-cold-agent-keys.md` is resolved by the founder on 2026-07-30: an agent starts credential issuance, a signed-in human authorizes it in a browser, and a scoped Clerk API key is returned to the polling agent. The prior recommendation to ship keyless `inspect_only` first is overruled. This plan is the implementation contract for that decision. It does not change product source itself.

The live write seam is:

- `src/routes/api.v1.requests.ts` → `src/lib/server/customer-request-agent-api.ts` → `authenticateCustomerRequestAgent()` → `auth({ acceptsToken: 'api_key' })` in `src/lib/server/customer-request-agent-auth.ts`.
- `authenticateCustomerRequestAgent()` re-reads `clerkClient().apiKeys.get(keyId)`, rejects a revoked, expired, mismatched, or unavailable key, and returns `principalId: clerk_api_key:<id>`, owner, credential id, and current scopes.
- `CUSTOMER_REQUEST_AGENT_SCOPE` is currently the literal `customer_requests:create` in `src/modules/customer-request/agent-contract.ts:3`. `CUSTOMER_REQUEST_STANDING_AUTHORITY_SCOPE` is currently the separate `customer_requests:standing_authority` literal and is used by repeat-permission handlers in `customer-request-agent-api.ts`.
- `/agent-access` is `src/routes/_operator/agent-access.tsx`. It currently invokes `issueCustomerRequestAgentKeyServer` and `revokeCustomerRequestAgentKeyServer`, creates a seven-day key, displays the secret for manual copy, and revokes the displayed key. The source-owned key logic is `src/modules/customer-request/agent-access.ts`; it calls Clerk API-key list/create/get-secret/revoke ports and stores AE claims for replay identity.
- The MCP adapter is `src/lib/server/mcp-api.ts`. T6 currently builds a fresh stateless server, exposes the four read-only `mcp` actions, and throws if an anonymous action is not `readOnly`. The future authenticated tier must replace this guard deliberately, not weaken it or treat a key as authority.

Clerk capability findings were checked against the current official documentation on 2026-07-30:

- [Clerk API keys guide](https://clerk.com/docs/guides/development/machine-auth/api-keys) documents enabling User or Organization API keys in the Dashboard, server-side `clerkClient.apiKeys.create({ name, subject, scopes, claims, createdBy, secondsUntilExpiration })`, `list`, `verify`, `getSecret`, and immediate `revoke`. API-key scopes are application-defined strings, and the feature is usage-priced. A generated API key is an opaque bearer credential associated with a user or Organization.
- [Clerk `apiKeys.create()`](https://clerk.com/docs/reference/backend/api-keys/create.md) confirms custom string scopes, `secondsUntilExpiration`, `claims`, and `subject`; [revoke](https://clerk.com/docs/reference/backend/api-keys/revoke.md) confirms immediate invalidation. The current app already uses these methods through `clerkClient()`.
- [Clerk OAuth implementation](https://clerk.com/docs/guides/configure/auth-strategies/oauth/how-clerk-implements-oauth.md) documents browser authorization-code OAuth, public clients with PKCE S256, dynamic client registration, consent screens, and built-in scopes (`openid`, `profile`, `email`, metadata, and organization read). It explicitly says custom OAuth scopes are not yet available. Its authorization-server metadata lists `authorization_code` and `refresh_token`, not the RFC 8628 device-code grant. Therefore Clerk is not assumed to provide AE's custom authority-mode scopes or device-code endpoints.
- Clerk provides the signed-in browser identity/session and the API-key credential lifecycle. AE builds the RFC 8628 device-code state machine, browser consent and grant binding, AE scope policy, the OAuth metadata/challenge surfaces, dynamic registration needed by MCP clients, and the translation from an approved grant to a Clerk API key.

MCP research (`agent://McpGoldStandard` and `.planning/research/2026-07-30-flysoar-cli-shape.md`) establishes the host boundary: Streamable HTTP at `/mcp`, progressive anonymous-read to OAuth-scoped tools, RFC 9728 protected-resource metadata, a 401 `WWW-Authenticate: Bearer resource_metadata="..."` challenge, OAuth 2.1 authorization-code + PKCE S256, dynamic client registration, and safety-labelled tool descriptions. The evidence ceiling for development is labelled local/dev; an issued key is not evidence of provider fulfilment, booking, payment, dispatch, or customer value.

## Decisions (settled)

1. **One AE authorization server, two grant entry paths.** The primary cold-agent path is RFC 8628-shaped device authorization. `POST /oauth/device_authorization` returns an opaque `device_code`, human `user_code`, `verification_uri`, `expires_in`, and polling `interval`. The agent opens the verification URI for the human and polls `POST /oauth/token` with `grant_type=urn:ietf:params:oauth:grant-type:device_code`. After approval, the token endpoint returns the Clerk API-key secret as `access_token` with `token_type: Bearer`, the granted AE scope string, and the seven-day key lifetime. It never returns the secret to the browser.
2. **MCP compatibility uses authorization code + PKCE against the same AE server.** Add `POST /oauth/register`, `GET /oauth/authorize`, and the `grant_type=authorization_code` branch of `POST /oauth/token`. Public MCP clients register exact redirect URIs, send `state`, `code_challenge_method=S256`, and exchange a one-time authorization code. The browser is still signed in through Clerk; the token endpoint creates the same scoped Clerk API key. Do not configure a Clerk OAuth application as the source of AE scopes: Clerk's documented custom OAuth scope limitation makes that unsafe. Clerk dynamic client registration remains a documented capability, but AE owns registration because AE must bind redirect URIs and custom authority scopes.
3. **Scopes mirror ADR-019 authority modes, while `customer_requests:create` remains the credential baseline.** Add these exact literals in `src/modules/customer-request/agent-contract.ts`:
   - `CUSTOMER_REQUEST_AGENT_SCOPE = 'customer_requests:create'` — admits the Customer Request API and remains required on every issued key.
   - `CUSTOMER_REQUEST_INSPECT_ONLY_SCOPE = 'customer_requests:inspect_only'`.
   - `CUSTOMER_REQUEST_APPROVE_EACH_SCOPE = 'customer_requests:approve_each'`.
   - `CUSTOMER_REQUEST_BOUNDED_MANDATE_SCOPE = 'customer_requests:bounded_mandate'`.
   - `CUSTOMER_REQUEST_FULL_YOLO_SCOPE = 'customer_requests:full_yolo'`.
   The mode scopes have an explicit rank (`inspect_only < approve_each < bounded_mandate < full_yolo`) and a key has exactly one mode scope. New issuance always returns `customer_requests:create` plus the selected mode scope. A legacy key carrying only `customer_requests:create` is treated as `inspect_only` for compatibility and is never upgraded. Replace the current `CUSTOMER_REQUEST_STANDING_AUTHORITY_SCOPE` checks with the ranked mode check; do not issue or accept `customer_requests:standing_authority` for new credentials.
4. **A mode scope is a capability ceiling, not customer authority.** `inspect_only` admits submit/continue/compare/prepare/read/evidence/recovery and no consequential release. `approve_each` additionally admits confirmation and start routes, but each exact current option still requires the existing customer confirmation and RouteMandate enforcement. `bounded_mandate` additionally admits standing repeat-permission operations, but only an exact current RouteMandate/RouteStepGrant, principal, generation, spend, data, recipient, count, concurrency, expiry, and idempotency checks can release work. `full_yolo` is a broader explicit mode ceiling only; it is never ambient permission and still requires a current explicit, revocable mandate. The source boundary remains the final authority check.
5. **Device and authorization-code state is durable and one-time without storing raw secrets.** Add one module-owned grant table for device/auth-code state and one module-owned public-client table. Store only SHA-256 hashes of device code, user code, and authorization code; store no Clerk API-key secret, refresh token, browser cookie, or PKCE verifier. Device grants expire after 10 minutes, authorization codes after 60 seconds, API keys after 7 days, and a successful device poll consumes the grant. Polling before `nextPollAt` returns OAuth `slow_down`; expired, denied, and consumed grants return the corresponding OAuth error. CAS transitions prevent double approval and double delivery. The API key remains revocable in Clerk after delivery.
6. **`/agent-access` becomes credential inventory and consent, not manual secret copy.** Keep `/agent-access` as the signed-in owner inventory: show assistant/client name, granted mode, created time, expiry, current/revoked/expired state, and a revoke action. Add `/agent-access/authorize?user_code=...` as the human approval page: show the requesting client, exact requested mode, what Customer Request operations the mode allows, the seven-day expiry, and explicit approve/deny controls. Approval never renders the API-key secret. An expired or revoked credential is not renewed in place: show the agent a 401 recovery path to start a new device flow, and show the owner a clear expired/revoked status plus a new authorization action. Denying or abandoning a pending code is safe and leaves no key.
7. **MCP keeps the anonymous tier and adds an explicit authenticated-tier seam.** `handleMcpRequest()` resolves an anonymous or authenticated tier. Anonymous requests still expose exactly the current four read-only actions and retain the construction-time `readOnly` guard. A valid Clerk API key with `customer_requests:create` and a ranked mode scope selects the authenticated projection; only actions explicitly surfaced as `mcp` and whose declared authority requirement is within the key's mode may appear. The key is used for identity/capability admission only; the action's source-owned authority checks remain mandatory. Missing/invalid credentials for an authenticated-only MCP tool return HTTP 401 with the RFC 6750 challenge before the tool executes. This is the seam T6 deferred; do not expose a non-read-only action anonymously merely because the registry contains it.
8. **Use one protected-resource audience and one metadata URL for both protected surfaces.** Add `GET /.well-known/oauth-protected-resource` with `resource=<canonical origin>`, `authorization_servers=[canonical origin]`, `bearer_methods_supported=['header']`, and all four AE mode scopes plus `customer_requests:create` in `scopes_supported`. Both `/mcp` protected-tool challenges and `/api/v1/requests` missing/invalid-key challenges point to this URL. Add `GET /.well-known/oauth-authorization-server` with AE `issuer`, `/oauth/authorize`, `/oauth/token`, `/oauth/register`, `/oauth/device_authorization`, `grant_types_supported` for authorization code/device code/refresh only if actually implemented, `response_types_supported:['code']`, `token_endpoint_auth_methods_supported:['none']`, and `code_challenge_methods_supported:['S256']`. Do not publish an OIDC `openid-configuration` claim or refresh-token behavior that is not implemented.
9. **401 and 403 remain different outcomes.** Missing, wrong-type, expired, revoked, mismatched, or unavailable API keys return 401 with `WWW-Authenticate: Bearer resource_metadata="<origin>/.well-known/oauth-protected-resource", scope="customer_requests:create"`. A valid key with an insufficient mode returns 403 with a `WWW-Authenticate` challenge naming the required mode and a typed `scope_required` body. No stack, Clerk error internals, API-key secret, or raw device code is logged or returned.
10. **Public claim boundaries follow evidence.** Before OAuth implementation, public copy may say an external agent can discover, read, compare, and call labelled sandbox quote surfaces without a key. After labelled local/dev flow proof, copy may say an agent can request a scoped credential, a signed-in person approves it in a browser, and the agent receives a short-lived/revocable key; it must not say hosted reachability or real supply. After hosted readback at an exact revision, copy may say the named hosted endpoints complete that consent journey. A key-gated MCP claim names only the surfaced tools and mode boundary. No stage may claim autonomous authority, booking, payment, dispatch, provider fulfilment, or customer value.
11. **HITL is explicit.** A human must enable Clerk User API keys in the Dashboard, confirm the production Clerk instance/domain and API-key scope behavior, configure `CLERK_SECRET_KEY`/publishable key/JWT issuer values and `AE_CONVEX_SERVER_FUNCTION_TOKEN` in each deployment, and approve the exact OAuth/MCP public-client policy before rollout. No secret is committed to the repository, browser storage, Convex documents, or test fixtures.

## Approach

### 1. Establish scope and authority-mode vocabulary

Update `src/modules/customer-request/agent-contract.ts`:

- Export the five exact scope constants and `CUSTOMER_REQUEST_AUTHORITY_MODE_VALUES = ['inspect_only', 'approve_each', 'bounded_mandate', 'full_yolo'] as const`.
- Export a pure `customerRequestAuthorityModeForScopes(scopes)` that returns the highest explicitly present mode, maps create-only legacy keys to `inspect_only`, and rejects multiple incomparable mode scopes or unknown caller-requested modes. Export `customerRequestScopeForMode(mode)` and `customerRequestModeAllows(granted, required)` for host checks.
- Remove the live use of `CUSTOMER_REQUEST_STANDING_AUTHORITY_SCOPE`; migrate all callers to `customerRequestModeAllows`.

Update `src/lib/server/customer-request-agent-auth.ts`:

- Extend `authenticateCustomerRequestAgent()` with an optional `requiredMode` argument and return the derived `authorityMode` on the authenticated principal.
- Keep `auth({ acceptsToken: 'api_key' })`, current-key `clerkClient().apiKeys.get(keyId)` verification, owner derivation, and fail-closed behavior unchanged.
- Check the required base scope first, then the ranked mode. Never derive authority from a caller-supplied query/body field.

Update `src/lib/server/customer-request-agent-api.ts`:

- Pass `requiredMode: 'approve_each'` for confirmation and start handlers.
- Pass `requiredMode: 'bounded_mandate'` for list/use/allow/withdraw repeat-permission handlers; `full_yolo` passes this ranked check.
- Leave submit, facts, messages, compare/options, inspect, evidence, recovery, and safe cancellation at the base `customer_requests:create` gate.
- Replace the local `scope_required` check with the shared mode helper.

Update `src/modules/customer-request/service-auth-envelope.ts` and `convex/customerRequestApplication.ts`:

- Keep scopes inside the signed assertion material.
- Add the same operation-to-mode table at `resolveRequestCaller()` so a forged or stale service assertion cannot call `confirm`, `run`, or standing-repeat operations with create-only/inspect-only scopes.
- Preserve the existing exact RouteMandate, RouteStepGrant, principal, generation, spend, data, expiry, idempotency, uncertainty, and cancellation checks. A mode scope must never become a substitute for those checks.

Focused tests: extend `tests/unit/customer-request-agent-auth.test.ts`, `tests/unit/customer-request-agent-access.test.ts`, and add mode/signed-assertion cases to the focused Customer Request tests. Prove legacy create-only maps only to inspect, mode rank cannot widen, and an assertion without the required mode is refused.

### 2. Add durable OAuth grant and public-client state

Add the module-owned tables to `src/modules/customer-request/internal/convex-schema.ts` and keep `convex/schema.ts` as the composition root that already spreads `customerRequestTables`:

- `customerRequestAgentOAuthGrants`: `grantRef`, `flow` (`device_code` or `authorization_code`), `clientId`, optional exact `redirectUri`, `requestedScopes`, optional `codeChallenge`/`codeChallengeMethod`, hashed device/user/auth codes, `status` (`pending`, `approved`, `denied`, `delivery_claimed`, `consumed`, `expired`), optional owner/key ids, `createdAt`, `expiresAt`, optional `approvedAt`, `consumedAt`, `nextPollAt`, and a bounded display name. Index hashes and `grantRef`; do not index raw secret material.
- `customerRequestAgentOAuthClients`: `clientId`, `clientName`, exact `redirectUris`, allowed `grantTypes`, `tokenEndpointAuthMethod` (`none`), `createdAt`, and `lastUsedAt`, indexed by `clientId`. Public registration creates no client secret.

Add `convex/customerRequestAgentOAuth.ts` with explicit argument/return validators and bounded work:

- Public `createDeviceGrant` hashes the generated opaque values before insert, validates one mode plus the base scope, and returns only the raw device/user values needed by the agent and verification URI.
- Public `readGrantForPoll` reads by hash, advances expired pending state, enforces `nextPollAt`, and returns only status/key id/error metadata. It never returns an API-key secret.
- Authenticated `approveGrant` checks Clerk identity from `ctx.auth`, exact user-code hash, pending state, expiry, and requested grant/client; atomically records the owner and key id. `denyGrant` performs the corresponding pending-to-denied CAS.
- Public `claimGrantDelivery` changes approved to delivery-claimed exactly once; `completeGrantDelivery` changes it to consumed after a successful secret retrieval. A failed Clerk read resets delivery-claimed to approved only when the claim token still matches.
- `registerClient` validates HTTPS or loopback redirect URIs, `response_types=['code']`, `grant_types` from the supported set, `token_endpoint_auth_method='none'`, and a bounded requested scope set; it returns a random public client id and no secret. `readClient` is bounded by indexed client id.
- Add a scheduled cleanup mutation or bounded expiry path for old consumed/denied/expired rows. Never use an unbounded table scan.

Add `tests/unit/customer-request-agent-oauth-state.test.ts` for hash-only persistence, expiry, poll interval, deny, single approval, single delivery, code replay, redirect binding, and unknown/overbroad scope refusal. Add the narrow Convex integration test for CAS races when the project’s existing Convex harness is available.

### 3. Make key issuance an approved-grant operation

Update `src/modules/customer-request/agent-access.ts`:

- Replace the fixed-scope issuance input with `{ ownerId, name, idempotencyKey, scopes, grantRef }`; validate that scopes are exactly base plus one mode scope and derive the mode from the constants.
- Preserve Clerk claims (`aePurpose: 'customer_request_agent'`) and add stable `aeGrantRef`, `aeDisplayName`, `aeAuthorityMode`, and `aeIssuanceKey` values. The grant reference is the idempotency identity; a retry lists/replays the same current unrevoked key instead of creating a duplicate.
- Keep the seven-day `secondsUntilExpiration` literal (`604800`) and the existing owner/key ownership checks. The approval path must discard the `create()` secret and never serialize it to the browser; the token endpoint obtains the secret through the Clerk `getSecret` port after its delivery CAS.
- Keep `revokeCustomerRequestAgentKey()` as the owner-only immediate Clerk revocation seam. Add a bounded list/read projection for `/agent-access` that includes mode, expiration, and revoked/expired state but never includes `secret`.

Update `src/modules/customer-request/agent-access.functions.ts`:

- Remove the manual “create key and return secret to the browser” server function from the active route.
- Add server functions for owner inventory, grant approval, grant denial, and revoke. Each calls `auth()` for the signed-in Clerk user, `clerkClient()` for key lifecycle, and the authenticated/public Convex source ports for grant CAS. Never send key secrets in server-function results.
- Approval orchestration is: load pending grant → issue/replay the Clerk API key by grant idempotency claim → CAS the grant to approved with key id → revoke a newly-created orphan if the CAS lost a race. Existing owner identity and grant owner binding remain mandatory.

Update `tests/unit/customer-request-agent-access.test.ts` to assert base-plus-mode scopes, claims, seven-day expiry, replay, ownership, no secret in inventory/approval output, and immediate revoke. Keep Clerk API calls injected as ports.

### 4. Implement the AE OAuth/device-code HTTP adapter

Add `src/lib/server/customer-request-agent-oauth-api.ts` as the only HTTP translation layer for device authorization, token polling, client registration, and browser authorization. It must use the source-owned module plus Convex ports; it must not contain Customer Request or RouteMandate business rules.

Implement these exported handlers and exact wire shapes:

- `handleDeviceAuthorizationPost(request)`: parse `application/x-www-form-urlencoded`, require registered/public client id where supplied, normalize a single requested mode plus `customer_requests:create`, create the grant, and return RFC 8628 fields `{ device_code, user_code, verification_uri, expires_in: 600, interval: 5 }`. Return `invalid_client`, `invalid_scope`, or `invalid_request` without leaking grant existence.
- `handleOAuthAuthorizeGet(request)`: validate client, redirect URI, `response_type=code`, `state`, PKCE S256 challenge, and requested scopes; if no Clerk session, redirect to the existing signed-in Clerk entry with a return URL preserving all validated parameters; if signed in, render/redirect to the consent UI. Approval creates a one-minute authorization-code grant and redirects only to the registered exact URI with `code` and the original `state`.
- `handleOAuthTokenPost(request)`: support device-code polling and authorization-code exchange. Device polling returns `authorization_pending`, `slow_down`, `access_denied`, `expired_token`, or `invalid_grant` as OAuth JSON with `Cache-Control: no-store`; successful delivery returns the Clerk API-key secret as the bearer `access_token`, `scope`, `expires_in: 604800`, and then consumes the grant. Authorization-code exchange requires matching client id, redirect URI, PKCE `code_verifier`, and one-time code consumption before returning the same key shape. Do not issue Clerk OAuth tokens or refresh tokens in this slice.
- `handleOAuthRegisterPost(request)`: implement constrained RFC 7591 public registration. Accept only public clients (`token_endpoint_auth_method='none'`), authorization-code/device grant types, `response_types=['code']`, exact bounded redirect URIs, and AE scopes. Return `client_id`, `client_id_issued_at`, redirect URIs, grant types, response types, and scope. Do not proxy arbitrary registration to Clerk.
- `handleOAuthConsentPost(request)`: accept only the signed-in owner’s validated user code, then call the server-function/module approval path. Return a safe status for the browser; no key secret.

Add `src/lib/http/oauth-challenge.ts` (or an equivalent shared server helper) with `bearerChallenge(canonicalBaseUrl, requiredScope)` and `oauthProtectedResourceMetadata(canonicalBaseUrl)`. Use the same canonical URL resolver as discovery; set `WWW-Authenticate`, `Cache-Control: no-store`, and `Vary: Authorization` where appropriate.

Update `src/lib/server/customer-request-agent-api.ts` refusal handling so the 401/403 responses use the challenge helper. The response body remains the existing typed `{ kind: 'refused', reason }` contract; only headers are extended.

### 5. Add routes and well-known metadata

Add thin TanStack Start routes:

- `src/routes/oauth.device_authorization.ts` → `POST handleDeviceAuthorizationPost`.
- `src/routes/oauth.token.ts` → `POST handleOAuthTokenPost`.
- `src/routes/oauth.register.ts` → `POST handleOAuthRegisterPost`.
- `src/routes/oauth.authorize.ts` → `GET handleOAuthAuthorizeGet` and `POST handleOAuthConsentPost` if the browser consent is hosted there.
- `src/routes/[.]well-known/oauth-authorization-server.ts` → `GET` the AE authorization-server metadata.
- `src/routes/[.]well-known/oauth-protected-resource.ts` → `GET` the shared RFC 9728 metadata for the AE origin resource server.

Keep `/mcp` and `/api/v1/requests` on the existing origin. `/.well-known/` is already reserved by `src/lib/http/agent-content-negotiation.ts`; add `/oauth/` and any verification URI only if the current middleware would negotiate them as page markdown. Never hand-edit `src/routeTree.gen.ts`; regenerate through the normal Vite route plugin.

Add focused route tests in `tests/unit/server/customer-request-agent-oauth-api.test.ts` and `tests/unit/routes/oauth-metadata.test.ts`:

- exact device issuance response and bounded scope rejection;
- pending/slow-down/denied/expired/consumed poll outcomes;
- signed-in approval binds the Clerk owner and creates one key;
- authorization-code + PKCE exchange and code replay refusal;
- exact redirect URI and state preservation;
- dynamic registration rejects secrets, wildcard redirects, unknown grant types, and unknown scopes;
- protected-resource and authorization-server metadata contain only implemented endpoints and scopes;
- API-key secret never appears in browser approval JSON, persisted grant rows, or error bodies.

### 6. Replace manual operator UI with consent and credential inventory

Update `src/routes/_operator/agent-access.tsx`:

- Replace the manual “Create a seven-day key” form and secret copy card with the owner inventory and a short explanation: an assistant starts authorization; the signed-in owner reviews the requested mode in the browser; the credential expires in seven days and can be revoked immediately.
- Render current, expired, revoked, and pending records with mode, created/expiry dates, client/assistant name, and revoke action. Do not render secrets.
- Add a link to start a local owner-authenticated authorization only as a recovery/manual path; it must create the same scoped grant, not a second issuance implementation.

Add `src/routes/_operator/agent-access.authorize.tsx`:

- Read/validate `user_code` from the URL, render client name, requested mode, exact permissions, expiry, and approve/deny buttons using Astryx components and complete loading/error/expired states.
- Require the existing owner/operator session. Approval/denial calls the server function, then shows “Approved — return to your assistant” or a safe denial/expiry message. The API key secret is never rendered, copied, or placed in browser state.
- Add explicit revoke/expiry recovery copy: revocation is immediate; expiry requires a new authorization; neither claims reversal of work already released.

Update `tests/e2e/public-owner-ui.spec.ts` and add a focused route test for the approval page. Use a labelled local Clerk-bypass fixture only; do not present this as hosted customer evidence.

### 7. Add protected MCP tier without widening anonymous tools

Update `src/lib/server/mcp-api.ts`:

- Preserve `createAeMcpServer(request, actions = listMcpActions())` injection compatibility and add an authenticated access argument or a small options overload with an explicit `McpAccessTier` (`anonymous` or `authenticated`, including the derived authority mode and principal identity).
- Keep the current anonymous construction error literal `MCP anonymous tier admits only read-only actions: <id>` and the four-action list exactly unchanged.
- Add a registry projection for authenticated actions: only `surfaces.includes('mcp')` actions are candidates, and each non-read-only action must declare an authority requirement that maps to a mode scope. The host filters by the authenticated key’s mode; it never grants authority from the MCP annotation or `caller: 'mcp'` attribution.
- `handleMcpRequest()` must preserve unauthenticated `initialize`/`tools/list` and the four keyless tools. For a protected tool call, resolve `authenticateCustomerRequestAgent()` with the action’s required mode and return the shared 401 challenge before invoking `action.run`. A valid key calls `action.run({ data, context: { caller: 'mcp', request } })`; the action/source seam still validates the exact Customer Request authority.
- Keep `structuredContent`, typed refusals, and thrown-error handling unchanged. A key or mode is not allowed to make a typed refusal an `isError` success or to bypass source authority.

Expose Customer Request actions in a later registry change only when their runners can carry the authenticated Customer Request service assertion through the registered action seam. Do not mark current write actions `mcp` in this slice merely to make `tools/list` non-empty; the key-gated tier is the tested seam and metadata contract, while T6/its follow-up owns the final MCP tool set.

Extend `tests/unit/server/mcp-api.test.ts`:

- anonymous `tools/list` remains exactly the four names and rejects an injected non-read-only action;
- an authenticated injected mode-eligible action is exposed only with a valid key and the matching mode;
- missing/invalid key on a protected call returns 401 plus the RFC challenge and does not invoke the action;
- inspect-only keys cannot invoke approve-each/bounded-mandate actions;
- `caller: 'mcp'` remains attribution, not authority.

### 8. Update discovery, manifest, and public copy claims

Update `src/modules/discovery/internal/agent-skill.ts`:

- Replace the manual “ask the customer to create a key and paste it back” step with the OAuth/device flow: the agent calls `/oauth/device_authorization`, shows `verification_uri` and `user_code`, polls `/oauth/token` at the returned interval, and sends the returned bearer key only to the AE Customer Request API.
- Name the exact mode scope requested and explain that a signed-in owner approves it; never ask the human to paste a secret into a browser or chat.
- Update 401/403 recovery to restart authorization on expiry/revocation and to request a narrower/exact mode on insufficient scope.
- Keep the existing keyless services/MCP and sandbox claims, with the existing `ae_sandbox_provider` provenance and no booking/payment/dispatch/fulfilment claim.

Update `src/modules/discovery/internal/discovery-files.ts`:

- Keep `/mcp` in the machine index and add the OAuth authorization metadata/protected-resource URLs only if the emitted path list is intended to advertise them.
- Replace the Customer Request auth line with the exact device-flow endpoint, `/agent-access` human approval URL, `customer_requests:create`, and mode scope vocabulary. Keep the 12-entry/4096-byte `llms.txt` ceiling.

Update `src/modules/discovery/internal/site-manifest.ts` only as needed to keep `customerRequest.keyRequestUrl`, OAuth metadata URLs, and endpoint labels aligned. The manifest is a projection, not a second auth contract.

Update `tests/seo/agent-skill.test.ts`, `tests/unit/discovery/offering-llms-index.test.ts`, and site-manifest tests to assert the exact device endpoint, verification URL, four mode names, protected-resource metadata URL, seven-day/revocation language, and evidence ceiling. Add negative assertions for manual secret-paste wording, autonomous/full-yolo promises, and booking/payment/dispatch claims. Run emitted-output inspection, not only string scans.

### 9. Verify the complete local journey and record the ticket resolution

After implementation, update `.planning/wayfinder/tickets/T3-cold-agent-keys.md` with a Resolution addendum naming the endpoint sequence, exact scope mapping, Clerk/AE ownership boundary, `/agent-access` consent and revocation UX, protected-resource challenge, MCP tier seam, and evidence class (`labelled local/dev`). Do not update the ticket before the focused journey passes.

## Critical files & anchors

- `src/lib/server/customer-request-agent-auth.ts:30-73` — Clerk `auth({ acceptsToken: 'api_key' })`, current-key `clerkClient().apiKeys.get`, principal construction, and refusal taxonomy.
- `src/modules/customer-request/agent-contract.ts:3-22` — `CUSTOMER_REQUEST_AGENT_SCOPE`, entrypoint metadata, navigation and lifecycle constants; add mode scope vocabulary here.
- `src/lib/server/customer-request-agent-api.ts:52-279` — all external-agent handlers and the current base/standing-scope wrapper.
- `src/modules/customer-request/service-auth-envelope.ts:6-69` and `convex/customerRequestApplication.ts:1683-1748` — signed scope assertion and source caller resolution; mode ceiling must be checked here as well as at HTTP.
- `src/modules/customer-request/agent-access.ts:1-105` — existing Clerk API-key create/list/get-secret/revoke logic, seven-day lifetime, claims, replay identity, and owner binding.
- `src/modules/customer-request/agent-access.functions.ts:1-40` — current Clerk adapter server functions; replace manual issuance with grant approval/inventory functions.
- `src/routes/_operator/agent-access.tsx:24-93` — current manual key UI; replace secret copy flow and add inventory/revocation states.
- `src/lib/server/mcp-api.ts:18-82` — T6 anonymous read-only guard and per-request MCP factory; authenticated tier replaces this guard only for authenticated projections.
- `src/routes/mcp.ts:5-12` and `src/routes/api.v1.requests.ts:5-7` — the two protected-resource host routes.
- `src/lib/http/agent-content-negotiation.ts:12-32` — reserved `/api/`, `/.well-known/`, and `/mcp` paths.
- `src/modules/discovery/internal/agent-skill.ts:90-120` and `src/modules/discovery/internal/discovery-files.ts:95-115,172-190` — current manual key/public auth wording that must become device authorization wording.
- `src/modules/discovery/internal/site-manifest.ts:130-155` — machine manifest Customer Request auth/key URL projection.
- `tests/unit/customer-request-agent-access.test.ts`, `tests/unit/server/customer-request-agent-auth.test.ts`, `tests/unit/server/mcp-api.test.ts`, `tests/seo/agent-skill.test.ts`, `tests/unit/discovery/offering-llms-index.test.ts`, and `tests/e2e/public-owner-ui.spec.ts` — focused existing contracts to extend.
- Official Clerk references: [API keys](https://clerk.com/docs/guides/development/machine-auth/api-keys), [`apiKeys.create`](https://clerk.com/docs/reference/backend/api-keys/create.md), [`apiKeys.revoke`](https://clerk.com/docs/reference/backend/api-keys/revoke.md), and [OAuth implementation](https://clerk.com/docs/guides/configure/auth-strategies/oauth/how-clerk-implements-oauth.md).

## Verification

Run from repository root. Do not substitute source inspection for execution, and keep evidence labelled.

1. Focused OAuth, auth, MCP, copy, and UI tests:

```sh
npx vitest run \
  tests/unit/customer-request-agent-oauth-state.test.ts \
  tests/unit/server/customer-request-agent-oauth-api.test.ts \
  tests/unit/routes/oauth-metadata.test.ts \
  tests/unit/customer-request-agent-access.test.ts \
  tests/unit/server/customer-request-agent-auth.test.ts \
  tests/unit/server/mcp-api.test.ts \
  tests/unit/discovery/offering-llms-index.test.ts \
  tests/seo/agent-skill.test.ts \
  tests/e2e/public-owner-ui.spec.ts
```

2. Contract ladder for changed boundaries:

```sh
npm run typecheck
npm run test:imports
npm run test:ui-contract
npm run test:seo
```

3. Local labelled end-to-end smoke. Start the dev server with Clerk bypass only in a non-production local environment and label all output `labelled local/dev`:

```sh
VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true npm run dev -- --port 3020 --strictPort --host 127.0.0.1
```

Then exercise the complete path with a test client or curl fixture:

```sh
BASE=http://127.0.0.1:3020
curl -sS -X POST "$BASE/oauth/device_authorization" \
  -H 'content-type: application/x-www-form-urlencoded' \
  --data-urlencode 'client_id=ae-local-device' \
  --data-urlencode 'scope=customer_requests:create customer_requests:approve_each'
# Open the returned verification_uri with the local signed-in fixture and approve.
curl -sS -X POST "$BASE/oauth/token" \
  -H 'content-type: application/x-www-form-urlencoded' \
  --data-urlencode 'grant_type=urn:ietf:params:oauth:grant-type:device_code' \
  --data-urlencode 'client_id=ae-local-device' \
  --data-urlencode 'device_code=<returned device_code>'
curl -i -sS "$BASE/.well-known/oauth-protected-resource"
curl -i -sS "$BASE/.well-known/oauth-authorization-server"
curl -i -sS -X POST "$BASE/api/v1/requests" -H 'content-type: application/json' -d '{}'
```

Expected: pending then approved/consumed device states; the successful poll returns a seven-day scoped Clerk API-key bearer; the browser never sees the secret; the no-key Customer Request call returns 401 with `WWW-Authenticate` pointing to RFC 9728 metadata; metadata names only implemented endpoints/scopes; revoking the key in `/agent-access` makes the same request return 401. This proves labelled local/dev contract behavior only.

4. MCP local smoke with the returned key:

```sh
H=(-H 'content-type: application/json' -H 'accept: application/json, text/event-stream')
curl -sS "${H[@]}" "$BASE/mcp" -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"oauth-smoke","version":"0"}}}'
curl -sS "${H[@]}" "$BASE/mcp" -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
curl -i -sS "${H[@]}" "$BASE/mcp" -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"<protected-tool>"}}'
curl -sS "${H[@]}" "$BASE/mcp" -H "Authorization: Bearer <returned key>" -d '{"jsonrpc":"2.0","id":4,"method":"tools/list"}'
```

Expected: anonymous list remains exactly the T6 four tools; a protected tool without a key receives a 401 challenge; a valid scoped key selects only mode-eligible authenticated tools; action source authority still decides the final result. If no protected Customer Request action is registered in this slice, the authenticated list must remain equal to the anonymous list and the test must prove the seam with an injected mode-eligible action rather than inventing a public tool.

5. If a real Clerk development instance is used, record the Clerk Dashboard setup and environment as HITL evidence: API keys enabled, User API keys enabled, exact Clerk instance/JWT issuer, `CLERK_SECRET_KEY` and other deployment secrets configured out of band, and any usage/plan approval. Never report this as hosted or production proof unless the exact deployed revision and public readback were exercised.

## Assumptions & contingencies

- Clerk's official docs expose both `apiKeys.create()` and `apiKeys.getSecret()`, while the guide also warns that secrets must be treated as one-time material. The implementation must verify the installed `@clerk/tanstack-react-start` behavior in the Clerk development instance before rollout. The normal path stores only the key id and calls `getSecret(keyId)` after the delivery CAS. If the enabled Clerk plan/API refuses post-create secret retrieval, do not persist plaintext: add an encrypted, short-lived, single-delivery secret envelope using a HITL-provisioned `AE_AGENT_OAUTH_SECRET_ENCRYPTION_KEY`, delete it after delivery, and add the encryption/recovery tests before enabling the flow.
- Clerk custom OAuth scopes are documented as unavailable. AE API-key scopes are distinct application-defined strings and are the only source of the four mode labels in this plan. If a future Clerk release adds custom OAuth scopes, retain the AE scope validator and source authority checks; changing the broker must not change the external contract.
- The OAuth/device state table is necessary control-plane state, not a second Customer Request or supply store. It stores hashes and grant metadata only. If Convex deployment auth cannot admit the public poll mutation safely, keep the same table and expose only opaque hash-indexed source ports; never move state to an in-memory map or browser storage.
- Dynamic registration is intentionally AE-owned. If an MCP client does not support device authorization and requires authorization-code + PKCE, use `/oauth/register` and `/oauth/authorize`; if it supports device flow, use `/oauth/device_authorization`. Both paths produce the same Clerk API-key scope contract.
- The current T6 SDK may validate only top-level Zod object output schemas. Keep the anonymous MCP tool set and output behavior unchanged; if an authenticated action has a union output, use the same adapter fallback already documented in `src/lib/server/mcp-api.ts` and validate through the action contract rather than weakening source results.
- Existing browser Customer Request routes use Clerk browser identity directly; only external-agent API-key calls use the service assertion. Do not make an API-key mode scope an owner identity, Preparation Authority, Approval Grant, RouteMandate, or Action Invocation authority.
- Evidence remains labelled local/dev until hosted readback. A successful Clerk key issuance proves credential delivery and revocation behavior only; it does not prove external-agent customer value, provider availability, booking, payment, dispatch, or fulfilment.
