# Security audit report (Cloudflare method)

## Run scope

- Profile: standard, full repository scope, white-box. Source ref: detached copy of origin/main at 9b129ec99.
- Execution boundary: source reading only. No deployed endpoint, external service or shared service was contacted, no `.env` file was read, and no target code was executed. Every "observed result" below is a source trace, not a runtime reproduction.
- Prior run: `docs/security/deep-audit-2026-10-11.md` was used as context only; its fixes were re-verified as code. No prior ledger existed, and no same-source confirmations were carried.
- Coverage: 47 units; 26 covered, 21 candidate (each has an independent final disposition in `findings.json`), 0 blocked, 0 deferred. Excluded for all units: memory-safety and desktop/mobile IPC companions (no native or local IPC code). Model-gateway, Formance client, PostHog, Sentry and workflow code each had a unit.
- This is a single-pass standard audit. It is not a proof of absence for any unit.

## Posture summary

No critical or high findings were confirmed. The confirmed set is 40 records (9 medium, 31 low). The medium findings cluster in three places: x402 and procurement payment lifecycle (authorization not bound to the issued ticket, terminal idempotency keys, unrecoverable outcomes), owner retirement and closed-owner tool exposure, and the chat approval gate and release workflow privilege. 33 further leads need deployment facts from the owner, and 20 candidates were rejected on review.

## Confirmed findings

