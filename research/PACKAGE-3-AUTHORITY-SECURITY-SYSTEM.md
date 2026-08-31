# Package 3 — Authority and security control plane

Status: preparation contract

Scope: Packages 3A–3D

Product authority: `PRODUCT.md`

Companion evidence: `research/PACKAGE-3-AUTHORITY-SECURITY-REFERENCES.md`

## Outcome

Package 3 becomes one authority and security control plane with four product
projections:

1. **Agents** — durable caller identity, credentials, grants, limits, use, and
   compromise response.
2. **Connections** — upstream authority, secret reference, health, rotation,
   and recovery.
3. **Consequential actions** — actor, target, consequence, confirmation,
   recent human proof when required, execution, and recovery.
4. **Account & security** — Clerk-owned human sessions, devices, factors, and
   recovery alongside AE-owned security evidence.

The system is cohesive because all four projections use the same principal,
Account, grant, consequence-admission, correlation, and evidence meanings. It
is not a monolith: each domain keeps its existing lifecycle and source of
truth.

## NOT in scope

- Do not build an identity provider, OAuth server for human login, MFA system,
  session store, secret vault, payment form, payout-account store, or custom
  rate limiter.
- Do not make Infisical, Clerk, Stripe, or an upstream provider the source of
  truth for AE principals, Accounts, grants, Operations, or spending policy.
- Do not create a universal credential table, universal state machine, generic
  security service, or one polymorphic audit payload.
- Do not rewrite the existing delegation, provider-connection, money,
  publication, or secret lifecycle state machines.
- Do not introduce organization membership or shared-account authority.
- Do not put secret values, session tokens, provider responses, or recovery
  factors into Convex, diagnostics, analytics, URLs, or browser storage.

## System boundary

```text
Human / agent / workload request
        |
        v
Existing identity resolver
Clerk session | AE agent credential | declared workload evidence
        |
        v
Canonical Principal + active Account binding
        |
        v
Current Grant / provider authority / policy generation
        |
        v
ConsequenceAuthorityBoundary
actor + target + scopes + resources + budget + fresh-proof policy
        |
        v
Domain-owned command
money | publication | agent access | provider connection
        |
        v
Canonical readback + redacted evidence
        |
        +--> Agents
        +--> Connections
        +--> Account & security
        +--> operator audit readback
```

The `ConsequenceAuthorityBoundary` remains the one protected execution seam
across HTTP, Convex, MCP, CLI, callbacks, workers, jobs, cron, and
reconciliation. Package 3 extends its admission facts and projections; it does
not create a second gateway.

## Source-of-truth ownership

| Concern | Source of truth | AE stores or projects |
|---|---|---|
| Human authentication, factors, sessions, devices, account recovery | Clerk | Canonical Principal/Account binding and selected redacted security-event references |
| Agent identity and authority | AE Principal, credential binding, AgentAccess grant, and Delegation grant | Owner-facing agent projection and lifecycle evidence |
| Provider authorization | Upstream provider authorization server plus AE provider-connection record | Granted scopes/resources, expiry, authority generation, health, and opaque credential reference |
| Secret material | Infisical | Opaque `secretRef`, active generation pointer, validation result, and lifecycle evidence |
| Funding and payout execution | Stripe-hosted or Stripe Elements/Connect flow plus AE money ledger | Intent, actor, Account, amount/destination summary, provider reference, canonical readback, and recovery state |
| Publication | AE catalog and supply source state | Actor, exact Operation revision, consequence, publication receipt, and recovery state |
| Rate limiting | `@convex-dev/rate-limiter` | Named policy, admitted/refused result, retry-after evidence where safe |
| Product audit history | Domain commands and canonical readbacks | One redacted, append-only owner security projection plus admin/operator projection |

### Infisical decision

Retain the existing `InfisicalCloudSecretStore` as the production secret-store
adapter. The current implementation already has OIDC machine authentication,
separate platform and customer vault scopes, generation-based writes,
validation before pointer promotion, bounded access-token lifetime,
reconciliation after ambiguous external effects, and secret-safe error
handling.

Package 3B should use more of Infisical's maintained lifecycle capabilities
where the upstream is supported, but must not import Infisical's machine
identity or RBAC model as AE's owner/agent authority model.

## Canonical meanings

These distinctions are mandatory across schemas, services, copy, and tests.

| Term | Meaning | Not interchangeable with |
|---|---|---|
| Principal | Durable actor identity in AE | Credential, session, provider account |
| Account | Owner boundary for authority and economics | Supplier identity, Clerk user, workspace |
| Credential | Replaceable authenticator bound to a Principal | Principal or Grant |
| Grant | Bounded permission, resources, budget, expiry, and generation | Credential or confirmation |
| Connection | Account-owned authorization to one upstream provider/resource set | Secret or Operation readiness |
| Confirmation | Human acknowledgement of the exact action shown | Reauthentication |
| Reauthentication | Fresh provider-verified proof that the current human is still present | A dialog, password field, or recent click |
| Consequence admission | Immutable server decision that the actor may attempt one exact command | Final domain outcome |
| Evidence event | Redacted fact about an attempted or completed transition | Secret material or provider response dump |

