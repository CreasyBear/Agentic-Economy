# Needs validation

Prioritized leads, no severity assigned. None is a confirmed vulnerability. Owner checks are read-only observations of configuration; send no audit traffic to a deployment.

## authenticated-platform-proof exposes staging environment secrets to any dispatched ref

Fingerprint: `ci-authenticated-proof-staging-secrets-any-ref`

The job gates only on workflow_dispatch, binds environment staging and passes Clerk and Vercel bypass secrets to code from the dispatched ref; chat-staging-proof requires refs/heads/main.

**Claimed root cause:** Missing ref restriction on an environment-scoped secret job.

**Trace**
  1. `.github/workflows/kernel-release-gate.yml:370` (sink) authenticated-platform-proof exposes staging environment secrets to any dispatched ref

**Evidence**
  - `.github/workflows/kernel-release-gate.yml:370` The job gates only on workflow_dispatch, binds environment staging and passes Clerk and Vercel bypass secrets to code from the dispatched ref; chat-staging-proof requires refs/heads/main.

**Blockers**
- Staging deployment-branch rules, reviewers and secret scope are not visible in source.

**Local plan:** n/a

**Owner-observed deployment check:** Settings > Environments > staging, check deployment branch rule and whether the three secrets are environment or repository scoped.

## No concurrency cap on open anonymous LLM streams

Fingerprint: `convex-anonymous-stream-concurrency`

Admission is request-count only; a burst within budget can hold many concurrent streams of up to about 87 seconds.

**Claimed root cause:** No semaphore.

**Trace**
  1. `convex/lib/chat/anonymous/stream.ts:14` (sink) No concurrency cap on open anonymous LLM streams

**Evidence**
  - `convex/lib/chat/anonymous/stream.ts:14` Admission is request-count only; a burst within budget can hold many concurrent streams of up to about 87 seconds.

**Blockers**
- Convex httpAction and OpenRouter concurrency limits.

**Local plan:** n/a

**Owner-observed deployment check:** check platform limits and observed concurrent streams.

## Thread title search leaks existence of sibling-principal thread titles within an account

Fingerprint: `convex-chat-thread-search-existence-oracle`

The search index is filtered by ownerId only and principal filtering happens after pagination, so empty pages reveal matches by other principals of the same account.

**Claimed root cause:** Post-pagination filter.

**Trace**
  1. `convex/lib/chat/threads/listing.ts:123` (sink) Thread title search leaks existence of sibling-principal thread titles within an account

**Evidence**
  - `convex/lib/chat/threads/listing.ts:123` The search index is filtered by ownerId only and principal filtering happens after pagination, so empty pages reveal matches by other principals of the same account.

**Blockers**
- Runtime pagination behaviour and whether siblings exist.

**Local plan:** convex-test with two principals under one account.

**Owner-observed deployment check:** n/a

## Agent-delegated publish, republish and withdraw never enforce the declared strict proofPolicy

Fingerprint: `convex-delegated-publish-skips-proof-policy`

admitAgentPublicationConsequence only null-checks the admission; owner paths enforce strict proof.

**Claimed root cause:** proofPolicy unread on the agent path.

**Trace**
  1. `convex/lib/capabilitySupply/publish/prepared.ts:309` (sink) Agent-delegated publish, republish and withdraw never enforce the declared strict proofPolicy

**Evidence**
  - `convex/lib/capabilitySupply/publish/prepared.ts:309` admitAgentPublicationConsequence only null-checks the admission; owner paths enforce strict proof.

**Blockers**
- Whether delegated publish is meant to rely on grant-time reverification.

**Local plan:** n/a

**Owner-observed deployment check:** confirm intent; check consent consequence action.

## devSeed production gate trusts only AE_DEPLOYMENT_ENVIRONMENT

Fingerprint: `convex-devseed-gate-only-checks-deployment-environment`

requireDevelopmentDeployment does not cross-check AE_FORMANCE_ENVIRONMENT like the money gate. Internal mutations only; a misdeclared deployment would accept fixed-id dev rows.

**Claimed root cause:** Weaker gate than the money environment check.

**Trace**
  1. `convex/devSeed.ts:58` (sink) devSeed production gate trusts only AE_DEPLOYMENT_ENVIRONMENT

