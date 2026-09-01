# Package 3 gauntlet progress

This is the live evidence record for the Package 3 implementation loop. It is
not product authority. `PRODUCT.md`, current source and tests, and the approved
Package 3 implementation plan remain authoritative in that order.

## Baseline carried forward

- PR0 is implemented at `4b353608e`, but its compile-time Clerk export proof is
  not sufficient evidence of a working live reverification ceremony.
- PR1 is implemented at `10bbbcff6`; its staged Account indexes were backfilled
  and activated at `2c3d86924` without synthesizing historical data.
- The Package 2 worktree is already dirty. Package 3 work must not reformat,
  revert, or stage those unrelated changes.

## PR2 — Clerk proof bound to consequential commands

Status: accepted after independent critique, focused gates, and live Clerk proof.

### Firsthand references checked

- Clerk reverification guide and TanStack `useReverification` reference:
  server `auth().has({ reverification: 'strict' })`, signed `fva`, unique
  `reverification_id`, automatic retry, cancellation, and graceful factor
  downgrade.
- Installed `@clerk/tanstack-react-start@1.5.9` and
  `@clerk/backend@3.16.13` exports and source.
- Convex mutation transaction and `@convex-dev/rate-limiter@0.3.2` behavior.
- OWASP Transaction Authorization and Business Logic Security guidance for
  server-derived significant data, unique proof, atomic check-and-act, and
  idempotent external effects.

### Repository facts

- The real first caller is the owner OAuth consent path:
  `AeAgentAccessAuthorizeForm` → `POST /oauth/authorize` →
  `handleOAuthConsentPost()` → `approveGrant()` → `issueGrantKey()`.
- `approveGrant()` already reserves the grant as `issuing` with a durable
  `issuanceKey` before Clerk key creation. PR2 must extend that reservation,
  not add another command or reservation table.
- `consequenceProofUses` already exists with `by_reverificationId`.
- `sourceWriteCommandDigest()` is the canonical digest implementation.
- Baseline focused suite on 2026-09-01: 7 files, 73 tests, all passing.

### Decisions closed by firsthand proof and critique

- Clerk's own reverification guide names the supported fallback import
  `@clerk/shared/authorization-errors`. The installed public export provides
  `reverificationErrorResponse`; PR2 will declare the already-installed
  `@clerk/shared` package directly and remove the internal import. No response
  adapter or copied payload is needed.
- The original authority boundary only admits delegation grants. An owner
  creating Agent authority instead acts through current Account ownership.
  PR2 will add an explicit, revisioned authority-source union and will not
  invent a synthetic owner delegation.
- An OAuth grant receives a monotonic revision. New-Agent consent binds that
  revision; replacement additionally binds the current Principal revision.
  Timestamps are not revisions.
- Only one authenticated Convex mutation may consume proof, apply the
  Account-keyed rate limit, and reserve `pending` to `issuing`. The generic
  update mutation will lose that transition.
- Both device and authorization-code approvals must enter the same protected
  React consent gate. Protecting only the current device UI would leave a raw
  HTML approval bypass.
- The Clerk development instance now has the documented
  `{"reverification_id":"{{session.reverification_id}}"}` custom claim. The
  dashboard PATCH included the shortcode and a full page reload returned the
  same template; an editor-only visual change was explicitly rejected as
  insufficient proof.

### Exit bar

- No proof means no reservation, key, grant, success event, or external call.
- Exact proof plus exact command reserves and issues once.
- Same proof plus same digest replays without another issue.
- Changed command, target revision, Account, or authority generation refuses
  before dispatch.
- Cancellation retains entered state and restores focus.
- Live Clerk sandbox proves the signed claim and retry ceremony; compilation
  alone is not completion.

### Gauntlet iterations

1. Contract slice 1: **rejected**. It correctly separated Account ownership
   from delegation and adopted Clerk's public helper, but its digest covered
   only the editable payload. The correction binds the final digest to a
   versioned envelope of resolved actor, Account, authority revision or
   generation, target revision, exact authority, consequence, recovery, and
   the pre-await payload digest. Mixed or unknown authority-source shapes also
   fail closed.