## Shared invariants

1. **Identity outlives credentials.** Rotation changes the active credential
   generation, not the Principal or its historical activity.
2. **Authority is server-resolved.** Actor, Account, grant, resources, budget,
   and current generation never come from editable request fields.
3. **Least privilege is visible and enforceable.** The owner sees scopes,
   resources, environment, spending limits, rate limits, and expiry before
   granting or increasing access.
4. **Confirmation is dynamically linked.** The confirmation describes the
   same actor, target, scope, amount, destination, and revision that the server
   later admits.
5. **Authority increases require recent human proof.** Creation, scope or
   resource expansion, budget increase, longer expiry, stronger authority
   mode, payout-destination replacement, and provider reauthorization are
   denied before dispatch when Clerk reverification is absent or stale.
6. **Proof is short-lived and non-replayable for critical increases.** A Clerk
   `reverification_id` and factor-verification age are correlated with one
   command digest; the same proof cannot authorize a different command.
7. **Reduction is not escalation.** Revocation, expiry shortening, budget
   reduction, and scope narrowing still require clear confirmation where
   destructive, but do not require escalation proof merely because they are
   sensitive.
8. **Rotation is prepare, validate, promote, revoke.** The previous credential
   remains usable only for the bounded overlap needed to deliver and validate
   its successor. Single-phase upstreams disclose the interruption risk.
9. **Health is evidence, not optimism.** Connection health reports the latest
   authenticated observation, its time, and its subject. Operation readiness
   remains a separate projection.
10. **Uncertain dispatch is never a retry invitation.** `outcome_unknown`
    preserves command identity and leads to canonical status readback or
    reconciliation.
11. **Secrets do not cross the port.** UI, Convex documents, logs, analytics,
    errors, snapshots, and diagnostic downloads contain opaque references and
    redacted metadata only.
12. **History survives revocation.** Revoking a credential, connection, or
    session does not erase attributable evidence.

## Consequential-action policy

Routes do not choose their own security treatment. One policy table maps a
domain action to the required controls. The server enforces the table before
reserving or dispatching a command; the UI projects the same server-authored
descriptor.

| Action class | Examples | Confirmation | Recent human proof | Recovery lead |
|---|---|---:|---:|---|
| Read | View agents, connection health, sessions, evidence | No | No | Refresh authoritative read |
| Safe validation | Test a connection without changing upstream authority | Contextual | No | Run test again |
| Spend or external transfer | Submit payment, paid canary | Exact amount and target | Provider SCA or policy-selected Clerk proof; never duplicate both without reason | Check payment/canary status |
| Publish or withdraw | Publish exact Operation revision, withdraw publication | Exact revision and market effect | Required when publication also expands monetary or execution authority | Read publication status |
| Authority increase | Create access, broaden scope, raise budget, extend expiry, replace payout destination, reauthorize provider | Exact before/after authority | Yes, before any external dispatch | Reload current authority |
| Authority reduction | Revoke credential, disconnect agent, narrow scope, revoke connection | Exact blast radius and retained history | No by default; Clerk may require it for Clerk-owned session revocation | Reload lifecycle/cleanup status |
| Account recovery/admin override | MFA reset, break glass, ownership recovery | Separate high-friction workflow | Provider/admin verification appropriate to recovery risk | Evidence reference and escalation |

### Admission shape

Extend the existing consequence intent/admission contract rather than adding a
parallel command framework. The minimum shared facts are:

- canonical actor Principal and active Account;
- action class and domain action identifier;
- canonical target references and target revision/generation;
- required scopes, resources, and budget amount;
- human-readable consequence and reversal/recovery classification;
- required proof policy and admitted Clerk proof metadata when interactive;
- idempotency reference, correlation reference, and command digest;
- admission and expiry timestamps.

The domain command remains responsible for its own arguments, transitions,
provider call, receipts, and readback.

## What already exists

