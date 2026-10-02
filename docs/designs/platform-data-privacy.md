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

**Status:** design authority, not a claim about deployment. **Reviewed:** 25 September 2026. This document governs data release, access and retention across the buyer and Provider journeys in [PRODUCT.md](../../PRODUCT.md#core-market-journeys). [The routing strategy](./2026-09-25-tool-market-routing-and-data-strategy.md) owns market choices; the [public Privacy Policy](../../src/components/ae/legal/privacy/privacy.contracts.ts) is the customer-facing statement.

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

## Legal and standards basis

The [Australian Privacy Principles](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines) and the [OAIC Privacy Impact Assessment guide](https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/privacy-impact-assessments/guide-to-undertaking-privacy-impact-assessments) guide notice, minimisation, disclosure, overseas recipients, security, disposal and individual requests. Whether particular duties apply to AE needs legal review. A proportionate privacy impact assessment should map each new data path and be revisited when recipients, purposes or retention change.

Use the [NIST Privacy Framework](https://www.nist.gov/privacy-framework/privacy-framework) for current versus target outcomes; [ISO/IEC 29100](https://www.iso.org/standard/85938.html) for privacy roles and vocabulary; [ISO/IEC 27701](https://www.iso.org/standard/27701) for a privacy management programme; and [ISO/IEC 27001](https://www.iso.org/standard/27001) for security management. These references do not turn a source review into compliance or certification. Progress is measured by the acceptance evidence above, plus deployed and contractual checks.