2. Contract slice 2: **accepted**. The corrected authority envelope passed 21
   focused tests, typecheck, and the second independent review.
3. OAuth revision slice 1: **rejected**. Compare-and-swap behavior was correct,
   but the Convex insert boundary still accepted an arbitrary numeric starting
   revision.
4. OAuth revision slice 2: **accepted**. Storage now requires revision `1`,
   rejects non-positive or non-integer expected revisions, increments once per
   successful transition, and leaves failed CAS attempts unchanged. The
   focused suite passes 51 tests and the second independent review.
5. Proof-transaction slice 1: **rejected**. The mutation made proof use, the
   Account rate limit, the redacted audit event, and the grant reservation one
   Convex transaction, but its digest omitted stored access limits, client,
   and flow. Replacement also pinned only the Principal revision instead of
   the current credential and binding generation. The correction is limited
   to those authority facts and negative proof of the existing signed
   server-to-Convex boundary; it does not add another proof protocol.
6. Proof-transaction slice 2: **accepted**. The canonical command now binds
   every stored issuance term and a re-resolved predecessor snapshot spanning
   the active Agent record, Clerk API-key binding, credential, and grant.
   Replay rejects any revision, generation, or policy drift. Missing or invalid
   source-write admission is proven side-effect free. The independent review
   accepted the slice after 74 focused tests and typecheck; the root gate also
   passed Convex codegen under the repository's pinned Node 22 runtime.
7. Consent cutover: **accepted in code review**. Both OAuth flows now land on
   the same React confirmation surface, Clerk strict reverification precedes
   the authenticated Convex reservation, and the stored reservation is the
   only path into issuance. Cancellation, duplicate confirmation, changed
   command, and ambiguous issuance have focused proof. The independent critic
   found no blocking defect after 102 tests and typecheck.
8. Live issuing recovery: **rejected**. The live Clerk ceremony consumed one
   signed proof and reserved the grant, then a downstream issuance failure
   correctly returned `outcome_unknown`. Refreshing the same verification URL,
   however, projected the in-flight grant as a generic route crash with “Try
   again,” which was not a safe action after possible dispatch.
9. Live issuing recovery correction: **accepted**. An owner-matched,
   unexpired `issuing` grant now returns a no-store, read-only recovery marker.
   The operator route preserves the same grant reference, removes approval and
   generic retry controls, and points to the existing Agents readback. The
   exact failed live URL now renders this state. The first critique rejected
   ownerless recovery rows; exact owner matching plus ownerless/foreign-owner
   denial coverage corrected it. The second review accepted the slice after 35
   focused tests and typecheck.
10. Human-verification race: **rejected**. While Clerk waited for an email
    proof, ordinary CLI token polling advanced the grant revision for
    `nextPollAt` bookkeeping. The unchanged consent then failed as stale with
    HTTP 409 after the human completed verification.
11. Poll/authority revision separation: **accepted in code review**. An exact
    poll-schedule-only patch now updates `nextPollAt` without changing the
    authority revision; every status, owner, scope, target, reservation,
    issuance, and delivery mutation still increments it. Tests exercise two
    polls followed by the original exact reservation. The independent critic
    accepted the correction after 88 focused tests and typecheck. The reopened
    live consent then completed successfully and produced one connected Agent
    with one attributable credential generation.
12. Completed-request refresh: **rejected**. Refreshing the successful URL
    after its original ten-minute consent window fell through to the generic
    route error. The window correctly barred a new approval but incorrectly
    erased the already completed readback.
13. Completed-request readback: **accepted**. Exact-owner `approved`,
    `delivery_claimed`, and `consumed` grants now project a no-store,
    read-only success before consent-window expiry is considered. The live
    expired URL shows the durable request reference and Agents readback with no
    approval or retry; the canonical Agent detail shows one connected
    generation and credential history without key material. The first review
    rejected a delivery-readiness claim that was not valid for every terminal
    state; the corrected copy claims only that approval completed and directs
    current credential truth to Agents. The second review accepted the slice
    after the API matrix, route tests, typecheck, and live expired-URL proof.