| Existing capability | Decision |
|---|---|
| Principal/Account and external-identity bindings | Reuse as the durable actor and owner backbone |
| AgentAccess credentials, policies, OAuth consent, replacement, revocation, and disconnect | Complete the projection and align enforceable resources; do not replace |
| Delegation grants, generations, ancestry checks, and immutable admission snapshots | Keep as canonical consequence authority |
| `ConsequenceAuthorityBoundary` and surface adapters | Extend in place as the sole protected command seam |
| Provider-connection authority, cleanup, and recovery lifecycle | Reuse; add provider-specific setup/health projections |
| Infisical secret-store adapter and AE generation/pointer lifecycle | Retain as secret custody and rotation machinery |
| Clerk `UserProfile`, server session auth, redirect sanitizer | Retain for human account/session/security controls; add maintained reverification |
| `@convex-dev/rate-limiter` | Extend with named policies only where new sensitive mutations require them |
| Money, payout, publication, invocation, and provider durable command identities | Reuse for consequence binding and unknown-outcome recovery |
| `AeConfirmDialog`, Package 1 state semantics, duplicate locks, and canonical readback copy | Reuse as UI primitives; do not create a universal security card |
| Existing admin audit contract/readback and domain histories | Extend into a typed owner security projection; do not treat debug logs as history |

## Current-state audit

### Package 3A — Agent access management

| Requirement | Current state | Remaining system work |
|---|---|---|
| Create and name access | OAuth device/code consent creates a durable Principal and display name; replacement flow preserves identity | Make the owner-facing create/replace distinction explicit and support renaming the durable display label without rotating identity |
| Show scope and spending limits | Consent and detail views show scopes, authority mode, environment, per-call/daily/monthly spend, concurrency, and rate limits | Make resource scope explicit; current delegation roots use `resourceRefs: ['*']` and `operationAccess: all_admitted` |
| Show last-used information | Agent projection shows `lastSeenAt`; credentials carry issue/expiry facts | Record and label credential-authentication use separately from money activity and generic last-seen projection; coarsen writes while preserving the evidence source |
| Rotate and revoke access | Successor credential, promotion, predecessor revocation, one-credential revoke, and full disconnect exist | Put rotation and compromise response in the owner surface with clear overlap and provider-revocation status |
| Handle expiration and compromise | Expired/revoked states and lost-key recovery copy exist | Add an explicit “credential may be compromised” action that rotates or disconnects, shows blast radius, and retains the reference |
| Preserve audit history | Credential generations and activity survive revocation | Add one redacted agent-security timeline covering create, use, deny, rotate, revoke, expiry, and provider cleanup |

Do not add another Agent grant model. Join the existing AgentAccess policy and
Delegation authority by their shared grant/generation identity, and make the
Delegation `resourceRefs` the enforceable resource boundary.

### Package 3B — Supplier connections

| Requirement | Current state | Remaining system work |
|---|---|---|
| Connect and test upstream providers | Public x402 inspection/connect is owner-visible; keyed adapters consume existing connection references | Add provider-specific connect adapters for the actually supported keyed providers; never add a generic raw-secret form |
| Show connection health | Lifecycle, expiry, availability, and Operation readiness evidence exist | Define one connection-health projection distinct from Operation readiness: last authenticated check, checked resource, observed scope, status, and next action |
| Explain required permissions | Requested/granted scopes and resources exist in commands | Present required, requested, and granted permissions in owner language before consent and after connection |
| Rotate credentials safely | Authority generation and the secret generation lifecycle exist | Expose provider-supported dual-phase rotation through Infisical; disclose maintenance-mode single-phase rotation where unavoidable |
| Recover disconnected/expired connections | `reauthorization_required`, `revocation_pending`, `cleanup_required`, and `outcome_unknown` exist | Drive every recovery action from canonical connection readback and make credential vs provider-authority recovery distinct |
| Keep secrets out of diagnostics | Opaque references, redaction, guarded bodies, and tests already exist | Retain as a release gate; add owner diagnostic export tests if an export is introduced |

Connection health must not become a second Operation readiness state machine.
The connection answers “can AE authenticate to this upstream authority now?”;
Operation readiness answers “can this exact Operation revision execute and
produce a conforming result now?”

### Package 3C — Consequential-action controls

| Requirement | Current state | Remaining system work |
|---|---|---|
| Identify actor and target | Canonical actor/Account/grant resolution is strong; domain UIs name some targets | Make actor, Account, and exact target/revision part of every server-authored action descriptor |
| Show scope and consequence | Funding quote, paid canary, publication, withdrawal, revocation, and disconnect have useful but independent copy | Project one consequence vocabulary and reversal/recovery class without making a universal visual card |
| Require human confirmation | Existing dialogs and Stripe confirmation cover many actions | Apply the central policy table and synchronous duplicate lock to every listed action |
| Reauthenticate on authority increase | Clerk session authentication exists; fresh-proof admission does not | Adopt Clerk reverification, enforce it server-side before dispatch, and bind unique proof to the command digest for critical increases |
| Explain reversal and recovery | Money, publication, agent, and connection state machines have readback/recovery behavior | Include domain-owned reversal/recovery facts in the action descriptor and final receipt |

