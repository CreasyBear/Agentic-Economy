# Agent-engine commerce: what actually transacts with businesses

**Date:** 2026-07-31  
**Status:** Active evidence review  
**Question:** Do current agent-commerce protocols and OSS agents support `/` as a model-driven engine that can complete a hybrid instant/API plus asynchronous human-business job?  
**Decisions under test:** D1–D6 (defined below)  
**Evidence standard:** Primary sources only: protocol specifications, official documentation, official repositories/source code, and builder-authored engineering/product material. Claims about what is *not* shipped are bounded to the sources reviewed here; they are not a proof of global nonexistence.

## Executive judgment

The founder's shape is partly right but currently overclaims the evidence.

1. **Instant machine commerce is real and increasingly well-specified.** x402, AP2, ACP, UCP, Stripe's machine payments, Shopify's Storefront MCP, and DoorDash Drive all represent machine-readable offers or checkout state and provide some combination of signed authorization, expiry, idempotency, cancellation, receipts, or trusted UI handoff.
2. **Those protocols are not asynchronous human-business inquiry protocols.** They model API-readable catalog, quote, cart, checkout, payment, fulfillment, and escalation. Their escalation usually means *hand the buyer to a trusted UI*, not “send an email or call a business, wait hours, parse a reply, negotiate, retry, and convert a reply into a commitment.”
3. **OSS agents demonstrate the pieces, not the end-to-end job loop.** The reviewed appointment agent books a calendar slot, creates a Gmail draft, and calls the user after booking; its retry/cron/time-zone stories remain pending. LangChain's ambient email agent requires human review and uses mock email/calendar tools. AIReceptionist is an inbound business receptionist with background notification retries, not a demand-side buyer agent. Browser Use is a generic browser executor and its examples do not establish reservation/hold/commitment semantics.
4. **The strongest disconfirming result:** no reviewed OSS source demonstrates a demand-side agent that discovers an arbitrary real business, sends an asynchronous inquiry by email/phone, receives and interprets a business response, survives a pause/expiry, and completes a durable offer → hold → confirmation loop with a commitment receipt. This is a negative finding within this review set, not a universal market claim.
5. **Recommendation:** keep the agent loop, but make it a bounded planner over a deterministic effect/authority kernel. Treat asynchronous inquiry as a first-class durable job capability, not as “the model keeps running.” For the first implementation, ship structured business APIs and one explicit inquiry adapter; do not claim that UCP/ACP/x402 supply the human-business side.

## The decisions under test

- **D1 — Agent engine:** `/` becomes a model-driven loop (understand → investigate → act on businesses → revise → complete), replacing classification → predefined-route orchestration.
- **D2 — Safety kernel:** deterministic routing is demoted to identity, authority, spend limits, idempotency, effects, evidence, and recovery; the model owns planning/action selection.
- **D3 — Authority:** the agent explores freely (search/compare/ask businesses); the person approves only effects (commitments, payments, sensitive disclosure).
- **D4 — Supply hybrid:** instant machine-callable endpoints and asynchronous human-business inquiries can coexist in one plan; async chase/notify is the product.
- **D5 — Contact timing:** capture contact at the first asynchronous effect, rather than up front.
- **D6 — Interaction style:** act first and ask when blocked, using strong defaults and minimal questions.

## AE context and evidence boundary

AE's source of truth is TanStack Start + Convex. Its registered action registry is the tool surface, answer threads (SSE) are the conversation spine, OpenRouter supplies LLM access, Clerk keys/OAuth device flow supply agent authority, and T12 supplies the credit ledger. AE does not currently have Temporal or queue infrastructure. Therefore “async” must mean a durable Convex state machine plus a scheduler/lease/retry mechanism, not a process that remains in memory. This is an architectural implication from the supplied stack context, not an external-source claim.

## 1. x402: payment authorization, not a commerce commitment protocol

### Primary sources

- Coinbase x402 v2 core specification: <https://github.com/coinbase/x402/blob/main/specs/x402-specification-v2.md>
- x402 v2 HTTP transport: <https://github.com/coinbase/x402/blob/main/specs/transports-v2/http.md>
- Current implementation-level EVM `upto` scheme: <https://github.com/coinbase/x402/blob/main/go/mechanisms/evm/upto/README.md>
- Stripe machine payments, including x402 support: <https://docs.stripe.com/payments/machine.md>

### Findings

- The v2 core flow is request → HTTP 402/payment requirements → signed payment authorization → verification and blockchain settlement. The core schema carries a resource URL/description, accepted scheme/network/amount/asset/pay-to address, and `maxTimeoutSeconds`; the example exact EVM authorization includes `validAfter`, `validBefore`, and a random `nonce`.
- Exact EVM verification is deliberately deterministic: signature validation, balance, exact amount, time window, parameter matching, and transaction simulation are required before settlement. The spec explicitly puts client-side budget management and session handling out of scope.
- The current repository also contains an implementation-level EVM `upto` scheme: the client authorizes a maximum amount, the server settles only actual usage, and the signed Permit2 witness binds settlement to a facilitator address. This is a bounded spend authorization, not a reservation of inventory or a hold on a business offer.
- x402's “expiry” is payment validity/settlement timing (`maxTimeoutSeconds`, `validBefore`), not a merchant's hold TTL. Its replay defense is nonce plus validity-window checking; the core does not define a general HTTP idempotency key or long-lived checkout/session state.
- Stripe positions x402 alongside its Machine Payments Protocol for agent-to-service/API pay-per-invocation. The official machine-payments page describes paying for API calls/resources and lists x402 on Base; it does not describe an email/phone inquiry or business negotiation path.

### Commitment model

| Stage | x402 reality |
|---|---|
| Offer | Resource server advertises a payment requirement and price. |
| Hold | None in the core flow; a payment authorization window is not an inventory hold. |
| Confirm | Client signs authorization; facilitator verifies and settles; server returns settlement evidence. |
| Expiry | `maxTimeoutSeconds`, `validAfter`, `validBefore`; nonce prevents replay. |
| Idempotency | Replay prevention via nonce/time checks; no general business-order idempotency/hold state in the core spec. |
| Trust gate | Deterministic facilitator checks signature, payer balance, amount, recipient, time, parameters, and transaction simulation. |

### Implications for AE

- **D1 — REFINES:** A model can discover a paid tool and decide whether to call it, but x402 still requires a deterministic verification/settlement boundary; this is not evidence that the model should own payment mechanics.
- **D2 — SUPPORTS:** x402 is almost a direct example of the safety kernel: signed authority, bounded amount, recipient, expiry, nonce, verification, and settlement evidence must remain outside the model.
- **D3 — REFINES:** “Approve effects” maps cleanly to signing a scoped payment authorization. Free exploration is only safe before the payment effect and within explicit spend limits.
- **D4 — CONTRADICTS (human side):** x402 adds instant machine payment, not asynchronous business inquiry or a durable chase loop.
- **D5 — REFINES:** Contact is irrelevant to x402's payment boundary; an AE inquiry adapter still needs separate contact-disclosure semantics.
- **D6 — SUPPORTS for low-risk tools / CONTRADICTS for money:** act-first can work for a priced read or quote, but payment authorization must be explicit and bounded.