14. PR2 closure: **accepted**. The final focused gate passed 127 tests,
    Convex code generation, typecheck, and the production build. The live
    Clerk flow produced one Agent with one connected credential generation;
    issuing and completed refreshes remain read-only and never replay secret
    delivery or offer a second consequential submit.

## PR3 — Account-isolated owner security history

Status: accepted after three independent critique passes and an isolated staged-tree build.

### Firsthand references checked

- Clerk's maintained `verifyWebhook()` documentation and the installed
  `@clerk/backend` implementation: the original `Request` is the verification
  input, verification throws on invalid Svix headers or signature, and the
  delivery identifier remains an HTTP header rather than event payload data.
- Installed Clerk event types: `session.created`, `session.ended`,
  `session.revoked`, and coarse `user.updated` are the only Package 3 events
  admitted here. `session.removed` and unsupported events are verified then
  ignored rather than reclassified.
- Existing Convex Account/time audit index, native pagination contract,
  `createPackage3AuditEvent()`, `persistAuditEvent()`, canonical Clerk identity
  bindings, and server-function assertion boundary.

### Decisions closed by firsthand proof and critique

- The webhook verifies the exact original request before reading the delivery
  identifier. Only hashed, bounded identifiers and configured event facts
  cross into Convex; provider payloads, email, IP, user-agent, factor, and
  session detail do not.
- Clerk subjects resolve through one active external identity binding, one
  active human Principal, and the Account's current ownership. Unknown,
  inactive, foreign, or ambiguous identities create no Account event.
- Session target identity is stable across create, end, and revoke. Lifecycle
  state belongs in the event type and outcome, not in the target digest.
- Unified history begins at the explicit Package 3 activation timestamp. It
  admits only the closed Package 3 event families and requires stored source
  and outcome facts; legacy rows remain in their domain views and no source,
  time, actor, or outcome is synthesized.
- The settings projection uses native Account-index pagination and returns only
  the safe table contract. Observed and recorded time remain distinct, and a
  missing observation time is stated explicitly.

### Gauntlet iterations

1. Webhook/history slice 1: **rejected**. It reconstructed the request passed
   to Clerk, varied the session target digest by lifecycle event, and projected
   legacy rows using invented source/time values. The correction passes the
   untouched request, hashes a stable session target, and stops synthesizing
   provider evidence.
2. Webhook/history slice 2: **rejected**. Source-tagged legacy rows could still
   enter unified history and missing outcomes were labeled `recorded`. The
   correction adds an explicit activation boundary, restricts the query to
   closed Package 3 event families, and requires stored source and outcome.
3. PR3 closure: **accepted**. Selective staging preserves the concurrent
   Package 2 information-architecture work. The focused gate passes 19 tests;
   the isolated staged tree passes typecheck and production build; Convex code
   generation passes under the supported Node runtime. The full worktree
   import gate remains blocked only by four unrelated, unstaged Package 2
   private imports.

## PR4 — Agent access management

Status: accepted after docs-first implementation, live CLI/browser proof, focused
gates, and independent adversarial review.

### Firsthand references checked

- Clerk's maintained API-key guide and the installed
  `@clerk/backend@3.16.13` API-key types and endpoint declarations. Clerk
  supports create, verify, expiry, last-use evidence, secret retrieval, and
  revoke; it does not expose API-key rotation or rename.
- A non-production Clerk probe created a short-lived API key, retrieved the
  same secret through the installed `getSecret()` API, verified it, and revoked
  it immediately without logging or persisting secret material.
- Existing AE replacement, Principal rename, Delegation resource, invocation
  admission, Package 3 audit, and Account/target history implementations.
- RFC 9396 Rich Authorization Requests: `authorization_details` carries
  fine-grained consent material; unknown, malformed, or missing fields for the
  registered detail type must be refused. AE keeps its detail type closed and
  stores normalized Operation selection before consent.

### Decisions closed by firsthand proof and critique

- Agent rename changes only the durable AE Principal. A Clerk key name is not
  Agent identity and will not be synchronized.