The existing `AeConfirmDialog` remains the confirmation primitive. Clerk's
maintained reverification UI is the reauthentication primitive. They may appear
in one journey, but must remain separate controls with separate server proof.

### Package 3D — Account security

| Requirement | Current state | Remaining system work |
|---|---|---|
| Session and device management | `/owner/settings` embeds Clerk `UserProfile`, which owns profile/security/session controls | Verify enabled Clerk features and make Account & security the stable owner route; do not duplicate Clerk session CRUD |
| Account recovery | Clerk owns sign-in and factor recovery; AE has separate operational authority recovery | Configure backup codes and recovery policy, document the high-risk MFA reset path, revoke other sessions on suspected compromise, and keep operational recovery separate |
| Sensitive-action reauthentication | Server `auth().has({ reverification })` support is present in the transitive Clerk backend | Upgrade `@clerk/tanstack-react-start` so the maintained client reverification flow is available, then enforce the shared consequence policy |
| Redirect and request protection | Same-origin redirect sanitization, CSRF/source-write admission, private caching, and security headers exist | Preserve and extend tests to all new callbacks and recovery returns |
| Rate limiting | `@convex-dev/rate-limiter` protects public, OAuth, agent, chat, and dispute surfaces | Add named limits only for new sensitive mutations and recovery probes; do not create another limiter |
| Security event history | Admin audit readback and several domain histories exist | Add an owner-scoped, redacted security-event projection spanning Clerk references, agents, connections, and consequence admissions |

The installed `@clerk/tanstack-react-start@1.4.9` bundles
`@clerk/react@^6.11.1`. Clerk's current sensitive-action reverification guide
requires a newer React SDK. The current published TanStack package is compatible
with this repo's TanStack versions and bundles a qualifying Clerk React SDK.
Treat that version change as a deliberate, separately verified dependency
update—not as permission to replace the existing auth boundary.

## Engineering review

### Architecture

The repo already has the correct load-bearing seams: Principal/Account,
generation-aware Delegation grants, the cross-surface consequence boundary,
provider-connection authority, Infisical-backed secret custody, domain-owned
money/publication commands, Clerk authentication, and the maintained Convex
rate limiter.

The architectural defect is projection drift: Agents, Connections, money,
publication, Clerk security, and the older audit registry each describe actor,
authority, consequence, and recovery differently. The plan resolves that with
one admission/evidence language. It does not merge the domain lifecycles or
vendor resource models.

Two controls stay deliberately separate:

- Clerk reverification proves recent control of the current human
  authenticator. The initial policy is strongest-available fresh verification,
  with the actual factor level recorded; it must never be labelled MFA unless
  the signed evidence proves MFA.
- AE consequence admission proves that this human may attempt this exact
  target, authority delta, amount, destination, or Operation revision now.

This avoids a custom authentication ceremony while preventing a recent login
from becoming reusable approval for arbitrary commands.

### Code quality

- Extend `AuthorityConsequenceIntent` and `AuthorityConsequenceAdmission`;
  do not add a parallel `SecurityCommand` framework.
- Keep event payloads typed by domain. Share the redacted envelope, not a
  `Record<string, unknown>` dumping ground.
- Introduce a provider adapter only when an existing execution adapter needs an
  owner connection flow. No speculative registry entries.
- Reuse `AeConfirmDialog`, the Package 1 UI-state contract, existing durable
  command identities, and canonical readbacks.
- Remove replaced route-specific confirmation/reauth policy branches as each
  domain adopts the central policy. Do not run both paths indefinitely.
- Keep Clerk and Infisical types inside their adapters so domain modules do not
  depend on vendor response shapes.

### Performance

- Do not call Clerk, Infisical, or an upstream provider while rendering the
  general owner shell. `UserProfile` owns live Clerk account controls;
  provider/secret reads occur only on their detailed surfaces or commands.
- Coarsen credential `lastUsedAt` persistence to a bounded window while keeping
  the authentication source and outcome semantics. A successful invocation
  already has its own receipt; do not write a duplicate security event for
  every call.
- Paginate owner security history by `(accountRef, createdAt)` and target
  lookups by `(accountRef, targetType, targetRef, createdAt)`. Never scan the
  global event set and filter in memory.
- Ingest Clerk webhooks asynchronously and idempotently. The event projection
  may be eventually consistent; current session authority still comes from the
  signed Clerk session.
- Cache static provider permission explanations by adapter version, not health
  results. Health always includes an observation time and bounded freshness.
- Reconciliation workers use leases/backoff and one current command identity so
  a provider outage cannot create an unbounded retry storm.

No new high-complexity synchronous path is required. The only added check on a
consequential command is current proof policy/digest admission before the
existing domain reservation or dispatch.

### Test coverage map

