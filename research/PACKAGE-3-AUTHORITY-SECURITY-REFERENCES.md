# Package 3 authority and recovery reference baseline

**Status:** research baseline for Package 3 planning
**Packages:** 3A Agent access management, 3B Supplier connections, 3C Consequential-action controls, 3D Account security
**Product authority:** [`PRODUCT.md`](../PRODUCT.md)
**Prepared:** 2026-08-31
**Source policy:** primary standards, official project guidance, current vendor documentation, and first-party product examples only

## Decision in one sentence

Build one **authority and recovery control plane** in which human identity,
durable agent identity, replaceable credentials, delegated authority, supplier
connections, consequential commands, recovery, and audit evidence remain linked
but never conflated.

Package 3 is not four settings-page feature lists. It is one system projected
through four user tasks:

```text
human Account ── authenticates with Clerk ──┐
                                            v
durable AE principal ── receives ──> authority grant
       |                         scope · budget · effects · generation
       |
       ├── uses replaceable Agent credential ──> Operation-market calls
       |
       └── manages Supplier connection ──> upstream provider credential
                                            stored in Infisical behind a secret reference

consequential command
  = actor + target + exact consequence + current authority + fresh human proof
  -> durable command/invocation identity -> result/readback/recovery

every transition -> security/audit event without secret material
```

This follows the product charter's existing separation of owner Account,
durable agent principal, credential, grant, payer, supplier, operator,
commitment, and invocation. It does not introduce an ownerless agent, a general
delegation graph, a custom identity provider, an OAuth server, or a custom
secret vault.

## Source authority and dating

The sources below do not all carry the same force.

