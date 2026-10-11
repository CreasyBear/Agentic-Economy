# Cloudflare-method audit verification, 11 October 2026

Source: `findings.json` (93 records keyed by fingerprint). Each row below was traced against the code on `codex/cf-audit-fixes` by two independent verifiers; status is after the fixes in this branch. Notes are condensed from the verifier traces.

## Counts by status

| status | count |
| --- | --- |
| fixed | 47 |
| present | 3 |
| needs_validation | 13 |
| disputed | 9 |
| rejected | 1 |
| total | 73 |

## Verification table

| fingerprint | original verdict | status after fixes | severity | notes | fix commit |
| --- | --- | --- | --- | --- | --- |
| `ci-authenticated-proof-staging-secrets-any-ref` | needs_validation | disputed | none | kernel-release-gate.yml:370-376 gates only on workflow_dispatch and binds environment staging; whether staging protection rules restrict refs is not visible in the repo, so both verifiers disputed the claim. | f8a964cc5, this round (required-proof job fails on skip) |
| `ci-cli-release-install-scripts-with-id-token` | confirmed | fixed | none | cli-release.yml build job has contents:read only and npm ci --ignore-scripts; id-token:write is confined to sign-publish. | 319b3fa4a, 09d27f2b1 |
| `convex-anonymous-chat-json-before-cap` | confirmed | fixed | none | anonymous/request.ts:43 parses request.json() with no byte limit; the 16 KB cap runs after parse. | b319e936a |
| `convex-anonymous-rerank-not-in-cost-ledger` | confirmed | fixed | none | anonymous/stream.ts:21 builds the agent without searchTurn, so search.ts:178 skips modelCostBinding. | 31d96bb0c |
| `convex-anonymous-stream-concurrency` | needs_validation | needs_validation | none | No concurrency cap in anonymous/stream.ts; admission is per-IP plus a global request budget. Unresolved: provider-side concurrency behaviour. | none |
| `convex-booking-ceilings-not-reasserted` | confirmed | fixed | none | managedCall/booking.ts sets buyerAmountUnits from the quote and never compares it to maximumSpend. | b3053767b |
| `convex-chat-call-approval-substring-gate` | confirmed | disputed | none | Single-Call path fixed (chatCall.ts:188 forces approval for ae-owner-chat); verifiers disagree on the plan path residual. | b6e8585a7 |
| `convex-chat-markdown-link-injection` | confirmed | fixed | none | generate/completedFacts.ts interpolates summary, outputPreview and choice.title raw into assistant Markdown. | 32f5429dd, this round (escapes : and @ and www. so bare-URL autolinks stay dead) |
| `convex-chat-share-survives-account-retirement` | confirmed | fixed | none | shares/reads.ts:45-61 checks only the HMAC grant and thread row, never owner lifecycle. | 70fa02534 |
| `convex-chat-thread-search-existence-oracle` | needs_validation | needs_validation | none | Search index filters by ownerId only and principal filtering runs after paginate. Unresolved: whether the page shape leaks existence across principals. | none |
| `convex-chat-tool-quote-resolves-before-turn-fence` | confirmed | fixed | none | purchase.ts:123 resolves the URL ref before the payableAdmissionRef fence at :125. | 5a660683a |
| `convex-closed-owner-tools-stay-routeable` | confirmed | fixed | none | readCurrentPublishedTool now gates on publicationOwnerOpen (currentTool/reads.ts:64). | be8d157fc |
| `convex-delegated-publish-skips-proof-policy` | needs_validation | needs_validation | none | admitAgentPublicationConsequence only null-checks proofPolicy. Unresolved: whether the owner path enforces the strict policy elsewhere. | none |
| `convex-devseed-gate-only-checks-deployment-environment` | needs_validation | fixed | none | requireDevelopmentDeployment checks AE_DEPLOYMENT_ENVIRONMENT only, not AE_FORMANCE_ENVIRONMENT. | a81f543d0 |
| `convex-email-suppression-unkeyed-hash` | confirmed | fixed | none | suppression.ts:8-12 stores an unkeyed SHA-256 of the address plus a plaintext domain. | 21f057fe1, this round (own never-rotated EMAIL_SUPPRESSION_HASH_SECRET) |
| `convex-export-includes-all-membership-audit-events` | needs_validation | fixed | none | exportData.ts takes the 50 newest auditEvents per accountRef with no event-type allowlist; verifiers disagree on whether that exposes other members. | d378948a2 |
| `convex-fulfill-return-regresses-reversed-funding` | needs_validation | fixed | none | returnFulfillment.ts:26 short-circuits only on succeeded; a reversed command reaches the Stripe readback. Unresolved: whether that state is reachable. | 3d29f953b |
| `convex-legacy-unsubscribe-token-no-expiry` | confirmed | fixed | none | unsubscribe.ts:59-72 accepts tokens without kid or exp until 2026-12-15; the window is open today. | 0c25a6c00 (legacy branch deleted; handover records that no hosted email used legacy tokens) |
| `convex-managed-x402-approval-unreachable` | confirmed | disputed | none | Fixed by 91da5a36e per one verifier (maximumSpend from the accepted Quote); the other found the older reservation path still sets maximumSpend only for fixed prices. | 91da5a36e |
| `convex-market-presence-overlapping-chains` | needs_validation | disputed | none | marketPresence.ts refresh has no in-flight marker; verifiers disagree on whether overlapping chains can occur. | none |
| `convex-money-sweep-claim-not-a-lease` | needs_validation | fixed | none | paidCallReports/lifecycle.ts:20-25 claim checks state and environment only, never nextWorkAt. | 258903d61 |
| `convex-oauth-grant-read-admission-returns-secrets` | needs_validation | disputed | none | grantFromDocument returns the whole row including deliveryClaimToken and issuanceKey; verifiers disagree on whether the public queries are reachable without admission. | none |
| `convex-oauth-register-unbounded-client-rows` | confirmed | fixed | none | clients.ts inserts a row per new clientId with no TTL or delete path. | a16260575, this round (indexed sweep advances past used clients) |
| `convex-owner-republish-ignores-offboarding-freeze` | confirmed | fixed | none | republish.ts:16-45 never calls providerRouteabilityIsFrozen. | bed57ab61 |
| `convex-owner-self-resolves-financial-hold` | needs_validation | needs_validation | none | resolveOwnerCase is owner-only and requires confirmation === caseRef. Unresolved: whether an owner may clear a hold that should need an operator. | none |
| `convex-owner-x402-staging-ignores-offboarding-freeze` | confirmed | fixed | none | ownerStaging/admission.ts:23-86 has no providerRouteabilityIsFrozen check. | bed57ab61 |
| `convex-provider-consequence-body-before-bearer` | confirmed | fixed | none | providerConsequence/http.ts:61-63 reads the full body before the bearer is checked. | d9ddf82fc |
| `convex-public-tool-projection-ignores-freeze` | confirmed | fixed | none | tool/projection.ts:176 sets routeable from qualification only; the freeze check gates awaitingInspection only. | 8af813c85 |
| `convex-quote-resolve-publishes-under-system-identity` | needs_validation | needs_validation | none | x402Directory.resolve publishes an unknown buyer URL under the worker identity. Unresolved: whether that is intended for Quote-only callers. | none |
| `convex-resend-webhook-body-before-verify` | needs_validation | fixed | none | http.ts:43-51 reads the raw body with no size cap or rate limit before Svix verification in the action. | d24983465 |
| `convex-retire-does-not-close-owned-account` | confirmed | fixed | none | Personal retire now closes the owned account and ownership and ends dependents (retire.ts:200-212). | edc065843, 6dac0b5e5 |
| `convex-retire-leaves-admin-membership-active` | confirmed | present | low | retire.ts and close.ts never patch adminMemberships. | none |
| `convex-retire-machine-agent-cap-and-owner-match` | confirmed | fixed | none | Cap removed (c46a4992e), then retire made chunked: 25 agents per mutation, rescheduled until none remain, idempotent because revoked agents leave the active index. Owner-match skip of agents bound to a different identity is by design. | c46a4992e, fd24cff75 |
| `convex-scheduled-chat-skips-session-ended-check` | needs_validation | needs_validation | none | Scheduled reconcile passes no identity so the session-ended check is skipped. Unresolved: whether session end revokes the underlying authority. | none |
| `convex-secret-lifecycle-journal-replace-binding` | confirmed | fixed | none | persistence.ts:70-84 replace() never compares row.authority to the snapshot. | 18f265adb |
| `convex-secret-lifecycle-pointer-read-no-snapshot` | confirmed | fixed | none | pointerControl.getActive returns the pointer with no requireSnapshot. | 18f265adb |
| `convex-source-read-admission-replayable` | confirmed | fixed | none | requireSourceRead never consumes the nonce, unlike requireSourceWrite. | eb9013ef4 |
| `convex-strict-consequence-proof-first-factor-age` | needs_validation | needs_validation | none | deriveStrictConsequenceProof anchors on second-factor age while the MFA variant uses the max. Unresolved: intended semantics. | none |
| `convex-stripe-inbox-identity-conflict-downgrades-applied` | confirmed | fixed | none | moneyStripeWebhookInbox.ts:87-94 patches any existing row to reconciliation_required on identity mismatch with no state check. | 7648dd219, this round (operator alert from ingest) |
| `convex-stripe-reconciliation-required-silent` | confirmed | fixed | none | A redelivery of a reconciliation_required row replays silently; operator listing does not surface it. | 7648dd219, this round |
| `convex-treasury-environment-oracle` | confirmed | fixed | none | adminTreasuryCommands.ts runs the environment match before admin auth, so an unauthenticated caller learns the environment. | 9769b61d5 |
| `convex-url-quote-egress-before-authority-mode` | confirmed | fixed | none | quoteAction.ts:54-56 resolves the URL (outbound GET plus directory publish) before authority mode is checked. | 063468ff0 |
| `convex-x402-prepare-authorization-unbound` | confirmed | fixed | none | prepare_authorization binds endpoint, asset and network to the Quote (x402.ts:102-124). | a267a5b58, 935486a4c |
| `gh-react-doctor-floating-checkout` | confirmed | fixed | none | react-doctor.yml:29 uses floating actions/checkout@v5 without persist-credentials:false and holds write permissions. | e9ad7ae6b |
| `src-agent-oauth-pending-grant-metadata` | confirmed | present | low | onboarding.ts:20 skips the owner check for ownerless grants and returns clientName and grantRef. | none |
| `src-anonymous-global-budget-exhaustion` | needs_validation | needs_validation | none | chat-anonymous-global is a 5000 per 24h fixed window. Unresolved: limiter reset behaviour in the deployed version. | none |
| `src-clerk-password-change-one-second-heuristic` | needs_validation | needs_validation | none | Revoke only when password_last_updated_at is within 1000 ms of observedAt. Unresolved: real Clerk payload timing. | none |
| `src-client-error-trusted-ingress-ip` | needs_validation | needs_validation | none | trustedIngressIp trusts client headers when VERCEL is unset. Unresolved: whether production always sets VERCEL. | none |
| `src-data-export-no-rate-limit-or-cap` | needs_validation | fixed | none | api.owner.data-export.ts has no withHttpRateLimit and pagination is unbounded. | cf63d31ec |
| `src-delegation-replay-skips-ancestry-liveness` | needs_validation | fixed | none | delegation.ts:197-198 returns the idempotent replay before assertLiveAncestry at :204. | 4b2654da1 |
| `src-device-code-consent-phishing` | needs_validation | present | low | Device grants are created without ownerId and any signed-in owner can read and approve them with the user code. | none |
| `src-http-json-dot-segment-path-escape` | needs_validation | fixed | none | Mapped HTTP JSON path parameters now refuse dot-segment values. | 07418717f |
| `src-jit-release-flag-nonmonotonic` | needs_validation | fixed | none | jitProviderConsequence.ts:193 sets releaseAttempted and :198 resets it on a pre-release refusal. | 93577e6c8 |
| `src-mcp-agent-key-double-clerk-verify` | confirmed | fixed | none | A failed candidate verification falls through to a second Clerk verify in authenticateAgentAccess. | d38442d2d, this round (Clerk 5xx/429 now rethrows to 503, only 4xx caches as null) |
| `src-mcp-oauth-hop-ip-literal-ssrf` | confirmed | fixed | none | mcp-source-discovery.ts:131 pre-checks only the initial URL; later hops rely on the guarded fetch. | 4c1b19cac |
| `src-money-documents-get-no-cache-control` | confirmed | fixed | none | Owner money document GETs now send private, no-store. | 96d18078c |
| `src-oauth-admission-keyed-by-caller-values` | confirmed | fixed | none | rate-limit.ts:157-161 keys admission by IP digest plus a caller-supplied suffix with no IP-only bucket. | aabb993e5 |
| `src-oauth-revoke-noop-for-device-tokens` | confirmed | fixed | none | token-family.ts returns revoked unconditionally, even when the token kind is unknown. | 40f697a63 |
| `src-procure-quote-refusal-terminalises-key` | confirmed | fixed | none | Retryable Quote refusals release the untouched key (attempt ec9e1be12 was reverted in 177041190 because replays with no Quote threw). Review follow-up: a throwing release no longer masks the refusal. | 9f1b31bf6, fd24cff75 |
| `src-provider-consequence-stale-customer-generation` | confirmed | fixed | none | fixedPointerStore returns ticket-time pointers for the customer store. | 266e13431 |
| `src-public-read-trusted-ingress-ip` | needs_validation | needs_validation | none | Same VERCEL-unset trust as the client-error route. Unresolved: runtime environment and edge header overwrite. | none |
| `src-recovery-money-before-canonical-reconcile` | needs_validation | needs_validation | none | persistX402Money runs before reconcilePublicExecution. Unresolved: whether the ordering can commit money for an unreconcilable execution. | none |
| `src-redaction-misses-bare-code-param` | needs_validation | fixed | none | degrade-backend.ts:8 pattern omits a bare code query parameter on absolute URLs. | 1c78d1690 |
| `src-single-internal-rpc-bearer-three-channels` | needs_validation | disputed | none | One bearer token gates provider-consequence, secret-lifecycle and Convex lifecycle channels; verifiers disagree on whether that is a defect. | none |
| `src-source-write-node-env-production-check` | needs_validation | needs_validation | none | Production gate is NODE_ENV only. Unresolved: whether any deployed runtime runs with a different NODE_ENV and no signing key. | none |
| `src-source-write-target-origin-unbound` | needs_validation | disputed | none | requestBindingMismatch compares the signed admission with a caller-supplied origin; verifiers disagree whether a Convex-side canonical origin is needed. | none |
| `src-trusted-ingress-ip-anonymous-chat` | needs_validation | disputed | none | Anonymous chat uses trustedIngressIp; on Vercel only the edge header is read. Disputed pending the VERCEL runtime fact. | none |
| `src-unverified-client-provider-scope-uncapped` | needs_validation | disputed | none | modeForGrant exempts provider supply-manage grants from the approval cap by design (comment at protocol.ts:265-266). | none |
| `src-x402-fresh-402-drops-offer-receipt` | needs_validation | fixed | none | x402RequirementsEquivalent never compares the signed-offer requirement. | 73143ded4, 7995a31f7 |
| `src-x402-recovery-unused-forces-outcome-unknown` | confirmed | rejected | none | Contradicted by code: an unused proof settles as not_settled (settle.ts:44-93). | none |
| `tools-ae-chat-terminal-escape` | confirmed | fixed | none | Every printed chat event line now passes through sanitizeText (start, text, reasoning, tool, quote, receipt, state, finish). | 66c90ab11, fd24cff75 |
| `tools-ae-status-next-command-shell-injection` | confirmed | fixed | none | The suggested origin export is quoted safely. | 66c90ab11 |
| `vercel-install-lifecycle-scripts-with-env` | needs_validation | fixed | none | vercel.json installCommand lacks --ignore-scripts. Unresolved: whether lifecycle scripts are needed at install on Vercel. | 485861e52 |