```text
CODE PATHS                                          OWNER / OPERATOR FLOWS
[EXISTING] Principal + Account resolution           [EXISTING] Clerk profile/session controls
[EXISTING] Delegation generation admission          [EXISTING] Agent consent + issue
[EXISTING] Cross-surface consequence boundary       [EXISTING] Agent rotate/revoke/disconnect
[EXISTING] Provider connection lifecycle            [EXISTING] x402 connect/revoke/recover
[EXISTING] Infisical generation + reconcile          [EXISTING] Money/publication readback recovery
[EXISTING] Maintained Convex rate limiter            [GAP] Agent rename + auth-use evidence
[GAP -> UNIT] Action classification matrix          [GAP -> E2E] Authority increase -> reverify
[GAP -> UNIT] Clerk proof/digest admission           [GAP -> E2E] Cancelled/stale reverification
[GAP -> UNIT] One-proof/one-command replay rule      [GAP -> E2E] Provider permissions + health
[GAP -> INTEGRATION] Owner security event ingest    [GAP -> E2E] Planned vs compromise rotation
[GAP -> INTEGRATION] Account-scoped event query     [GAP -> E2E] Account compromise checklist
[GAP -> INTEGRATION] Provider health observation    [GAP -> E2E] Security history + session revoke

Baseline: 11 existing protected paths/flows; target adds 13 explicitly tested
paths/flows. Every new external-effect flow includes refusal, timeout,
duplicate, stale-generation, and outcome-unknown coverage where applicable.
```

No LLM prompt, model, evaluation dataset, or AI-generation behavior changes in
Package 3.

## One owner security history, several event producers

The owner needs one chronological readback, but domains remain responsible for
emitting truthful events. Extend the existing audit contract and projection
instead of scraping UI state or copying provider audit logs wholesale.

Minimum event families:

- `account.session.*`, `account.factor.*`, `account.recovery.*` — selected
  Clerk webhook/API references, not session tokens or recovery material;
- `agent.created`, `agent.renamed`, `agent.credential.used`,
  `agent.credential.denied`, `agent.credential.rotated`,
  `agent.credential.revoked`, `agent.disconnected`;
- `connection.created`, `connection.checked`, `connection.reauthorized`,
  `connection.secret_rotated`, `connection.revocation_started`,
  `connection.cleanup_completed`, `connection.cleanup_unknown`;
- `consequence.confirmed`, `consequence.reverification_required`,
  `consequence.admitted`, `consequence.refused`,
  `consequence.outcome_unknown`, `consequence.reconciled`.

Every event includes actor Principal, active Account, target type/reference,
event time, correlation/idempotency reference, outcome/reason code, source
system, and redacted evidence references. Domain-specific before/after state
stays typed; there is no free-form provider payload.

Clerk and Infisical audit logs remain their operational sources. AE records only
the subset required to explain product authority and recovery to the owner.

## Implementation sequence

### Slice 0 — Dependency and configuration proof

**Outcome:** prove the maintained products can provide the required machinery
before changing domain behavior.

- Upgrade `@clerk/tanstack-react-start` in isolation to a version whose bundled
  React SDK supports `useReverification` and whose peer ranges include the
  installed TanStack versions.
- Configure and test Clerk session claims for factor-verification age and a
  unique `reverification_id` without exceeding Clerk's custom-claim size limit.
- Confirm Clerk `UserProfile` exposes the enabled sessions, factors, backup
  codes, and recovery controls in the deployed instance.
- Confirm Infisical machine OIDC, platform/customer vault isolation, audit-log
  access, and supported rotation integrations in the deployment environment.
- Record provider support and licensing constraints; unsupported provider
  rotation remains manual, explicit, and truthful.

**Proof:** dependency tests, production build, deployed Clerk sandbox journey,
and an Infisical non-production rotation rehearsal. Stop if maintained SDK
support is unavailable; do not replace it with custom password/MFA UI.

### Slice 1 — Shared consequence admission

**Outcome:** one server-enforced policy for confirmation and recent human proof.

- Extend the existing consequence intent/admission with action class, exact
  target version, consequence/recovery class, proof policy, and command digest.
- Add a Clerk-specific interactive authority adapter that checks
  `auth().has({ reverification: ... })` and, for critical increases, validates
  the signed proof identifier/freshness before command reservation.
- Consume each critical proof once for one command digest. Replays with the
  same command are idempotent; use with different command material is refused.
- Return a typed `reauthentication_required` refusal before any dispatch.
- Add the shared event envelope and owner-scoped projection contract.

**Proof:** matrix tests for every action class, mutation-order tests proving no
reservation/provider call occurs before proof, proof replay/mismatch tests, and
cross-surface authority tests.

### Slice 2 — Package 3A projection and lifecycle completion

**Outcome:** Agents is the complete management home for identity, scope,
limits, use, rotation, compromise, and history.