### Skip list

- **Do not copy x402 as an offer/hold/order model.** It protects a paid resource request, not inventory, appointment, or a merchant quote.
- **Do not treat `validBefore` as a reservation.** It limits signature validity; it does not guarantee the business will retain capacity.
- **Do not assume `upto` means open-ended agent spend.** It authorizes a maximum and settles actual usage only within the facilitator- and protocol-defined boundary.

## 2. Google AP2: signed mandates and receipts, with deterministic verification

### Primary sources

- AP2 repository and samples: <https://github.com/google-agentic-commerce/AP2>
- AP2 v0.2 specification: <https://github.com/google-agentic-commerce/AP2/blob/main/docs/ap2/specification.md>
- Checkout Mandate: <https://github.com/google-agentic-commerce/AP2/blob/main/docs/ap2/checkout_mandate.md>
- UCP AP2 Mandates extension: <https://ucp.dev/specification/ap2-mandates/>

### Findings

- AP2 is explicitly a payment-security protocol within a commerce protocol. Catalogs, checkout updates, and inter-role communication are outside AP2's scope; it is not itself a business-inquiry protocol.
- AP2 separates Shopping Agent, Credential Provider, Merchant, Merchant Payment Processor, and Trusted Surface roles. The Trusted Surface **must** be non-agentic and is responsible for informed user consent before signing a mandate. Validation/processing at every role **must** happen in deterministic code even when a role also uses an LLM.
- The core commitment artifacts are a merchant-signed Checkout JWT, a Checkout Mandate proving authorization for the checkout, a linked Payment Mandate proving authorization to pay that checkout, and signed Checkout/Payment Receipts. The checkout and payment mandates are cryptographically bound.
- In the autonomous (“Human Not Present”) mode, a user authorizes open mandates containing constraints; the agent creates closed transaction-specific mandates and signs them with an agent key. Open mandates should use the smallest useful `exp`. An agent must not present another open checkout/payment mandate without a rejection receipt for the previous one, preventing one approval from silently authorizing multiple alternatives.
- AP2's evidence model is stronger than a chat transcript: mandates and receipts can be joined later as non-repudiable dispute evidence. However, the spec notes that automated mandate retrieval is still a future utility and that mandate-to-agent delegation is outside the current version.
- The UCP AP2 extension makes the binding concrete: the business signs checkout state, the platform supplies signed checkout/payment mandates at completion, both sides become “security locked,” and the checkout's default expiry is six hours if no `expires_at` is supplied. The extension uses ES signatures, JCS canonicalization, and SD-JWT credentials.

### Commitment model

| Stage | AP2 reality |
|---|---|
| Offer | Merchant-signed Checkout object/JWT with terms and line items. |
| Hold | A checkout/mandate can have an expiry, but AP2 does not mandate inventory reservation semantics. The default UCP AP2 session TTL is six hours. |
| Confirm | Closed Checkout Mandate + Payment Mandate are verified; Merchant/MPP return signed receipts. |
| Expiry | `exp` on open mandates is recommended to be as short as possible; UCP AP2 defaults `expires_at` to six hours when omitted. |
| Idempotency / duplicate defense | Closed/open binding, transaction identifiers, receipts, and the rule requiring a rejection receipt before another open mandate; this is not a generic REST idempotency-key contract. |
| Trust gate | Non-agentic Trusted Surface consent, merchant-signed terms, scoped constraints, agent key binding, deterministic verification, selective disclosure, signed receipts. |

### Implications for AE

- **D1 — REFINES:** AP2 allows a shopping agent to assemble and revise a checkout, but the final path is a typed mandate/receipt transition, not an unconstrained model loop. The model may plan; deterministic code must validate.
- **D2 — SUPPORTS:** AP2 directly requires the split: model-driven shopping can sit above deterministic identity/constraint/signature/receipt verification.
- **D3 — SUPPORTS with a hard qualification:** autonomous operation can avoid a fresh click for every closed checkout, but only within user-signed constraints and merchant verification. “Freely” must not mean unconstrained disclosure, merchant choice, line-item choice, or spend.
- **D4 — CONTRADICTS (async human-business claim):** AP2 secures a checkout/payment transaction; it does not define a mailbox, call, reply, negotiation, retry, or human business operator loop.
- **D5 — REFINES:** AP2/UCP can progressively disclose only the constraints needed to evaluate the closed mandate. This supports delayed disclosure, but the first business-facing disclosure still needs explicit policy and evidence.
- **D6 — REFINES:** defaults are acceptable while assembling a checkout inside the mandate constraints; final commitment still requires a Trusted Surface or a valid autonomous mandate. “Ask when blocked” needs a rejection receipt/constraint failure, not just model uncertainty.

### Skip list

- **Do not import AP2's mandate vocabulary without its verifier/receipt discipline.** A JSON “approval” in an answer thread is not equivalent to a signed, bound mandate.
- **Do not treat AP2 autonomous mode as blanket user delegation.** It is bounded by open mandates, constraints, expiry, selective disclosure, and merchant/payment-processor checks.
- **Do not assume AP2 solves async contact.** The protocol's own boundary says commerce APIs and communication details are outside scope.

## 3. OpenAI ACP / Instant Checkout: stateful checkout with explicit user control

### Primary sources

- OpenAI Instant Checkout launch (29 September 2025): <https://openai.com/index/buy-it-in-chatgpt/>
- ACP repository/README: <https://github.com/agentic-commerce-protocol/agentic-commerce-protocol>
- ACP 2026-04-17 checkout OpenAPI: <https://github.com/agentic-commerce-protocol/agentic-commerce-protocol/blob/main/spec/2026-04-17/openapi/openapi.agentic_checkout.yaml>
- Stripe ACP overview: <https://docs.stripe.com/agentic-commerce.md>

### Findings

- OpenAI's launch describes Instant Checkout as a merchant-controlled checkout integration. At launch, U.S. Free/Plus/Pro users could buy from U.S. Etsy sellers in chat; Shopify merchants were described as coming soon. OpenAI says the merchant remains merchant of record and continues to handle orders, payment, fulfillment, returns, support, and customer relationship.
- The product flow is not “agent acts without a user”: users tap Buy, confirm order/shipping/payment details, and complete the purchase. OpenAI's trust claims say users explicitly confirm each step; payment tokens are authorized for specific amounts and merchants; only required data is shared with permission.
- The ACP OpenAPI models a real state machine: create authoritative checkout session, update it, retrieve it, complete it, or cancel it. `complete` must create an order and return a completed state on success.
- Every POST requires an `Idempotency-Key`, scoped to authenticated identity plus endpoint. The spec defines replayed responses, 409 in-flight collisions with `Retry-After`, and 422 idempotency conflicts when the same key is reused with a different body. This is one of the clearest machine-commerce commitments in the reviewed sources.
- Sessions carry `expires_at` and, where quote-backed, `quote_expires_at`. Statuses include `incomplete`, `requires_escalation`, `authentication_required`, `pending_approval`, `ready_for_payment`, `complete_in_progress`, `completed`, `canceled`, and `expired`. `requires_escalation` is a handoff, not an asynchronous inquiry queue.
- Buyer and fulfillment details can be optional when creating a session, but the merchant may return a recoverable missing-field message (for example, buyer email). The agent updates the authoritative session and retries. This provides a concrete “ask only when blocked” loop for machine-readable missing data.
- Stripe currently labels agentic commerce “private preview.” Its official overview separates UCP/ACP commerce checkout from MPP/x402 machine payments and describes agents as presenting feeds, managing carts/checkout, and accepting payments—not contacting arbitrary businesses by email or telephone.