- Ordinary rotation remains the existing agent-initiated OAuth successor
  lifecycle. The owner console will not invent a second secret-delivery path.
- Compromise recovery must extend the same replacement lifecycle: prepare the
  successor under the same Principal, revoke predecessor authority
  immediately, and truthfully report reduced availability until delivery.
- Operation-specific policy is enforced after the request body resolves the
  canonical Operation, and again before rate-limit consumption or reservation.
  Delegation and policy must independently allow the same Operation.
- Successful authentication and known-credential denial evidence belong at
  the canonical credential boundary and are coarsened there. Unknown keys do
  not create domain rows.

### Gauntlet iterations

1. Policy compatibility slice 1: **rejected**. It relabelled v1 policy
   material as v2 while retaining the v1 digest, used a permissive hybrid
   storage validator, made normalized owner scope optional, and left the
   repository uncompilable.
2. Policy compatibility slice 2: **rejected**. It separated exact storage,
   v2-only writes, and normalized reads, but still added `operationRefs` to the
   nested legacy policy and therefore changed the material protected by the
   retained digest.
3. Policy compatibility slice 3: **accepted**. Storage is an exact runtime
   union of genuine v1 and v2 shapes; public and internal writes are v2-only;
   v1 reads preserve source format and canonical policy digest while deriving
   only top-level `operationRefs: []`; selected v2 references are canonical,
   unique, sorted, and bounded to 1–64. Hybrid rows and mismatched policy/grant
   selections fail closed. Full typecheck, 45 focused tests, scoped lint, and
   diff checks pass.
4. Exact Operation admission slice 1: **rejected**. New invocation binding and
   reservation correctly required Agent policy and Delegation independently,
   but the same check accidentally treated the synthetic invocation-list
   authority target as a Public Operation and denied every Agent receipt list.
5. Exact Operation admission slice 2: **accepted**. New Operations are checked
   against stored policy before Delegation and again before rate limiting,
   concurrency, reservation, evidence, or effects. Exact existing reservations
   replay before current policy checks. Receipt listing uses an explicit
   internal purpose and a server-derived live-Delegation probe, not a synthetic
   Operation permission; persisted invocation recovery remains unchanged. Full
   typecheck, 121 focused tests, scoped lint, and diff checks pass.
6. OAuth selection/issuance slice 1: **rejected**. The HTTP parser normalized
   Operation refs, but the two direct OAuth grant constructors still stored
   caller-supplied access verbatim. Internal callers could therefore persist
   unsorted, invalid, or supplier-selected material and make proof comparison
   order-sensitive.
7. OAuth selection/issuance slice 2: **accepted**. Both OAuth constructors now
   normalize before insertion and refuse invalid or supplier-selected access
   without writes. The immutable stored selection is visible in consent but is
   absent from the approval POST; it is bound into the existing consequence
   digest, a compact Clerk replay claim, the v2 Agent policy, signed issuance
   registration, and identical Delegation resources for both new and
   replacement credentials. Full typecheck and 139 focused tests pass. The
   development OAuth grant table is empty, so this required-field schema change
   needs no non-production cleanup or backfill.
8. Local consent ceremony: **rejected**. The local Clerk bypass still rendered
   the Clerk-only `useReverification` hook without a `ClerkProvider`, so the
   authorization loader failed before consent. The correction keeps one shared
   form but selects the maintained Clerk proof adapter or the production-guarded
   local proof adapter before either hook is called. The route suite proves the
   local branch never invokes Clerk.
9. Completed consent replay: **rejected**. Reposting the exact proof and exact
   already-approved command returned HTTP 409 even though issuance had already
   succeeded. Terminal replay now re-resolves owner, Account, target revision,
   current authority, proof, and command digest before returning the durable
   success projection. Direct Convex tests prove approved, delivery-claimed,
   and consumed replay performs no second proof, rate, audit, reservation, or
   provider write; changed proof, command, revision, owner, or authority refuses.