- Add rename, explicit last-authenticated-use, issue/expiry, resource scope,
  and audit events to the existing Principal projection.
- Replace wildcard resource presentation with exact enforceable resource
  choices or an explicit “all admitted Operations” grant; never imply a
  narrower grant than the server enforces.
- Route creation, scope/budget/expiry increase, and rotation through Slice 1.
- Add a compromise path that offers rotate or disconnect, explains the blast
  radius, and reports provider-revocation cleanup separately.

**Proof:** owner isolation, exact-scope enforcement, last-use semantics,
rotation overlap/promotion/revocation, compromise recovery, stale generation,
duplicate command, and retained-history tests.

### Slice 3 — Package 3B projection and lifecycle completion

**Outcome:** Connections is a provider-specific, secret-safe authority surface.

- Introduce a narrow provider-adapter registry only for providers already
  supported by execution adapters. Each adapter declares consent method,
  required permissions, health check, expiry facts, rotation mode, revoke, and
  recovery link.
- Project connection health independently from Operation readiness.
- Use provider-hosted OAuth/authorization where available; use Infisical for
  secret material and supported rotations; never render a generic raw-key
  field.
- Route reauthorization, credential replacement, and expanded permissions
  through Slice 1.

**Proof:** requested/granted permission mismatch, expired consent, health
observation freshness, dual- and single-phase rotation, disconnected recovery,
ambiguous cleanup, and secret-leak scanning across DOM/log/error/audit output.

### Slice 4 — Package 3C adoption by domain

**Outcome:** funding, payouts, publishing, and authority changes all project
and enforce the same consequence policy.

- Funding shows Account, credit amount, fee, total charge, provider handoff,
  and canonical recovery. Provider payment confirmation remains authoritative.
- Payout connection/replacement shows beneficiary/destination summary,
  capability impact, irreversibility, and strict recent proof before authority
  changes.
- Publication shows exact Operation revision, market visibility, price/payment
  implications, withdrawal path, and readback.
- Agent and provider authority changes show before/after scopes, resources,
  budgets, expiry, credentials affected, and retained history.
- Preserve domain-specific UI; reuse the shared descriptor, inline state,
  confirmation primitive, and Clerk reverification flow.

**Proof:** one table-driven contract suite plus domain journeys for funding,
payouts, publication, agent access, and provider connections. Every uncertain
external effect must recover by the same command/reference.

### Slice 5 — Package 3D owner security projection

**Outcome:** Account & security combines Clerk's maintained controls with AE's
redacted security narrative.

- Keep `UserProfile` as the session/device/factor management surface.
- Add owner-facing security history and incident actions: sign out other
  sessions through Clerk, rotate/disconnect agents, revoke/reauthorize provider
  connections, and reach support with references.
- Configure backup codes and a documented support/admin MFA-reset policy.
- On suspected compromise, recovery must address sessions, factors, agents,
  provider connections, and payout authority as separately visible steps; it
  must not claim that one reset revoked everything.

**Proof:** session revocation, factor/recovery configuration, cross-account
event isolation, webhook replay/signature failure, redaction, compromise
checklist, redirect safety, and rate-limit behavior.

## Failure model

| Failure | Required behavior | Proof |
|---|---|---|
| Clerk unavailable during a sensitive action | No dispatch; preserve command draft and explain that identity could not be reverified | Adapter failure test |
| User cancels reverification | No dispatch; keep entered data and focus on the initiating action | Browser journey |
| Reverification succeeds after target changes | Reject stale digest/generation and reload current facts | Digest mismatch test |
| Same proof is reused for another command | Refuse before reservation | Proof uniqueness test |
| Infisical unavailable | Do not expose cached material or claim connection health; preserve opaque reference | Existing and extended secret-plane tests |
| Secret rotation validates but pointer result is unknown | Reconcile pointer; do not create another generation blindly | Existing lifecycle test |
| Provider accepted revoke but callback/readback is lost | Show cleanup/outcome unknown and poll canonical state | Connection recovery test |
| Credential is revoked while an invocation is in flight | New admission fails; admitted execution retains its immutable snapshot and receipt | Authority race test |
| Audit sink fails | Domain safety decision remains authoritative; durable command retains evidence reference for reconciliation | Fault-injection test |
| Clerk webhook is late or duplicated | Owner projection is idempotent and labelled with observed/source time; current session authority comes from Clerk, not the projection | Webhook replay test |
| Rate-limit storage unavailable | Fail closed for sensitive mutations with a correlation reference; do not weaken limits | Admission failure test |
| Provider diagnostic includes a secret-like field | Drop/redact the field and retain only an opaque evidence digest | Leak-regression test |

## Verification gates

### Contract gates

- one exhaustive action-policy table;
- every Package 3 mutation maps to one action class;
- every authority increase maps to a Clerk reverification policy;
- every external dispatch has idempotency, correlation, and authoritative
  readback;