| Severity | Title | Location | Observed result |
|---|---|---|---|
| medium | cli-release runs dependency lifecycle scripts in the job that holds id-token: write and signs the release | `.github/workflows/cli-release.yml:45` | The publish job grants id-token: write at job level, runs plain npm ci (lifecycle scripts enabled, 7 lockfile packages have install scripts), then npm pack (prepack builds dist/ae.js) and keyless cosign sign-blob in the same job. |
| medium | Owner-chat approval gate is satisfied by any mention of the Tool ref in user text | `convex/chatCall.ts:199` | requireApproval is cleared when the latest user message merely contains the toolRef |
| medium | Published tools of a closed or retired owner stay listed, quotable and routeable | `convex/lib/capabilitySupply/currentTool/reads.ts:126` | Close and retire never touch businesses, publications or provider connections, and readCurrentPublishedTool, qualification and quote paths check publicStatus and freeze only, never account lifecycle |
| medium | Owner approval for managed x402 Tools can never succeed | `convex/lib/capabilityExecution/callLifecycle/admissionApprovals.ts:361` | pricingConfigDecisionAmount is undefined for managed_x402, so the authority request lacks maximumSpend and approvalRequestMatches returns false; approval is refused with invocation_invalid after the owner sees a quote price |
| medium | Personal retire does not close the account, so a retired owner blocks all members | `convex/lib/principalAccount/personalAccount/retire.ts:135` | Retire marks the principal retired but leaves the account and ownership active, so requireCurrentOwnerActive denies every member |
| medium | Retire revokes machine agents with a silent 64 cap and skips agents lacking ownerTokenIdentifier | `convex/lib/principalAccount/personalAccount/retireDependents.ts:30` | Cascade breaks at 64 agents silently and skips agents whose ownerTokenIdentifier differs or is undefined, so survivors keep grants, credentials and refresh families, which can still rotate credentials |
| medium | x402 prepare_authorization accepts payee, amount and endpoint not bound to the issued ticket | `convex/lib/capabilityExecution/providerConsequence/httpX402.ts:79` | The prepare branch overwrites only identity fields; payTo, amountUnits, providerEndpoint and challenge fields are caller supplied and matchingOptionalIdentity does not cover them |
| medium | Retryable quote refusal permanently terminalises the procurement idempotency key | `src/modules/capability-execution/procure-engine.ts:313` | A quote refusal with retryable true completes the operation key as failed_terminal; same-key retries replay the stored refusal forever |
| medium | Proven-unused x402 authorization can never complete recovery | `src/modules/capability-execution/call-worker/recovery/x402.ts:404` | After reconcileX402PaymentAttempt commits the spend as unused, persistX402Money still sees settlementStatus not settled, marks the managed call outcome_unknown and returns false, so recovery returns reconciliation_required on every retry. |
| low | Anonymous chat request.json() has no byte cap | `convex/lib/chat/anonymous/request.ts:43` | Gated by the proxy secret, then request.json() parses unbounded before the 16 KB transcript check |
| low | Anonymous search rerank LLM calls bypass the model-cost ledger | `convex/lib/chat/tools/search.ts:178` | The anonymous path creates the agent without searchTurn, so presentSearch gets no modelCostBinding and rerank calls through OpenRouter are unrecorded |
| low | bookingFromRows does not re-assert per-call and plan-node ceilings | `convex/lib/money/managedCall/booking.ts:97` | buyerAmountUnits comes from quote.decisionAudUnits with no comparison to maximumSpendPerCallUnits or nodeCeilingUnits; ceilings are enforced only at issue |
| low | Provider-authored Tool titles and Call output interpolated unescaped into assistant Markdown | `convex/lib/chat/generate/completedFacts.ts:42` | choice.title and outputPreview are inserted raw into saved assistant text; the client renders Markdown with http/https links, so a listing title can inject a clickable link inside an AE reply |
| low | Shared chat links keep serving transcripts after owner retirement or workspace close | `convex/lib/chat/shares/reads.ts:58` | Retire and close never touch chatThreadShares; reads check only the HMAC grant |
| low | Chat tool.quote resolves URL refs before the turn fence | `convex/lib/chat/tools/purchase.ts:123` | callableToolRef (egress and publish) runs before payableAdmissionRef checks turn state, cancellation and supersession, contradicting the invariant stated in x402Directory.resolve. |
| low | Email suppression keys are unkeyed SHA-256 of the lowercased address | `convex/lib/principalAccount/notifications/suppression.ts:8` | emailSuppressions stores a deterministic unsalted hash next to a plaintext domain, so a reader of the table can test guessed addresses |
| low | Legacy unsubscribe tokens bypass expiry until a hard-coded cutoff | `convex/lib/principalAccount/notifications/unsubscribe.ts:71` | HMAC-valid tokens without kid or exp are accepted until 2026-12-15 |
| low | Unbounded anonymous client row creation via /oauth/register | `convex/lib/agentAccess/oauth/clients.ts:20` | Every well-formed registration inserts a row; nothing deletes clients and the only limit is 5/min per ingress IP. |
| low | Owner republish reactivates a withdrawn Tool during offboarding routeability freeze | `convex/lib/capabilitySupply/ownerFunnel/republish.ts:16` | republishOwnerCapabilityHandler never calls providerRouteabilityIsFrozen, so a provider under an open offboarding freeze can restore a withdrawn revision to current |
| low | Owner x402 staging creates a current publication during offboarding freeze | `convex/lib/capabilitySupply/ownerStaging/admission.ts:23` | stageOwnerX402CapabilityHandler, reuseExactStagedPublication and the staging publication ports have no freeze check, so a frozen provider can stage or patch a current publication and schedule a probe. |
| low | Provider-consequence HTTP handlers buffer request bodies before authentication | `convex/lib/capabilityExecution/providerConsequence/http.ts:63` | bearer() is a format check; boundedJson calls request.text() on the full body before the byte cap, for begin, attest, complete, abort and the x402 RPC |
| low | Frozen provider Tools shown as routeable in public search, detail and graph | `convex/lib/capabilitySupply/tool/projection.ts:184` | routeable is computed from qualification status alone; freeze only suppresses inspection_required |
| low | Personal account retire leaves the admin membership active | `convex/lib/principalAccount/personalAccount/retire.ts:135` | retire never patches adminMemberships and resolveAdminAuthority does not consult principal lifecycle, so an unexpired JWT for the deleted Clerk user can still pass admin checks |
| low | journal_replace skips the row-to-caller authority binding that getByIdempotency enforces | `convex/lib/secrets/lifecycle/persistence.ts:70` | replace() looks up the row by idempotencyRef and checks state and identity fields but not row.authority against the caller authority, unlike getByIdempotency |
| low | pointer_read returns secret pointer metadata without delegation snapshot binding | `convex/lib/secrets/lifecycle/persistence.ts:91` | readSecretPointer calls getActive with no requireSnapshot, returning secretRef, activeGeneration and revision to a holder of the RPC token who names the account |
| low | Source read admissions are not single-use | `convex/lib/security/sourceWrite/admission.ts:5` | requireSourceRead never consumes the nonce, so a captured read admission replays for up to 5 minutes for agent list and read of provider connections |
| low | Identity-conflict branch downgrades an applied inbox row to reconciliation_required | `convex/moneyStripeWebhookInbox.ts:87` | ingest() patches any existing row, including applied, to reconciliation_required when digest, type or destination differ, and complete() then refuses to update it |
| low | Terminal reconciliation_required top-ups are never surfaced or redriven | `convex/moneyStripeWebhookInbox.ts:85` | A non-retryable worker refusal marks the inbox row reconciliation_required; redelivery returns replayed with HTTP 200 so Stripe stops retrying, and listStuckForOperator has no callers or cron |
| low | Unauthenticated environment oracle in payments and treasury mutations | `convex/adminTreasuryCommands.ts:17` | setPaymentsPaused, setPaymentsAudience and changeThresholds return environment_mismatch before runAdminCommand's authority check, so an anonymous caller learns whether a supplied environment matches the deployment. |
| low | read_only key triggers unpaid outbound GET and directory publish via URL Quote | `convex/lib/capabilityExecution/quotes/quoteAction.ts:54` | admitCallableResolve checks only hasCurrentAgentGrant; resolveCallableRef then does a guarded unpaid GET and facilitator discovery publish |
| low | actions/checkout pinned to a floating tag in a write-scoped workflow | `.github/workflows/react-doctor.yml:29` | The job grants pull-requests, issues and statuses write; checkout@v5 is a mutable tag and persists the token in .git/config before a third-party action runs. |
| low | Pending device grant metadata readable by any signed-in account holding its user code | `src/lib/server/agent-access-oauth/onboarding.ts:20` | The owner check is skipped for ownerless grants, so any signed-in account with the user code or grantRef reads client name and grantRef |
| low | Invalid-key requests trigger two Clerk apiKeys.verify calls per request | `src/lib/server/agent-access-auth.ts:220` | verifyApiKeyCandidate fails and authenticateAgentAccess verifies the same secret again on protected paths, so each invalid key costs two Clerk calls, bounded by the 30/min anonymous IP bucket. |
| low | IP-literal hosts in MCP OAuth metadata hops bypass the connect-time SSRF guard | `src/modules/capability-supply/internal/mcp-source-discovery.ts:79` | Only the initial serverUrl is pre-checked |
| low | Financial document URL and statement GET responses lack no-store headers | `src/lib/server/money-documents.functions.ts:280` | The money GET server functions set no cache-control while sibling owner GETs set private, no-store. |
| low | OAuth admission limits keyed by attacker-supplied values | `src/lib/server/rate-limit.ts:157` | Keys include client_id, device_code, code or user_code supplied by the caller, so random values obtain fresh buckets and no per-IP aggregate applies |
| low | POST /oauth/revoke returns 200 without revoking device or non-offline access tokens | `src/lib/server/agent-access-oauth/token-family.ts:45` | Revoke looks only at refresh-family rows; access tokens issued for device and non-offline code grants have no searchable row, so revocation reports success while the key stays valid. |
| low | Rotated-out customer credential generation still executes for the ticket lifetime | `src/routes/api.internal.provider-consequence.ts:231` | The customer pointer is read at issue time and fixedPointerStore returns the ticket's values, so a rotated-out generation is still decrypted and sent for up to 30 seconds |
| low | Remote chat text written raw to the terminal | `tools/ae/commands/chat.ts:19` | text-delta, reasoning and thread id values are written without sanitizeText, so model output with ESC/OSC sequences reaches the operator's terminal |
| low | nextCommand interpolates the origin into an export line with JSON.stringify | `tools/ae/commands/status.ts:43` | A base URL host containing $() or backticks survives URL parsing and is placed in double quotes, which POSIX shells expand when the suggested line is run. |

### Detail per finding

#### [medium] cli-release runs dependency lifecycle scripts in the job that holds id-token: write and signs the release

Fingerprint: `ci-cli-release-install-scripts-with-id-token`
- Source: `.github/workflows/cli-release.yml:45`
- Lower-trust principal and condition: A compromised upstream release of a lockfile package with an install script (esbuild, @sentry/cli, core-js) runs during npm ci in the publish job.
- Result (source trace): The publish job grants id-token: write at job level, runs plain npm ci (lifecycle scripts enabled, 7 lockfile packages have install scripts), then npm pack (prepack builds dist/ae.js) and keyless cosign sign-blob in the same job.
- Impact and priority: likelihood low (Needs the stated precondition and lower-trust access is limited.); impact medium (Bounded impact as described; no cross-tenant read or unbounded spend demonstrated.); overall medium.
- Smallest source fix: Use npm ci --ignore-scripts in cli-release.yml, build in a job without id-token, and sign in a separate minimal job that consumes the uploaded tarball artifact.

#### [medium] Owner-chat approval gate is satisfied by any mention of the Tool ref in user text