| Class | Sources | How to use them |
|---|---|---|
| Normative interoperability and security standards | IETF [RFC 7009](https://www.rfc-editor.org/rfc/rfc7009.html) (August 2013), [RFC 8707](https://www.rfc-editor.org/rfc/rfc8707.html) (February 2020), and [RFC 9700 / BCP 240](https://www.rfc-editor.org/rfc/rfc9700.html) (January 2025) | Apply the RFC requirement language to OAuth implementations in its stated scope. RFC 9700 is the current OAuth 2.0 security BCP and updates RFC 6749/6750 security advice. |
| Government normative guidance in its jurisdiction; high-assurance baseline elsewhere | NIST [SP 800-63B-4](https://csrc.nist.gov/pubs/sp/800/63/b/4/final), final July 2025 | Treat `SHALL` as binding for in-scope US federal systems. For AE, use it as a tested high-assurance baseline unless a later threat model deliberately chooses otherwise. |
| Official security-project guidance, not an Internet standard | OWASP Cheat Sheet Series: [Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html), [Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), [Forgot Password](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html), [Transaction Authorization](https://cheatsheetseries.owasp.org/cheatsheets/Transaction_Authorization_Cheat_Sheet.html), [CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html), [Logging](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html), and [Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html), retrieved 2026-08-31 | Use as control-design and abuse-case guidance. Do not present OWASP recommendations as RFC or NIST requirements. |
| Current vendor contracts and product examples | Clerk, Convex, Infisical, Stripe, GitHub, Google, and AWS documentation cited below, retrieved 2026-08-31 | Use to decide what to buy and how a vendor actually behaves. Recheck before implementation because these contracts and plan limits can change. |

Repository applicability snapshot: AE currently declares
`@clerk/tanstack-react-start` `1.4.9`, `convex` `1.45.0`, and
`@convex-dev/rate-limiter` `^0.3.2`. Vendor examples below are not evidence
that an installed version exposes every documented feature; implementation
planning must verify the exact installed SDK surface and deployment plan.
AE does not install an Infisical SDK: its current
[`InfisicalCloudSecretStore`](../src/modules/secrets/infisical-cloud.ts) uses
the documented HTTPS API behind the repository-owned secret-store port, and
[`createProductionSecretRuntime`](../src/modules/secrets/runtime.ts) exchanges
a workload OIDC token for a short-lived Infisical machine-identity token.

## The shared system contract

### 1. Keep identity, credentials, and authority separate

| Record | Owns | Must not own |
|---|---|---|
| **Account** | Human or organization ownership boundary and Clerk identity linkage | Agent secret values, provider secret values, or an invocation's outcome |
| **Agent principal** | Durable technical actor, Account ownership, lifecycle, display name | A particular credential value |
| **Agent credential** | Authentication of one principal, fingerprint/reference, lifecycle, issuance/expiry/last-use observations | The principal's identity, spending ledger, or permanent authority |
| **Authority grant** | Allowed Operation/capability scopes, effect classes, per-call and aggregate exposure, validity, generation | Authentication ceremony or secret value |
| **Supplier connection** | Upstream provider, supplier owner, requested/granted permissions, credential reference, observed health, last test, recovery action | Plaintext secret or a claim that a redirect completed provider readiness |
| **Domain command** | Existing funding, payout, publication, authority-change, commitment, or invocation identity plus exact target and consequences | A reusable generic approval detached from the command |
| **Security event** | Actor, acting principal, target, action, result, reason, correlation, time, authority generation, and safe metadata | Passwords, session IDs, access/refresh tokens, provider payloads, or raw credentials |

OAuth's current BCP says token privileges should be restricted to the minimum
required, including audience, resource, and action restrictions
([RFC 9700 §§2.2–2.3](https://www.rfc-editor.org/rfc/rfc9700.html#section-2.3)).
[RFC 8707](https://www.rfc-editor.org/rfc/rfc8707.html) further shows why a
token intended for one resource or tenant must not be reusable at another.

**AE implication:** authentication answers “which credential presented?”;
the Agent principal answers “which durable actor?”; the current grant answers
“what may it do now?”; and the domain command answers “to which exact target,
for what consequence?” Every consequential server path must check all four.

### 2. Use one lifecycle vocabulary with domain-specific projections

The shared control plane needs common transition semantics, not one universal
status enum rendered everywhere.

```text
credential: active -> rotating -> replaced | revoked | expired | compromised
connection: setup_required -> connected -> degraded -> reauthorization_required
                                      \-> disconnected
session: active -> revoked | expired | abandoned
domain command: proposed -> confirmation_required -> authorized -> dispatched
                                             -> confirmed | refused | outcome_unknown
```

Rules:

1. Rotation creates and proves the successor before retiring the predecessor
   during a bounded planned cutover. A suspected compromise skips overlap and
   revokes immediately.
2. Expiry, revocation, disconnection, and compromise are distinct causes. They
   may share recovery infrastructure but require different user copy and audit
   events.
3. A connection test is a bounded, non-consequential provider read or explicit
   verification endpoint. It cannot publish, fund, pay out, or mutate supply.
4. A successful redirect means only that a hosted flow returned. Authoritative
   provider state determines readiness.
5. A possible dispatch is never converted into a retry invitation. Read current
   state using the existing command, invocation, payment, payout, or provider
   reference.

### 3. Every consequential action uses one authorization envelope

OWASP's [Transaction Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Transaction_Authorization_Cheat_Sheet.html)
requires users to identify significant transaction data, requires unique and
time-limited authorization credentials, invalidates authorization when data
changes, enforces the sequence server-side, and performs a final authorization
gate before execution.

For AE, the envelope is attached to the existing domain command and contains:

- human actor and acting agent/operator principal;
- Account and exact target reference;
- action kind and authority generation;
- significant consequence facts: amount and currency, destination, public
  visibility, new scope/effect/budget, or credential being replaced;
- a digest of the immutable command facts shown for confirmation;
- required human verification level and verification time;
- one-time confirmation identity and expiry; and
- reversal class and exact safe recovery/readback action.

This does **not** replace the existing Operation commitment or invocation
identity. Funding, payout, publication, and authority changes retain their own
domain commands. The common envelope makes their authorization evidence
consistent.

### 4. Recovery is a first-class transition, not an error-message branch

NIST SP 800-63B-4 says suspected lost or compromised authenticators need an
immediate invalidation mechanism ([§3.2.1](https://pages.nist.gov/800-63-4/sp800-63b.html#sec3)),
recognizes saved/issued recovery codes, recovery contacts, and repeated proofing
as recovery classes, and requires notification after account recovery
([§4.2](https://pages.nist.gov/800-63-4/sp800-63b.html#account-recovery)).

**AE implication:** recovery must preserve the Account and durable principal
while replacing credentials, reducing authority when uncertainty exists,
revoking exposed sessions/credentials, recording the cause, notifying the
owner, and showing the exact next read or reconnect action. Recovery must not
silently reactivate an old grant or erase the incident trail.

### 5. Audit history is durable product evidence, not debug logging

OWASP's [Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
calls for authentication, authorization, session, and administrative events,
while explicitly excluding or masking session identifiers, access tokens,
passwords, connection strings, encryption keys, and other primary secrets.
GitHub's current [organization audit-log product](https://docs.github.com/en/organizations/keeping-your-organization-secure/managing-security-settings-for-your-organization/reviewing-the-audit-log-for-your-organization)
is a useful first-party projection: searchable actor, affected user/resource,
action, country, and time, with export.

**AE implication:** write a durable, Account-visible security history for grant,
credential, connection, session, recovery, and consequential-action transitions.
Operational logs may carry the same event reference but are not the system of
record. Convex states that its built-in logs have limited retention and can be
erased during maintenance; historical operational logs require log streaming
([Convex debugging](https://docs.convex.dev/functions/debugging), current
2026-08-31). That makes them unsuitable as the only Package 3 audit history.

## Package 3A — Agent access management

### Reference findings

| Requirement | Primary reference | Concrete AE implication |
|---|---|---|
| Create and name access | Clerk's current [API-key guide](https://clerk.com/docs/guides/development/machine-auth/api-keys), last updated 2026-08-27, requires a name and subject and supports description, scopes, creator, and optional expiration; GitHub's current [fine-grained PAT flow](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) similarly asks for name, resource owner, expiry, repository access, and minimum permissions. These are product examples, not AE domain authority. | Creation is two linked acts: create/choose the durable Agent, then issue a one-time-visible credential for it. Show name, owner Account, environment, scope, limits, expiry, and secret-storage warning before issuance. |
| Show scope and spending limits | [RFC 9700 §2.3](https://www.rfc-editor.org/rfc/rfc9700.html#section-2.3) requires least privilege across audience, resource, and action. | Scope and budget are grant facts, not properties inferred from a key string. Show exact Operation/capability/effect scopes, per-call maximum, aggregate committed exposure, period, and grant generation. |
| Show last used | AWS IAM's current [credential report](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_getting-report.html) reports key status, creation/rotation, and last-use date/service/region; it records at most the first use in a 15-minute span. Clerk's [own platform-key rotation guide](https://clerk.com/docs/guides/secure/rotate-api-keys), updated 2026-08-27, uses per-key last-used evidence during cutover. | Record a safe `lastUsedAt` observation plus surface/environment and outcome class. Label never-used and unknown distinctly. Last-used is coarsened evidence, not proof that a credential is safe or unused everywhere. Never store request bodies or secrets to make this feature work. |
| Rotate safely | Stripe's current [API-key guide](https://docs.stripe.com/keys), retrieved 2026-08-31, demonstrates successor-first rotation, bounded overlap (up to seven days in Stripe), canary rollout, request-log observation, and then expiry. AWS IAM permits two simultaneous keys specifically to support cutover. | Planned rotation: mint successor once, preserve principal and grant, increment credential generation, allow bounded overlap, observe successor use, then revoke predecessor. Compromise: immediate predecessor revocation, owner notification, and review of events—no grace period. Stripe's seven days is an example, not AE's required duration. |
| Revoke and expire | [RFC 7009](https://www.rfc-editor.org/rfc/rfc7009.html) defines OAuth token revocation over TLS. Clerk's API-key product makes revocation immediately invalid and retains the revoked metadata/reason; GitHub documents automatic revocation at expiry and security-log events for expiration/revocation in [Token expiration and revocation](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/token-expiration-and-revocation). | Revocation must immediately fail new admission but retain credential metadata and audit history. Expiration is scheduled invalidity; compromise is an incident cause; replacement links predecessor and successor. None deletes the Agent principal. |
| Preserve audit history | OWASP logging and GitHub audit-log references above. | Record issuer, human actor, Agent, old/new grant generation, predecessor/successor refs, reason, timestamps, correlation, and result. Store only a non-secret credential identifier/fingerprint. |

### Buy-versus-own boundary

Clerk's API-key feature is a credible candidate for opaque secret issuance,
verification, expiration, and revocation. Its current guide documents subjects
as Clerk users or Organizations. It does **not** document an AE Agent as a
first-class subject, domain spending limits, Operation commitments, or
last-used data for user-issued keys.

Therefore:

- do not make a Clerk API key the Agent principal or authority grant;
- do not duplicate Clerk's human authentication/session machinery;
- evaluate Clerk API Keys or another maintained credential verifier behind the
  existing AE credential port;
- keep AE's principal, grant, budget, authority generation, and audit linkage
  authoritative; and
- require a migration decision and live capability probe before replacing the
  current credential verifier. Documentation alone does not prove subject-model
  fit or installed-SDK support.

## Package 3B — Supplier connections

### Reference findings

| Requirement | Primary reference | Concrete AE implication |
|---|---|---|
| Explain required permissions | [RFC 9700 §2.3](https://www.rfc-editor.org/rfc/rfc9700.html#section-2.3) and Google's current [OAuth best practices](https://developers.google.com/identity/protocols/oauth2/resources/best-practices), retrieved 2026-08-31, require least privilege and recommend incremental, in-context authorization; functionality must be disabled when a required scope is denied. | Before connect, list exact provider permissions grouped by read/write/consequential effect, why each is needed, which Operations depend on it, and what remains unavailable if denied. Never collapse provider scope into “full access.” |
| Secure the OAuth flow | [RFC 9700 §§2.1 and 4.7](https://www.rfc-editor.org/rfc/rfc9700.html#section-2.1) requires exact redirect matching, no open redirectors, CSRF protection through supported PKCE or a one-time session-bound `state`, and mix-up defense when multiple issuers are supported. | Each provider adapter owns an allowlisted issuer/endpoints, exact callback, one-time state/PKCE binding, supplier/Account binding, and requested-scope digest. Reject callback drift before storing tokens or claiming connection. |
| Store tokens and secrets | Google's OAuth guidance requires secure at-rest token storage and deletion after revocation. OWASP's [Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html) calls for centralized provisioning, auditing, rotation, revocation, and secret-safe logging. Infisical's current [Secrets Management overview](https://infisical.com/docs/documentation/platform/secrets-mgmt/overview), retrieved 2026-08-31, documents versioned storage by project/environment/path, machine access control, delivery APIs, rotation, and audit workflows. AWS [Secrets Manager](https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html), current 2026-08-31, remains a comparison example rather than a second selected vault. | Retain the existing Infisical-backed secret-store port. AE stores only the secret reference, provider, active generation, safe fingerprint, timestamps, scope metadata, and connection lifecycle. Provider calls lease secret material only at dispatch; no projection returns it. |
| Connect and test | Google requires apps to handle partial consent and invalid/expired refresh tokens. Stripe's [Connect hosted onboarding](https://docs.stripe.com/connect/hosted-onboarding), current 2026-08-31, says returning to `return_url` only proves that the user exited the flow; readiness must be read from current account requirements, and expired/single-use links must be regenerated through `refresh_url`. | `Connect` and `Test` are separate transitions. After callback, read provider identity, granted scopes, expiry, and the minimum non-mutating capability needed by the Operation. Store observed health and evidence time. A redirect or saved secret alone is never `healthy`. |
| Show health and recover | Google's guidance says refresh tokens may be revoked or expire at any time and apps must handle it. GitHub's current [refresh-token flow](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens) rotates the token pair and forces the authorization flow again after refresh-token expiry. [RFC 9700 §4.14](https://www.rfc-editor.org/rfc/rfc9700.html#section-4.14) requires public-client refresh-token replay detection via sender constraint or rotation. | Health must say what AE last observed: `healthy`, `degraded`, `reauthorization_required`, `disconnected`, or `unknown`, with evidence time and cause. OAuth refresh occurs server-side; invalid grant transitions to reauthorization rather than retry loops. Preserve the supplier and Operation identities. |
| Rotate safely | Infisical's current [Secret Rotation overview](https://infisical.com/docs/documentation/platform/secret-rotation/overview), retrieved 2026-08-31, distinguishes dual-phase overlap from single-phase replacement and explicitly warns that single-phase rotation may interrupt service. Stripe's API-key guide and AWS Secrets Manager's [rotation lifecycle](https://docs.aws.amazon.com/secretsmanager/latest/userguide/rotating-secrets.html) are additional product examples. | Preserve AE's existing generation workflow: create/receive successor, store it as a non-active generation, validate it non-consequentially, atomically advance the AE pointer, reconcile ambiguous advancement, then retire the predecessor. Provider credential issuance/revocation remains provider-specific. Infisical's automatic rotation model is not a substitute for AE's connection state or command reconciliation. |
| Keep diagnostics secret-safe | OWASP Logging says access tokens, passwords, connection strings, encryption keys, and primary secrets should not be logged directly. Stripe's current [key-management guidance](https://docs.stripe.com/keys-best-practices) likewise keeps keys in a vault, not source, chat, or support messages. | Diagnostic contracts allow provider, connection ref, safe error class, HTTP status class, scope names, evidence time, and correlation ID. They reject request authorization headers, tokens, secret values, provider payload dumps, and user-supplied URLs containing credentials. Test redaction at UI, API, logs, events, and support export boundaries. |

### Infisical is the secret store, not the authority system

Convex's current [environment-variable documentation](https://docs.convex.dev/production/environment-variables)
says variables can hold API keys, but they are deployment-wide, visible and
modifiable in the dashboard/CLI, listable with values, and accessible from
queries, mutations, actions, and HTTP actions. They are appropriate for AE's
own deployment configuration, not per-supplier credential custody. Convex's
current [CLI guidance](https://docs.convex.dev/cli/reference/env) also warns
about keeping values out of shell history.

**Decision:** do not build Package 3B by creating supplier-specific Convex
environment variables or returning encrypted secret blobs through domain
records. Retain the existing
[`src/modules/secrets`](../src/modules/secrets/public.ts) boundary and
`InfisicalCloudSecretStore`. The current runtime already separates `platform`
and `customer` vault scopes, leases material ephemerally, validates a successor
generation before activation, advances the active pointer with compare-and-swap,
and reconciles ambiguous rotation outcomes. Package 3 should prove and complete
that path rather than select or build another vault.

Infisical's current [Machine Identities](https://infisical.com/docs/documentation/platform/identities/machine-identities)
and [OIDC Auth](https://infisical.com/docs/documentation/platform/identities/oidc-auth/general)
documentation, retrieved 2026-08-31, describes an infrastructure workload
identity that exchanges an issuer-bound JWT for a short-lived Infisical access
token. That is the correct role for AE's backend workload when it accesses the
vault. It is **not** an AE Agent principal, Account membership, or authority
grant. Infisical projects, environments, paths, roles, and identities govern
access to secret infrastructure; they must not become the source of truth for
Operation scope, spending limits, effect classes, supplier ownership, or
consequential-action approval.

The ownership boundary is therefore explicit:

| Infisical owns | AE owns |
|---|---|
| Secret-value custody and versioned storage | Account, durable Agent principal, and supplier connection identity |
| Machine authentication and short-lived vault access tokens | Operation/effect scope, budget, grant generation, and grant lifecycle |
| Vault project/environment/path authorization | Provider-requested/granted permissions and connection health |
| Secret access/change audit events | Human confirmation, domain commands, outcomes, recovery, and Account-visible audit history |

Infisical's current [audit-log model](https://infisical.com/docs/documentation/getting-started/concepts/audit-logs),
retrieved 2026-08-31, provides useful custody evidence for secret reads and
changes. AE should correlate those events by safe secret/operation reference,
not copy secret material or claim that a vault event proves provider readiness
or market authority.

## Package 3C — Consequential-action controls

### Reference findings

| Requirement | Primary reference | Concrete AE implication |
|---|---|---|
| Identify actor and target | OWASP Transaction Authorization requires the user to identify significant transaction data and server-side enforcement. GitHub audit events are a product example that distinguishes actor, affected user/resource, action, and time. | Every confirmation names the signed-in human, acting Agent/operator where relevant, Account, exact destination/Operation/grant, and immutable reference. Server execution re-resolves them rather than trusting display fields. |
| Show scope and consequence | OWASP's “what you see is what you sign” guidance requires the authorization ceremony to include significant transaction facts. | Funding shows total/fees/source; payout shows amount/currency/destination/timing; publication shows exact Operation revision and public/effect/data-use change; authority change shows old/new scopes, effects, budgets, expiry, and affected Agent. Any material change invalidates confirmation. |
| Require appropriate human confirmation | OWASP requires transaction authorization distinct from login, unique per operation, time-limited, sequential, and checked immediately before execution. | Use explicit confirmation for funding, payouts, publication, credential replacement/revocation, and authority increase. Bind confirmation once to the command digest; do not treat a generic dialog click or an earlier session login as approval. |
| Reauthenticate when authority increases | NIST SP 800-63B-4 [§5.2](https://pages.nist.gov/800-63-4/sp800-63b.html#reauthentication) requires periodic reauthentication to confirm continued presence. Clerk's TanStack [reverification hook](https://clerk.com/docs/tanstack-react-start/reference/hooks/use-reverification), current 2026-08-31, can prompt and retry a protected request; Clerk's [server-side guide](https://clerk.com/docs/guides/secure/reverification), updated 2026-08-28, requires the server to evaluate recent verification and documents action-correlated reverification for one sensitive action. | Clerk owns the identity ceremony. AE defines which actions need which freshness/strength and binds successful reverification to the exact command. Check freshness again server-side at dispatch. Do not infer proof from a client modal. |
| Explain reversal and recovery | Stripe's current APIs make reversal state-dependent: a payout is cancellable only while `pending`; [payout reversal](https://docs.stripe.com/connect/payout-reversals) has country, age, and payout-type limits and may later fail; [PaymentIntent cancellation](https://docs.stripe.com/api/payment_intents/cancel) is limited to listed pre-terminal states. | Classify before confirmation as `reversible_before_dispatch`, `reversible_while_pending`, `compensatable`, or `irreversible`. Show the real deadline, eligibility, fees/liability, and readback/support path. Never promise undo merely because a provider exposes some reversal endpoint. |
| Prevent duplicate effects | Stripe's [idempotent-request contract](https://docs.stripe.com/api/idempotent_requests), current 2026-08-31, is a mature product example: repeat POST requests with the same key return the first result and reject mismatched parameters. | Keep AE's existing durable command/invocation identities and synchronous UI locks. Confirmation consumes one command identity. Timeouts move to status/reconciliation, not a new command. |

### Reauthentication is not authorization

This is the most important Package 3C boundary.

- Clerk reverification can establish that the human recently proved control of
  an authenticator.
- It does not know the payout destination, Operation revision, grant delta,
  budget increase, reversal policy, or whether the command changed after the
  prompt.
- AE must bind the human proof to its server-owned command digest and execute
  only if the target, consequence, authority generation, and expiry still
  match.

Clerk's current reverification guidance also warns that a requested
second-factor or multi-factor level can gracefully downgrade when the user has
no eligible second factor. The Package 3 threat model must decide whether such
downgrade is acceptable for each action. “Requested MFA” must not be recorded
as “MFA completed” without checking the actual verification evidence.

## Package 3D — Account security

### Reference findings

| Requirement | Primary reference | Concrete AE implication |
|---|---|---|
| Session and device management | Clerk's current [session list](https://clerk.com/docs/reference/backend/sessions/get-session-list) and [revoke-session](https://clerk.com/docs/reference/backend/sessions/revoke-session) APIs list per-user sessions/status and revoke a session. Clerk's [session options](https://clerk.com/docs/guides/secure/session-options) support inactivity and maximum lifetimes. GitHub's current [session-management UI](https://docs.github.com/en/enterprise-cloud@latest/authentication/keeping-your-account-and-data-secure/viewing-and-managing-your-sessions) is a first-party example of viewing and revoking active sessions. | Project Clerk's authoritative sessions into Account & security with current-session marker, safe device/browser/location/last-active facts when actually available, and revoke. Do not fabricate a device inventory from user-agent strings or store a parallel AE session. |
| Compromise detection and response | Clerk's [unauthorized sign-in guidance](https://clerk.com/docs/guides/secure/best-practices/unauthorized-sign-in), updated 2026-08-27, documents new-device notifications and immediate session revocation on supported plans. NIST requires immediate invalidation after suspected authenticator compromise. | “This wasn't me” revokes the target session, offers revoke-others/credential review, records the event, and guides recovery. Validate plan support; do not promise Clerk's notification/revoke-from-email feature if the production plan lacks it. |
| Account recovery | NIST SP 800-63B-4 §4.2 defines recovery methods and notification. OWASP [Forgot Password](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html) requires non-enumerating responses, uniform timing, side-channel delivery, random single-use expiring tokens, and per-account abuse controls. Clerk's [MFA recovery](https://clerk.com/docs/guides/secure/mfa-recovery), updated 2026-08-27, provides backup codes and backend reset operations but deliberately leaves verification policy to the application. | Prefer Clerk's managed recovery and backup-code paths. If AE grants a support-assisted MFA reset, define evidence and approval policy explicitly, notify the owner, revoke sessions/credentials as incident risk requires, and never expose account existence. |
| Sensitive-action reauthentication | NIST reauthentication and Clerk reverification references above. | One server-side policy maps each AE action to freshness and factor requirements. The Account UI explains why reverification is required and resumes the same command only after success. |
| Redirect protection | [RFC 9700 §2.1](https://www.rfc-editor.org/rfc/rfc9700.html#section-2.1) requires exact registered redirect matching and prohibits open redirectors. OWASP [Unvalidated Redirects](https://cheatsheetseries.owasp.org/cheatsheets/Unvalidated_Redirects_and_Forwards_Cheat_Sheet.html) prefers server-side identifiers or allowlists. Clerk's current [production guide](https://clerk.com/docs/guides/development/deployment/production) recommends explicit `authorizedParties` and allowlisted redirect URLs. | Preserve AE's same-origin/path sanitizer for post-auth return context; configure Clerk's authorized parties; allowlist provider callbacks; never accept arbitrary scheme/host, protocol-relative URLs, credential-bearing URLs, or authorization codes in a reusable return target. |
| Request protection | OWASP [CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html) treats SameSite as defense in depth, requires origin verification or CSRF tokens as appropriate, and documents Fetch Metadata with an Origin/Referer fallback. RFC 9700 requires state/PKCE protections for OAuth callbacks. | All cookie-authenticated state changes use unsafe HTTP methods, server authorization, origin/CSRF protection appropriate to the framework, bounded bodies, and duplicate locks. OAuth callbacks additionally verify state/PKCE/issuer. Do not apply browser-CSRF assumptions to bearer-authenticated agent APIs without a threat-model reason. |
| Rate limiting | NIST SP 800-63B-4 [§3.2.2](https://pages.nist.gov/800-63-4/sp800-63b.html#rate-limiting-throttling) requires throttling for applicable authenticators and treats 100 consecutive failures as an upper bound, not a target. OWASP recovery guidance adds per-account throttling. Convex's first-party [application-layer rate-limit guidance](https://stack.convex.dev/rate-limiting), current 2026-08-31, recommends its maintained component rather than a race-prone custom counter. | Reuse the installed `@convex-dev/rate-limiter`: separate keys for account, credential/principal, source network where justified, and action; return bounded retry timing; make successful recovery possible; and audit threshold/lockout events. Exact limits come from threat and usability tests, not the NIST maximum. |
| Security event history | OWASP Logging, GitHub security/audit logs, and Convex log-retention references above. | One Account-visible history includes sign-in/recovery events sourced from Clerk when available and AE-owned grant, credential, connection, and consequential events. Preserve provenance (`clerk_observed`, `provider_observed`, `ae_recorded`) and do not imply AE observed facts it only received later. |

### Clerk recovery caveat

Clerk's current MFA recovery guide explicitly states that disabling MFA does
not revoke active sessions or change the password. It recommends separately
signing out other sessions when compromise is suspected. Package 3 must make
that a coherent incident flow; an MFA reset alone is not account containment.

## System-wide acceptance invariants

These are reference-derived behaviors to carry into the implementation plan.

1. **No credential is an identity.** Rotating a key preserves the Agent or
   supplier connection identity and links predecessor to successor.
2. **No authentication is standing consent.** Every consequential command is
   bound to exact target and consequence facts, a current authority generation,
   and any required fresh human proof.
3. **No callback is readiness.** Provider and payment state are read after a
   return, refresh, timeout, or ambiguous response.
4. **No possible dispatch is blindly retried.** Status/reconciliation leads;
   a new command is offered only when no dispatch is proven.
5. **No secret reaches a projection.** UI, API, MCP, CLI, logs, analytics,
   audit history, support exports, and exception text expose references and safe
   metadata only.
6. **No planned rotation revokes first.** Successor creation, bounded proof,
   cutover, and predecessor retirement are explicit. Suspected compromise is
   the deliberate exception and revokes immediately.
7. **No recovery silently restores authority.** Recovery preserves identity,
   invalidates exposed material, notifies the owner, and re-evaluates grants.
8. **No audit event loses attribution.** Human actor, acting principal,
   Account, target, authority generation, result, reason, time, and correlation
   are present when applicable.
9. **No vendor owns AE's market semantics.** Clerk authenticates humans;
   Infisical protects secrets; providers expose rails. AE remains authoritative
   for Agent ownership, Operation authority, budgets, effects, commitments,
   invocations, consequences, and recovery state.
10. **No hand-rolled commodity subsystem.** Use Clerk for human identity and
    session ceremonies, the maintained Convex rate limiter for application
    throttling, Stripe/Connect for payment and payout rails, and the existing
    Infisical-backed port for provider-secret custody. Do not import any of
    those vendors' resource models as AE domain authority.

## Contradictions, limits, and decisions still required

| Tension or limit | What the references actually say | Planning consequence |
|---|---|---|
| Clerk API keys versus AE Agent identity | Clerk's documented API-key subject is a user or Organization; its scopes are arbitrary strings. The docs do not establish AE Agent ownership, spending exposure, Operation commitments, or user-key last-use reporting. | Treat Clerk API Keys as a credential-mechanics candidate, not as Package 3A's domain model. Spike subject binding, verification latency/outage behavior, audit fields, plan cost, and rotation before adoption. |
| Clerk reverification strength | Clerk documents recent-verification checks and action correlation, but also documents graceful downgrade when an eligible stronger factor is unavailable. Some lower-level reverification configuration types are marked public beta in current SDK reference. | Choose an explicit fail/downgrade policy per consequential action and verify it against `@clerk/tanstack-react-start` 1.4.9 before promising MFA-grade confirmation. |
| Recovery can increase attacker control | NIST treats recovery as a distinct, higher-risk lifecycle event; Clerk leaves custom MFA-reset verification to the application, and reset alone leaves sessions active. | Prefer managed recovery. Any AE support reset requires a threat model, documented evidence, notification, rate limit, session containment, and audit review. |
| Convex environment variables versus Infisical | Convex environment variables are deployment-wide and retrievable by dashboard/CLI and backend code. Infisical is already implemented as AE's per-secret custody mechanism. | Keep only Infisical bootstrap configuration in deployment configuration; keep per-supplier values in Infisical and opaque references/generations in Convex. Live-prove access, rotation, audit, outage, and deletion behavior. |
| Infisical IAM versus AE authority | Infisical machine identities and project roles authorize a workload to access Infisical resources. They do not express an AE Agent's Account owner, Operation scope, effect class, budget, supplier ownership, or current domain command. | Retain the Infisical identity narrowly as the backend's vault credential. Never project it as an Agent principal or use Infisical roles/projects/environments as the Package 3 grant model. |
| Infisical rotation versus supplier rotation | Infisical documents managed dual-phase and single-phase rotation for supported integrations. AE's current secret plane instead stores immutable named generations, validates the pending value, advances its own active pointer, and reconciles ambiguous results. Neither mechanism by itself proves that an arbitrary supplier has issued or revoked the upstream credential. | Keep AE's generation/pointer contract authoritative for consumption. Use provider-specific issuance/revocation choreography and only use an Infisical managed rotator when its exact provider semantics align with that contract. Do not run two independent schedulers over the same credential. |
| Provider rotation is not uniform | OAuth refresh rotation, static API-key overlap, and provider-managed reauthorization are different protocols. RFC 9700's refresh-token rules do not automatically apply to static API keys. | One connection lifecycle, provider-specific adapters. Do not invent one universal token-rotation algorithm. |
| Last-used precision | AWS documents 15-minute coarsening; vendors differ and some expose no last-use field. | Show evidence source/time and `unknown` honestly. Do not use last-used alone to prove safe revocation or absence of compromise. |
| Audit history versus observability | GitHub projects durable searchable audit events; Convex warns its built-in logs have limited retention. | AE security history must be durable domain evidence. Stream operational logs separately and join by safe event/correlation reference. |
| Return URL versus completed setup | Stripe states that returning from Connect onboarding does not prove all requirements are satisfied. | Always re-read authoritative connection/payout readiness. Never mark `connected` or `ready` from navigation alone. |
| Reversibility varies by rail and state | Stripe permits payout cancellation or reversal only under specific status, geography, age, and method conditions, and a reversal itself can fail. | Consequence copy and recovery actions must be generated from current domain/provider state, never a generic “Undo available” promise. |
| NIST and OWASP authority | NIST `SHALL` is jurisdictional; OWASP cheat sheets are guidance rather than standards. | Record which controls AE adopts as product policy. Do not mislabel every recommendation a compliance requirement. |
| Device and location evidence has privacy cost | NIST permits session monitoring but requires privacy-risk consideration; Clerk/GitHub surface device, IP, or location facts where available. | Minimize retention and precision, distinguish provider-observed from AE-observed facts, and avoid creating fingerprinting data solely for visual polish. |

## Implementation-reference checklist

Before Package 3 planning is called implementation-ready, verify these unstable
vendor facts against the live account and installed versions:

- Clerk production plan support for unauthorized-sign-in notification and
  revoke-from-notification;
- TanStack SDK server-side reverification, actual factor evidence, cancellation,
  action correlation, and downgrade behavior;
- Clerk API Keys subject model, user-key last-use fields, webhook/audit coverage,
  outage behavior, pricing, and secret migration support;
- the live Infisical deployment's region, project/environment/path separation,
  least-privilege Machine Identity role, OIDC issuer/subject/audience/claim
  bindings, access-token TTL, audit export, outage behavior, and deletion
  recovery;
- the existing platform/customer scope isolation and generation lifecycle:
  successor write, non-consequential validation, atomic pointer advancement,
  ambiguous-result reconciliation, predecessor retirement, and the rule that
  only one rotation controller owns a given supplier credential;
- each upstream provider's exact OAuth scopes, incremental consent, refresh
  rotation, revocation, identity endpoint, safe health probe, and reconnect path;
- Stripe API version and Connect account model used by AE before relying on a
  cancellation, reversal, onboarding, or requirements field; and
- `@convex-dev/rate-limiter` `^0.3.2` behavior under concurrent failure,
  rollback, retry-after projection, and deployment outage.

Those are capability probes and architecture decisions, not reasons to build
replacement identity, OAuth, vault, payout, or throttling machinery inside AE.