- every owner event has Account isolation and redaction;
- no credential value or session material appears in Convex schema, route
  output, DOM, log, analytics, or test snapshots.

### Focused product journeys

1. Create and name an agent; inspect scope, limits, expiry, and exact last use.
2. Increase its budget; reverify; confirm; observe one audit event and one grant
   generation.
3. Rotate a compromised credential; validate successor; revoke predecessor;
   preserve history.
4. Connect a supported provider through provider-hosted authorization; inspect
   required/granted permissions and health.
5. Rotate the provider credential through Infisical; recover from an ambiguous
   pointer result without exposing material.
6. Fund credit, replace payout authority, publish an Operation, and revoke
   access; each shows the correct actor, target, consequence, proof, and
   recovery treatment.
7. Revoke another Clerk session and inspect the owner security history.
8. Start compromise recovery and see separate truthful status for human
   sessions, agents, provider connections, and payout authority.

### Final engineering gate

- focused authority, agent-access, provider-connection, secret, money,
  publication, Clerk adapter, audit, rate-limit, and redirect suites;
- `npm run test:imports`;
- `npm run test:ui-contract`;
- `npm run typecheck`;
- `npm run lint`;
- production build;
- authenticated browser journeys against Clerk and non-production provider
  sandboxes;
- repository secret scan and diagnostic redaction scan.

## Scope guard for implementation

Pause before implementation if any slice requires:

- a second Principal, Account, grant, secret, or consequence authority;
- raw credential entry into a general-purpose AE form;
- a custom password, factor, session, recovery, payment, or rate-limit system;
- provider support that has no existing execution adapter or current product
  need;
- a generic abstraction without a second concrete Package 3 caller;
- changing a public API, Convex schema, or wire format without an explicit
  migration and user approval.

The implementation may be several atomic commits, but it must leave one system:
vendor-owned commodity security behind narrow ports, AE-owned product authority
at one admission boundary, domain-owned consequence state machines, and one
redacted evidence language across all four Package 3 projections.

## Worktree parallelization strategy

The foundation is sequential. After it lands, bounded domain projections can
run in parallel worktrees, followed by one integration pass.

| Step | Modules touched | Depends on |
|---|---|---|
| Vendor capability proof | dependency/configuration, Clerk adapter, secret runtime | — |
| Consequence admission + evidence envelope | authority/context, server authority boundary, common audit/security schema | Vendor capability proof |
| Agent access completion | agent-access, Agents UI, agent Convex functions | Consequence admission |
| Supplier connection completion | capability-supply/provider-connection, secrets integration, Connections UI | Consequence admission |
| Account security projection | settings/security UI, Clerk webhook adapter, owner security query | Consequence admission |
| Domain consequence adoption | money, publication, agent access, provider connection | Agent + connection completion |
| Compromise and end-to-end integration | Account & security, Agents, Connections, money/publication journeys | All domain lanes |

Parallel lanes:

- Lane A: vendor capability proof → consequence admission (sequential shared
  foundation).
- Lane B: Agent access completion.
- Lane C: Supplier connection completion.
- Lane D: Account security projection.
- Lane E: domain consequence adoption → compromise/E2E integration
  (sequential after B–D).

Execution order: finish Lane A; launch B, C, and D in isolated worktrees; merge
all three; run Lane E. Because the current checkout already contains unrelated
Package 2 work, do not run B–D concurrently in this dirty checkout.

Conflict flags:

- Predeclare shared event-envelope fields and action classes in Lane A. If B–D
  all edit the common audit registry, they will conflict.
- Lane C owns provider connection and secret integration; Lane B must not edit
  those modules while adding agent compromise recovery.
- Lane E deliberately touches every domain and must run after the projection
  lanes merge.

## Implementation Tasks

Synthesized from the audit and engineering review. Each task protects a named
Package 3 requirement.

- [ ] **T1 (P1, human: ~1d / CC: ~2h)** — vendor capability proof — Upgrade and prove Clerk reverification; rehearse the existing Infisical path.
  - Surfaced by: Package 3C/3D — fresh human proof is missing and the installed Clerk React SDK predates the maintained hook.
  - Files: dependency manifest/lock, Clerk auth adapter tests, secret runtime deployment proof.
  - Verify: focused Clerk adapter tests, Infisical non-production rehearsal, typecheck, production build.
- [ ] **T2 (P1, human: ~3d / CC: ~6h)** — authority — Extend the consequence admission with action class, exact target, proof policy, command digest, and recovery class.
  - Surfaced by: Architecture review — route-specific consequence meanings drift despite one existing authority seam.
  - Files: authority/context, server authority boundary, authority tests.
  - Verify: action-matrix, proof freshness/replay/mismatch, mutation-order, and cross-surface tests.