Fingerprint: `convex-chat-call-approval-substring-gate`
- Source: `convex/chatCall.ts:199`
- Lower-trust principal and condition: Owner asks a read-only question containing operation:v1:<hex>; injected listing text steers the model to tool.quote then tool.call.
- Result (source trace): requireApproval is cleared when the latest user message merely contains the toolRef. Owner-chat authority is spending_policy, so a model steered by provider text can quote and call or run a plan after a non-purchase question that includes a ref. The read-only restriction exists only as prompt text.
- Impact and priority: likelihood medium (Needs the stated precondition and lower-trust access is limited.); impact medium (Bounded impact as described; no cross-tenant read or unbounded spend demonstrated.); overall medium.
- Smallest source fix: Require an explicit purchase action (UI approval or structured intent) rather than substring inclusion, and enforce the read-only intent in code for plan run.

#### [medium] Published tools of a closed or retired owner stay listed, quotable and routeable

Fingerprint: `convex-closed-owner-tools-stay-routeable`
- Source: `convex/lib/capabilitySupply/currentTool/reads.ts:126`
- Lower-trust principal and condition: Public catalog read and Quote after workspace close.
- Result (source trace): Close and retire never touch businesses, publications or provider connections, and readCurrentPublishedTool, qualification and quote paths check publicStatus and freeze only, never account lifecycle. The UI copy says Tools stop. Settlement leg not traced.
- Impact and priority: likelihood medium (Needs the stated precondition and lower-trust access is limited.); impact medium (Bounded impact as described; no cross-tenant read or unbounded spend demonstrated.); overall medium.
- Smallest source fix: Start offboarding or unpublish on close and add an account-active check to readCurrentPublishedTool.

#### [medium] Owner approval for managed x402 Tools can never succeed

Fingerprint: `convex-managed-x402-approval-unreachable`
- Source: `convex/lib/capabilityExecution/callLifecycle/admissionApprovals.ts:361`
- Lower-trust principal and condition: Approval-required agent calls a managed_x402 Tool, then the owner approves.
- Result (source trace): pricingConfigDecisionAmount is undefined for managed_x402, so the authority request lacks maximumSpend and approvalRequestMatches returns false; approval is refused with invocation_invalid after the owner sees a quote price. Fail-closed availability defect.
- Impact and priority: likelihood medium (Needs the stated precondition and lower-trust access is limited.); impact medium (Bounded impact as described; no cross-tenant read or unbounded spend demonstrated.); overall medium.
- Smallest source fix: Carry quote.decisionAudUnits into maximumSpend for managed_x402 requests.

#### [medium] Personal retire does not close the account, so a retired owner blocks all members

Fingerprint: `convex-retire-does-not-close-owned-account`
- Source: `convex/lib/principalAccount/personalAccount/retire.ts:135`
- Lower-trust principal and condition: Clerk user.deleted for the current owner of a populated workspace.
- Result (source trace): Retire marks the principal retired but leaves the account and ownership active, so requireCurrentOwnerActive denies every member. The deletion eligibility rule is dead code with no caller. Fail-closed availability and lifecycle defect; Clerk self-deletion can trigger it.
- Impact and priority: likelihood medium (Needs the stated precondition and lower-trust access is limited.); impact medium (Bounded impact as described; no cross-tenant read or unbounded spend demonstrated.); overall medium.
- Smallest source fix: Enforce eligibility server-side and transfer or close the account before retiring an owner.

#### [medium] Retire revokes machine agents with a silent 64 cap and skips agents lacking ownerTokenIdentifier

Fingerprint: `convex-retire-machine-agent-cap-and-owner-match`
- Source: `convex/lib/principalAccount/personalAccount/retireDependents.ts:30`
- Lower-trust principal and condition: Retire an owner with over 64 agents or agents without ownerTokenIdentifier.
- Result (source trace): Cascade breaks at 64 agents silently and skips agents whose ownerTokenIdentifier differs or is undefined, so survivors keep grants, credentials and refresh families, which can still rotate credentials. Call admission still fails on the inactive owner.
- Impact and priority: likelihood medium (Needs the stated precondition and lower-trust access is limited.); impact medium (Bounded impact as described; no cross-tenant read or unbounded spend demonstrated.); overall medium.
- Smallest source fix: Page through all agents, reuse the machineCascade fallback, and fail loudly when work remains.

#### [medium] x402 prepare_authorization accepts payee, amount and endpoint not bound to the issued ticket

Fingerprint: `convex-x402-prepare-authorization-unbound`
- Source: `convex/lib/capabilityExecution/providerConsequence/httpX402.ts:79`
- Lower-trust principal and condition: prepare_authorization RPC with a valid journal token and a different payTo.
- Result (source trace): The prepare branch overwrites only identity fields; payTo, amountUnits, providerEndpoint and challenge fields are caller supplied and matchingOptionalIdentity does not cover them. The ticket claims carry no payee or amount. A journal bearer holder within the 30 second ticket window can obtain authorization for a different payee, bounded by spend caps and screening of the supplied payee.
- Impact and priority: likelihood medium (Needs the stated precondition and lower-trust access is limited.); impact medium (Bounded impact as described; no cross-tenant read or unbounded spend demonstrated.); overall medium.
- Smallest source fix: Verify payTo, amount, endpoint and challenge digest against the quoted requirement inside the prepare step.

#### [medium] Retryable quote refusal permanently terminalises the procurement idempotency key

Fingerprint: `src-procure-quote-refusal-terminalises-key`
- Source: `src/modules/capability-execution/procure-engine.ts:313`
- Lower-trust principal and condition: procure with a quote that returns inspection_unavailable, then retry.
- Result (source trace): A quote refusal with retryable true completes the operation key as failed_terminal; same-key retries replay the stored refusal forever. The call-refusal branch deliberately does not terminalise. No money moves.
- Impact and priority: likelihood medium (Needs the stated precondition and lower-trust access is limited.); impact medium (Bounded impact as described; no cross-tenant read or unbounded spend demonstrated.); overall medium.
- Smallest source fix: Do not terminalise the key when retryable, matching the call refusal branch.

#### [medium] Proven-unused x402 authorization can never complete recovery

Fingerprint: `src-x402-recovery-unused-forces-outcome-unknown`
- Source: `src/modules/capability-execution/call-worker/recovery/x402.ts:404`
- Lower-trust principal and condition: Recovery of an authorization proven expired or cancelled.
- Result (source trace): After reconcileX402PaymentAttempt commits the spend as unused, persistX402Money still sees settlementStatus not settled, marks the managed call outcome_unknown and returns false, so recovery returns reconciliation_required on every retry.
- Impact and priority: likelihood medium (Needs the stated precondition and lower-trust access is limited.); impact medium (Bounded impact as described; no cross-tenant read or unbounded spend demonstrated.); overall medium.
- Smallest source fix: Handle expired_unused and authorization_cancelled by releasing the managed reservation and reconciling as released.