### Commitment model

| Stage | ACP reality |
|---|---|
| Offer | Create returns a rich, authoritative cart/checkout state with line items, totals, fulfillment, messages, and merchant terms. |
| Hold | Checkout session and quote state can expire; the spec does not promise inventory reservation merely because a session exists. |
| Confirm | `POST /checkout_sessions/{id}/complete` creates the order; response includes completed session and order. |
| Expiry | `expires_at` and `quote_expires_at`; session can become `expired`/`canceled`. |
| Idempotency | Required key on every POST; replay, in-flight collision, and payload conflict are specified. |
| Trust gate | Authenticated merchant API, scoped payment data, user confirmation in Instant Checkout, merchant remains MoR; optional request signature/timestamp headers exist in the API shape. |

### Implications for AE

- **D1 — SUPPORTS the loop / REFINES the boundary:** ACP shows a useful model loop—create, inspect authoritative state, resolve a missing field, update, re-evaluate, complete—but the model must follow protocol statuses rather than inventing state.
- **D2 — SUPPORTS:** idempotency, expiry, replay, in-flight collision, and completion are deterministic kernel responsibilities.
- **D3 — CONTRADICTS “approval only for effects” if interpreted too narrowly:** the production Instant Checkout UX explicitly confirms order, shipping, and payment details. A model cannot silently choose final details merely because the user previously stated a broad goal.
- **D4 — REFINES:** ACP supplies instant API checkout and a buyer handoff (`requires_escalation`/continue path), not a business operator who replies asynchronously. Hybrid AE needs another adapter and durable job state.
- **D5 — SUPPORTS with conditions:** buyer details can be progressively added to a session, but a merchant can require contact before completion; do not collect contact merely because the agent might someday need it, and do not disclose it before the business boundary requires it.
- **D6 — SUPPORTS for recoverable machine errors / CONTRADICTS for checkout completion:** automatically fix invalid or missing fields when safe; ask for buyer input/review or confirm before final order placement.

### Skip list

- **Do not copy ACP's checkout session as a business inquiry object.** A session has merchant-defined API state and expiry; it does not carry a reply thread, human SLA, or negotiation transcript.
- **Do not infer universal production scale from the launch post.** Its merchant and user availability statements are a dated product announcement; the ACP repository remains an open protocol and Stripe labels the broader agentic commerce product private preview.
- **Do not remove confirmation because ACP has idempotency.** Idempotency prevents duplicate effects; it does not establish user intent for an incorrect or newly changed order.

## 4. UCP: explicit state transitions, recoverable errors, and trusted escalation

### Primary sources

- UCP Checkout capability (canonical current page): <https://ucp.dev/specification/checkout/>
- UCP REST binding: <https://ucp.dev/specification/checkout-rest/>
- UCP AP2 Mandates extension: <https://ucp.dev/specification/ap2-mandates/>

### Findings

- UCP's standard Checkout capability is intentionally conservative: checkout must be finalized manually by the user through a trusted UI unless the AP2 Mandates extension is supported. The business remains Merchant of Record.
- UCP defines a clean status machine: `incomplete` ↔ `requires_escalation` → `ready_for_complete` → `complete_in_progress` → `completed`; `canceled` represents an invalid/expired session and can occur from any state. A `continue_url` supports buyer handoff.
- UCP's `messages` are more actionable than generic error text. `recoverable` means the platform should update the resource and retry; `requires_buyer_input` means the API lacks needed information; `requires_buyer_review` means buyer authorization is required; `unrecoverable` means start a new resource or hand off. The spec gives a prioritized algorithm: resolve unrecoverable/recoverable problems first, then hand off for buyer input/review.
- The examples include invalid phone, delivery scheduling, and high-value-order review in one response. That is a useful machine-readable “blocked” model, but not an email/phone conversation with the business.
- UCP makes buyer fields progressively constructible: the REST binding says all `buyer` fields are optional and clients can build checkout state across calls. The profile example also shows a missing buyer email returned as a recoverable error. This is direct support for collecting contact when required rather than globally up front.
- Eligibility claims are explicitly untrusted until resolved at completion. Businesses can provisionally apply a claim, but accepted claims must be verified or rescinded; otherwise completion returns `eligibility_invalid`. This is an anti-fraud/anti-misrepresentation gate, not an LLM judgment.
- The AP2 extension turns UCP into a cryptographically bound agreement: businesses sign checkout terms and platforms present signed checkout/payment mandates at completion. Once capability intersection activates it, neither party may revert to an unprotected checkout.

### Commitment model

| Stage | UCP reality |
|---|---|
| Offer | Checkout session with authoritative line items, totals, payment/fulfillment options, terms, messages, and business-selected status. |
| Hold | Session can expire/cancel; UCP does not, in the base capability, guarantee that a checkout reserves stock or appointment capacity. |
| Confirm | User completes via trusted UI in base UCP; AP2 extension permits programmatic complete with cryptographic mandates. |
| Expiry | `canceled` covers invalid/expired sessions; AP2 checkout example specifies a six-hour default when `expires_at` is omitted. |
| Idempotency | The reviewed UCP capability/REST pages define create/get/update/complete/cancel and status/error semantics; they do not establish ACP's universal required idempotency-key contract. Treat retries as a provider binding concern unless the business advertises one. |
| Trust gate | Trusted UI, business-controlled state/messages, HTTPS/TLS, AP2 business signature and mandates, and completion-time eligibility verification. |

### Implications for AE

- **D1 — SUPPORTS:** UCP's status/error algorithm is a protocol-native revision loop. The model can choose the next action from structured messages, but it should not bypass the state machine.
- **D2 — SUPPORTS strongly:** status transitions, recoverability, buyer handoff, signature checks, eligibility resolution, and expiry belong in deterministic code.
- **D3 — REFINES:** autonomous effects are possible only with AP2 mandates; base UCP expects trusted UI. Sensitive disclosures and high-value/review conditions are explicit blockers.
- **D4 — CONTRADICTS the asserted async product claim:** `requires_escalation` is buyer handoff via `continue_url`, not an asynchronous business response job. UCP composes machine commerce with a human UI, not human business operations.
- **D5 — SUPPORTS:** progressive buyer/contact fields and non-identifying context permit delayed disclosure. The boundary is “when the merchant needs it,” not automatically “at account creation.”
- **D6 — SUPPORTS:** resolve recoverable errors automatically and ask only for `requires_buyer_input`/`requires_buyer_review`; **CONTRADICTS** silent final completion in the base capability.

### Skip list