- [ ] **T3 (P1, human: ~2d / CC: ~4h)** — security evidence — Add the typed redacted event envelope and Account-scoped owner projection.
  - Surfaced by: Package 3A/3D — history is split between credentials, money activity, and admin audit.
  - Files: common audit/security schema, domain emitters, owner security query and UI.
  - Verify: Account isolation, event idempotency, pagination/index use, redaction, and provider-observed timestamp tests.
- [ ] **T4 (P1, human: ~3d / CC: ~6h)** — Agent access — Complete naming, resource scope, authentication-use evidence, rotation, compromise response, and history.
  - Surfaced by: Package 3A audit — resource authority is wildcard and last-seen is not credential-use evidence.
  - Files: agent-access policy/projection/Convex lifecycle, Agents UI and tests.
  - Verify: exact-resource enforcement, coarsened last use, planned/compromise rotation, revoke/disconnect, retained history.
- [ ] **T5 (P1, human: ~4d / CC: ~8h)** — supplier connections — Add supported provider setup adapters, permission explanations, independent health, safe rotation, and recovery.
  - Surfaced by: Package 3B audit — only x402 is owner-complete and health is conflated with Operation readiness.
  - Files: provider-connection adapters/projection, secrets integration, Connections UI and tests.
  - Verify: OAuth state/PKCE, partial consent, health freshness, dual/single-phase rotation, ambiguous cleanup, full secret-leak scan.
- [ ] **T6 (P1, human: ~3d / CC: ~6h)** — consequential actions — Adopt the shared policy in funding, payouts, publishing, and authority changes.
  - Surfaced by: Package 3C audit — current confirmations are useful but independently authored and no authority increase reauthenticates.
  - Files: money, publication, agent-access, provider-connection command adapters and UI tests.
  - Verify: exact actor/target/consequence, safe cancelled reauth, stale target, duplicate lock, outcome-unknown readback.
- [ ] **T7 (P1, human: ~2d / CC: ~4h)** — Account security — Complete the Clerk-owned session/recovery surface and AE compromise workflow.
  - Surfaced by: Package 3D audit — `UserProfile` exists but no unified AE security narrative or containment checklist exists.
  - Files: Account & security UI, Clerk webhook/reference adapter, security event projection.
  - Verify: session revoke, recovery caveat, webhook replay/signature failure, redirect safety, limits, cross-account isolation.
- [ ] **T8 (P2, human: ~2d / CC: ~4h)** — integration — Run Package 3 end-to-end compromise and recovery journeys across browser and machine surfaces.
  - Surfaced by: Failure review — one reset must not falsely claim to contain human sessions, agents, connections, and payout authority together.
  - Files: focused integration and browser tests; no production abstraction solely for tests.
  - Verify: all focused suites, imports, UI contract, typecheck, lint, build, deployed sandbox journeys, secret/diagnostic scan.

## GSTACK REVIEW REPORT

| Review | Runs | Status | Findings |
|---|---:|---|---|
| Scope challenge | 1 | ACCEPTED AS SYSTEM | Package 3 is large but divided behind one shared foundation and four bounded projections |
| Architecture | 1 | FOLDED | One shared admission/evidence language; no universal domain state machine |
| Code quality | 1 | FOLDED | Extend existing seams, typed envelopes, remove replaced route policy branches |
| Tests | 1 | PLANNED | 13 new protected paths/flows identified with unit, integration, and browser proof |
| Performance | 1 | FOLDED | Bounded last-use writes, paginated Account queries, async vendor events, no shell-time provider reads |
| Outside voice | 1 | RESEARCH AGENT | Primary-source review reinforced the authority/recovery control-plane boundary and vendor limits |

Completion summary:

- Step 0: Scope Challenge — scope accepted as one system with sequential foundation and bounded projections.
- Architecture Review: 1 issue found and folded into the control-plane design.
- Code Quality Review: 1 issue found and folded into the no-mega-abstraction guardrails.
- Test Review: diagram produced; 13 planned gaps identified.
- Performance Review: 4 risks found and folded into bounded-write/query/vendor-read rules.
- NOT in scope: written.
- What already exists: written.
- TODOS.md updates: 0 items; all valuable work is in the Package 3 slices or explicitly excluded.
- Failure modes: 0 silent untested critical gaps permitted by the plan.
- Outside voice: primary-source research agent completed; no unsupported recommendation absorbed.
- Parallelization: 5 lanes; 3 bounded domain lanes parallel after 1 sequential foundation; 1 sequential integration lane.
- Lake Score: 4/4 complete recommendations selected.

Verdict: **CLEAR TO IMPLEMENT AFTER SLICE 0 CAPABILITY PROOF.**

NO UNRESOLVED DECISIONS