#### [low] Anonymous chat request.json() has no byte cap

Fingerprint: `convex-anonymous-chat-json-before-cap`
- Source: `convex/lib/chat/anonymous/request.ts:43`
- Lower-trust principal and condition: Direct POST with the proxy secret and a large body.
- Result (source trace): Gated by the proxy secret, then request.json() parses unbounded before the 16 KB transcript check. The public proxy caps at 18 KB.
- Impact and priority: likelihood low (Needs the stated precondition and lower-trust access is limited.); impact low (Bounded impact as described; no cross-tenant read or unbounded spend demonstrated.); overall low.
- Smallest source fix: Cap bytes before parsing as the other routes do.

#### [low] Anonymous search rerank LLM calls bypass the model-cost ledger

Fingerprint: `convex-anonymous-rerank-not-in-cost-ledger`
- Source: `convex/lib/chat/tools/search.ts:178`
- Lower-trust principal and condition: Any admitted anonymous chat request that triggers search.
- Result (source trace): The anonymous path creates the agent without searchTurn, so presentSearch gets no modelCostBinding and rerank calls through OpenRouter are unrecorded. Volume is bounded by the 5000/day admission budget; the gap is cost accounting and visibility.
- Impact and priority: likelihood low (Needs the stated precondition and lower-trust access is limited.); impact low (Bounded impact as described; no cross-tenant read or unbounded spend demonstrated.); overall low.
- Smallest source fix: Provide an anonymous cost binding or account rerank spend against a global anonymous ledger.

#### [low] bookingFromRows does not re-assert per-call and plan-node ceilings

Fingerprint: `convex-booking-ceilings-not-reasserted`
- Source: `convex/lib/money/managedCall/booking.ts:97`
- Lower-trust principal and condition: A quote row written outside issueQuote.
- Result (source trace): buyerAmountUnits comes from quote.decisionAudUnits with no comparison to maximumSpendPerCallUnits or nodeCeilingUnits; ceilings are enforced only at issue. Quote rows are written only by issueQuote, so this is defense in depth.
- Impact and priority: likelihood low (Needs the stated precondition and lower-trust access is limited.); impact low (Bounded impact as described; no cross-tenant read or unbounded spend demonstrated.); overall low.
- Smallest source fix: Assert decisionAudUnits <= maximumSpendPerCallUnits and <= nodeCeilingUnits in bookingFromRows.

#### [low] Provider-authored Tool titles and Call output interpolated unescaped into assistant Markdown