- **Do not call `requires_escalation` an async job.** It is an instruction to hand off via a URL, with no business-side reply lifecycle.
- **Do not treat UCP's status machine as an inventory hold.** The spec describes session expiry and order completion, not universal reservation guarantees.
- **Do not trust buyer-asserted eligibility.** UCP explicitly says claims are not facts and must be verified or rescinded before completion.

## 5. Stripe agent toolkits and machine payments: excellent tooling, no human-business lane

### Primary sources

- Stripe agents overview: <https://docs.stripe.com/agents.md>
- Stripe official agent toolkit repository: <https://github.com/stripe/agent-toolkit>
- Stripe remote MCP documentation: <https://docs.stripe.com/mcp.md>
- Stripe agentic commerce overview: <https://docs.stripe.com/agentic-commerce.md>
- Stripe machine payments: <https://docs.stripe.com/payments/machine.md>

### Findings

- Stripe's toolkit is infrastructure for agents building on Stripe: a remote OAuth-protected MCP server, agent skills, CLI, billing SDKs, and token metering. The official repository describes it as SDKs and tools for Stripe resources; it is not a buyer-to-arbitrary-business inquiry agent.
- Stripe's agentic-commerce overview separates “sell through agents” (catalog + checkout using UCP/ACP) from “accept machine payments” (MPP/x402). This is a useful supply-side capability matrix: agents can browse feeds, embed checkout, share payment credentials, or pay for a machine resource, depending on the integration.
- Stripe labels agents in its agentic-commerce product as Private Preview. The docs emphasize product feeds, cart/checkout, payment credentials, and seller onboarding. They do not promise email replies, phone calls, negotiation, or cross-business chasing.
- Stripe's seller docs are operationally revealing: inventory feeds run every 15 minutes, pricing feeds every 15 minutes, and stale feeds cause purchase failures. Imports are asynchronous and observable via polling/webhooks with terminal states; upload URLs and error-file URLs expire after five minutes. This is asynchronous infrastructure, but it is feed ingestion, not a human negotiation loop.
- Stripe's machine-payments page positions x402/MPP for pay-per-use services and API calls. Refunds and settlement exist, but this is still machine-to-machine resource access.

### Implications for AE

- **D1 — REFINES:** Stripe tooling can make the model's tool surface broad and machine-readable, but the actual effect protocol remains a typed checkout/payment API.
- **D2 — SUPPORTS:** OAuth, restricted keys, feed validation, webhooks, expiry, and payment protocol boundaries are kernel concerns; an LLM should not receive unrestricted Stripe credentials.
- **D3 — SUPPORTS for scoped commerce / CONTRADICTS unrestricted exploration:** products and carts are agent-facing, but payment credentials and seller authorization remain scoped; merchant onboarding/approval is explicit.
- **D4 — CONTRADICTS the human-business side:** Stripe's “async” examples are imports, polling, and webhooks, not a customer agent asking a human operator for a special quote.
- **D5 — REFINES:** catalog feeds can be public/low-sensitivity while payment/contact data enters later; use progressive disclosure, but observe seller-required fields before completion.
- **D6 — SUPPORTS:** stale feed/errors can be retried deterministically; money and checkout effects still need explicit confirmation/authority.

### Skip list

- **Do not equate an MCP server with a job system.** Tool discovery and OAuth do not create durable retries, SLA tracking, reply correlation, or escalation ownership.
- **Do not treat feed-import asynchronous state as business inquiry evidence.** It is provider-controlled ingestion with polling/webhooks and known terminal states.
- **Do not expose Stripe secret/restricted keys to the model as the safety boundary.** Keep scopes and effect authorization in deterministic code.

## 6. Marketplaces and agent-callable supply

### 6.1 Shopify Storefront MCP and UCP Catalog

**Primary source:** <https://shopify.dev/docs/apps/build/storefront-mcp/servers/storefront>

#### Findings

- Shopify exposes per-store Storefront MCP endpoints. Its UCP Catalog tools are `search_catalog`, `lookup_catalog`, and `get_product`; standard tools include `get_cart`, `update_cart`, and policy/FAQ search.
- UCP Catalog requests require an agent profile in request metadata. The standard Storefront MCP endpoint is described as unauthenticated, while individual stores may restrict access. Catalog discovery is therefore machine-readable and progressively scoped, but it is not equivalent to effect authority.
- Shopify describes the flow as browse products → manage cart → shopper completes checkout. The docs do not define a universal catalog-level hold, appointment reservation, business email thread, or negotiation protocol.

#### Implications for AE

- **D1 — SUPPORTS:** catalog search and cart tools are natural model-planning inputs.
- **D2 — SUPPORTS:** split anonymous/read catalog tools from authenticated effect tools; retain deterministic merchant/profile/checkout boundaries.
- **D3 — REFINES:** free comparison is reasonable for catalog reads; payment/checkout remains a separate authority tier.
- **D4 — CONTRADICTS async-human supply:** this is instant structured supply, not an operator inquiry.
- **D5 — SUPPORTS:** do not ask for contact before product discovery; collect it when checkout/fulfillment needs it.
- **D6 — SUPPORTS:** search and policy questions can proceed with defaults; ask for variant/fulfillment details only when the API blocks.

#### Skip list

- **Do not assume cart state is a hold.** Shopify's Storefront MCP page does not promise inventory reservation or a TTL for a cart.
- **Do not copy unauthenticated catalog access to effectful tools.** The docs distinguish catalog/profile metadata from cart/checkout behavior.

### 6.2 DoorDash Drive quote → accept

**Primary sources:**

- Quote workflow: <https://developer.doordash.com/en-US/docs/drive/how_to/quote_deliveries/>
- Drive API reference: <https://developer.doordash.com/en-US/api/drive/>

#### Findings

- DoorDash's recommended workflow is `POST /drive/v2/quotes` to check serviceability, delivery fee, and time estimates, then `POST /drive/v2/quotes/{external_delivery_id}/accept` if acceptable.
- The quote must be accepted within **five minutes**. This is a concrete offer/short-lived hold-like transition, although the docs describe it as quote acceptance rather than a universal inventory reservation.
- `external_delivery_id` is caller-generated and reused for the delivery. The API documents duplicate-ID responses and advises retrying with the same ID or retrieving the delivery if the client did not receive the response. This is practical idempotent effect handling.
- Delivery requests include contact details, notification preferences, E.164 phone requirements, and optional proof controls such as PIN, signature, photo, and identity verification. These are business/fulfillment trust gates, not LLM policy.

#### Commitment model

| Stage | DoorDash reality |
|---|---|
| Offer | Quote with serviceability, fee, ETA, and delivery details. |
| Hold | Quote acceptance window is five minutes; it is not documented as a generalized stock/appointment hold. |
| Confirm | Accept quote creates a delivery with status `created` and tracking URL. |
| Expiry | Quote acceptance deadline; request also has delivery `expires_by` fields for fulfillment. |
| Idempotency | Caller-generated `external_delivery_id`, duplicate detection, retry/retrieve guidance. |
| Trust gate | API credentials plus contact validation and optional PIN/signature/photo/identity verification. |