## Review findings fixed in fd24cff75

| finding | result |
| --- | --- |
| retireDependents: removing the cap made retire unbounded in one mutation | fixed: 25 agents per chunk, rescheduled with `ctx.scheduler.runAfter(0, ...)` via `internal.personalAccount.revokeMachineAgentsChunk` until none remain; idempotent. Stray indent removed. |
| `ae chat`: tool, quote, receipt, state and finish lines printed server text raw | fixed: wrapped in `sanitizeText`. |
| procure-engine: a throwing `identity.release` hid a retryable Quote refusal | fixed: release is wrapped in try/catch and the refused result still returns. |

## Deferred

| item | severity | reason |
| --- | --- | --- |
| procureIdentity release has no ownership token, so a delayed release could delete a row another request re-reserved | low | Not a double purchase: the checkpoint rejects a different quoteRef and the Call key derives from quoteRef. A reservation token needs a schema change to the idempotency table, so it is deferred. |
| Retire owner-match skip for agents bound to another identity | low | By design: those agents belong to a different owner. |
| Every `needs_validation` and `disputed` row above | none | Each hinges on a runtime or product fact (for example whether VERCEL is always set, or staging environment ref protection) that the repository cannot answer. |
| Every `present` row above | low | Confirmed low-severity hardening, not fixed in this pass. |