Fingerprint: `convex-chat-markdown-link-injection`
- Source: `convex/lib/chat/generate/completedFacts.ts:42`
- Lower-trust principal and condition: Listing title like Verify [your account](https://attacker.example).
- Result (source trace): choice.title and outputPreview are inserted raw into saved assistant text; the client renders Markdown with http/https links, so a listing title can inject a clickable link inside an AE reply. HTML is skipped and images dropped.
- Impact and priority: likelihood low (Needs the stated precondition and lower-trust access is limited.); impact low (Bounded impact as described; no cross-tenant read or unbounded spend demonstrated.); overall low.
- Smallest source fix: Escape Markdown in provider-authored strings (markdownText) before interpolation or render them as plain text.

#### [low] Shared chat links keep serving transcripts after owner retirement or workspace close

Fingerprint: `convex-chat-share-survives-account-retirement`
- Source: `convex/lib/chat/shares/reads.ts:58`
- Lower-trust principal and condition: Open a share token after the owner retired.
- Result (source trace): Retire and close never touch chatThreadShares; reads check only the HMAC grant. The retired owner cannot revoke (resolveBusinessActor returns anonymous). Exposure ends when idle-content retention (30 days from last turn) clears messages, so it is bounded not indefinite.
- Impact and priority: likelihood low (Needs the stated precondition and lower-trust access is limited.); impact low (Bounded impact as described; no cross-tenant read or unbounded spend demonstrated.); overall low.
- Smallest source fix: Revoke shares in retire and close, and check owner lifecycle in listSharedMessages.

#### [low] Chat tool.quote resolves URL refs before the turn fence

Fingerprint: `convex-chat-tool-quote-resolves-before-turn-fence`
- Source: `convex/lib/chat/tools/purchase.ts:123`
- Lower-trust principal and condition: tool.quote with a URL ref after the turn is cancelled.
- Result (source trace): callableToolRef (egress and publish) runs before payableAdmissionRef checks turn state, cancellation and supersession, contradicting the invariant stated in x402Directory.resolve.
- Impact and priority: likelihood low (Needs the stated precondition and lower-trust access is limited.); impact low (Bounded impact as described; no cross-tenant read or unbounded spend demonstrated.); overall low.
- Smallest source fix: Run authorizePayableTool before resolveCallableRef.

#### [low] Email suppression keys are unkeyed SHA-256 of the lowercased address

Fingerprint: `convex-email-suppression-unkeyed-hash`
- Source: `convex/lib/principalAccount/notifications/suppression.ts:8`
- Lower-trust principal and condition: Read access to the emailSuppressions table.
- Result (source trace): emailSuppressions stores a deterministic unsalted hash next to a plaintext domain, so a reader of the table can test guessed addresses. Not reachable by lower-trust principals.
- Impact and priority: likelihood low (Needs the stated precondition and lower-trust access is limited.); impact low (Bounded impact as described; no cross-tenant read or unbounded spend demonstrated.); overall low.
- Smallest source fix: Use HMAC-SHA256 with a server-held key (pattern exists in unsubscribe.ts) and drop or leave existing rows.

#### [low] Legacy unsubscribe tokens bypass expiry until a hard-coded cutoff

Fingerprint: `convex-legacy-unsubscribe-token-no-expiry`
- Source: `convex/lib/principalAccount/notifications/unsubscribe.ts:71`
- Lower-trust principal and condition: Unsubscribe link signed before kid and exp existed.
- Result (source trace): HMAC-valid tokens without kid or exp are accepted until 2026-12-15. The effect is opt-out only and the legacy window is hours of issued tokens.
- Impact and priority: likelihood low (Needs the stated precondition and lower-trust access is limited.); impact low (Bounded impact as described; no cross-tenant read or unbounded spend demonstrated.); overall low.
- Smallest source fix: Delete the legacy branch (repo rule: no backward compatibility).

#### [low] Unbounded anonymous client row creation via /oauth/register

Fingerprint: `convex-oauth-register-unbounded-client-rows`
- Source: `convex/lib/agentAccess/oauth/clients.ts:20`
- Lower-trust principal and condition: POST /oauth/register from many IPs.
- Result (source trace): Every well-formed registration inserts a row; nothing deletes clients and the only limit is 5/min per ingress IP.
- Impact and priority: likelihood low (Needs the stated precondition and lower-trust access is limited.); impact low (Bounded impact as described; no cross-tenant read or unbounded spend demonstrated.); overall low.
- Smallest source fix: Add TTL cleanup for unused clients and a global registration budget.

#### [low] Owner republish reactivates a withdrawn Tool during offboarding routeability freeze

Fingerprint: `convex-owner-republish-ignores-offboarding-freeze`
- Source: `convex/lib/capabilitySupply/ownerFunnel/republish.ts:16`
- Lower-trust principal and condition: republishOwnerCapability mutation by the business owner for a withdrawn Tool while an offboarding case has routeabilityFrozenAt set.
- Result (source trace): republishOwnerCapabilityHandler never calls providerRouteabilityIsFrozen, so a provider under an open offboarding freeze can restore a withdrawn revision to current. Calls stay refused and completion is blocked, so impact is state integrity only.
- Impact and priority: likelihood low (Needs the stated precondition and lower-trust access is limited.); impact low (Bounded impact as described; no cross-tenant read or unbounded spend demonstrated.); overall low.
- Smallest source fix: Call providerRouteabilityIsFrozen in republishOwnerCapabilityHandler and refuse while frozen.

#### [low] Owner x402 staging creates a current publication during offboarding freeze

Fingerprint: `convex-owner-x402-staging-ignores-offboarding-freeze`
- Source: `convex/lib/capabilitySupply/ownerStaging/admission.ts:23`
- Lower-trust principal and condition: stageOwnerX402Capability mutation by a frozen provider's owner with an existing exact catalog target and connection.
- Result (source trace): stageOwnerX402CapabilityHandler, reuseExactStagedPublication and the staging publication ports have no freeze check, so a frozen provider can stage or patch a current publication and schedule a probe.
- Impact and priority: likelihood low (Needs the stated precondition and lower-trust access is limited.); impact low (Bounded impact as described; no cross-tenant read or unbounded spend demonstrated.); overall low.
- Smallest source fix: Add the freeze check in stageOwnerX402CapabilityHandler before reuse or publish.

#### [low] Provider-consequence HTTP handlers buffer request bodies before authentication

Fingerprint: `convex-provider-consequence-body-before-bearer`
- Source: `convex/lib/capabilityExecution/providerConsequence/http.ts:63`
- Lower-trust principal and condition: Unauthenticated POST with a well-formed 43 to 128 char bearer and a large chunked body.
- Result (source trace): bearer() is a format check; boundedJson calls request.text() on the full body before the byte cap, for begin, attest, complete, abort and the x402 RPC. Platform body limits bound it; impact is wasted compute.
- Impact and priority: likelihood low (Needs the stated precondition and lower-trust access is limited.); impact low (Bounded impact as described; no cross-tenant read or unbounded spend demonstrated.); overall low.
- Smallest source fix: Return 401 when no bearer before reading and cap bytes while streaming; rate-limit by IP.

#### [low] Frozen provider Tools shown as routeable in public search, detail and graph

Fingerprint: `convex-public-tool-projection-ignores-freeze`
- Source: `convex/lib/capabilitySupply/tool/projection.ts:184`
- Lower-trust principal and condition: Public search or detail query for a Tool whose business has an open freeze case.
- Result (source trace): routeable is computed from qualification status alone; freeze only suppresses inspection_required. providerTools/projection.ts computes eligible && !frozen, so the public view is inconsistent. Calls and quotes are still refused.
- Impact and priority: likelihood low (Needs the stated precondition and lower-trust access is limited.); impact low (Bounded impact as described; no cross-tenant read or unbounded spend demonstrated.); overall low.
- Smallest source fix: Compute routeable = eligible && !routeabilityFrozen in tool/projection.ts and gate admittedToolRef in the graph.

#### [low] Personal account retire leaves the admin membership active

Fingerprint: `convex-retire-leaves-admin-membership-active`
- Source: `convex/lib/principalAccount/personalAccount/retire.ts:135`
- Lower-trust principal and condition: Admin request with a pre-deletion Clerk JWT.
- Result (source trace): retire never patches adminMemberships and resolveAdminAuthority does not consult principal lifecycle, so an unexpired JWT for the deleted Clerk user can still pass admin checks. Window is the JWT lifetime.
- Impact and priority: likelihood low (Needs the stated precondition and lower-trust access is limited.); impact low (Bounded impact as described; no cross-tenant read or unbounded spend demonstrated.); overall low.
- Smallest source fix: End adminMemberships in retire or check principal lifecycle in readActiveAdminMembership.

#### [low] journal_replace skips the row-to-caller authority binding that getByIdempotency enforces

Fingerprint: `convex-secret-lifecycle-journal-replace-binding`
- Source: `convex/lib/secrets/lifecycle/persistence.ts:70`
- Lower-trust principal and condition: journal_replace with a reconcile-scoped snapshot against another operation's row on the same secret.
- Result (source trace): replace() looks up the row by idempotencyRef and checks state and identity fields but not row.authority against the caller authority, unlike getByIdempotency. Requires the internal RPC bearer and a same-account snapshot covering the secret.
- Impact and priority: likelihood low (Needs the stated precondition and lower-trust access is limited.); impact low (Bounded impact as described; no cross-tenant read or unbounded spend demonstrated.); overall low.
- Smallest source fix: Compare row.authority to the caller authority as getByIdempotency does.

#### [low] pointer_read returns secret pointer metadata without delegation snapshot binding

Fingerprint: `convex-secret-lifecycle-pointer-read-no-snapshot`
- Source: `convex/lib/secrets/lifecycle/persistence.ts:91`
- Lower-trust principal and condition: pointer_read RPC with the channel bearer, accountRef and secretRef.
- Result (source trace): readSecretPointer calls getActive with no requireSnapshot, returning secretRef, activeGeneration and revision to a holder of the RPC token who names the account. No secret material returned.
- Impact and priority: likelihood low (Needs the stated precondition and lower-trust access is limited.); impact low (Bounded impact as described; no cross-tenant read or unbounded spend demonstrated.); overall low.
- Smallest source fix: Require a snapshot (with a scope a read can carry) before getActive.

#### [low] Source read admissions are not single-use

Fingerprint: `convex-source-read-admission-replayable`
- Source: `convex/lib/security/sourceWrite/admission.ts:5`
- Lower-trust principal and condition: Replay a captured list request within 5 minutes.
- Result (source trace): requireSourceRead never consumes the nonce, so a captured read admission replays for up to 5 minutes for agent list and read of provider connections. Convex queries cannot write, so the fix is a shorter window or moving the read.
- Impact and priority: likelihood low (Needs the stated precondition and lower-trust access is limited.); impact low (Bounded impact as described; no cross-tenant read or unbounded spend demonstrated.); overall low.
- Smallest source fix: Shorten the read max age or serve these reads from a mutation that consumes the nonce.

#### [low] Identity-conflict branch downgrades an applied inbox row to reconciliation_required

Fingerprint: `convex-stripe-inbox-identity-conflict-downgrades-applied`
- Source: `convex/moneyStripeWebhookInbox.ts:87`
- Lower-trust principal and condition: Same stripeEventId delivered with a different payload digest.
- Result (source trace): ingest() patches any existing row, including applied, to reconciliation_required when digest, type or destination differ, and complete() then refuses to update it. Requires a differing body under one event id from Stripe.
- Impact and priority: likelihood low (Needs the stated precondition and lower-trust access is limited.); impact low (Bounded impact as described; no cross-tenant read or unbounded spend demonstrated.); overall low.
- Smallest source fix: Leave applied rows untouched and record the conflict in a separate field.

#### [low] Terminal reconciliation_required top-ups are never surfaced or redriven

Fingerprint: `convex-stripe-reconciliation-required-silent`
- Source: `convex/moneyStripeWebhookInbox.ts:85`
- Lower-trust principal and condition: Verified Stripe checkout whose worker returns a non-retryable refusal.
- Result (source trace): A non-retryable worker refusal marks the inbox row reconciliation_required; redelivery returns replayed with HTTP 200 so Stripe stops retrying, and listStuckForOperator has no callers or cron. The only recovery is owner-initiated fulfillReturn.
- Impact and priority: likelihood low (Needs the stated precondition and lower-trust access is limited.); impact low (Bounded impact as described; no cross-tenant read or unbounded spend demonstrated.); overall low.
- Smallest source fix: Schedule an operator alert or cron over listStuckForOperator and surface the count in the operator digest.

#### [low] Unauthenticated environment oracle in payments and treasury mutations

Fingerprint: `convex-treasury-environment-oracle`
- Source: `convex/adminTreasuryCommands.ts:17`
- Lower-trust principal and condition: Public mutation call with input.environment set to production and then sandbox, no identity.
- Result (source trace): setPaymentsPaused, setPaymentsAudience and changeThresholds return environment_mismatch before runAdminCommand's authority check, so an anonymous caller learns whether a supplied environment matches the deployment.
- Impact and priority: likelihood low (Needs the stated precondition and lower-trust access is limited.); impact low (Bounded impact as described; no cross-tenant read or unbounded spend demonstrated.); overall low.
- Smallest source fix: Move the environment check inside runAdminCommand after authority, or return one generic refusal for both cases.

#### [low] read_only key triggers unpaid outbound GET and directory publish via URL Quote

Fingerprint: `convex-url-quote-egress-before-authority-mode`
- Source: `convex/lib/capabilityExecution/quotes/quoteAction.ts:54`
- Lower-trust principal and condition: Quote request for an https URL ref with a read_only key.
- Result (source trace): admitCallableResolve checks only hasCurrentAgentGrant; resolveCallableRef then does a guarded unpaid GET and facilitator discovery publish. authorityMode is checked later and only for managed pricing. The GET carries no input or credentials; publish is documented behaviour of the system workload.
- Impact and priority: likelihood low (Needs the stated precondition and lower-trust access is limited.); impact low (Bounded impact as described; no cross-tenant read or unbounded spend demonstrated.); overall low.
- Smallest source fix: Require a non-read_only mode or an explicit capability before URL resolution.

#### [low] actions/checkout pinned to a floating tag in a write-scoped workflow

Fingerprint: `gh-react-doctor-floating-checkout`
- Source: `.github/workflows/react-doctor.yml:29`
- Lower-trust principal and condition: workflow_dispatch by a writer after an upstream tag move.
- Result (source trace): The job grants pull-requests, issues and statuses write; checkout@v5 is a mutable tag and persists the token in .git/config before a third-party action runs.
- Impact and priority: likelihood low (Needs the stated precondition and lower-trust access is limited.); impact low (Bounded impact as described; no cross-tenant read or unbounded spend demonstrated.); overall low.
- Smallest source fix: Pin checkout to the SHA used elsewhere and set persist-credentials: false.

#### [low] Pending device grant metadata readable by any signed-in account holding its user code

Fingerprint: `src-agent-oauth-pending-grant-metadata`
- Source: `src/lib/server/agent-access-oauth/onboarding.ts:20`
- Lower-trust principal and condition: readAgentOnboardingRequestServer with a user code.
- Result (source trace): The owner check is skipped for ownerless grants, so any signed-in account with the user code or grantRef reads client name and grantRef. Matches device-flow design; user code is about 40 bits and rate limited.
- Impact and priority: likelihood low (Needs the stated precondition and lower-trust access is limited.); impact low (Bounded impact as described; no cross-tenant read or unbounded spend demonstrated.); overall low.
- Smallest source fix: Document or bind pending grants to the first reader.

#### [low] Invalid-key requests trigger two Clerk apiKeys.verify calls per request

Fingerprint: `src-mcp-agent-key-double-clerk-verify`
- Source: `src/lib/server/agent-access-auth.ts:220`
- Lower-trust principal and condition: Requests with an invalid Bearer on a protected MCP method.
- Result (source trace): verifyApiKeyCandidate fails and authenticateAgentAccess verifies the same secret again on protected paths, so each invalid key costs two Clerk calls, bounded by the 30/min anonymous IP bucket.
- Impact and priority: likelihood low (Needs the stated precondition and lower-trust access is limited.); impact low (Bounded impact as described; no cross-tenant read or unbounded spend demonstrated.); overall low.
- Smallest source fix: Pass the failed result forward or cache per request.

#### [low] IP-literal hosts in MCP OAuth metadata hops bypass the connect-time SSRF guard

Fingerprint: `src-mcp-oauth-hop-ip-literal-ssrf`
- Source: `src/modules/capability-supply/internal/mcp-source-discovery.ts:79`
- Lower-trust principal and condition: MCP server returning 401 with resource_metadata=http://127.0.0.1:<port>/.
- Result (source trace): Only the initial serverUrl is pre-checked. resource_metadata, authorization_servers and registration_endpoint URLs from the owner's server go through createGuardedLookup, which Node skips for IP literals, so GET and a JSON POST can reach private or link-local literals. Blind SSRF with an authenticated provider owner precondition.
- Impact and priority: likelihood low (Needs the stated precondition and lower-trust access is limited.); impact low (Bounded impact as described; no cross-tenant read or unbounded spend demonstrated.); overall low.
- Smallest source fix: Validate resolved socket address in a custom connector or refuse non-public IP literals and require https for every discovery hop.

#### [low] Financial document URL and statement GET responses lack no-store headers

Fingerprint: `src-money-documents-get-no-cache-control`
- Source: `src/lib/server/money-documents.functions.ts:280`
- Lower-trust principal and condition: Authenticated GET of an owner document URL.
- Result (source trace): The money GET server functions set no cache-control while sibling owner GETs set private, no-store.
- Impact and priority: likelihood low (Needs the stated precondition and lower-trust access is limited.); impact low (Bounded impact as described; no cross-tenant read or unbounded spend demonstrated.); overall low.
- Smallest source fix: Set cache-control: private, no-store on the four money GET handlers.

#### [low] OAuth admission limits keyed by attacker-supplied values

Fingerprint: `src-oauth-admission-keyed-by-caller-values`
- Source: `src/lib/server/rate-limit.ts:157`
- Lower-trust principal and condition: Token or device endpoint requests with random device_code values.
- Result (source trace): Keys include client_id, device_code, code or user_code supplied by the caller, so random values obtain fresh buckets and no per-IP aggregate applies. Availability and cost only.
- Impact and priority: likelihood low (Needs the stated precondition and lower-trust access is limited.); impact low (Bounded impact as described; no cross-tenant read or unbounded spend demonstrated.); overall low.
- Smallest source fix: Add an IP-only aggregate bucket in front of suffix-keyed buckets.

#### [low] POST /oauth/revoke returns 200 without revoking device or non-offline access tokens

Fingerprint: `src-oauth-revoke-noop-for-device-tokens`
- Source: `src/lib/server/agent-access-oauth/token-family.ts:45`
- Lower-trust principal and condition: Revoke request carrying a device-flow access token and its client_id.
- Result (source trace): Revoke looks only at refresh-family rows; access tokens issued for device and non-offline code grants have no searchable row, so revocation reports success while the key stays valid.
- Impact and priority: likelihood low (Needs the stated precondition and lower-trust access is limited.); impact low (Bounded impact as described; no cross-tenant read or unbounded spend demonstrated.); overall low.
- Smallest source fix: Store an access token hash for every issued credential and revoke it, or return unsupported.

#### [low] Rotated-out customer credential generation still executes for the ticket lifetime

Fingerprint: `src-provider-consequence-stale-customer-generation`
- Source: `src/routes/api.internal.provider-consequence.ts:231`
- Lower-trust principal and condition: Ticket issued, owner rotates the credential, execute within 30 seconds.
- Result (source trace): The customer pointer is read at issue time and fixedPointerStore returns the ticket's values, so a rotated-out generation is still decrypted and sent for up to 30 seconds. Old generations are not deleted.
- Impact and priority: likelihood low (Needs the stated precondition and lower-trust access is limited.); impact low (Bounded impact as described; no cross-tenant read or unbounded spend demonstrated.); overall low.
- Smallest source fix: Re-read the customer pointer at attest or execute and refuse when generation or revision changed.

#### [low] Remote chat text written raw to the terminal

Fingerprint: `tools-ae-chat-terminal-escape`
- Source: `tools/ae/commands/chat.ts:19`
- Lower-trust principal and condition: SSE text-delta containing ESC ] 52 sequences.
- Result (source trace): text-delta, reasoning and thread id values are written without sanitizeText, so model output with ESC/OSC sequences reaches the operator's terminal. Needs model-side source of escape bytes.
- Impact and priority: likelihood low (Needs the stated precondition and lower-trust access is limited.); impact low (Bounded impact as described; no cross-tenant read or unbounded spend demonstrated.); overall low.
- Smallest source fix: Pass all remote strings through sanitizeText.