#### Implications for AE

- **D1 — SUPPORTS:** quote → inspect → accept is a compact provider-specific job loop.
- **D2 — SUPPORTS:** effect key, duplicate handling, quote TTL, status retrieval, and proof-of-delivery belong in the deterministic kernel.
- **D3 — REFINES:** the agent can compare/quote freely; accepting the quote is a commitment and needs the user's authority policy.
- **D4 — SUPPORTS only the machine half:** this is a real supply endpoint but has no human operator inquiry path.
- **D5 — REFINES:** contact is required by the delivery effect; capture it at the first provider call that needs it, not necessarily at conversation start.
- **D6 — SUPPORTS:** ask for contact/address only when quote creation needs it; do not accept without the user's permitted commitment policy.

#### Skip list

- **Do not generalize a five-minute delivery quote to all commerce.** It is DoorDash-specific and does not establish inventory/appointment hold semantics elsewhere.
- **Do not omit the provider ID on retries.** Reissuing an accept with a new ID risks a duplicate delivery.

### 6.3 FlySoar: distribution and offer identity, not booking completion

**Primary sources:**

- Repository snapshot reviewed in the earlier source study: <https://github.com/Gahnxd/flysoar-cli/tree/3abe6f19>
- CLI README: <https://raw.githubusercontent.com/Gahnxd/flysoar-cli/3abe6f19/README.md>
- CLI models: <https://raw.githubusercontent.com/Gahnxd/flysoar-cli/3abe6f19/src/models.rs>
- Machine-facing guidance: <https://raw.githubusercontent.com/Gahnxd/flysoar-cli/3abe6f19/SKILL.md>

#### Findings

- The CLI's public search is keyless and returns SSE offer events. Offers include IDs, prices/conditions, and `expires_at`; the CLI is intentionally search-only and its machine guidance tells agents to report results without booking.
- Booking and management are a separate OAuth-protected MCP host with progressive tool scopes. The source study found public search tools separated from booking/read/write/cancel scopes and an explicit “quote does not cancel” boundary.
- This split is an excellent distribution/authority pattern: anonymous read/compare first, OAuth-scoped effects later. It is not evidence that the CLI itself completes a booking, and it is not an asynchronous human-business inquiry loop.

#### Implications for AE

- **D1 — SUPPORTS:** streamed offers and a later select → quote/refresh → book loop give the model useful planning state.
- **D2 — SUPPORTS strongly:** progressive OAuth scopes, durable offer identity, refresh, explicit booking, and manage/cancel are exactly safety-kernel seams.
- **D3 — SUPPORTS:** exploration can be anonymous; booking requires a stronger authority tier.
- **D4 — CONTRADICTS the “one hybrid loop already exists” reading:** Soar splits stateless search and server-side booking; no CLI async chase is shown.
- **D5 — SUPPORTS:** no contact/auth for search; identity and traveler data are introduced only when booking needs them.
- **D6 — SUPPORTS:** search can act first; booking needs explicit readiness/authority and must not silently cross tiers.

#### Skip list

- **Do not copy authless effectful endpoints or user-agent/header spoofing.** The CLI's read-only distribution shape is useful; its network quirks and no-auth effects are not.
- **Do not strip offer IDs/conditions from AE's evidence trail.** A model needs offer identity, expiry, and conditions to make/replay a sound decision.

## 7. Async-human side: what OSS actually demonstrates

### 7.1 Appointment Booking Agents (LangGraph + Composio + calendar/Gmail/telephony)

**Primary sources:**

- README: <https://github.com/mjunaidca/appointment-agent/blob/main/README.md>
- State graph: <https://github.com/mjunaidca/appointment-agent/blob/main/src/appointment_agent/graph.py>
- Tool wiring: <https://github.com/mjunaidca/appointment-agent/blob/main/src/appointment_agent/nodes/_tools.py>
- Confirmation call tool: <https://github.com/mjunaidca/appointment-agent/blob/main/src/appointment_agent/tools/make_confirmation_call.py>
- Prompt: <https://github.com/mjunaidca/appointment-agent/blob/main/src/appointment_agent/prompts.py>

#### Findings

- The project is an AI dental appointment agent. Its graph loops an LLM node through a calendar availability node and a tool node. Tool wiring includes Google Calendar free-slot lookup, Calendar event creation, Gmail email-draft creation, and a Bland outbound confirmation call.
- The prompt requires asking the user for a preferred date/time, checking availability, offering close alternatives, obtaining explicit user agreement on a specific slot, creating the event, drafting a confirmation email, and asking for a phone number after booking for the confirmation call.
- The README marks “cron job to schedule calls,” timezone handling, business active hours, queue/wait-time flow, and retry when email/phone fails as pending user stories. This is unusually useful disconfirming evidence: the visible prototype's happy path is not a durable async business loop.
- The “business” is represented by a configured Google Calendar and Gmail account, not an arbitrary business operator who responds with a counter-offer. The confirmation call is made to the user after the appointment is already booked, not to a business to negotiate a slot.
- The call function is a direct HTTP POST to Bland and returns JSON; the reviewed function does not show an AE-style effect key, retry state, or durable attempt record.

#### Implications for AE

- **D1 — SUPPORTS the loop shape but not the job-loop claim:** this is a genuine LLM → tool → LLM loop for a bounded vertical; it stops at Calendar/Gmail effects and does not prove cross-channel completion.
- **D2 — REFINES:** explicit graph routing is not the enemy; deterministic tool boundaries and effect recovery are still needed. The prototype's missing cron/retry/idempotency illustrates why.
- **D3 — SUPPORTS:** explicit user confirmation before calendar booking is a clean effect gate. It does not support unrestricted agent approval of commitments.
- **D4 — CONTRADICTS the async-human claim:** no business reply, chase, or human operator appears; only API/calendar state and a post-booking user call.
- **D5 — SUPPORTS:** email is requested only if needed, and phone is requested after booking for confirmation. This is progressive contact, though the project does not establish a generalized privacy policy.
- **D6 — REFINES:** strong defaults and alternative slots reduce questions; explicit agreement remains required before the booking effect.

#### Skip list

- **Do not present a vertical happy path as general business negotiation.** Calendar availability is a structured read; it is not a human counterparty.
- **Do not copy direct outbound calls without call authorization, idempotency, consent, and failure handling.** The source's pending stories explicitly acknowledge these gaps.
- **Do not infer production durability from LangGraph graph compilation.** The graph is an orchestration shape; durable scheduling/retry requires deployment infrastructure and state semantics.

### 7.2 LangGraph ambient email agent: human approval and mock tools

**Primary sources:**

- Repository README: <https://github.com/langchain-ai/ambient-agent-101/blob/main/README.md>
- HITL implementation: <https://github.com/langchain-ai/ambient-agent-101/blob/main/src/email_assistant/email_assistant_hitl.py>
- LangGraph interrupt documentation: <https://docs.langchain.com/oss/python/langgraph/interrupts>

#### Findings