10. Local credential wiring: **rejected twice**. A module-local key map produced
    a live 401 across separate Vite server graphs; a process-wide, production-
    guarded registry corrected custody. The next live call returned 403 because
    local issuance wrote only a legacy grant. Local issuance now uses the same
    `issueAgentAccessKey` and signed `registerIssuedAgentBinding` seam as Clerk,
    with only the provider adapter replaced. The authenticated `ae account
    status` projection resolves the resulting Principal, Account, credential,
    scope, and authority.
11. Convex deployment: **rejected then accepted**. The running local deployment
    was stale and the broad Agent-access public barrel was not schema-safe. A
    narrow `agent-access/schema.ts` entry now follows the repository's existing
    schema-entry pattern; the module manifest declares it, Convex pushes cleanly,
    and codegen passes on the pinned Node 22 runtime. The canonical Operation-ref
    validator was extracted to the dependency-free common layer so Agent access
    does not introduce the forbidden reverse dependency on capability supply.
12. Device polling race: **rejected then accepted**. Approval could win the
    grant compare-and-swap while an in-flight pending poll lost its scheduling
    update; the losing poll was incorrectly converted to terminal
    `invalid_grant`. RFC 8628 requires an unapproved device request to continue
    as `authorization_pending`, so only that pending scheduling conflict now
    remains pending. Other grant conflicts remain fail-closed. The race test
    proves the stored approval survives while the concurrent poll stays retryable.
13. Local replacement lifecycle: **rejected then corrected**. Local
    `replace_credential` consent was audited as replacement but fell through to
    new-Agent issuance. Local replacement now uses the existing prepare,
    delivery-time promote/cancel, and predecessor-revocation lifecycle with the
    same process-local provider adapter. The selected Principal and replacement
    generation remain intact, and the local new-Agent regression now exercises
    the real `issueAgentAccessKey` plus binding path instead of an injected
    imitation. Independent re-review accepted the shared lifecycle and found no
    production-path regression.
14. Live CLI/browser recovery: **accepted in runtime**. A fresh device request
    was approved through the real browser surface, the waiting CLI exited
    `connected` without printing the credential, and `ae account status`
    authenticated the stored origin-bound key against the canonical Agent
    binding. The focused closure gate passes 167 tests, typecheck, Convex
    codegen, and diff checks. The import gate reports only four pre-existing,
    unrelated Package 2 private imports in `owner-operations.functions.ts`.
15. Agent rename and lifecycle history: **accepted after adversarial review**.
    Rename updates the canonical Principal through revision-checked optimistic
    concurrency and refreshes the authoritative directory instead of applying
    an optimistic browser patch. Create, credential replacement preparation,
    promotion, cancellation, revocation, and Agent disconnection now write
    closed, secret-safe Package 3 events in the same Convex transaction as the
    authoritative transition; replay and no-op branches do not duplicate
    evidence. The selected Agent sheet loads its own history only when opened,
    verifies Account ownership and live Agent admission, and paginates natively
    through the existing Account/target index. The shared table renderer keeps
    the owner Account history projection intact while hiding raw actor and
    target references in the Agent-specific view. The focused gate passes 48
    tests across six suites, typecheck, Convex codegen, production build, and
    diff checks. Independent critique found no blocking defect.
16. Canonical authentication evidence: **accepted after docs-first correction**.
    The first design was rejected before implementation because Clerk
    `lastUsedAt` can precede AE authority admission, missing evidence cannot be
    called “Never,” and the lifecycle audit constructor would have falsely
    attributed Agent authentication to an owner. Final evidence is written only
    after the canonical credential, Agent Principal, Account admission, current
    grant generation, Delegation snapshot, scope/resource, and final expiry
    checks agree. Successful authentication updates the credential and one
    `agent.credential.authenticated` event at most every 15 minutes; known
    canonical denials share one secret-safe event identity per credential per
    five-minute bucket, independent of request correlation or refusal reason.
    Unknown locators create no domain row. The audit vocabulary now identifies
    the actor as `agent`, inconsistent human-Principal/Agent-admission rows fail
    closed, and the owner directory derives current “Last authenticated” from
    the current credential while keeping “Last seen” separate. Missing evidence
    reads “Not recorded” and discloses the 15-minute precision. The combined
    gate passes 107 tests, typecheck, Convex codegen, production build, and diff
    checks; independent critique found no blocking defect.