#### [low] nextCommand interpolates the origin into an export line with JSON.stringify

Fingerprint: `tools-ae-status-next-command-shell-injection`
- Source: `tools/ae/commands/status.ts:43`
- Lower-trust principal and condition: --base-url https://a$(id).example.invalid with AE_API_KEY set and origin unset.
- Result (source trace): A base URL host containing $() or backticks survives URL parsing and is placed in double quotes, which POSIX shells expand when the suggested line is run.
- Impact and priority: likelihood low (Needs the stated precondition and lower-trust access is limited.); impact low (Bounded impact as described; no cross-tenant read or unbounded spend demonstrated.); overall low.
- Smallest source fix: Use shellArgument(origin) from continuation-command.ts.

## NEEDS VALIDATION

Unconfirmed leads without severity. Full text in `NEEDS-VALIDATION.md`.

| Title | Trace | Blocker | Local step | Owner check |
|---|---|---|---|---|
| authenticated-platform-proof exposes staging environment secrets to any dispatched ref | `.github/workflows/kernel-release-gate.yml:370` | Staging deployment-branch rules, reviewers and secret scope are not visible in source. | - | Settings > Environments > staging, check deployment branch rule and whether the three secrets are environment or repository scoped. |
| No concurrency cap on open anonymous LLM streams | `convex/lib/chat/anonymous/stream.ts:14` | Convex httpAction and OpenRouter concurrency limits. | - | check platform limits and observed concurrent streams. |
| Thread title search leaks existence of sibling-principal thread titles within an account | `convex/lib/chat/threads/listing.ts:123` | Runtime pagination behaviour and whether siblings exist. | convex-test with two principals under one account. | - |
| Agent-delegated publish, republish and withdraw never enforce the declared strict proofPolicy | `convex/lib/capabilitySupply/publish/prepared.ts:309` | Whether delegated publish is meant to rely on grant-time reverification. | - | confirm intent; check consent consequence action. |
| devSeed production gate trusts only AE_DEPLOYMENT_ENVIRONMENT | `convex/devSeed.ts:58` | Live values of both variables on the production Convex deployment. | unit test with development plus production formance. | npx convex env list (names and values on the owner's own console). |
| Personal export includes unfiltered audit history of every membership account | `convex/lib/principalAccount/personalAccount/exportData.ts:117` | Intended visibility of audit rows for members. | - | product decision, then filter through the owner-history allowlist. |
| Owner fulfillReturn can regress a reversed funding command to succeeded | `convex/lib/money/funding/returnFulfillment.ts:26` | Stripe session status after a full refund. | unit test reversed command through fulfillReturn. | Stripe sandbox refund and session read. |
| Hourly market presence refresh starts a new self-rescheduling chain with no lock | `convex/marketPresence.ts:82` | Production row count and per-page duration. | - | Convex insights for marketPresence:refresh duration versus table size. |
| Money sweeps and owner report path do not enforce the claim lease | `convex/lib/capabilityExecution/paidCallReports/lifecycle.ts:20` | Formance behaviour for concurrent identical command references is outside the repo. | convex-test with two concurrent claims. | confirm Formance rejects or replays a duplicate reference. |
| Replayable read admissions gate public queries returning claim tokens | `convex/agentAccessOAuth.ts:82` | Whether admission arguments can leak via logs. | - | check Convex function-arg logging and Sentry breadcrumbs; strip secrets from the query return. |
| Account owner can self-resolve a financial-scope reconciliation hold | `convex/moneyReconciliationCases.ts:75` | Whether any operator or ledger step reverses credit after a partial refund. | sandbox fixture with partial refund, resolveOwnerCase, then paid-call admission. | - |
| Quote resolve admits a buyer-chosen resource and publishes it under the system workload identity | `convex/x402Directory.ts:126` | Whether this is intended observed_external policy and whether the endpoint inspector admission gates reject arbitrary hosts. | test resolve with an arbitrary host against the discovery admission. | confirm product policy. |
| Resend webhook route reads and forwards the body before any gate | `convex/http.ts:43` | Convex body and argument limits. | - | check platform limits. |
| Scheduled chat authorization skips the session-ended check | `convex/lib/principalAccount/interactiveAuthority/factResolution.ts:110` | Whether read tools re-check authority per call and real credential window. | schedule, apply session.ended, authorize before and after expiry. | - |
| Strict consequence proof ignores first-factor age when a second factor is present | `convex/lib/authority/consequence/proof.ts:108` | Product policy and Clerk behaviour. | - | decide whether strict consequences need fresh first factor. |
| Rotating-IP traffic can exhaust the shared 24h anonymous global budget | `src/modules/security/rate-limit-policy.ts:49` | Deployed limiter window semantics. | - | confirm fixed-window reset behaviour of @convex-dev/rate-limiter in production. |
| Password-change revocation depends on a 1-second timestamp equality heuristic | `src/lib/server/clerk-security-webhook.ts:108` | Real Clerk payload timing and whether Clerk ends other sessions. | unit test with 1001 ms skew. | sample a real payload and check session policy. |
| Client-error sink limiter bypass when VERCEL is unset | `src/lib/server/rate-limit.ts:168` | VERCEL defined in production runtime. | - | confirm VERCEL is set at runtime. |
| Full-account data export has no rate limit or size cap | `src/lib/server/personal-data-export.functions.ts:96` | Cost for large accounts. | seeded large account measurement. | - |
| Idempotent replay in admitConsequence returns a snapshot before the ancestry liveness recheck | `src/modules/authority/delegation/delegation.ts:190` | Recovery consumer and any depth greater than 1 creation path. | test replay after ancestor revoke in recovery path. | - |
| Device-code approval lets a deceived user hand the poller an account credential | `src/modules/agent-access/oauth-state.ts:322` | Whether product accepts device-code phishing residual risk. | - | review verification page copy and consider verified-client binding. |
| HTTP-JSON path parameter dot segments escape the published operation template | `src/modules/capability-supply/internal/route-transport-http-json.ts:538` | Whether the provider inputSchema constrains the mapped field and whether privileged sibling routes exist. | unit test requestTarget with . and .. mappings and assert refusal. | review published inputSchema path fields. |
| Non-monotonic release flag lets a post-release refusal abort a consequential journal row | `src/modules/capability-execution/call-worker/jitProviderConsequence.ts:185` | Whether DNS rebinding between tools/call and DELETE is reachable. | harness with a resolver flipping after the first request. | - |
| Public-read limiter keyed on client-controlled ingress header when VERCEL is unset | `src/lib/server/rate-limit.ts:170` | VERCEL set in every runtime and edge overwrite behaviour. | - | preview check as for the anonymous chat finding. |
| Money settlement commits before the canonical reconcile gate | `src/modules/capability-execution/call-worker/recovery/reconciliation.ts:105` | Whether concurrent recovery can reach the window. | concurrent recovery harness. | - |
| Redaction misses a bare code= query parameter in client-error text | `src/lib/observability/degrade-backend.ts:8` | Whether any external reporter forwards raw redirect URLs. | unit test redactSensitiveText. | check reporters. |
| One internal RPC bearer gates provider execution and secret lifecycle | `src/routes/api.internal.provider-consequence.ts:565` | Whether a holder can obtain a valid delegation snapshot. | trace snapshot creation paths. | confirm which processes hold the token. |
| Admission production check depends on NODE_ENV on the Convex deployment | `src/modules/security/source-write-admission.ts:591` | Convex env values. | - | npx convex env list for names NODE_ENV and AE_SOURCE_WRITE_*. |
| Admission target origin is not bound to a Convex-side canonical origin | `src/modules/security/source-write-admission.ts:214` | Whether preview or non-prod deployments share keys with production Convex. | - | compare AE_SOURCE_WRITE_KEY_* across scopes. |
| Anonymous admission keys trust client-influenced IP headers when VERCEL is unset or the edge appends | `src/lib/server/rate-limit.ts:170` | Whether Vercel overwrites client x-vercel-forwarded-for and VERCEL is always set. | - | send a forged header to a preview you control and inspect the value; confirm VERCEL=1 at runtime. |
| Unverified dynamic client can obtain provider supply-manage authority without the approval cap | `src/lib/server/agent-access-oauth/protocol.ts:267` | Whether a bound connection can redirect payments for the owner's tools. | trace connectX402 binding to published tools. | - |
| Fresh 402 silently replaces committed offer-receipt requirement | `src/modules/capability-supply/internal/route-transport-x402.ts:121` | No bounded test run yet. | unit test with a committed offer-receipt and a fresh 402 without extensions. | - |
| Vercel install runs dependency lifecycle scripts with deployment env present | `vercel.json:3` | Whether Vercel exposes project env to the install command and restricts egress. | - | review Vercel project env scopes and docs; test with a dummy variable in a preview. |

## Hardening notes and positive patterns

No hardening notes were retained in the ledger bookkeeping. Positive source patterns noted in architecture recon: Stripe `constructEvent` and Svix verify-before-parse on webhooks, constant-time compare for internal RPC tokens (`src/lib/server/constant-time.ts`), the `isPublicHttpTarget` and `createGuardedLookup` outbound guard (`src/modules/network-guard/public.ts`), and customer OAuth grants capped at `approval_required`.

## Coverage summary

- Units: 47 total, 26 covered, 21 candidate, 0 blocked, 0 deferred.
- Records: 40 confirmed, 33 needs_validation, 20 rejected (rejected records are retained in `findings.json` so later runs do not repeat unsupported claims; they are not findings).
- Files: `FINDINGS-DETAIL.md`, `NEEDS-VALIDATION.md`, `findings.json`, `coverage-ledger.json`, `architecture.md`.