- The tutorial builds an ambient Gmail assistant with triage, response, human-in-the-loop, and memory sections. Its README explicitly says the initial email/calendar tools are mocks; Gmail integration is a separate setup path.
- The HITL source places `write_email`, `schedule_meeting`, and `Question` behind an interrupt. A user can accept, edit, respond with feedback, or ignore. Read/search-like tools can execute without interruption.
- LangGraph interrupts persist graph state and wait indefinitely until resumed when a persistence layer is configured. That is a sound pause/resume primitive, but it is not automatically a queue, SLA tracker, provider retry system, or business reply parser.

#### Implications for AE

- **D1 — SUPPORTS:** model-driven tool selection plus iterative state is proven as a useful OSS pattern.
- **D2 — SUPPORTS:** deterministic interrupt/effect handling is the right seam; the LLM proposes a tool call, but a policy gate controls it.
- **D3 — SUPPORTS strongly:** human review is placed exactly around outbound email and meeting effects, with edit/accept/ignore semantics.
- **D4 — CONTRADICTS:** the tutorial handles a user's email inbox and mocked tools; it does not show an agent independently negotiating with a business.
- **D5 — REFINES:** contact is already present in the email thread; for AE, the equivalent inquiry identity and reply address must be captured before outbound contact.
- **D6 — CONTRADICTS pure act-first for effects:** outbound email/scheduling is interrupted for review rather than automatically sent.

#### Skip list

- **Do not copy a blocking in-process interrupt as AE's async infrastructure.** AE needs Convex-persisted jobs, leases, due times, retry budgets, and answer-thread notifications.
- **Do not call mock-tool tutorial behavior shipped commerce.** The README expressly distinguishes mocks from Gmail setup.

### 7.3 AIReceptionist: inbound conversations and background notification retries

**Primary source:** <https://github.com/kirklandsig/AIReceptionist/blob/main/README.md>

#### Findings

- AIReceptionist is a self-hosted, inbound phone receptionist for businesses using OpenAI Realtime + LiveKit/SIP. It answers FAQs, transfers calls, takes messages, and supports multiple business configurations.
- Its message delivery channels include file, email, and webhook. Email/webhook delivery runs in the background with three-attempt exponential backoff; exhausted failures are written to a `.failures/` directory for inspection. This is concrete operational evidence for durable-ish notification retry.
- The project supports recording/transcripts and a configurable consent preamble for two-party-consent states. These are real communication/privacy gates.
- The README describes inbound call handling and message taking, not a buyer-side agent that calls another business, waits for an answer, negotiates, or books a commitment. It is an operator-side interface, not a cross-business transaction loop.

#### Implications for AE

- **D1 — REFINES:** voice is a conversational surface, but a voice conversation's completion is not a commerce commitment.
- **D2 — SUPPORTS:** consent, recording, message persistence, retries, and failure inspection belong in deterministic infrastructure.
- **D3 — REFINES:** human approval is not enough when the agent is speaking/recording on a person's behalf; disclosure/consent policy is a separate boundary.
- **D4 — SUPPORTS only notification mechanics:** background delivery and failure quarantine are reusable; inbound receptionist behavior does not prove outbound business inquiry.
- **D5 — CONTRADICTS “contact first effect” if read as universal:** phone number/SIP identity is necessarily present before an inbound call, but this is a different interaction direction. For outbound AE, capture the minimum contact route before disclosure.
- **D6 — REFINES:** the receptionist can answer known FAQs immediately; transfer or message-taking is the blocked/escalated path. It does not establish silent booking defaults.

#### Skip list

- **Do not copy inbound caller identity as authorization to make outbound commitments.** Direction and principal differ.
- **Do not copy CAPTCHA/voice/vendor assumptions as trust.** Communication consent, identity, and payment authority remain separate.
- **Do not confuse three-attempt notification delivery with business-level retries.** A delivered message is not a received/replied/accepted offer.

### 7.4 Browser Use: generic browser executor, no commitment semantics

**Primary source:** <https://github.com/browser-use/browser-use/blob/main/README.md>

#### Findings

- Browser Use describes an open-source browser agent that opens pages, clicks buttons, types, fills forms, extracts data, and runs arbitrary natural-language tasks. The README examples are job-application form filling, data extraction, and QA; FAQ examples include uploading a video, comparing laptops, and filling a job application.
- The project offers cloud proxy rotation, stealth browser fingerprinting, and CAPTCHA solving. Those features help execution against websites; they are not merchant identity, payment authority, anti-fraud verification, or user-consent evidence.
- The README does not define a reservation object, offer/hold/confirm transition, idempotency key, payment authorization boundary, or durable reply/job model. A browser can technically reach a reservation site, but the reviewed source does not establish reliable commerce completion semantics.

#### Implications for AE

- **D1 — SUPPORTS exploration:** a model can plan and act over a broad, changing interface.
- **D2 — SUPPORTS the need for a kernel:** browser execution without an effect boundary is too unconstrained for payment, sensitive disclosure, or commitments.
- **D3 — CONTRADICTS unrestricted effect authority:** browser automation can click a final purchase/reservation control; AE must interpose explicit policy/approval regardless of browser success.
- **D4 — CONTRADICTS the evidence for async business loops:** generic browser execution is not evidence of email/phone inquiry, human reply, or durable chase.
- **D5 — REFINES:** contact fields should be disclosed at the form boundary only with site/user policy; browser auto-fill can leak more data than an API contract.
- **D6 — REFINES:** act-first is reasonable for read/extract tasks, not for final submit, payment, or sensitive data entry.

#### Skip list

- **Do not use stealth/CAPTCHA solving as an anti-fraud gate.** It is, at best, a way to get past a site's defenses and may conflict with site policies; it proves neither user intent nor merchant authorization.
- **Do not infer booking reliability from generic task completion benchmarks.** Without provider-side offer IDs, expiry, idempotency, and receipts, a screenshot of a success page is weak evidence.

## 8. What messages actually get replies?

The reviewed primary sources do not publish controlled response-rate data for agent-to-business messages. Therefore no claim here that a template “gets replies” is empirically established. The strongest reusable patterns are structural, not marketing copy:

1. **Structured API message with an explicit next action.** UCP's `messages` includes `code`, `path`, `severity`, and content; recoverable errors tell the platform to update/retry, while buyer-input/review messages tell it to hand off. This is more machine-actionable than an unconstrained paragraph. Source: <https://ucp.dev/specification/checkout/>.
2. **Authoritative current state plus a bounded request.** ACP requires create/update to return authoritative cart state, and its complete endpoint is a clear order transition. Source: <https://github.com/agentic-commerce-protocol/agentic-commerce-protocol/blob/main/spec/2026-04-17/openapi/openapi.agentic_checkout.yaml>.
3. **Appointment-style question with alternatives.** The appointment agent's prompt asks for a date/time, checks availability, and offers nearby alternatives when unavailable. This is a good user-facing pattern, but the source does not show an arbitrary business replying. Source: <https://github.com/mjunaidca/appointment-agent/blob/main/src/appointment_agent/prompts.py>.
4. **One request per effect, with identity and deadline.** DoorDash's quote uses `external_delivery_id`, a five-minute accept window, and a single accept endpoint; x402 uses a resource, amount, recipient, nonce, and validity window. Sources: <https://developer.doordash.com/en-US/docs/drive/how_to/quote_deliveries/> and <https://github.com/coinbase/x402/blob/main/specs/x402-specification-v2.md>.
5. **Email/phone inquiry template for AE should be explicit and replyable (proposed, not source-validated):** identify the agent and principal, state the exact request, enumerate acceptable alternatives, state deadline/expiry, ask for one concrete response format, and provide a stable reply address/thread ID. This is a design recommendation, not an observed response-rate result and is marked `[INFERENCE]`.

