# Waitlist alpha: integrated release design

Date: 14 September 2026. Status: design baseline; bounded implementation is tracked in the maturity register.
Authority: [PRODUCT.md](../../PRODUCT.md), Joel's 20 September 2026 launch decision and
[START_LINE.md](../../START_LINE.md). This defines completion work, not a claim
that the application is ready. Evidence and audit protocol remain in the
[alpha validation plan](alpha-validation-plan.md).

The [32-item alpha maturity register](alpha-maturity-register.md) is the single
execution and closure register. Every implementation assignment and audit
finding must name its register item; this design does not create another backlog.

## Thesis and scope

**An invited business can give its Agent bounded access to useful paid Tools,
and can understand and recover every resulting purchase.**

Two complete journeys establish the market: a Provider makes supported supply
available, and a Customer authorizes an Agent to buy and use it. Account setup,
funding, connections, records and support must work around those journeys.

Qualification uses Stripe sandbox funding and real x402 testnet execution on
Base Sepolia. Launch acceptance additionally requires live AUD funding and real
USDC x402 purchases on Base mainnet, with usable delivery, reconciled records
and supported recovery. Clerk, Convex, Formance and Infisical are real hosted
integrations. Source and sandbox proof cannot close the launch goal.

Production activation follows the existing commercial and infrastructure gates,
fresh production identities/state, explicit financial exposure limits and exact
target/rollback proof. Synthetic release data is not promoted in place. Supported
payout obligations remain subject to their existing contract; this decision does
not invent another payout rail. Every advertised or exposed supported behavior
must be covered by acceptance, including failure and recovery.

Use the current app, service topology, components and official SDKs. No new
service, dependency, generic workflow engine, general ledger or navigation
redesign is proposed. New functionality is not inferred from a forward-looking
charter claim. Existing unsupported features require an explicit product
decision and truthful presentation, not an implementation shortcut.

## System responsibilities

| Fact or responsibility | Existing authority | Completion rule |
| --- | --- | --- |
| Human identity and session | Clerk | Authenticate through Clerk; current AE Account/role binding determines access |
| Agent delegation and spending authority | AE authority records in Convex | Resolve current authority on the server; possession of funds or credentials alone is insufficient |
| Funding settlement | Stripe | Verified event and SDK readback, not browser return, permit one credit operation |
| Balances, reservations, captures and reversals | Formance | Exact transaction-reference readback establishes a posting; UI/cache values cannot authorize spending |
| Quote, Call identity and permitted next action | Existing Convex domain handlers | Same accepted Call survives process loss and repeated requests |
| Custody signing and upstream settlement | Official CDP/x402 path plus verified settlement evidence | Persist the attempt and submission fence; never invent a fresh payment after uncertainty |
| Delivery | Tool contract and retained Provider response | Settlement alone cannot establish usable output |
| Publication and routeability | Existing admission/promotion evaluator and current supply facts | Successful job execution alone cannot make a Tool sellable |
| Durable background coordination | Installed Convex components | Schedule/replay work; do not become another financial or publication authority |
| Secret material | Infisical; AE stores scoped pointers and lifecycle evidence | Hosted identity, ownership and generation checks; revoke/delete require provider readback |
| User and machine presentation | Existing routes, projections, components and SDK/CLI contracts | Read the same facts and offer the same permitted continuation |

This preserves the existing topology documented in
[deployment architecture](deployment-architecture.md). Multiple services own
different facts; none may infer another service's success from a redirect,
timeout, local write or completed background job.

## AM02: interactive authentication and Account recovery

CONTRACT: sign in, return and restore the interactive Account
  Requires: Clerk-verified identity for protected admission; an active canonical
  Account/ownership chain; an untrusted return destination validated as an
  application-relative URL. Provider authentication remains Clerk-owned.
  Ensures: sign-in/sign-up switching retains the intended safe destination;
  anonymous or expired sessions return to sign-in; a later session for the same
  stable Clerk identity restores the same Account. First provisioning is unique.
  Invariant: sign-out changes session access, not durable Account, Ownership or
  history. No cached authorized result substitutes for current session/source
  checks; no external redirect or authentication-route return loop is accepted.
  On violation: discard an unsafe destination and use Account settings; redirect
  an anonymous session with its safe return context; refuse missing ownership;
  propagate unavailable evidence to the existing retry/status error surface.

| Condition | Existing authority and source evidence |
| --- | --- |
| Fresh identity and unique Account | `interactiveAuthority.ts` canonical materialization; `interactive-authority.test.ts` proves first provision, repeat, and two concurrent fresh sessions produce one binding/Principal/Account/Ownership/credential chain |
| Sign-out and later restoration | Same test exercises anonymous materialization=false and authority=null with unchanged durable rows, then a distinct valid session restores the same chain with permitted credential rotation; UI delegates sign-out to Clerk `SignOutButton` and returns to `/` |
| Safe destination through both flows | Shared `auth-redirect.ts` uses the platform URL parser; hostile TAB/LF/CR and normalized auth/self-return paths were red before the bounded repair; 18 sanitizer/route cases pass with valid query/hash retained |
| Sign-in/sign-up switching | Both routes now supply Clerk's opposite-flow fallback prop alongside their own; six route tests were red before the missing props and pass afterward. Existing signup footer also preserves the route search |
| Current session and Account required | `operator-session.test.ts` executes the server guard through signed-in → signed-out → new session, verifies no source read while anonymous, exact return path, owner/surface refusal and recovery after auth/source failure |
| Expiry, interruption and retry | Existing canonical expiry/invalid-binding tests remain; the server guard propagates unavailable evidence and rechecks on retry; `operator-route-error-reload.test.tsx` proves the existing retry/status recovery surface. Clerk's prebuilt flow owns authentication challenge and OAuth recovery |

