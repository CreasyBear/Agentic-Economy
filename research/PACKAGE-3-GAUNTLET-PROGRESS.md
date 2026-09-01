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
