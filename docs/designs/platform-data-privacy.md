# Platform data privacy design

## Privacy baseline for any digital service

This section applies to any service that handles customer information. “Must have” is a trustworthy-service baseline; exact legal duties depend on the organisation, information and jurisdiction.

### Must have

| Customer question | Required answer |
| --- | --- |
| What do you collect and why? | Identify necessary and optional data, purposes, and any analytics, training or marketing use. |
| Who receives it, and when? | Name material recipients and fields **before the first external send**, including price checks, retries and fallback. |
| Who can see it? | Limit customer, staff and supplier access by role; protect credentials and record sensitive access. |
| How long does it remain? | Distinguish content, logs, billing records and backups; provide a deletion or de-identification rule and a usable rights/contact path. |
| Can I trust the promise? | Make the product, contracts, live settings and actual data flows agree; review changes to recipients and purposes. |

Routine requests should follow standing customer choices. A new recipient, purpose or broader data release needs attention before it happens.

### Nice to have

Saved recipient and data limits; regional or private processing options; a history of actual disclosures; shorter customer-selected retention; self-service deletion; and independent assurance. Each advanced claim needs a precise scope. “No training” does not answer whether logs or other copies are retained.

### What the industry standard looks like

[OpenRouter's routing controls](https://openrouter.ai/docs/guides/routing/provider-selection) let a customer constrain inference providers and fallback; [its ZDR scope](https://openrouter.ai/docs/guides/features/zdr) does not automatically cover connected tools or application storage. [Cloudflare AI Gateway](https://developers.cloudflare.com/ai-gateway/observability/logging/) and [Amazon Bedrock](https://docs.aws.amazon.com/bedrock/latest/userguide/model-invocation-logging.html) expose logging controls, but their gateway/model settings do not govern every copy in an application. The standard to copy is a **specific, verifiable promise for each recipient and data copy**.

### How a customer should navigate it

1. **Before use:** see a short account of data, purposes, usual recipients and retention, with full terms one click away.
2. **When choosing:** see who will receive which fields; use hard limits to exclude unsuitable options and preferences to rank the rest.
3. **At first release:** use standing permission for an ordinary allowed request; stop only when the proposed disclosure exceeds it.
4. **Afterwards:** see actual recipients, stored content, purchase facts and a direct route to settings or a privacy request.

## AEcon decision

**Status:** design authority, not a claim about deployment. **Reviewed:** 25 September 2026. This document governs data release, access and retention across the buyer and Provider journeys in [PRODUCT.md](../../PRODUCT.md#core-market-journeys). [The dated routing proposal](../archive/2026-10-05/designs/2026-09-25-tool-market-routing-and-data-strategy.md) retains market-choice research; PRODUCT.md owns product direction and the [public Privacy Policy](../../src/components/ae/legal/privacy/privacy.contracts.ts) is the customer-facing statement.

**An Agent can find and buy a Tool without giving AE the Customer's whole task.** The Customer sets standing limits; the Agent can narrow them. Before each external send, AE checks the intended recipient, purpose and exact fields against those limits. AE records what was actually sent and separates content from purchase evidence. Normal permitted work requires no repeated privacy click.

**Current position:** AE has a useful foundation in [field-level Tool data-use declarations](../../src/modules/registry/tool-choice-contracts.ts), [Call approval context](../../convex/lib/capabilityExecution/callLifecycle/admissionApprovals.ts), Quote-bound input, owner status and payload-sparing application telemetry. These are **not** a complete privacy route: the earliest external sends, saved Customer/Agent privacy defaults, verified Provider handling terms, content expiry and live infrastructure settings still need work. Build on the existing Tool, Quote, Call and Account contracts rather than creating a second privacy workflow.

## The data paths we must control

These observations come from checked-in source. Provider contracts and deployed host, model, logging and backup settings have not been verified.

| Path | What source does today | Required decision |
| --- | --- | --- |
| Search | [Public search](../../src/routes/api.v1.market-tools.search.ts) can send a query and candidate summaries to [Jev reranking](../../src/modules/registry/tool-reranker.ts), which may use an external model. The `dataUse` filter describes Tool metadata, not the query's sensitivity. | Tell the user the matching route. An authenticated search applies Account limits; if external matching is disallowed, return useful local catalogue results. Public search uses stated public defaults, not an Account policy it cannot identify. |
| AE chat | [Chat](../../convex/lib/chat/generate/run.ts) uses [OpenRouter](../../src/modules/model-gateway/public.ts) and durable messages. The inspected gateway permits fallback without per-request Provider or retention limits. | Treat chat as a separate data route; identify possible and actual inference recipients. A model's handling terms never stand in for a Tool Provider's. |
| Quote | [`tool.quote`](../../src/modules/capability-execution/quote.ts) accepts Tool input. For x402, [price inspection](../../convex/lib/capabilityExecution/quotes/quoteAction.ts) can send mapped input to the Provider **before** a Quote exists. Committed Quotes store normalized input. | Apply the release rule and show recipient/field paths before the probe. If a permitted probe occurs but pricing fails, report that disclosure. |
| Call | [`tool.call`](../../src/modules/capability-execution/call-contracts.ts) sends Quote-bound input and stores input and result in [Call records](../../src/modules/capability-execution/internal/convex-schema.ts). | Recheck authority and the bound Provider, destination and terms; do not silently switch recipient. Report possible delivery after a timeout or retry under one Call identity. |
| Logs and money | [Gateway telemetry](../../src/lib/server/gateway-telemetry.ts) allowlists scalar data and [Sentry](../../src/lib/observability/sentry.server.ts) sanitizes events. Stripe, Formance and x402 handle payment facts; live settings remain unchecked. | Keep Tool content out of routine logs, analytics, ledger descriptions and public settlement data. Verify each live destination. |

### Who sees what

| Party | Current visibility and required limit |
| --- | --- |
| Customer and authorised Account users | [Call status](../../convex/lib/capabilityExecution/callLifecycle/callRecoveryActions.ts) and the [receipt view](../../src/components/ae/call-receipt/CallStatusViews.tsx) can show request and output. Billing-only access should show money and state without content. |
| AE systems and staff | AE stores full Quote input and Call input/result. Routine staff access should be transaction metadata; content access needs a support or incident reason, a time limit and an audit trail. Staff controls are not yet verified. |
| Selected Provider | Receives the mapped request at an x402 price probe and/or paid Call. It does not automatically receive the Agent's full conversation or AE credential; personal information can still be inside submitted fields. |
| Matcher or model provider | May receive search text or AE chat material. Fallback may add recipients. Actual endpoint, retention and logs require live evidence. |
| Payment parties and other market users | Payment parties need transaction facts, not Tool content. Other Customers and unrelated Providers should see only their own data or published Tool metadata. |

## Gap map and build sequence

| Move | Where AEcon is weak | Build on what exists | Proof and customer outcome |
| --- | --- | --- | --- |
| **Now: establish the truth** | Live model/provider fallback, host logs, backups, staff access and Provider contracts are unverified. The [Privacy Policy](../../src/components/ae/legal/privacy/privacy.contracts.ts) promises offer details that the current Quote does not show. | Inventory actual destinations and retained copies for search, chat, Quote, Call and payment. Correct any public claim ahead of the product. Record the owner and terms source for each external recipient. | A harmless test request can be traced through actual recipients and stores; the customer-facing statement matches the observed route. **This is needed before stronger public assurances.** |
| **First product change: control the first send** | Public search can use external matching without Account context; x402 inspection can send Tool fields before Quote. There is no saved privacy ceiling and Agent default for these paths. | Add authenticated search with Customer limits, Agent defaults and request filters; keep public search under published defaults. Apply the same effective rule before search matching and price inspection. Give an excluded Tool a reason and a route back to comparison. | An Agent gets useful local results when external matching is barred. A blocked search sends no query to a matcher; a blocked GET or POST Quote sends no Provider probe. Ordinary allowed requests continue without an extra approval. |
| **Next: make Tool choice and receipt trustworthy** | Current Tool `dataUse` describes field classes and purposes, but [unannotated imported fields can be labelled public](../../src/modules/capability-supply/internal/admit-provider-schema.ts); that is not proof about actual values or Provider retention. Provider location, onward use and training evidence are incomplete. | Extend existing Tool and Quote facts with Provider/endpoint, terms source, locations, retention/training status and review date. Treat missing evidence as unknown. Show “who gets what” in choice and Quote; bind the accepted recipient/version to Call and record actual release in status. | A changed Provider or term cannot inherit an old decision. The Customer can compare eligible Tools without reading a schema, and later see the actual recipient and fields even if a permitted price probe failed. |
| **In parallel: limit the copies and viewers** | Full Quote input and Call input/result are stored; no matching content purge was found. Account export is partial, and deployed support/billing access has not been demonstrated. | Separate payload from purchase facts; implement approved expiry and deletion across active stores/backups; limit billing and routine staff views to metadata and audit exceptional content access. | A deletion exercise removes eligible content but leaves justified purchase records. Billing-only, unrelated Account and unauthorised staff identities cannot read payload. The owner can see what remains and why. |

The first product change improves **buyer matching and purchase**: an Agent can search within its Customer's limits and reach an eligible Tool without repeated prompts. The Tool facts also improve **Provider distribution**: a Provider with verifiable handling terms can be discovered by buyers whose rules would otherwise exclude it. Completion is measured by the observed tests above, not a single privacy percentage.

**Proposed retention defaults for decision:** purge expired Quote input within 24 hours of expiry; purge Call input/output 30 days after final Purchase resolution, unless a disclosed choice or specific hold applies. These are design proposals, not current behavior or legal minimums. Keep financial records on their own lawful schedule; Australian tax records generally require at least [five years](https://www.ato.gov.au/api/public/content/0-28262f91-6835-40bb-a9fe-99ee7d0b7c72). An unresolved Call retains what is needed until resolved.

**Open owner decisions:** approve exact content and backup periods; decide which sensitive or secret-bearing routes AE will support initially; set the minimum evidence for Provider claims; inspect live recipients and logging; and get an entity-specific Australian legal review. Until those are resolved, describe unknown handling honestly and do not advertise a blanket “private,” “no retention” or Australian-only route.

## Explicit product feedback — 6 October 2026

Joel approved following Executor's v2 feedback pattern: an optional
`feedback.submit` action, instructions to use it when friction occurs, and
confirmed ingestion into the existing PostHog project. The reference is
[Executor's agent instructions](https://github.com/UsefulSoftwareCo/executor/blob/1e25fd4eee3fafe21e6fe6efe155c0ab01134ec2/packages/app-templates/executor/skills/executor/feedback.md)
and [submission implementation](https://github.com/UsefulSoftwareCo/executor/blob/1e25fd4eee3fafe21e6fe6efe155c0ab01134ec2/apps/hosted/cloud/src/implementation/product-analytics.ts).
This is distinct from the categorical Call usefulness feedback below.

**Requires:** an authenticated Agent credential and one explicitly submitted,
nonblank `message` of at most 10,000 characters. No caller-supplied identity,
Call payload, conversation, attachment or arbitrary analytics properties.
**Ensures:** `accepted` only after PostHog acknowledges ingestion. Only the
submitted text and server-derived pseudonymous attribution/version/environment
metadata are sent. Agents describe product friction without credentials,
personal information or Customer business data, then continue working.
**Invariant:** no Call, payment, refund, spending authority or usefulness vote
changes. No application feedback table or durable content queue is added.
**On violation:** authentication, input and rate-limit failures stop before
ingestion; disabled analytics returns `feedback_disabled`; a network failure,
non-success response or five-second deadline returns `feedback_unavailable`.

**Error and retry decision:** ingestion is the sole new mutation. It is not
idempotent; duplicate or concurrent submissions may produce separate events.
Make one attempt, with no automatic retry and no generated retry continuation.
A timeout cannot prove rejection, so the failure guarantees preserved product
state, not rollback at PostHog. The agent should skip unavailable feedback and
continue the original task. Expected transport failures become typed outcomes;
neither submitted text nor upstream error bodies enter diagnostic logs.

**Complexity decision:** keep one action schema/descriptor shared by HTTP, MCP
and CLI, their existing adapters, and one confirmed-send function beside the
current PostHog implementation. This adds transport registration but keeps
payload changes in one schema. The existing fire-and-forget capture helper and
installed SDK's error-swallowing `captureImmediate` cannot prove acceptance;
use Executor's direct batch-ingestion pattern. Reject a separate feedback
database, service layer, retry store and dashboard. Retention is the configured
PostHog project's policy, not the Call feedback table's 90-day policy.

**Verification:** exercise authorization, strict/oversized input, opt-out,
confirmed acceptance, rejected/delayed ingestion, independent concurrent
submissions, single-attempt failures, and equivalent CLI/MCP/HTTP outcomes.
Inspect the outbound event to establish that only explicit feedback text and
the allowed attribution are sent. Tests replace the external ingestion boundary;
they do not establish production PostHog delivery or retention.

## Approved alpha learning change — 4 October 2026

Joel approved 30-day Call content retention, disclosed founder review,
usefulness feedback and 90-day learning metrics that exclude content. This
section is the implementation contract; it is not deployment evidence.

**Thesis:** learn which purchases help the Customer's Agent continue, while
content expires independently of the permanent purchase and retry identities.
The design review uses the approved decision and source evidence directly;
no additional interview is needed. Conceptual integrity is strong if every
new field either bounds retained content or records a useful learning signal.

**Scope and cost decision.** Reuse the existing Call, Quote, procurement replay,
chat component, admin command and selection-decision paths. Add one bounded,
content-free feedback record per Account and Call; do not add an analytics
service, duplicate payload store, general privacy framework or training pipeline.
An explicit expired-content result and bounded cleanup are necessary complexity:
removing an entire Call or returning a fabricated output would either destroy
purchase evidence or make a replay unsafe. Use existing Convex transactions,
schedulers and component deletion APIs. Keep purchase reporting/refunds separate
from learning feedback.

The implementation proceeds in dependency order:

1. Model expired content while preserving completed delivery, receipts, amounts,
   original digests and idempotency. A consumed Quote must replay its Call using
   the stable references without needing deleted input.
2. Delete eligible copies through bounded, repeatable cleanup. Cover the Quote,
   Call, procurement cache, x402 attempt, consequence observation and associated
   chat messages/continuations. Preserve unresolved financial work. Use component
   APIs to remove message embeddings and file references as well as messages.
3. Add Account-scoped usefulness feedback and owner-admin content review through
   existing audited command admission. A review returns content only for the
   explicitly selected Call; it never stores content in the command receipt.
4. Explain the retention/review purpose before alpha use, show expired-content
   states, and expose recent failures and feedback in existing admin views.
5. Verify the behavior and native settings before publishing an operational
   retention claim or widening the current alpha audience.

| Boundary | Requires | Ensures | Invariant / on violation |
| --- | --- | --- | --- |
| Call expiry | Thirty days since final Purchase resolution, with no pending report, dispute, obligation reversal or recovery | Input/output and associated active-store copies are removed; completed delivery and money evidence remain readable | Unknown or unresolved state retains the required evidence and is surfaced for investigation. Expiry never issues a new Call, charge or payment. |
| Quote expiry | Unconsumed Quote expired for at least 24 hours, or its consumed Call is eligible for content expiry | Submitted input and content-bearing price-inspection material are removed | Original Quote identity and digests remain; the same consumed Quote can return the original expired-content Call. |
| Chat expiry | Turn is no longer generating, its content is at least 30 days old and linked purchases are eligible | Message content, component embeddings/file references and saved search continuation content are removed in bounded batches | An active generation or unresolved linked purchase blocks deletion. A cleanup retry resumes deletion and never resumes generation. Shared chat links reference the same retained messages; they hold no snapshot. |
| Learning feedback | Current authenticated Account owns the Call; choice and reason belong to bounded enums | One current usefulness choice per Account/Call, retained for 90 days | Duplicate/concurrent updates cannot create duplicate votes, leak another Account's Call or initiate a refund. No prompt, output or free-text comment is accepted. |
| Founder review | Current owner-admin membership, fresh normal admin command authority, a selected Call and bounded review reason | An audited, explicit content read whose command receipt contains only references and metadata | Support/reviewer roles and expired content cannot use this path. Replay cannot restore deleted content or bypass current membership and the review freshness bound. |
| Learning metrics | Existing content-free selection facts and feedback within the last 90 days | Recent no-match, failure, latency, cost and usefulness evidence for prioritisation | Customer content never enters the learning metrics. Financial/audit records remain governed separately and are not represented as deleted learning content. |
| Learning UI failure | An optional learning or review-access query rejects | The affected panel shows an explicit retry; the surrounding readiness, queues and Call receipt remain available | Review content stays closed on access failure. Retrying only remounts the failed panel and cannot issue a purchase or review command. |

**Type decision.** A completed Call has either its original output or an explicit
content-expiry timestamp, never both and never neither. Purchase state does not
become failed when content expires. Procurement replay has the equivalent
delivered-content distinction. Storage markers must not make an old command
appear unclaimed or allow a stale worker to restore purged content.

**Verification.** Exercise immediately before/at/after expiry; unresolved Calls,
pending refunds and disputed obligations; interrupted cleanup and duplicate or
concurrent runs; cached and direct Call replay after deletion; preserved receipt
and ledger references; Account and admin-role separation; stale review authority;
and absence of content in feedback, metrics and audit receipts. Verify every
known active copy, including the native chat component. Run the required project
checks and full release gate on the final integrated change.
The native scheduler drill exposed Convex's query-bound cursor requirement:
all pages now carry the sweep's fixed cutoff, while each transaction checks the
current purchase state. Content becoming old enough mid-sweep waits for the next
sweep. Invalid or incomplete checkpoints fail before deleting content. The
regression advances the clock between scheduled pages and verifies both cases.

**Material risks and cuts.** The greatest risks are secondary payload copies,
stale workers restoring them, and public copy overstating backup/recipient
deletion. Inspect those boundaries explicitly. Backups and independent model or
Tool Providers have separate retention; do not infer their deletion from an
application purge. Keep the existing honest limitation until native evidence
establishes a specific period. Cut free-text feedback, automatic model training,
cross-Customer content search and a new analytics dashboard from this change.
The smallest useful loop is a bounded review of failed/no-match/low-usefulness
cases, followed by a redacted regression case and a measured fix.

**Interface review.** Feedback sits beside the delivered result: three choices,
then one optional bounded reason for a negative response. The control saves the
choice directly and shows confirmation only after the server accepts it. A
separate sentence points to the existing answer-report flow for credit returns.
The founder opens one selected Call, chooses one of two reasons and uses the
existing MFA flow. Input and output stay collapsed until requested and disappear
when the review expires, the selected Call changes or the admin role is lost.
Keyed component state costs one small local component per control and removes
the risk of an old asynchronous response appearing against a new Call; keep it.
The overview labels its 50-record samples and displays at most five attention
links per category. It adds no new navigation, modal workflow or analytics store.
The existing error-boundary pattern contains failed learning and review-access
queries to their panels. Route tests reject each query, assert that operational
context remains visible and recover through the explicit retry control.

**Module audit.** The expected alpha changes are feedback categories, retention
periods and the criteria for founder investigation; existing authorization and
payment boundaries remain settled. The feedback contract exposes bounded domain
values while its server adapter hides signed request construction. Changing the
feedback database layout affects its Convex concern and schema, not callers;
changing a category deliberately affects the public contract and its UI label.
Retention concerns hide eligibility and traversal of payload copies; a period
change also requires the corresponding customer notice. The admin concern hides
receipt-safe content access behind the existing command protocol; replacing the
identity provider remains the security module's responsibility. No storage rows
or internal cleanup phase state cross these public entry points. Keep the two
feedback entry surfaces in the existing capability-execution module and place
data-aware admin controls beside the existing container panels, leaving the
presentation-only component folders pure.

**Source evidence.** The Call and chat retention tests exercise exact expiry,
unresolved-money holds, repeatable cleanup, interrupted native message deletion,
embeddings and file release. A delayed procurement completion returns an expired
result without restoring input, output or endpoint. The learning-control tests
exercise Account isolation, duplicate votes, 90-day deletion, admin-role/MFA
admission, ten-minute replay expiry, membership revocation, content-free audit
receipts and bounded metrics. Component tests cover lost-response retries,
selection changes, role loss, escaping and the review deadline. Deployment,
native cron operation, backups and independent recipients require separate
runtime evidence; these source tests do not establish their settings.

## Legal and standards basis

The [Australian Privacy Principles](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines) and the [OAIC Privacy Impact Assessment guide](https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/privacy-impact-assessments/guide-to-undertaking-privacy-impact-assessments) guide notice, minimisation, disclosure, overseas recipients, security, disposal and individual requests. Whether particular duties apply to AE needs legal review. A proportionate privacy impact assessment should map each new data path and be revisited when recipients, purposes or retention change.

Use the [NIST Privacy Framework](https://www.nist.gov/privacy-framework/privacy-framework) for current versus target outcomes; [ISO/IEC 29100](https://www.iso.org/standard/85938.html) for privacy roles and vocabulary; [ISO/IEC 27701](https://www.iso.org/standard/27701) for a privacy management programme; and [ISO/IEC 27001](https://www.iso.org/standard/27001) for security management. These references do not turn a source review into compliance or certification. Progress is measured by the acceptance evidence above, plus deployed and contractual checks.