**Evidence**
  - `convex/devSeed.ts:58` requireDevelopmentDeployment does not cross-check AE_FORMANCE_ENVIRONMENT like the money gate. Internal mutations only; a misdeclared deployment would accept fixed-id dev rows.

**Blockers**
- Live values of both variables on the production Convex deployment.

**Local plan:** unit test with development plus production formance.

**Owner-observed deployment check:** npx convex env list (names and values on the owner's own console).

## Personal export includes unfiltered audit history of every membership account

Fingerprint: `convex-export-includes-all-membership-audit-events`

Export takes 50 audit rows per membership account with no event-type allowlist or activation bound; the owner-history query also has no ownership gate.

**Claimed root cause:** No allowlist in export.

**Trace**
  1. `convex/lib/principalAccount/personalAccount/exportData.ts:117` (sink) Personal export includes unfiltered audit history of every membership account

**Evidence**
  - `convex/lib/principalAccount/personalAccount/exportData.ts:117` Export takes 50 audit rows per membership account with no event-type allowlist or activation bound; the owner-history query also has no ownership gate.

**Blockers**
- Intended visibility of audit rows for members.

**Local plan:** n/a

**Owner-observed deployment check:** product decision, then filter through the owner-history allowlist.

## Owner fulfillReturn can regress a reversed funding command to succeeded

Fingerprint: `convex-fulfill-return-regresses-reversed-funding`

Only succeeded short-circuits; a reversed command falls through, the Formance reference replays, and finalize patches state to succeeded leaving reversal fields. Fires only if Stripe still reports complete and paid after a refund and the command was webhook-settled.

**Claimed root cause:** No reversed guard.

**Trace**
  1. `convex/lib/money/funding/returnFulfillment.ts:26` (sink) Owner fulfillReturn can regress a reversed funding command to succeeded

**Evidence**
  - `convex/lib/money/funding/returnFulfillment.ts:26` Only succeeded short-circuits; a reversed command falls through, the Formance reference replays, and finalize patches state to succeeded leaving reversal fields. Fires only if Stripe still reports complete and paid after

**Blockers**
- Stripe session status after a full refund.

**Local plan:** unit test reversed command through fulfillReturn.

**Owner-observed deployment check:** Stripe sandbox refund and session read.

## Hourly market presence refresh starts a new self-rescheduling chain with no lock

Fingerprint: `convex-market-presence-overlapping-chains`

Each hourly cron starts a chain that pages 20 rows and reschedules itself; overlap happens only if a pass exceeds an hour. Not attacker reachable.

**Claimed root cause:** No in-flight marker.

**Trace**
  1. `convex/marketPresence.ts:82` (sink) Hourly market presence refresh starts a new self-rescheduling chain with no lock

**Evidence**
  - `convex/marketPresence.ts:82` Each hourly cron starts a chain that pages 20 rows and reschedules itself; overlap happens only if a pass exceeds an hour. Not attacker reachable.

**Blockers**
- Production row count and per-page duration.

**Local plan:** n/a

**Owner-observed deployment check:** Convex insights for marketPresence:refresh duration versus table size.

## Money sweeps and owner report path do not enforce the claim lease

Fingerprint: `convex-money-sweep-claim-not-a-lease`

claimHandler returns work for any pending row without checking nextWorkAt, so the cron sweep and reportOwner can submit the same refund concurrently; promotionalCredit has the same shape. Finish is idempotent and refund references are deterministic.

**Claimed root cause:** Claim does not check or advance a lease.

**Trace**
  1. `convex/lib/capabilityExecution/paidCallReports/lifecycle.ts:20` (sink) Money sweeps and owner report path do not enforce the claim lease

**Evidence**
  - `convex/lib/capabilityExecution/paidCallReports/lifecycle.ts:20` claimHandler returns work for any pending row without checking nextWorkAt, so the cron sweep and reportOwner can submit the same refund concurrently; promotionalCredit has the same shape. Finish is idempotent and refund 

**Blockers**
- Formance behaviour for concurrent identical command references is outside the repo.

**Local plan:** convex-test with two concurrent claims.

**Owner-observed deployment check:** confirm Formance rejects or replays a duplicate reference.

## Replayable read admissions gate public queries returning claim tokens

Fingerprint: `convex-oauth-grant-read-admission-returns-secrets`

getGrantByHash and getGrantByRef return the full grant including deliveryClaimToken and issuanceKey under a replayable read admission.

**Claimed root cause:** Verify-only admission plus unfiltered projection.

**Trace**
  1. `convex/agentAccessOAuth.ts:82` (sink) Replayable read admissions gate public queries returning claim tokens

**Evidence**
  - `convex/agentAccessOAuth.ts:82` getGrantByHash and getGrantByRef return the full grant including deliveryClaimToken and issuanceKey under a replayable read admission.

**Blockers**
- Whether admission arguments can leak via logs.

**Local plan:** n/a

**Owner-observed deployment check:** check Convex function-arg logging and Sentry breadcrumbs; strip secrets from the query return.

## Account owner can self-resolve a financial-scope reconciliation hold

Fingerprint: `convex-owner-self-resolves-financial-hold`

resolveOwnerCase needs only owner identity, confirmation equal to caseRef and free text; the processor_difference admission is minted from the owner session. A partial Stripe refund opens an account-scope hold with no reversal booked; resolution unlocks spend.

**Claimed root cause:** No independent verification of hold release.

**Trace**
  1. `convex/moneyReconciliationCases.ts:75` (sink) Account owner can self-resolve a financial-scope reconciliation hold

**Evidence**
  - `convex/moneyReconciliationCases.ts:75` resolveOwnerCase needs only owner identity, confirmation equal to caseRef and free text; the processor_difference admission is minted from the owner session. A partial Stripe refund opens an account-scope hold with no re

**Blockers**
- Whether any operator or ledger step reverses credit after a partial refund.

**Local plan:** sandbox fixture with partial refund, resolveOwnerCase, then paid-call admission.

**Owner-observed deployment check:** n/a

## Quote resolve admits a buyer-chosen resource and publishes it under the system workload identity

Fingerprint: `convex-quote-resolve-publishes-under-system-identity`

An unknown URL ref triggers liveResource and facilitator discovery reconcile under the workload principal, creating a system-owned published business and observed_external tool without provider consent.

**Claimed root cause:** Buyer-selected URL reaches a system-authority write.

**Trace**
  1. `convex/x402Directory.ts:126` (sink) Quote resolve admits a buyer-chosen resource and publishes it under the system workload identity

**Evidence**
  - `convex/x402Directory.ts:126` An unknown URL ref triggers liveResource and facilitator discovery reconcile under the workload principal, creating a system-owned published business and observed_external tool without provider consent.

**Blockers**
- Whether this is intended observed_external policy and whether the endpoint inspector admission gates reject arbitrary hosts.

**Local plan:** test resolve with an arbitrary host against the discovery admission.

**Owner-observed deployment check:** confirm product policy.

## Resend webhook route reads and forwards the body before any gate

Fingerprint: `convex-resend-webhook-body-before-verify`

request.text() and a Node action run before Svix verification, with no rate limit.

**Claimed root cause:** No size cap before action.

**Trace**
  1. `convex/http.ts:43` (sink) Resend webhook route reads and forwards the body before any gate

**Evidence**
  - `convex/http.ts:43` request.text() and a Node action run before Svix verification, with no rate limit.

**Blockers**
- Convex body and argument limits.

**Local plan:** n/a

**Owner-observed deployment check:** check platform limits.

## Scheduled chat authorization skips the session-ended check

Fingerprint: `convex-scheduled-chat-skips-session-ended-check`

Identity-free resolution skips requireCurrentInteractiveSession, and session.ended neither revokes credentials nor advances the cutoff, so a scheduled generation runs until credential expiry (about 60 s). Scheduled turns lack purchase tools.

**Claimed root cause:** No identity to bind a session proof.

**Trace**
  1. `convex/lib/principalAccount/interactiveAuthority/factResolution.ts:110` (sink) Scheduled chat authorization skips the session-ended check

**Evidence**
  - `convex/lib/principalAccount/interactiveAuthority/factResolution.ts:110` Identity-free resolution skips requireCurrentInteractiveSession, and session.ended neither revokes credentials nor advances the cutoff, so a scheduled generation runs until credential expiry (about 60 s). Scheduled turns

**Blockers**
- Whether read tools re-check authority per call and real credential window.

**Local plan:** schedule, apply session.ended, authorize before and after expiry.

**Owner-observed deployment check:** n/a

## Strict consequence proof ignores first-factor age when a second factor is present

Fingerprint: `convex-strict-consequence-proof-first-factor-age`

deriveStrictConsequenceProof anchors on the second factor, matching Clerk's strict preset; the MFA path uses max.

**Claimed root cause:** Asymmetry between strict and MFA derivations.

**Trace**
  1. `convex/lib/authority/consequence/proof.ts:108` (sink) Strict consequence proof ignores first-factor age when a second factor is present

**Evidence**
  - `convex/lib/authority/consequence/proof.ts:108` deriveStrictConsequenceProof anchors on the second factor, matching Clerk's strict preset; the MFA path uses max.

**Blockers**
- Product policy and Clerk behaviour.

**Local plan:** n/a

**Owner-observed deployment check:** decide whether strict consequences need fresh first factor.

## Rotating-IP traffic can exhaust the shared 24h anonymous global budget

Fingerprint: `src-anonymous-global-budget-exhaustion`

chat-anonymous-global is a fixed 5000 per 24h window; about 170 IPs at 30/h exhaust it and every guest gets 429. Documented spend-versus-availability trade-off; Retry-After is dropped by the proxy.

**Claimed root cause:** Single global fixed-window budget with no bot challenge.

**Trace**
  1. `src/modules/security/rate-limit-policy.ts:49` (sink) Rotating-IP traffic can exhaust the shared 24h anonymous global budget

**Evidence**
  - `src/modules/security/rate-limit-policy.ts:49` chat-anonymous-global is a fixed 5000 per 24h window; about 170 IPs at 30/h exhaust it and every guest gets 429. Documented spend-versus-availability trade-off; Retry-After is dropped by the proxy.

**Blockers**
- Deployed limiter window semantics.

**Local plan:** n/a

**Owner-observed deployment check:** confirm fixed-window reset behaviour of @convex-dev/rate-limiter in production.

## Password-change revocation depends on a 1-second timestamp equality heuristic

Fingerprint: `src-clerk-password-change-one-second-heuristic`

user.updated revokes only when password_last_updated_at is within 1000 ms of updated_at; otherwise observe_only and no cutoff advance.

**Claimed root cause:** Heuristic correlation of two timestamps.

**Trace**
  1. `src/lib/server/clerk-security-webhook.ts:108` (sink) Password-change revocation depends on a 1-second timestamp equality heuristic

**Evidence**
  - `src/lib/server/clerk-security-webhook.ts:108` user.updated revokes only when password_last_updated_at is within 1000 ms of updated_at; otherwise observe_only and no cutoff advance.

**Blockers**
- Real Clerk payload timing and whether Clerk ends other sessions.

**Local plan:** unit test with 1001 ms skew.

**Owner-observed deployment check:** sample a real payload and check session policy.

## Client-error sink limiter bypass when VERCEL is unset

Fingerprint: `src-client-error-trusted-ingress-ip`

Same trustedIngressIp issue on /api/observability/client-error (5/min) feeding Sentry.

**Claimed root cause:** Header trust depends on runtime.

**Trace**
  1. `src/lib/server/rate-limit.ts:168` (sink) Client-error sink limiter bypass when VERCEL is unset

**Evidence**
  - `src/lib/server/rate-limit.ts:168` Same trustedIngressIp issue on /api/observability/client-error (5/min) feeding Sentry.

**Blockers**
- VERCEL defined in production runtime.

**Local plan:** n/a

**Owner-observed deployment check:** confirm VERCEL is set at runtime.

## Full-account data export has no rate limit or size cap

Fingerprint: `src-data-export-no-rate-limit-or-cap`

The GET and HEAD route is not wrapped in withHttpRateLimit and pages unboundedly through agents, calls and invoices.

**Claimed root cause:** No limit wrapper or row cap.

**Trace**
  1. `src/lib/server/personal-data-export.functions.ts:96` (sink) Full-account data export has no rate limit or size cap

**Evidence**
  - `src/lib/server/personal-data-export.functions.ts:96` The GET and HEAD route is not wrapped in withHttpRateLimit and pages unboundedly through agents, calls and invoices.

**Blockers**
- Cost for large accounts.

**Local plan:** seeded large account measurement.

**Owner-observed deployment check:** n/a

## Idempotent replay in admitConsequence returns a snapshot before the ancestry liveness recheck

Fingerprint: `src-delegation-replay-skips-ancestry-liveness`

Replay returns before assertLiveAncestry; current consumers recheck the leaf and delegate() has no production caller.

**Claimed root cause:** Replay precedes ancestry check.

**Trace**
  1. `src/modules/authority/delegation/delegation.ts:190` (sink) Idempotent replay in admitConsequence returns a snapshot before the ancestry liveness recheck

**Evidence**
  - `src/modules/authority/delegation/delegation.ts:190` Replay returns before assertLiveAncestry; current consumers recheck the leaf and delegate() has no production caller.

**Blockers**
- Recovery consumer and any depth greater than 1 creation path.

**Local plan:** test replay after ancestor revoke in recovery path.

**Owner-observed deployment check:** n/a

## Device-code approval lets a deceived user hand the poller an account credential

Fingerprint: `src-device-code-consent-phishing`

Pending grants are ownerless and the consent page shows an attacker-chosen client name with an unverified badge; strict reverification gates approval.

**Claimed root cause:** No out-of-band binding.

**Trace**
  1. `src/modules/agent-access/oauth-state.ts:322` (sink) Device-code approval lets a deceived user hand the poller an account credential

**Evidence**
  - `src/modules/agent-access/oauth-state.ts:322` Pending grants are ownerless and the consent page shows an attacker-chosen client name with an unverified badge; strict reverification gates approval.

**Blockers**
- Whether product accepts device-code phishing residual risk.

**Local plan:** n/a

**Owner-observed deployment check:** review verification page copy and consider verified-client binding.

## HTTP-JSON path parameter dot segments escape the published operation template

Fingerprint: `src-http-json-dot-segment-path-escape`

requestTarget maps input into the path template without refusing . or .. so id=.. resolves to a sibling path on the provider host with the provider credential attached; x402-request.ts refuses these.

**Claimed root cause:** No dot-segment refusal in the http-json lane.

**Trace**
  1. `src/modules/capability-supply/internal/route-transport-http-json.ts:538` (sink) HTTP-JSON path parameter dot segments escape the published operation template

**Evidence**
  - `src/modules/capability-supply/internal/route-transport-http-json.ts:538` requestTarget maps input into the path template without refusing . or .. so id=.. resolves to a sibling path on the provider host with the provider credential attached; x402-request.ts refuses these.

**Blockers**
- Whether the provider inputSchema constrains the mapped field and whether privileged sibling routes exist.

**Local plan:** unit test requestTarget with . and .. mappings and assert refusal.

**Owner-observed deployment check:** review published inputSchema path fields.

## Non-monotonic release flag lets a post-release refusal abort a consequential journal row

Fingerprint: `src-jit-release-flag-nonmonotonic`

A refused DELETE (terminateSession) after the consequential tools/call resets releaseAttempted, so the success is replaced by a refusal and the row aborted. Double execution is blocked by lease settlement; the residual is a ledger gap.

**Claimed root cause:** releaseAttempted reset on pre-release refusal of a later request.

**Trace**
  1. `src/modules/capability-execution/call-worker/jitProviderConsequence.ts:185` (sink) Non-monotonic release flag lets a post-release refusal abort a consequential journal row

**Evidence**
  - `src/modules/capability-execution/call-worker/jitProviderConsequence.ts:185` A refused DELETE (terminateSession) after the consequential tools/call resets releaseAttempted, so the success is replaced by a refusal and the row aborted. Double execution is blocked by lease settlement; the residual i

**Blockers**
- Whether DNS rebinding between tools/call and DELETE is reachable.

**Local plan:** harness with a resolver flipping after the first request.

**Owner-observed deployment check:** n/a

## Public-read limiter keyed on client-controlled ingress header when VERCEL is unset

Fingerprint: `src-public-read-trusted-ingress-ip`

Same trustedIngressIp branch applied to /api/businesses public-read (120/min).

**Claimed root cause:** Header trust depends on runtime.

**Trace**
  1. `src/lib/server/rate-limit.ts:170` (sink) Public-read limiter keyed on client-controlled ingress header when VERCEL is unset

**Evidence**
  - `src/lib/server/rate-limit.ts:170` Same trustedIngressIp branch applied to /api/businesses public-read (120/min).

**Blockers**
- VERCEL set in every runtime and edge overwrite behaviour.

**Local plan:** n/a

**Owner-observed deployment check:** preview check as for the anonymous chat finding.

## Money settlement commits before the canonical reconcile gate

Fingerprint: `src-recovery-money-before-canonical-reconcile`

persistX402Money commits before reconcilePublicExecution, and a canonical refusal does not undo money. Pre-checks mirror the canonical gate so only a concurrent writer reaches it.

**Claimed root cause:** Ordering.

**Trace**
  1. `src/modules/capability-execution/call-worker/recovery/reconciliation.ts:105` (sink) Money settlement commits before the canonical reconcile gate

**Evidence**
  - `src/modules/capability-execution/call-worker/recovery/reconciliation.ts:105` persistX402Money commits before reconcilePublicExecution, and a canonical refusal does not undo money. Pre-checks mirror the canonical gate so only a concurrent writer reaches it.

**Blockers**
- Whether concurrent recovery can reach the window.

**Local plan:** concurrent recovery harness.

**Owner-observed deployment check:** n/a

## Redaction misses a bare code= query parameter in client-error text

Fingerprint: `src-redaction-misses-bare-code-param`

redactSensitiveText keeps code= while filtering state=, so a reporter forwarding a redirect URL would send an OAuth code to Sentry. No in-repo sender exists.

**Claimed root cause:** Alias list lacks code.

**Trace**
  1. `src/lib/observability/degrade-backend.ts:8` (sink) Redaction misses a bare code= query parameter in client-error text

**Evidence**
  - `src/lib/observability/degrade-backend.ts:8` redactSensitiveText keeps code= while filtering state=, so a reporter forwarding a redirect URL would send an OAuth code to Sentry. No in-repo sender exists.

**Blockers**
- Whether any external reporter forwards raw redirect URLs.

**Local plan:** unit test redactSensitiveText.

**Owner-observed deployment check:** check reporters.

## One internal RPC bearer gates provider execution and secret lifecycle

Fingerprint: `src-single-internal-rpc-bearer-three-channels`

AE_SECRET_LIFECYCLE_RPC_TOKEN gates the provider-consequence route, the secret-lifecycle route and Convex lifecycle HTTP. Execute still needs a journal token and signed ticket; the lifecycle channel can write secret material given a matching delegation snapshot.

**Claimed root cause:** No per-channel credential separation.

**Trace**
  1. `src/routes/api.internal.provider-consequence.ts:565` (sink) One internal RPC bearer gates provider execution and secret lifecycle

**Evidence**
  - `src/routes/api.internal.provider-consequence.ts:565` AE_SECRET_LIFECYCLE_RPC_TOKEN gates the provider-consequence route, the secret-lifecycle route and Convex lifecycle HTTP. Execute still needs a journal token and signed ticket; the lifecycle channel can write secret mate

**Blockers**
- Whether a holder can obtain a valid delegation snapshot.

**Local plan:** trace snapshot creation paths.

**Owner-observed deployment check:** confirm which processes hold the token.

## Admission production check depends on NODE_ENV on the Convex deployment

Fingerprint: `src-source-write-node-env-production-check`

Without NODE_ENV=production and explicit keys, Convex derives keys from AE_SOURCE_WRITE_SECRET with public default key ids.

**Claimed root cause:** Production detection by NODE_ENV only.

**Trace**
  1. `src/modules/security/source-write-admission.ts:591` (sink) Admission production check depends on NODE_ENV on the Convex deployment

**Evidence**
  - `src/modules/security/source-write-admission.ts:591` Without NODE_ENV=production and explicit keys, Convex derives keys from AE_SOURCE_WRITE_SECRET with public default key ids.

**Blockers**
- Convex env values.

**Local plan:** n/a

**Owner-observed deployment check:** npx convex env list for names NODE_ENV and AE_SOURCE_WRITE_*.

## Admission target origin is not bound to a Convex-side canonical origin

Fingerprint: `src-source-write-target-origin-unbound`

Convex compares admission.targetOrigin to caller-supplied args.sourceWriteRequest; cross-environment acceptance depends on shared key material.

**Claimed root cause:** Origin binding is caller supplied.

**Trace**
  1. `src/modules/security/source-write-admission.ts:214` (sink) Admission target origin is not bound to a Convex-side canonical origin

**Evidence**
  - `src/modules/security/source-write-admission.ts:214` Convex compares admission.targetOrigin to caller-supplied args.sourceWriteRequest; cross-environment acceptance depends on shared key material.

**Blockers**
- Whether preview or non-prod deployments share keys with production Convex.

**Local plan:** n/a

**Owner-observed deployment check:** compare AE_SOURCE_WRITE_KEY_* across scopes.

## Anonymous admission keys trust client-influenced IP headers when VERCEL is unset or the edge appends

Fingerprint: `src-trusted-ingress-ip-anonymous-chat`

trustedIngressIp reads cf-connecting-ip, x-real-ip and x-vercel-forwarded-for from the client when VERCEL is unset, or the first x-vercel-forwarded-for value on Vercel.

**Claimed root cause:** Header trust depends on platform behaviour.

**Trace**
  1. `src/lib/server/rate-limit.ts:170` (sink) Anonymous admission keys trust client-influenced IP headers when VERCEL is unset or the edge appends

**Evidence**
  - `src/lib/server/rate-limit.ts:170` trustedIngressIp reads cf-connecting-ip, x-real-ip and x-vercel-forwarded-for from the client when VERCEL is unset, or the first x-vercel-forwarded-for value on Vercel.

**Blockers**
- Whether Vercel overwrites client x-vercel-forwarded-for and VERCEL is always set.

**Local plan:** n/a

**Owner-observed deployment check:** send a forged header to a preview you control and inspect the value; confirm VERCEL=1 at runtime.

## Unverified dynamic client can obtain provider supply-manage authority without the approval cap

Fingerprint: `src-unverified-client-provider-scope-uncapped`

modeForGrant leaves provider grants at spending_policy by design; connectionConnect accepts an attacker-chosen payee signed by that payee.

**Claimed root cause:** Deliberate exemption with unclear policy.

**Trace**
  1. `src/lib/server/agent-access-oauth/protocol.ts:267` (sink) Unverified dynamic client can obtain provider supply-manage authority without the approval cap

**Evidence**
  - `src/lib/server/agent-access-oauth/protocol.ts:267` modeForGrant leaves provider grants at spending_policy by design; connectionConnect accepts an attacker-chosen payee signed by that payee.

**Blockers**
- Whether a bound connection can redirect payments for the owner's tools.

**Local plan:** trace connectX402 binding to published tools.

**Owner-observed deployment check:** n/a

## Fresh 402 silently replaces committed offer-receipt requirement

Fingerprint: `src-x402-fresh-402-drops-offer-receipt`

Fresh challenge selection ignores extensions, so a 402 without offer-receipt skips signed-offer and receipt verification and the result is still delivered. Money is bounded by amount and payee checks.

**Claimed root cause:** Extensions and offer digest not compared to the committed challenge.

**Trace**
  1. `src/modules/capability-supply/internal/route-transport-x402.ts:121` (sink) Fresh 402 silently replaces committed offer-receipt requirement

**Evidence**
  - `src/modules/capability-supply/internal/route-transport-x402.ts:121` Fresh challenge selection ignores extensions, so a 402 without offer-receipt skips signed-offer and receipt verification and the result is still delivered. Money is bounded by amount and payee checks.

**Blockers**
- No bounded test run yet.

**Local plan:** unit test with a committed offer-receipt and a fresh 402 without extensions.

**Owner-observed deployment check:** n/a

## Vercel install runs dependency lifecycle scripts with deployment env present

Fingerprint: `vercel-install-lifecycle-scripts-with-env`

installCommand runs npm ci without --ignore-scripts; the repo's own CI skips scripts where secrets are present.

**Claimed root cause:** Install-time code in a secret-bearing build.

**Trace**
  1. `vercel.json:3` (sink) Vercel install runs dependency lifecycle scripts with deployment env present

**Evidence**
  - `vercel.json:3` installCommand runs npm ci without --ignore-scripts; the repo's own CI skips scripts where secrets are present.

**Blockers**
- Whether Vercel exposes project env to the install command and restricts egress.

**Local plan:** n/a

**Owner-observed deployment check:** review Vercel project env scopes and docs; test with a dummy variable in a preview.