A minimally structured asynchronous inquiry envelope should carry:

```text
inquiry_id / attempt_id
principal + authority scope
business identity + channel
request summary and exact constraints
acceptable alternatives / maximum price / dates
contact route and disclosure consent
reply deadline / offer expiry
expected response schema (accept | counter-offer | reject | need-info)
provider idempotency/effect key
```

The envelope is the missing bridge between “agent can ask a business” and “agent can finish a job.” It must be persisted before sending; a reply must correlate to `inquiry_id`, be authenticated as far as the channel permits, and create a new offer/hold/approval transition rather than silently changing the plan. `[INFERENCE]`

## 9. Cross-source comparison: offer → hold → confirm

| System | Offer | Hold / expiry | Confirm | Idempotency / replay | Human-business async? |
|---|---|---|---|---|---|
| x402 exact | PaymentRequired resource + amount | Payment validity window, not inventory hold | Signed authorization + settlement | Nonce/time checks; no core checkout idempotency | No |
| x402 upto | Max spend authorization | Authorization max and validity; actual usage settled later | Facilitator settles actual amount | Permit2/facilitator-bound authorization; no business-order state | No |
| AP2 | Merchant-signed Checkout JWT | Mandate `exp`; UCP AP2 default six-hour session expiry | Closed checkout/payment mandates + receipts | Mandate binding, rejection-receipt rule; not generic REST key | No |
| ACP | Authoritative checkout session/cart | `expires_at`, `quote_expires_at`; status `expired`/`canceled` | Complete creates order | Required `Idempotency-Key`, replay/409/422 semantics | No; escalation is handoff |
| UCP base | Checkout session/status/messages | Expiry/cancel; no universal reservation guarantee | Trusted UI completion | Binding-specific; do not assume ACP key semantics | No; `continue_url` handoff |
| UCP + AP2 | Signed checkout and payment mandates | Six-hour default if absent in AP2 extension; explicit expiry | Programmatic complete with mandates | JWS/JCS/SD-JWT plus business/platform signatures | No |
| DoorDash Drive | Quote with fee/ETA/serviceability | Five-minute quote acceptance | Accept creates delivery | External delivery ID / duplicate/retry guidance | No |
| Shopify Storefront MCP | Catalog/product/cart state | No documented universal hold in reviewed page | Shopper checkout | Endpoint/provider-dependent | No |
| FlySoar | SSE flight offers with IDs/conditions | `expires_at` | Booking in separate OAuth MCP host | Server-side journey identity (source-study evidence) | No |
| OSS appointment agent | Calendar availability | Calendar/provider semantics, not modeled in project | Calendar event creation | No demonstrated provider effect key in reviewed function | No; calls user after booking |
| OSS ambient email | Email thread / model draft | LangGraph persistence while interrupted | Human accepts send/schedule | No commerce idempotency | No; user reviews |
| AIReceptionist | Inbound call/message | Call/message delivery retry | Message/file/webhook delivery | Three-attempt notification retry; no offer semantics | No; inbound receptionist |

**Bottom line:** machine commerce has several credible offer → expiry → confirm kernels. The async human-business row is empty in this source set. That is the key disconfirmation of treating D4 as already validated.

## 10. Trust and anti-fraud gates observed

| Gate | Evidence | What it protects | AE interpretation |
|---|---|---|---|
| Scoped user consent | OpenAI explicit confirmation; UCP trusted UI; LangGraph interrupt accept/edit/ignore | User intent at effect boundary | Keep approval on commitments/payment/sensitive disclosure |
| Cryptographic mandate | AP2 Checkout/Payment Mandates, merchant authorization, SD-JWT/JCS | Terms, authority, and dispute evidence | Prepared Action/Approval Grant needs bound canonical payloads, not free text |
| Deterministic payment verification | x402 facilitator signature/balance/amount/time/recipient/simulation | Unauthorized/replayed/incorrect payment | Never let LLM verify or settle money |
| Idempotency | ACP required key and conflict semantics; DoorDash external ID; x402 nonce | Duplicate charge/order/delivery | Every async effect needs stable key and reconciliation path |
| Expiry | x402 validity windows; AP2 `exp`; ACP session/quote expiry; DoorDash five-minute quote | Stale offers/authorizations | Expiry is a state transition requiring refresh or user re-approval |
| Merchant authenticity | AP2 merchant-signed checkout; UCP AP2 business signature | Tampered price/line items/merchant | Preserve source/evidence hash in answer thread |
| Eligibility/claim verification | UCP eligibility must be verified or rescinded before completion | Misrepresented benefits/access | Treat agent claims as untrusted input |
| Fulfillment proof | DoorDash PIN/signature/photo/identity controls | Delivery fraud/misdelivery | Provider-specific proof must remain in provider adapter |
| Communication consent | AIReceptionist recording preamble and transcript controls | Illegal/unexpected recording | Voice contact needs consent/policy separate from payment approval |
| Failure quarantine | AIReceptionist retry budget and `.failures/` store; Stripe import terminal errors | Silent loss of notifications/tasks | Async job must expose attempts, next retry, terminal failure |

Not observed in the reviewed OSS examples: a unified trust model covering business identity, outbound agent identity, authorized disclosure, reply authenticity, offer authenticity, hold reservation, payment, and post-commit evidence across email/phone/browser channels. `[INFERENCE]`

## 11. Direct judgment on D1–D6

### D1 — Model-driven engine

**Verdict: REFINES, not a clean yes.** LangGraph and Browser Use support model-driven iterative planning and tool use. ACP/UCP show that a useful loop is “inspect authoritative state → resolve a typed blocker → update → re-evaluate → complete.” But commerce protocols deliberately retain fixed state transitions and deterministic validation. Replace route trees only at the planning layer; do not replace typed effect transitions with model judgment. The job-loop completion claim is **not validated** for asynchronous human-business work by this source set.

### D2 — Deterministic safety kernel

**Verdict: STRONGLY SUPPORTS.** Every serious source puts authority and integrity outside the LLM: x402 facilitator checks, AP2 deterministic role verification, UCP status/error/eligibility rules, ACP idempotency/expiry, DoorDash effect IDs, Stripe OAuth/restricted credentials, and LangGraph interrupts. The router may be demoted from deciding *what the user wants*, but not from enforcing who may do what, whether an effect is fresh, whether it is duplicated, and how failure/recovery works.

### D3 — Agent explores; person approves effects