17. PR4 closure: **accepted**. Owners can create and name an Agent, constrain it
    to all admitted or selected Operations, inspect exact scope, budget, expiry,
    credential generations, last authenticated evidence, and activity, and use
    the existing replacement, revocation, disconnection, and compromise paths.
    Principal identity and history survive credential generations; admission
    checks policy and Delegation independently. The live CLI/browser ceremony
    delivered one key to its caller, authenticated the resulting Agent, and did
    not expose supplier authority. No parallel rotation, credential, audit, or
    human-security system was added.

## PR5 — x402 supplier connections

Status: accepted after official x402/Clerk references, focused gates, and two
adversarial-review passes.

### Firsthand references checked

- The x402 v2 specification, official HTTP 402 guide, and installed `@x402`
  implementation. x402 defines payment requirements and signed payment proof;
  it does not define a stored provider credential or scheduled connection
  expiry.
- Clerk's maintained TanStack `useReverification` and server strict-
  reverification contracts already proven in PR2.
- Existing guarded x402 endpoint inspector, wallet-control claim, source-write
  admission, connection authority model, durable cleanup worker, Account audit
  envelope, and provider-connection UI.

### Gauntlet iterations

1. Authority and health slice: **rejected once, then accepted**. The connection
   now stores the exact method and payee-control subject, exposes a safe unpaid
   challenge check, keeps health separate from Operation readiness, and records
   redacted provider-observed evidence. The first version incorrectly carried a
   generation N health observation into generation N+1. Reauthorization now
   clears all five health fields, and domain plus owner-integration tests protect
   that invariant.
2. Consequence proof and replay: **accepted**. Connect and reauthorize repeat
   live endpoint inspection and wallet-control proof, then require Clerk strict
   reverification. The existing authority boundary derives the exact Account,
   ownership revision, connection target, method, resource, payee, observation,
   and claim digest. Rate admission and proof consumption occur in the same
   Convex transaction before grant or connection mutation. Exact replay is
   duplicate-safe; changed command IDs and changed material under the same
   command ID return typed `command_changed` without a new generation, grant,
   or proof use.
3. Package 3B closure: **accepted**. The owner surface shows exact HTTPS method
   and resource, requested payee authority, generation, honest no-scheduled-
   expiry copy, health observation, no-credential custody, and separate
   Operation readiness. The old one-click x402 reconnect path is closed;
   reauthorization requires the full proof ceremony. Revoke remains exact
   confirmation with durable cleanup/readback. The focused connection gate
   passes 52 tests, the Infisical regression gate passes 47 tests, typecheck,
   Convex codegen, and production build pass. The repository import gate remains
   blocked only by four unrelated Package 2 private imports in
   `owner-operations.functions.ts`.

## PR6 — consequential controls across money and publication

Status: accepted at `fd72ff730`, with the publication-authority correction at
`ab1681509`.

### Decisions closed

- Funding keeps Stripe-hosted SCA as the escalation proof. AE binds the owner
  Account, amount, fees, total, cancellation, and authoritative readback without
  adding a duplicate Clerk prompt.
- Payout authority and transfer use the shared server-derived consequence
  descriptor and strict one-command Clerk proof before reservation or provider
  handoff.
- Publish and republish bind the exact Operation revision, market visibility,
  commercial material, and withdrawal path. Withdrawal is an authority
  reduction with exact confirmation and no escalation proof.
- Ambiguous external outcomes retain their command and correlation references
  and lead to status or reconciliation, never blind resubmission.

### Gauntlet result

1. Shared domain adoption: **accepted after correction**. Money, payout, and
   publication retain their existing state machines and durable readbacks.
2. Publication authority: **corrected**. Agent publication authority is derived
   from canonical server state rather than a browser-supplied descriptor.
3. Package 3C closure: **accepted**. Funding, payouts, publication, Agent
   authority, and connection authority share one consequence vocabulary and one
   server-enforced authority boundary.