The two bounded source repairs reuse the URL standard and installed
`@clerk/tanstack-react-start` 1.5.9. No session store, Account bootstrap service,
authentication UI or custom OAuth/retry protocol is introduced. Clerk explicitly
provides the reciprocal fallback props for users who switch authentication flows:
[SignIn properties](https://clerk.com/docs/tanstack-react-start/reference/components/authentication/sign-in)
and [SignUp properties](https://clerk.com/docs/tanstack-react-start/reference/components/authentication/sign-up).
Its [redirect guidance](https://clerk.com/docs/guides/development/customize-redirect-urls)
recommends configuring both flows. The installed shared SDK's `RedirectUrls`
resolves and carries these distinct fallback settings.

Source evidence does not establish live Google/OAuth challenges, invitation
configuration, cookie/session termination in a real browser, production Convex
concurrent scheduling, or the fresh invited-user hosted journey. Those proofs
remain explicitly deferred to hosted acceptance; Account isolation beyond this
session/context boundary belongs to AM04.

## AM04 Account and role isolation

**Contract:** a caller's current canonical authority determines access to private
Account resources. Knowing a locator, holding credit or having administrator
membership does not substitute for that authority. Public Tool information
retains its public discovery contract.

  Requires: an owner has current canonical interactive authority for the Account;
  an Agent has the specific current delegated authority and authenticated service
  admission required by the operation; an administrator has an active durable
  membership permitting the requested administrative action.
  Ensures: private reads select the authorized Account and private mutations
  validate the resource's Account before effects. Each legitimate owner can
  still read and manage their own resources. Delegated Agent operations preserve
  their narrower Principal, Account, application, environment and resource scope.
  Invariant: changing a business, Tool, Call, document, grant or continuation
  locator cannot grant authority. Refusals disclose no private record and leave
  the protected resources unchanged. Administrator authority never implicitly
  grants another customer's ownership; internal functions are trusted dispatch
  boundaries, not additional public role APIs.
  On violation: preserve the surface's existing concealed-not-found or explicit
  authentication refusal contract. Do not turn missing authority into a successful
  empty read where the caller explicitly requires authority. Do not add a common
  error wrapper that erases those established API meanings.

| Resource and permitted behavior | Enforcement and attributable source evidence |
| --- | --- |
| Private owner Tool management | `capabilityProviderTools` resolves current owner authority and checks the Business's canonical Account before read/list/slug resolution. `authz-actor-isolation.test.ts` covers owner/member success, workload/anonymous/stranger/wrong-Account/stale-generation refusal and unchanged authority rows. `capability-supply-owner-funnel-read.test.ts` covers real owner Tool detail, another valid Account and locator substitution. |
| Delegated Provider Tool operations | `listAgent`/`readAgent` require source admission, canonical supplier Agent authority and Business/Account equality. `capability-supply-private-provider-preparation.test.ts` owns the actual issued-Agent private read/write and cross-Account cases. Public query declaration does not make private preparation public. |
| Public Tool discovery | `capabilitySupplyTools` search/detail/compare use the existing public current-Tool projection without owner admission. `canonical-tool-reads.test.ts` exercises public discovery through the anonymous backend. Account isolation must not add an owner check to this path. |
| Calls | Public Agent wrappers reconcile current canonical authority, then recovery matches Principal, Account, application and environment. Public owner recovery and the worker independently check current Account ownership. `capability-call-authority-boundary.test.ts` and `capability-call-recovery.test.ts` cover canonical admission, scope substitutions, replacement/revocation and refused recovery without worker effects. `account-call-isolation.test.ts` adds actual persisted Calls in two valid Accounts: each owner reads their private input and cancels their own Call; the other owner, administrator, workload and anonymous caller cannot read, cancel or reconcile them, with both rows unchanged after refusals. |
| Money | `moneyOwnerSpend.readOwnerHistory` resolves the Account through `moneyAccountFunding.readBalanceSubject` on every page; the Formance adapter scopes the official ledger query and binds continuation cursors to that Account. `money-account-history.test.ts` proves both owners' query scopes, foreign cursor refusal before the ledger, client Account injection refusal, and no ledger access for anonymous/admin-without-ownership/workload identities. `money-account-funding.test.ts` proves issued-Agent handoff Account/Principal binding and another Agent's refusal. The deliberately public payer receipt exposes only its limited funding status, Agent display name and amount. |
| Credentials and provider connections | `agentAccessPolicy` owner readbacks use the canonical Account; server registration requires the service assertion and an active matching unexpired canonical Agent. `agentAccessPolicy.test.ts` proves two-owner readback exclusion, anonymous/admin-without-owner refusal and unchanged grants on missing/mismatched/inactive/expired Principal refusal. `provider-connection-agent-lifecycle.test.ts` proves genuine supplier-Agent management and rejects missing admission or another Account's Business. Canonical Account and external owner token are distinct facts; comparing them as aliases would break valid registration. |
| Secret material boundary | The secret lifecycle HTTP bridge requires its server transport credential and exact command schema before internal dispatch (`secret-lifecycle-http.test.ts`). Stored pointers/journals contain references and authority, not secret bytes. `secretLifecyclePersistence` validates the delegated snapshot and resource for effects and binds journal reads to its Account; `secretPointerPersistence` checks pointer/command Account identity. `secret-lifecycle-operations.test.ts` proves provision/rotation positives and cross-Account or expired snapshot refusal without journal/pointer effects. These server primitives do not grant a browser owner or administrator raw-secret access. |
| Documents | `moneyDocuments` derives statement Account and document identity from owner authority, filters lists by Account, and requires Account equality for signing and URL issuance. `money-documents.test.ts` covers two-owner create/list/sign/download positives, replay, foreign document/cursor refusal or non-disclosure, role denials and stored-state preservation. A storage URL already issued to an authorized owner is a bearer capability; these checks prove issuance isolation, not revocation of an already-issued URL. |
| Administrator privileges | `authz` reads durable active token-bound membership; `admin-authority.test.ts` protects the source-owned role/action matrix and audited destructive denials. `operator-context.test.ts` proves an administrator without ownership gets admin/developer access without owner access. Resource tests separately prove that this privilege cannot cross customer Account boundaries. |

Applied skills: `sluice` keeps the work on existing interfaces with narrow
behavioral checks; `contract-enforcer` supplies the preconditions, guarantees,
invariants and failure contracts above. The `iceinvein-design-review`
non-interactive procedure was used against this contract because Joel already
directed autonomous execution. Its thesis is the first paragraph; conceptual
integrity is strong because all private paths use current canonical authority
while public discovery remains separately defined. The material risks are
confusing administrator with owner, testing only invalid fixtures, and assuming
source proof establishes hosted identity/configuration correctness. No new IAM
model, permission middleware, test framework, service or dependency is justified.
The fixed register and existing fixtures bound the work; unrelated behavior and
hosted proof remain with their existing records.

This section establishes source obligations and their evidence, not hosted
acceptance. Real isolated Clerk/Agent/admin sessions, deployed source bindings,
direct hosted route probes and storage behavior remain unverified until the
consolidated hosted acceptance phase. Source completion requires the focused
tests above to pass; the manager owns register acceptance and integrated checks.

Source verification on 14 September 2026: five new/changed test files passed
22 tests; the existing public two-supplier discovery case passed; 16 selected
existing role/isolation/funding/secret-boundary cases passed across seven files.
The filtered runs skipped unrelated cases intentionally. All five changed test
files passed explicit Oxlint and the patch passed whitespace checks. No product
code, API, schema, dependency or provider configuration changed. Combined
typechecking and integration remain manager-owned.

The independent bounded test review found no production defect. Its evidence
limits are retained: Call refusal checks snapshot the protected Call rows, not
every audit or ledger table; administrator foreign-Account refusal and
administrator-without-ownership refusal are separate cases. Client-selected
Account injection is rejected by the actual public Convex argument validator
before the handler; the TypeScript function-reference annotation grants no API
authority. Formance filtering is asserted at the external SDK boundary, while
ledger-internal filtering correctness remains the provider contract.

## AM05 Buyer connection, approval and return

**Contract:** an owner approves bounded access for a buyer Agent; its supported
client resumes with the approved Account and can request its first Quote.
AE owns authorization and the purchased Tool boundary. The client retains its
task and conversation; AE does not manufacture external task links.

  Requires: a registered OAuth client, the appropriate device-code or
  authorization-code proof, current canonical owner authority, a current approval
  request, an explicit approve/deny decision and access within the requested
  ceiling. Credential replacement also requires the exact existing Agent and
  predecessor authority.
  Ensures: approval reserves one exact command and registers the issued
  credential against the canonical Account before claiming usable connection.
  The CLI validates account-self, stores the origin-bound credential and resumes
  through existing discovery/Quote commands. Authorization-code clients receive
  only their registered callback with the opaque client state; denial returns
  `access_denied` there without issuing a credential.
  Invariant: funding is not authority; no Account identifier or wallet setup is
  supplied to connect. Client origin, role and environment partition pending
  connection state. Replay does not mint a second credential or reissue a
  consumed authorization secret. Lost responses cannot prove that approval was
  refused, expired or unapplied.
  On violation: reject malformed decisions without changing the grant; retain a
  pending device approval across a bounded CLI wait; restart an expired request
  through the original client; refuse mismatched scope/environment before
  storing a credential. Unknown browser outcomes offer a read of the same
  approval request, retaining its OAuth state, rather than another approval.
  Clerk reverification cancellation preserves the existing choice and focus.

| Condition | Existing source and evidence |
| --- | --- |
| Canonical owner, Account and approved policy | `convex/lib/agentAccess/oauth/consent.ts` records current authority revisions, target, proof and exact command under CAS. `agentAccessOAuth.test.ts` covers exact replay, owner narrowing, cross-Account proof refusal, replacement membership and predecessor binding/credential/grant/policy drift. |
| Issue and activate before connected | `issueGrantKey` uses the installed Clerk API adapter and `issueAgentAccessKey` with `registerIssuedAgentBinding`; the CLI then validates `/api/v1/account`. `agent-access.test.ts` covers atomic owner-authorized registration, rollback of a newly created key after binding failure, and preservation of a pre-existing credential on unavailable replay. |
| Durable CLI approval and reconnection | `connect.ts` and `pending-connect.ts` preserve the same device request, validate existing credentials, bound the wait, partition by origin/role/environment and protect local credential files. Existing `cold-loop.test.ts` cases cover restart, expiry, concurrent polling refusal, edge propagation, rejected-key replacement and origin-preserving continuation. These cases are reused rather than replaced by another connection framework. |
| Explicit decision and registered callback | `agent-access-oauth-api.ts` validates the decision before mutation and returns a registered authorization-code denial callback. Its focused tests assert unchanged grant/no issuance on malformed input, client-state return, no caller-selected callback and unchanged device denial behavior. Existing authorization/token tests protect exact redirect matching and PKCE. |
| Browser interruption and continuation | `agent-access.authorize.tsx` carries the original query state to the form separately from the consent read model. The form posts that state for approval and denial, follows the server callback and offers the same grant's status link after a lost response. `agent-access-authorize.test.tsx` covers both callbacks, both lost-response paths, replacement selection, strict reauthentication cancellation and one approval dispatch. |
| Expired approval request | The authorize route recognizes confirmed 4xx `expired_token`/`invalid_grant` responses and uses existing reconnect guidance. Route tests prove no approval or futile retry control remains, while a 503 with an OAuth-looking body stays retryable. |
| Expired/revoked existing connection | `ownerConnections.ts` derives expiry and returns reconnect candidates only for the requesting OAuth client and the same owner Account. `agentAccessOAuth.test.ts` and the authorize-route tests cover exact-client candidates, no automatic choice when history is ambiguous, stable revision revocation and planned/compromise replacement. |
| First Quote in the installed CLI | The bounded `cold-loop.test.ts` connection/discovery/Quote scenario uses the existing child-process/local-server test pattern and the installed-CLI override. The installed client completed connect → its emitted search command → Quote for the returned Tool. Assertions verify the exact Quote reference, server Account/environment, stored credential reuse and preserved IPv6 origin, ending before any paid Call. Its provider responses are controlled test boundaries; hosted provider integration remains separate. |

The protocol references are the existing
[OAuth device flow](https://www.rfc-editor.org/rfc/rfc8628#section-3.3), in which
the requesting client polls while the owner approves elsewhere, and
[authorization-code error return](https://www.rfc-editor.org/rfc/rfc6749#section-4.1.2.1),
which uses the client's validated redirect URI and state. A device client has
no requirement for a browser callback. A URL back to an arbitrary third-party
conversation is not defined by these protocols or current AE source. Such a
destination must come from an actual supported client contract; it cannot be
invented or inferred from the client's display name. The separate missing
funding/task return context remains explicitly owned by AM09/24 and is not
silently claimed as repaired here.

Applied `sluice`, `contract-enforcer`, `error-strategist` and
`temporal-coupling-detector` procedures to the sequence approval reservation →
issuance/binding → account-self validation → local storage → first Quote.
Existing persisted states, CAS and caller preconditions enforce the ordering.
The UI boundary can promise honest uncertainty after a transport failure, not
rollback of an already accepted server command. Design review retains the
existing OAuth/client responsibilities and rejects a parallel callback registry,
custom URI scheme, task store or orchestration service. Changed React source is
checked with the installed React Doctor; no new dependency is required.

Source verification for this change: OAuth API 48/48; authorize route/form
26/26; selected installed CLI and refusal cases 7 passed (51 unselected);
existing issuance/binding cases 3 passed (13 unselected); existing canonical
approval/replacement/reconnection cases 7 passed (42 unselected). The installed
CLI was `/private/tmp/ae-am21-cli-3s8cnv16/consumer/node_modules/.bin/ae`;
its source-bundle fallback was not used. Scoped Oxlint, whitespace checks and
changed-source React Doctor passed; Doctor scoring and unrelated audits were
disabled. Independent bounded reviews found no concrete defect in the browser
uncertainty/callback changes or terminal-expiry recovery. No deployment or
combined typecheck was run in this lane.

Hosted Clerk challenges, actual invited-user approval, live credential propagation
and real harness/browser return remain unverified. Installed client behavior
against controlled provider boundaries proves source compatibility only. Whole
AM05 source acceptance belongs to the manager after the focused checks and
integrated typecheck pass.

## AM06 Credential replacement, revocation and retained capacity

**Contract:** an owner replaces access to an existing Agent without replacing
that Agent, its Account, its current spending limits or its accepted purchase
history. Revoking access prevents new Calls. Replacement credentials do not
create another allowance or authorize an otherwise forbidden recovery effect.

  Requires: current canonical owner authority, an existing Agent in that Account,
  a valid replacement target and exact current policy/predecessor evidence.
  Only an active credential with current authority may admit a new purchase.
  Ensures: the replacement belongs to the same Agent and Account; activation
  makes the intended credential usable and disables the predecessor according
  to the supported transition. Accepted Call and money references remain stable.
  Invariant: daily/monthly allowance, rate limits, active Call capacity and
  purchase idempotency are keyed to stable Agent identity. Credential generation
  is access/effect evidence, never a fresh spending account. A recorded purchase
  remains history after revocation; history alone grants no new authority.
  On violation: reject stale, foreign or conflicting transitions without partial
  activation; report uncertain provider cleanup truthfully and preserve its
  retry identity. Reconcile current authority before further effects. Exact
  already-accepted bookkeeping recovery uses its existing bounded proof, not
  a general bypass of revoked authority.

| Condition | Source and attributable evidence |
| --- | --- |
| Same Agent, Account, limits and accepted history | `principals/replacement.ts` resolves current owner/Account, predecessor identity, mode, scopes, Tool selection and exact policy before replacement. Existing `agentAccessPrincipals.test.ts` cases exercise prior Call recovery after promotion, immutable original evidence, Account isolation, planned stage/promote/replay/cancel with audit retention, compromise mode, one pending successor and the authenticated two-Agent lifecycle through retained history. These are canonical Convex mutation/query tests, not a comparison of duplicated policy constants alone. |
| Canonical revoke and scoped cleanup | `principals/revocation.ts` revokes exact credential/grant/delegation/binding material, invalidates scoped refresh families and retains audit/provider-revocation records. It validates the exact principal, credential, provider identifier and revoked lifecycle before recording provider outcomes; a stale result cannot target the successor. Existing canonical lifecycle cases prove scoped revoke/disconnect/replay, failure before mutation for missing binding, and bounded cleanup continuation. |
| Official provider and interrupted cleanup | `agent-access.functions.ts` uses the installed Clerk `apiKeys` adapter. Canonical revoke precedes provider calls. Two selected wrapper tests pass for retryable partial cleanup followed by canonical replay, and completed cleanup replay with no repeated Clerk call. These mock the source/provider boundaries separately; live Convex-to-Clerk integration is not implied. |
| One capacity across credentials | `convex/lib/callLifecycle/admission.ts` indexes active pending/uncertain Calls and reservation replay by stable Principal. `convex/lib/rateLimit.ts` keys the maintained rate-limiter component to that Principal. Five selected `capability-call-reservation.test.ts` cases pass for rotated replay, the exact rate key, pending/uncertain counts, expired pending grants and an actual maintained token bucket across two credential identifiers. |
| New Call admission after revocation | The canonical current-authority resolver rejects revoked bindings and expired credentials. Three selected `capability-call-authority-boundary.test.ts` cases pass for those refusals and the public action contract that requires exact canonical authority before the Call handler. AM20's registered rotation journey separately observes refusal through the revoked key. |
| Further effects after revocation | `call-worker/runPreparation.ts` validates the current dispatcher and accepted authority before claiming dispatch. All six `call-credential-rotation-dispatch.test.ts` cases pass, retaining original effect identity and refusing revoked original authority, wrong owner, revoked successor and stale generation. Three selected `capability-call-worker-authority-boundary.test.ts` cases pass for refusal before claim/effects, revocation between preparation and release, and exact persisted recovery provenance. The rotation fixture explicitly refuses the existing AM20 recovery reader; it is not a proof of that reader itself, whose exact policy-update/recovery contract remains covered by accepted AM20 evidence. |
| Retained monetary allowance and history | AM20's accepted registered-buyer/native-Ledger evidence is reused: `capability-call-workpool.test.ts`, `retains one Agent $capacity through registered credential replacement` (spending and concurrency variants), prepares/promotes the same Agent, concurrently refuses the old credential and evaluates the successor against retained capacity. It retains the original Call, permits bounded cancellation by the successor and preserves budget generation/calendar periods and final balance. This existing evidence is not replaced by a second money implementation or broad rerun. |

`sluice` bounds this record to credential lifecycle and its existing authority,
capacity and history consequences. `contract-enforcer` supplies the semantic
contract above. `idempotency-guardian` separates identity-preserving replacement
and provider cleanup from purchase reservation replay. Ordering analysis checks
prepare → activate → cleanup and admission → dispatch → consequence against
persisted transition evidence; atomic database operations are not treated as
an excuse to add a parallel state machine.

The correction filters active successors before bounding the result, rejects
stale binding replay, validates a live successor before new promotion can revoke
its predecessor, and validates the requested grant before creating replacement
artifacts. The existing completed-promotion replay remains valid after expiry;
replaying a recorded outcome does not reactivate access. The rotation fixture
now accounts for the existing, tightly scoped AM20 accepted-Call policy-update
reader without making revoked credential authority permissive.

Focused verification: all nine credential-replacement tests pass, including
red-first regressions for the four conditions. Nine selected canonical lifecycle
cases and two provider-cleanup wrapper cases pass. Five reservation/rate cases,
six rotation-dispatch cases and three worker authority cases pass. After the
source correction, six selected canonical rotation/history and OAuth refresh
cases pass; the refresh family still promotes atomically and revokes on token
reuse. Source invariants and existing accepted AM20 native-Ledger evidence cover
capacity; this record does not rerun the full money suite. Hosted simultaneous
clients, Clerk cleanup and production transaction scheduling remain unverified.
Scoped Oxlint and whitespace checks pass. Independent review of the two-file
replacement correction found no concrete defect; the three additional current
authority/public-action checks also pass.

Technical design review used the non-interactive fallback because the accepted
product contract and autonomous assignment already resolve its design questions.
Thesis: replace access while preserving the Agent and its purchase obligations.
Integrity is strong at the design level: canonical identity owns continuity,
existing Convex transactions own activation, the official provider owns its key,
and existing ledger controls own capacity. The risks are stale successor
selection, destructive ordering before validation, and mistaking provider
cleanup failure for still-valid AE access. Cuts: no second rotation state store,
new usage counter, cleanup scheduler or credential history rewrite. Existing
indexes, lifecycle results and provider readback constrain the correction.
The manager owns integrated source acceptance and combined typechecking. Hosted
provider behavior remains an explicit operational question.

## AM07 Funding quote and Checkout amount agreement

**Contract:** the Customer can distinguish the AUD credit added to the Account,
the separate funding service fee/tax and the total payable before authorizing
Checkout. The accepted total buys the promised credit. Invalid, expired or
changed quote material requires a clear correction before any changed obligation
is accepted.

  Requires: supported AUD amount/precision/increment, current canonical Account
  authority, valid current quote/policy material for the supported funding path,
  and a stable command identity for a retried Checkout request.
  Ensures: credit is the requested principal; fee and tax are additional amounts;
  total equals their sum. Provider Checkout uses the accepted command material,
  and readback must match its amount, metadata, mode and expiry.
  Invariant: no credential, advisory quote or browser return grants credit.
  Replaying a command cannot change its Account, principal amount or financial
  terms. A changed policy cannot silently replace an accepted owner quote.
  On violation: refuse before creating a new financial command or provider
  Session where refusal is established; preserve entered work and offer the
  supported correction/requote. Uncertain provider outcomes recover the same
  Session/command rather than inviting a second payment.

| Condition | Source and existing evidence |
| --- | --- |
| Exact financial calculation | `aud-funding.ts` uses the existing exact-unit/Decimal helpers and commercial controls, rounds fee/tax to cents and adds them to the full principal. `funding-quote.test.ts` covers A$10 credit + A$0.50 fee + A$0.05 tax = A$10.55, constraints and unsupported/out-of-range precision. Public preflight quotes explicitly say `binding: false`; they are not payment authorization. |
| Current owner policy | `moneyAccountFunding.reserveFundingHandler` validates canonical owner and expected commercial policy digest before storing the command. The existing changed-policy test refuses with no funding command. Its replay is bound to the original Account, input digest, amount and environment. |
| Exact hosted Checkout | `stripe-checkout-evidence.ts` uses the installed Stripe client, fixed command material and provider idempotency key. Existing provider tests assert separate credit/fee line items, inclusive tax evidence, same-key replay, durable request readback, material-drift refusal and invalid amount refusal before provider I/O. |
| Clear correction before payment | The funding panel preserves invalid input and explains format, minimum and increment errors accessibly. A changed policy blocks stale payment, refreshes through the existing owner callback and requires another explicit Pay action against the new displayed total. Failed refresh retains a retry even when constraints become unavailable; only an available different policy digest clears the block. |

Eight selected quote/provider/canonical-policy checks pass. Six selected public
preflight/owner entry cases also pass. The new canonical owner test fixes the
principal/fee/tax/total, replays the exact command and refuses changed material
without modifying its stored snapshot. Two HTTP cases reject caller-supplied
advisory quote identity/expiry or total before handoff creation. Current-policy
expiry and the entry adapter's no-provider-work refusal each pass a selected
existing test. The UI agent reports all 30 cases in `demand-console.test.tsx`
passing. Final review corrected the missing-constraints refresh edge and reran
the five quote-refresh/input-correction cases: all pass (25 unrelated cases
skipped). These are source checks; combined typecheck, integration acceptance
and hosted proof remain with the integration owner.

**Manager interpretation of expiry:** v3 public `binding: false` and its
five-minute `expiresAt` describe estimate freshness, not an accepted purchase
or an expiring quote token. Refresh that estimate through its existing quote
endpoint before relying on it for comparison; the handoff accepts only requested
principal plus idempotency key, never an advisory total. It reads current policy
and returns the actual reserved terms before the payer reviews Stripe Checkout.
The owner preview similarly sends the policy digest rather than a quote token.
New obligations reject changed terms (`price_changed`) or unavailable/expired
commercial policy (`commercial_policy_required`) before provider work. Already
accepted same-command replay preserves immutable terms; it does not reprice.
This distinction preserves the acceptance condition without claiming rejection
of a nonexistent quote-token input or adding a parallel quote store. The HTTP
rejection tests establish unsupported material refusal, not a token-expiry
mechanism. Missing Checkout Session/negative-return recovery and the owner's
lost `begin` response remain explicitly with AM09; these are not claimed fixed.

The existing accepted AM08 settlement and credit receipt is reused; webhook
reordering and cancelled/failed payment return retain AM09/10 ownership.

Applied `sluice`, `contract-enforcer`, `idempotency-guardian` and the Stripe
integration skill to the existing Checkout Sessions integration. Official
[Checkout Session creation](https://docs.stripe.com/api/checkout/sessions/create)
defines line items and a provider Session expiry of 30 minutes to 24 hours;
that provider lifetime is distinct from AE's quote validity. No SDK migration,
new payment service or homemade payment form is part of this record.
Contract and failure review reused the existing component, exact-money helpers,
canonical funding command and Stripe adapter. The change adds no service,
dependency, storage or public protocol. The finite AM07 source assignment ends
at this handoff; AM09 recovery is explicitly unverified here.

## Provider lifecycle contract

The user submits one reviewed Tool version and sees its progress on the same
Tool page. Returning to the page or restarting the CLI must recover that work.

Provider visibility and Tool admission are separate: an existing public Provider
can validate another Tool under the same sandbox contract as a new Provider.
The internal validation snapshot may relax only missing Provider publication
and the exact Tool's outstanding validation admission. Every other qualification
blocker remains binding. Existing public Provider evidence is preserved; a future
published-Provider anchor is needed only while that Provider is private. Final
promotion remains the owner of Tool routeability.

Promotion predicts its exact admission record and, when needed, Provider
publication through the existing qualification rules before writing. The
published Tool must match that complete material identity, including all
qualification evidence. Readiness times and the current Provider claim remain
binding. Unexpected drift aborts the transaction. No alternate hash or
qualification protocol is introduced. Replay consumes the retained promotion
record and never requests another paid validation.

| State and trigger | System responsibility | User's next action |
| --- | --- | --- |
| Draft / Needs setup | Preview source, input/output contract, pricing and connection requirements without purchasing anything | Correct the identified field or connection, then submit |
| Submitted / Under review | Persist the exact approved source, publisher, connection authority and original command identity; check readiness and perform one bounded platform-funded validation | Inspect progress; no repeated approval for already-admitted work |
| Validation delivery and payment proven | Existing evaluator checks current source/authority, output evidence and settlement; atomically admits publication | View published Tool |
| Known failure before possible submission | Record evidence, retain command identity, recheck authority before another permitted attempt | One owned retry/recheck action, if safe |
| Possible submission or uncertain result | Keep the original Call and attempt; reconcile retained payment and output evidence | Observe status or follow a specific intervention; no new purchase |
| Expired authority or changed source/connection | Refuse new effect, preserve old evidence, state exactly what changed | Reauthorize or submit the intended new revision through the existing action |
| Published → paused, changed or withdrawn | Recompute routeability from current facts; prevent new Calls while preserving accepted purchases and records | Manage the Tool using existing revision/withdrawal actions |

**Coordination decision:** use the installed Workflow component for the
readiness → validation → evidence wait → promotion sequence. The concrete need
is durable continuation across external work and uncertainty, not merely making
several sequential calls. Workpool continues to own bounded Call execution.
Do not add a parallel scheduler or a custom saga/state table.

**Status decision:** keep the existing Provider lifecycle projection as the
user-facing contract. Workflow state is operational metadata. Readiness writes,
promotion and workflow completion must use consistent evidence precedence;
neither a late readiness result nor a failed job callback may overwrite a
verified current publication with an unrelated terminal claim. Changed source
identity invalidates old progress before any new effect.

**Resume decision:** a polling window ending is not a terminal business failure.
The same case/Call must remain observable and have an owned resumption path.
Recovery distinguishes proven absence, verified settlement without delivery,
usable retained output and unresolved evidence. A new workflow run, where
needed, resumes those records; it does not mint another purchase identity.

The uncommitted workflow is an implementation candidate, not the design's
baseline of truth. Its fixed polling window, terminal callback, duplicate-start
guard and interaction with existing admission writers must satisfy this full
contract before it can be deployed. The previous loop of adding the next
successful transition is explicitly rejected.

### Disposition of the pending implementation

Keep the extracted internal request/promotion commands and the atomic link from
an admitted publication to durable coordination, subject to their acceptance
tests. Replace the candidate's timeout-as-completion behavior and permanent
no-resume guard. Reuse `provider_tools:v1`, its eight states and existing
`supply.status` / `supply.recheck` continuations; do not add a public validation
object or a second public status API.

The remaining lifecycle decisions are fixed:

- A safe recheck resumes coordination for the same case and accepted Call.
  A fresh attempt requires the existing Call recovery contract to prove it is
  permitted. A request to retry is not itself proof of non-submission.
- Expired claims, revoked connections, offboarding and ownership transfer block
  new effects. They do not delete past payment/output evidence. Recovery of
  past effects uses the existing authorized recovery boundary.
- Withdrawal prevents future routeability and promotion, including a late
  successful validation. It does not pretend to cancel already-submitted work;
  that work remains subject to its Call cancellation/recovery contract.
- Promotion rechecks current source, connection, ownership, offboarding/freeze
  and expiry in the same authoritative transition. Existing promotion checks
  must be reused; a wrapper's absence of these checks is not proof they are
  missing from its delegated evaluator.
- Resume after an interruption between promotion and workflow completion reads
  the exact promotion receipt and succeeds idempotently. It cannot require the
  Provider to become private again or reconstruct consumed approval.
- A background failure reports an operational blocker. Current domain evidence
  takes precedence over its callback when projecting publication status.

## Buyer purchase contract

The primary machine journey remains **search → Quote → Call → result**.
Connection, funding and spending-policy setup are prerequisites resolved in the
app; they must not become extra diagnostic calls on every purchase.

| Transition | Required behavior and evidence |
| --- | --- |
| Sign in → connect Agent | Bind the correct Account, role, replaceable credential and current spending policy; revoke the old credential without losing history |
| Funding quote → Checkout → credit | Disclose credit, fee and total; post confirmed funding once in the applicable qualification or approved live environment; cancellation grants nothing; repeated events preserve the same credit/documents |
| Discovery → Quote | Browsing has no paid effects. Quote binds Tool version, input, challenge, all-in AUD price, authority, expiry and evidence; unsupported network paths are refused, while approved Base Sepolia and Base mainnet paths remain environment-separated |
| Accept Quote → reserve → dispatch | Recheck exact facts and fresh treasury capacity. Reserve shared funds and Agent exposure before signing; concurrency cannot overspend |
| Known usable delivery | Capture the correct AUD amount once and retain separate upstream settlement and delivery records |
| Known pre-submission failure | Release safely with evidence; preserve the same Call and explain the permitted next action |
| Unknown submission, payment or delivery | Hold the uncertain purchase, reconcile the same references, and offer one safe continuation; never show false completion or blind retry |
| Remedy → resolved record | Apply the supported refund/adjustment once; retain attributable history and correct period totals; do not erase the original event |

Platform-funded Provider validation has no buyer reservation or Charge. Its
success proves supply qualification only. A separate hosted buyer journey must
prove the full financial and delivery chain above, including the applicable
Seller/Provider/recipient and document facts. Missing facts cannot be replaced
with plausible labels. The fourteen [start-line proof steps](../../START_LINE.md#proof-contract)
remain the detailed acceptance contract.

## Product interaction contract

Keep the existing Operations, Agents, Credit, Calls and Account & security
surfaces. Complete their transitions and shared projections before visual
polish. For each supported operation, its page and machine response must state:

- What was accepted, and its durable reference.
- What is happening or what specifically prevented progress.
- One next action that is safe in the current state.
- What changed after that action, including financial consequences.

Loading preserves context; empty states offer a relevant start; errors preserve
entered data; expired hosted links regenerate through their owning provider;
browser return reads durable status. Reconnection resumes the existing resource.
Use existing maintained form, dialog, notification and navigation components.
Internal implementation labels must not appear in product copy.

The Stripe question is a design heuristic: predictable progress, reliable
resumption, clear responsibility and understandable records. The local
[maturity comparison](../../research/PACKAGE-5-MATURE-SCAVENGE-COMPARISON.md)
supports those principles as dated research. It is not a claim about current
Stripe or competitor internals, and it does not justify copying their domains.

## Fixed delivery sequence

Root owns this design and integration. Workers implement agreed contracts;
auditors report observed behavior. Discoveries change the plan explicitly
before they change task scope. Each implementation assignment has at most three
owned files where practical, one behavior contract and a finite completion point.

| Order | Complete outcome | Boundary and acceptance | Work allocation |
| --- | --- | --- | --- |
| 1 | Establish Provider lifecycle acceptance against this design | Encode evidence precedence, interrupted continuation, stale callbacks, exact replay after promotion and withdrawal; pending-work disposition is fixed above | Tests precede the remaining coordination, projection and recovery changes; no deployment until this complete milestone passes |
| 2 | Deliver supported publication as a complete journey | Owner and Agent submission, one testnet validation, usable output, publication visibility, repeat submission and safe change/withdrawal on a coherent candidate | Root integrates reviewed 1–3-file tasks and performs exact hosted proof |
| 3 | Prove buyer purchase and remedy | Fresh user/Agent, qualification credit, Quote, paid Base Sepolia Call, matched ledger/delivery/documents; limits, duplicates, interruption and remedy | Bounded fixes only for established contract failures, grouped by owning boundary; re-run the whole affected journey |
| 4 | Close supporting integrations and operations | Hosted Infisical create/use/revoke/delete and tenant isolation; credential rotation; documents; actionable alert/support; restore proof and current operating constraints | Readback first. Configuration tasks use official tools. No new service or speculative monitoring layer |
| 5 | Freeze one candidate and audit every supported surface | Reconcile routes/navigation/API/CLI/MCP/chat inventory with finite cold-user reports; desktop, compact layout, keyboard and all relevant states | Bounded cold Luna review, isolated test resources, at most six decision turns or twelve minutes each |
| 6 | Close the production package and launch proof | Group remaining findings by root cause, satisfy attributable commercial/infrastructure gates, then execute the bounded live funding and Base mainnet purchase against a named revision | No auditor patches; no release while approvals, critical findings or supported production journeys remain unverified |

Orders 2 and 3 form one transaction milestone, not separate declarations of
readiness. Supporting integration readbacks may run alongside them where they
do not mutate shared test resources. Do not repeat configuration already proved
merely because another part of a journey fails.

Before each worker starts, root resolves its exact 1–3 files from the contract's
source owner and the existing test setup. This plan does not pretend a whole
buyer lifecycle is a three-file patch. Multiple bounded assignments remain
subordinate to one acceptance milestone and one integrated design.

## Evidence and release decision

The [reset evidence table](alpha-validation-plan.md#release-outcome-and-present-evidence)
separates configured, source-tested and hosted-proven behavior. Reuse verified
Clerk and Stripe funding evidence where unchanged; it does not close purchase,
secret lifecycle or recovery gaps.

Release requires complete evidence for all six journey groups in that table,
the start-line financial invariants, and every supported surface in the audit
inventory. Record deployed revisions and test identities, exact references,
expected/observed results and recovery outcomes. A passing test suite or a green
readiness endpoint cannot substitute for that evidence.

Current known holds: hosted publication and buyer purchase; Infisical hosted
lifecycle; document/refund/replay journeys; full user/Agent and role-isolation
coverage; operational alert and recovery evidence. The recorded SNS delivery
and RPO gap require current readback and resolution, not an invented waiver.
Sentry/PostHog configuration or event delivery is not established by this review.
Source correctness, runtime readiness and polished interaction are separate
checks required for the included behavior.

## Design review conclusion

The technical design review was applied non-interactively to this document;
existing product decisions answer the interview questions. Integrity is coherent
at the design level; implementation and hosted evidence remain incomplete.

The most material risks are competing status writers, a recovery path that ends
without a usable continuation, and mistaking isolated integration success for
a complete purchase. The design removes speculative services, generic recovery
engines, duplicate business state, broad navigation redesign and open-ended
patch loops. Sandbox scope, the existing stack and finite workers constrain the
solution without weakening correctness.

Current execution assignments and order are governed exclusively by the
[alpha maturity register](alpha-maturity-register.md#record-by-record-execution).
The earlier milestone ordering above describes design dependencies and history;
it does not authorize switching away from the manager's active release record.