## Final cleanup round (codex/final-cleanup)

| finding | result |
| --- | --- |
| MCP Clerk blip becomes 401 | fixed: `verifyApiKeyCandidate` rethrows Clerk 5xx, 429 and network errors so the route answers 503; only a Clerk 4xx caches as an invalid candidate, keeping one Clerk verify per request. |
| Suppression hash shares the unsubscribe secret | fixed: dedicated `EMAIL_SUPPRESSION_HASH_SECRET`, never rotated. Convex env must set it before deploy. Existing plain SHA-256 rows cannot be re-hashed; none are expected before the first hosted send, otherwise re-seed from Resend's suppression list. |
| Legacy unsubscribe tokens | closed: legacy branch stays deleted; the hosted deployment has sent no email, so no pre-kid link exists. Recorded in the handover. |
| OAuth stale-client sweep stuck on the oldest window | fixed: sweep reads never-used clients through `by_lastUsedAt_and_createdAt`, deletes those without grants and stamps granted ones used, so it always advances. Registration stays gated by the existing per-IP `oauth-issuance` limit; the 5000 cap stays a backstop (read per insert, so not raised); 30 day TTL unchanged because clients are not known to re-register on invalid_client. |
| Stripe identity conflict on applied or ignored row stays silent | fixed: ingest enqueues an operator alert `stripe-conflict-<eventId>` in that branch. |
| Markdown autolinks bypass escape | fixed: `:` and `@` escaped, dot after `www` escaped. |
| kernel-release-gate proof skips silently off main | fixed: `authenticated-platform-proof-required` job fails unless the proof job succeeded. |
| Procure rows reserved before deploy have no nonce | closed: nothing is hosted yet, so no in-flight pre-nonce rows; fail-closed kept. |