## PR7 — Account security and compromise recovery

Status: accepted at `417c03cc9`, with canonical Operation recovery links at
`07cd77d72` and bounded authority/lifecycle follow-ups through `6b1bbfa47`.

### Decisions closed

- Clerk `UserProfile` remains the owner of human sessions, devices, factors,
  backup codes, and account recovery.
- Compromise response is a checklist of independent authoritative actions. It
  has no one-click “secure everything” mutation and never claims containment
  from an MFA reset alone.
- Recovery links open the current canonical Agent, supplier-connection, payout,
  and security controls. Owners without a supplier identity see truthful setup
  guidance rather than an unavailable control.
- Authority reductions pass through the central consequence boundary with exact
  confirmation and no authority-widening proof.

### Gauntlet result

1. Security history distinguishes `ae_recorded`, `clerk_observed`, and
   `provider_observed` evidence.
2. Changed sensitive commands require fresh proof. Planned credential
   replacement preserves the Principal and predecessor until successor
   promotion; compromise handling does not reactivate revoked authority.
3. Package 3D closure: **accepted**. Clerk owns human security while AE owns the
   Account-isolated evidence and truthful multi-system recovery path.

## Final Package 3 journeys and closure

Status: accepted in the 2026-09-01 working tree after live Clerk, Convex,
browser, HTTP, and x402 journeys.

### Firsthand references checked

- Clerk Playwright testing: [overview](https://clerk.com/docs/guides/development/testing/playwright/overview)
  and [test helpers](https://clerk.com/docs/guides/development/testing/playwright/test-helpers).
- Clerk [interactive reverification](https://clerk.com/docs/react/reference/hooks/use-reverification)
  and [server reverification](https://clerk.com/docs/guides/secure/reverification).
- Playwright [web-server configuration](https://playwright.dev/docs/test-webserver).
- TanStack Router [data loading](https://tanstack.com/router/latest/docs/guide/data-loading)
  and [search-parameter navigation](https://tanstack.com/router/latest/docs/how-to/navigate-with-search-params).

### Papercuts found and resolved

1. **Local origin mismatch.** The authenticated test server now supplies its
   actual `http://127.0.0.1:3021` canonical origin, so Clerk middleware evaluates
   the same authorized party the browser uses.
2. **Reused proof on a changed command.** Proof-related OAuth refusals now
   return Clerk's maintained strict-reverification response. The authenticated
   journey signs out and back in through Clerk's official test helpers before a
   second changed sensitive command, producing fresh test proof rather than
   weakening one-proof/one-command binding.
3. **Credential and delegation generation conflation.** Canonical Agent
   authentication now resolves the exact active grant attached to the presented
   credential, validates that grant against current Agent admission, and selects
   its exact Delegation by grant reference. A prepared predecessor remains
   usable, a promoted successor retains the same Principal, and the predecessor
   is refused after promotion.
4. **Supplier-less owner recovery.** Account security now presents the existing
   truthful supplier-workspace onboarding when the owner has no supplier
   identity.
5. **Browser-driver action wait.** The final sheet journey verifies the exact
   row destination, direct-loads that detail view, asserts visible controls, and
   dispatches the action before waiting for the real dialog, mutation, and
   readback. This proves the lifecycle but is not pointer-timing or focus-ring
   evidence; those remain covered by the existing component regressions.

### Final evidence

- Authenticated Package 3 Clerk/Convex journeys: **3/3 passed**.
- Targeted multi-Agent lifecycle journeys: **2/2 passed**.
- Focused unit and Convex suites: **102 tests passed across 7 files**.
- Official and route-runtime x402 local canaries: **passed**.
- Lint, TypeScript, import boundaries, UI contract, Convex generated-code
  verification, anonymous Convex code generation, and production build:
  **passed**.
- The build retained only known non-blocking local warnings for the expired
  Vercel OIDC token, Clerk development keys, and Vite dependency packaging.

Packages 3A–3D are closed against the approved implementation plan. No custom
human-security system, vault, rate limiter, provider registry, audit table, or
parallel authority gateway was added.