**Verdict: SUPPORTS with narrower language.** Anonymous/search/read/catalog exploration is common; payment/checkout is scoped. AP2 autonomous mode allows effects under user-signed constraints. However, OpenAI Instant Checkout explicitly confirms order/shipping/payment, UCP base requires trusted UI, and UCP/AP2 can require buyer input/review. Use “person approves effects or has previously signed a verifiable constraint that exactly covers the effect,” not “person only approves effects” as a blanket exemption from detail review.

### D4 — Instant supply + async human-business inquiries in one plan

**Verdict: MACHINE HALF SUPPORTS; HUMAN HALF UNPROVEN/CONTRADICTED.** UCP/ACP can combine API updates with trusted UI escalation, and AE can technically add an async adapter. But the reviewed protocols do not model arbitrary business email/phone replies, and reviewed OSS does not demonstrate durable inquiry → reply → negotiate → commit. Ship it only as an explicit new product capability with durable job state, not as an assumed property of `/`.

### D5 — Capture contact at first async effect

**Verdict: SUPPORTS with a disclosure boundary.** ACP/UCP permit optional/progressive buyer fields; AP2 supports selective disclosure; Shopify/FlySoar separate public read from identity-bearing effects. Capture the minimum contact route when the first outbound business contact requires it, but capture and authorize it **before** sending or disclosing. Contact should be a versioned, consented effect input, not an incidental field collected after the send.

### D6 — Act first, ask when blocked

**Verdict: SUPPORTS for reads/recoverable errors; CONTRADICTS for commitments.** UCP explicitly asks platforms to repair recoverable errors before handoff; appointment agents offer nearby slots; catalog/search can proceed on defaults. But final booking, payment, email send, meeting schedule, and Instant Checkout require explicit confirmation or a tightly scoped mandate. The safe rule is “act first on reversible, low-risk, non-disclosing reads; ask before irreversible, externally visible, sensitive, or money-bearing effects.”

## 12. Product/architecture consequence for AE

If AE wants D4 rather than only instant API commerce, the smallest honest kernel is:

1. **Inquiry object:** immutable `inquiry_id`, principal/agent identity, business/channel, structured request, allowed alternatives, contact route, disclosure consent, deadline, and current status.
2. **Effect record:** stable `effect_key`, attempt number, provider request ID, payload hash, authorization/approval grant, created/started/completed timestamps, and reconciliation status.
3. **Offer record:** business identity, exact terms, source message, offer ID, price/conditions, `expires_at`, and whether the business actually promised a hold.
4. **Reply normalization:** `accept`, `counter_offer`, `reject`, `need_information`, `no_response`, `unverified`; preserve raw email/call/browser evidence alongside parsed fields.
5. **Durable scheduler:** Convex-persisted due time, lease, bounded retry/backoff, cancellation, escalation, and notification. An SSE answer thread is a conversation projection, not the scheduler.
6. **Commitment transition:** only a provider-confirmed offer/hold plus user authority (fresh approval or matching signed constraint) can move to `committing`; completion must produce an evidence receipt or explicit provider status.
7. **Contact policy:** progressive disclosure with the minimum necessary contact data, capture before outbound effect, and a record of what the business received.
8. **Provider adapter contract:** quote/offer, refresh, hold (if actually supported), accept/confirm, cancel, get status, and idempotency/reconciliation. Providers that only support send-message must not be presented as bookable.

This is intentionally more deterministic than the proposed “model owns planning/action selection” wording. The model can select a provider/action and generate a message; it cannot fabricate a hold, infer acceptance from silence, or turn an unverified reply into a commitment.

## 13. Honest negative findings and open falsifiers

- **No reviewed OSS source ships the full async business loop.** The closest examples are (a) a calendar API booking prototype with post-booking user confirmation call and pending retry/cron stories, (b) an inbound receptionist with background message delivery retries, (c) an email assistant with human review and mocks, and (d) generic browser execution. None demonstrates arbitrary business outreach through durable reply-to-commitment completion.
- **No reviewed protocol defines human-business negotiation over email/phone.** AP2 explicitly scopes commerce APIs/communication outside its protocol; UCP/ACP escalation is buyer UI handoff; x402/MPP are machine payment/resource access.
- **No reviewed source proves that contact is safe to collect only after an asynchronous effect.** Progressive contact is supported, but every source that sends/fulfills an external effect requires the contact route before that effect can be delivered.
- **No reviewed source proves that “act first” is safe for commitments.** The strongest sources instead distinguish reversible read/repair from final authorization/complete.

### Falsifiers for this review

This review should be updated if a primary source demonstrates all of the following in one shipped OSS or official system: arbitrary business discovery; outbound email/phone inquiry; reply correlation and authentication; deadline/retry/pause recovery; explicit offer/hold/confirm states; idempotent replays; user authority/mandate; and a durable completion receipt. A source that demonstrates only API checkout, browser clicking, inbound receptionist behavior, or one-shot email generation does not falsify the negative finding.

## Source register (reviewed 2026-07-31)

1. Coinbase x402 v2 core, HTTP transport, and EVM `upto` source: <https://github.com/coinbase/x402>, <https://github.com/coinbase/x402/blob/main/specs/x402-specification-v2.md>, <https://github.com/coinbase/x402/blob/main/go/mechanisms/evm/upto/README.md>
2. Google AP2 repository/specification/mandates: <https://github.com/google-agentic-commerce/AP2>, <https://github.com/google-agentic-commerce/AP2/blob/main/docs/ap2/specification.md>
3. OpenAI Instant Checkout announcement: <https://openai.com/index/buy-it-in-chatgpt/>
4. Agentic Commerce Protocol repository and checkout OpenAPI: <https://github.com/agentic-commerce-protocol/agentic-commerce-protocol>, <https://github.com/agentic-commerce-protocol/agentic-commerce-protocol/blob/main/spec/2026-04-17/openapi/openapi.agentic_checkout.yaml>
5. UCP checkout, REST, and AP2 extension: <https://ucp.dev/specification/checkout/>, <https://ucp.dev/specification/checkout-rest/>, <https://ucp.dev/specification/ap2-mandates/>
6. Stripe Agents, MCP, agentic commerce, machine payments, and toolkit: <https://docs.stripe.com/agents.md>, <https://docs.stripe.com/mcp.md>, <https://docs.stripe.com/agentic-commerce.md>, <https://docs.stripe.com/payments/machine.md>, <https://github.com/stripe/agent-toolkit>
7. Shopify Storefront MCP: <https://shopify.dev/docs/apps/build/storefront-mcp/servers/storefront>
8. DoorDash Drive quote/accept: <https://developer.doordash.com/en-US/docs/drive/how_to/quote_deliveries/>, <https://developer.doordash.com/en-US/api/drive/>
9. FlySoar CLI/MCP source snapshot: <https://github.com/Gahnxd/flysoar-cli/tree/3abe6f19>
10. LangGraph interrupts and ambient email agent: <https://docs.langchain.com/oss/python/langgraph/interrupts>, <https://github.com/langchain-ai/ambient-agent-101>
11. Appointment Booking Agents Vertical Starter Kit: <https://github.com/mjunaidca/appointment-agent>
12. AIReceptionist: <https://github.com/kirklandsig/AIReceptionist>
13. Browser Use: <https://github.com/browser-use/browser-use>
