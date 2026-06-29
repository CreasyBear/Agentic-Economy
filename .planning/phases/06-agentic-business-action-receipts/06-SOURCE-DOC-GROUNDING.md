---
phase: "06"
slug: agentic-business-action-receipts
status: source-doc-grounding
created: 2026-06-29
feeds:
  - .planning/phases/06-agentic-business-action-receipts/06-ENGINEERING-REQUIREMENTS.md
  - /skill:gsd-spec-phase 6
---

# Phase 6 Source-Doc Grounding: Agentic Business Operation Evidence

## Decision

Phase 6 should build around **receipt-backed agentic business operation evidence**, not an AE-owned payment rail.

The source docs support this split:

- **Stripe/Link** can provide spend credentials, shared payment tokens, PaymentIntent/Checkout/payment-link state, webhook evidence, and agent-facing payment tooling.
- **NVIDIA Nemotron / NeMo Guardrails** can provide model reasoning, safety, tool-call governance, and trace evidence.
- **x402 / Agentic.Market** define the API-microtransaction lane AE should avoid as its main wedge.
- **Stripe Agentic Commerce Suite / Shopify catalogs** define product-catalog commerce lanes AE should avoid owning in Phase 6.

AE's job is narrower and stronger:

> AE records who authorized the agent, what the agent was allowed to do, what spend or consequence was requested, what external rail evidence came back, and whether the whole chain reconstructs.

## Source facts

### Stripe Agents and AI

Source: <https://docs.stripe.com/agents>

Observed facts:

- Stripe has an agent-facing docs surface for MCP, skills, CLI, Markdown docs, `llms.txt`, and agentic commerce.
- Stripe describes agentic commerce as letting agents buy and sell on behalf of customers.
- Stripe points agents toward Agentic Commerce, machine payments, and tool/MCP support.

Implication for AE:

- Stripe is a meaningful sponsor rail.
- AE should not invent a Stripe abstraction before selecting a concrete Stripe rail.
- For Phase 6, Stripe evidence should be stored as provider readback attached to an AE authorization checkpoint, not as AE authority.

### Link Agents / Link CLI

Sources:

- <https://link.com/agents>
- <https://github.com/stripe/link-cli>
- <https://docs.stripe.com/agentic-commerce/concepts/shared-payment-tokens.md?agent-seller=seller>
- <https://docs.stripe.com/agentic-commerce/concepts/shared-payment-tokens.md?agent-seller=agent>

Observed facts:

- Link's agent page says: "Let your agents pay online using one-time-use cards or with machine payment protocols. You approve every request."
- Link's page says agent wallets are currently US-only, coming soon globally.
- `stripe/link-cli` says it lets agents get secure one-time-use payment credentials without storing real card details.
- Link CLI can produce either:
  - a virtual card for standard web checkout, or
  - a Shared Payment Token (SPT) for merchants that support Machine Payment Protocols.
- Link CLI spend requests require merchant context and amount.
- `--request-approval` triggers user approval and waits for approve/deny.
- Link CLI supports `--test` for test-mode credentials.
- Spend request lifecycle: create -> request approval -> approved with credentials.
- Required spend request fields: `merchant_name`, `merchant_url`, `context`, `amount`.
- Documented constraints include a 10-minute approval window and 12-hour credential validity from spend request creation.
- Link CLI can run as an MCP server.
- Link CLI supports `report` outcomes: `success`, `blocked`, `abandoned`, with tags such as `captcha`, `3ds_challenge`, `payment_declined`, and `timeout`.
- SPT docs define usage limits: currency, max amount, and expiration.
- SPTs have states such as `active`, `requires_action`, and `deactivated`.
- SPT webhooks include requires-action, active, used, and deactivated events.

Build implications:

- Replace the vague phrase **"Stripe Link CLI spend approval"** with source terms:
  - `Link CLI spend request`,
  - `one-time-use virtual card`,
  - `Shared Payment Token`,
  - `usage_limits`,
  - `approval window`,
  - `credential validity`.
- AE can record a Link spend request as external evidence only after AE authority passes.
- AE must never store raw virtual card PAN/CVC/expiry, Link auth tokens, SPT secrets, or payment credentials.
- AE can store hashes and private readback refs for:
  - spend request id,
  - merchant URL/name,
  - amount/currency,
  - line item hashes,
  - approval/refusal state,
  - credential type,
  - expiry timestamps,
  - report outcome.
- If Link US availability blocks a real demo, use Link CLI `--test` and label the path as test-mode evidence. Do not claim live spend.

Hard cuts:

- No AE-owned wallet.
- No AE custody.
- No AE card handling.
- No agent self-approval.
- No Link credential printed into AE logs, receipts, public verifier, or screenshots.

### Stripe Shared Payment Tokens

Sources:

- <https://docs.stripe.com/agentic-commerce/concepts/shared-payment-tokens.md?agent-seller=agent>
- <https://docs.stripe.com/agentic-commerce/concepts/shared-payment-tokens.md?agent-seller=seller>

Observed facts:

- SPTs grant scoped access to a customer's payment method for agent-initiated purchases.
- The agent issues an SPT to a seller's Stripe profile.
- The agent sets usage limits including currency, maximum amount, and expiration.
- Sellers use the granted SPT to create a PaymentIntent.
- SPTs can require additional customer action.
- SPTs can be revoked.
- Stripe sends webhooks for SPT lifecycle changes.

Build implications:

- If Phase 6 uses SPTs, AE's receipt must bind:
  - seller/business profile or hash,
  - SPT id or hash,
  - usage limits,
  - mandate hash,
  - request hash,
  - expiration,
  - webhook lifecycle state.
- AE should not treat an SPT as approval. Approval is AE/owner/mandate state; the SPT is payment credential evidence.
- SPT state loops (`requires_action` -> `active`) mean AE's state machine must allow payment evidence to be pending, blocked, or user-action-required.

### Stripe Machine Payments: MPP and x402

Sources:

- <https://docs.stripe.com/payments/machine>
- <https://docs.stripe.com/payments/machine/mpp>
- <https://docs.stripe.com/payments/machine/x402>
- <https://github.com/stripe-samples/machine-payments>

Observed facts:

- Stripe machine payments are for machine-to-machine payments, especially agents paying for resources programmatically.
- Machine payments are suited to API calls, services, data/content paywalls, and low-dollar microtransactions.
- Stripe supports MPP and x402 as HTTP payment protocols.
- MPP/x402 flows commonly return HTTP `402 Payment Required`, then a client retries with a payment credential/header.
- MPP supports crypto payments and SPT fiat/card flows.
- x402 supports crypto deposit/payment flows through Stripe PaymentIntents and facilitators.
- Stripe's sample repo implements MPP and x402 servers in TypeScript and Python.

Build implications:

- MPP/x402 are real agentic payment rails, but they are the **API-native microtransaction lane**.
- This is close to Agentic.Market and should not be AE's main Phase 6 wedge.
- AE can borrow concepts:
  - payment challenge,
  - exact amount/currency binding,
  - request retry after payment credential,
  - receipt attached to fulfilled resource.
- AE should invert the control order:
  - AE authorization checkpoint first,
  - external payment evidence second,
  - receipt reconstruction last.

Hard cuts:

- Do not expose AE business actions as x402-payable generic API endpoints in Phase 6.
- Do not add `paymentRequired=true` to public discovery without enforcement and receipt reconstruction.
- Do not position AE as an x402 directory.

### Stripe Agentic Commerce Suite

Sources:

- <https://docs.stripe.com/agentic-commerce>
- <https://docs.stripe.com/agentic-commerce/for-sellers>
- <https://docs.stripe.com/agentic-commerce/for-agents.md?agent-checkout-mode=full>
- <https://docs.stripe.com/agentic-commerce/for-agents.md?agent-checkout-mode=feed-only>
- <https://docs.stripe.com/agentic-commerce/product-feed>

Observed facts:

- Agentic Commerce Suite is available in the US.
- Stripe supports seller product feeds for agent discovery.
- Stripe product feeds include product, inventory, price, fulfillment, compliance, and performance/review fields.
- Stripe recommends product data daily and inventory/pricing updates every 15 minutes for freshness.
- Agents can ingest product feeds and either redirect checkout or use embedded checkout.
- Embedded agent checkout can create marketplace facilitator/tax obligations.
- Orchestrated Commerce Agreements connect agents and sellers.
- Product feeds have a `disable_checkout` field for discovery-only products.

Build implications:

- Stripe ACS is a strong source for what a product-catalog agent-commerce system looks like.
- AE should not rebuild ACS in Phase 6.
- AE should avoid physical-product catalog claims, inventory truth, tax/shipping/fulfillment truth, and marketplace-facilitator posture.
- If AE later does seller catalogs, it should be a separate post-P6 decision with feed freshness, OCA/seller relationship, tax, and fulfillment scope explicitly accepted.
- For this Phase 6 wedge, use **Business Action Cards**, not product feeds.

### Stripe MCP and key handling

Sources:

- <https://docs.stripe.com/mcp>
- <https://docs.stripe.com/keys-best-practices>
- <https://docs.stripe.com/api/idempotent_requests>
- <https://docs.stripe.com/webhooks>

Observed facts:

- Stripe MCP lets agents interact with Stripe APIs and documentation.
- Stripe recommends OAuth for MCP where possible; restricted API keys are the fallback for clients without OAuth.
- Stripe recommends human confirmation of tools and caution when using Stripe MCP with other MCP servers because of prompt injection risks.
- Stripe says secret keys must stay server-side, should not be in source code, and restricted API keys should follow least privilege.
- Stripe idempotency keys safely retry POST requests and compare reused-key parameters to prevent misuse.
- Stripe webhook handling requires signature verification with raw request body; endpoint handlers should return `2xx` quickly before slow work.

Build implications:

- Do not hand Hermes an unrestricted Stripe secret key.
- If Stripe MCP is used, use OAuth or restricted keys, scoped permissions, human confirmation, and no mixed untrusted tool context.
- AE should treat Stripe API writes as downstream external mutations that require:
  - AE authorization checkpoint,
  - idempotency key,
  - exact amount/currency binding,
  - webhook signature/readback,
  - reconciliation state.
- Store webhook/event readback separately from public receipts.

### NVIDIA Nemotron

Source: <https://developer.nvidia.com/topics/ai/nemotron>

Observed facts:

- Nemotron is a family of open models with open weights, data, and recipes for specialized AI agents.
- Nemotron models target reasoning, tool calling, coding, retrieval, multimodal understanding, speech, and safety.
- NIM microservices are a deployment path for models.
- Nemotron Safety includes jailbreak detection, content moderation, PII detection, custom policy enforcement, and topic control.
- NVIDIA points to NeMo Guardrails as a flexible open library for enterprise AI policies, including tool-call governance and safety filtering.

Build implications:

- Nemotron is useful for the visible reasoning/safety sponsor role.
- Nemotron is not itself a payment rail, authorization system, wallet, or receipt signer.
- Nemotron evidence should be framed as:
  - model/provider/version,
  - policy prompt/config hash,
  - reasoning/refusal summary hash,
  - safety classifier output,
  - tool-call allow/block decision,
  - latency/cost/readback if available.

### NeMo Guardrails

Sources:

- <https://docs.nvidia.com/nemo/guardrails/about-nemo-guardrails-library/rail-types>
- <https://docs.nvidia.com/nemo/guardrails/latest/observability/tracing>
- <https://github.com/NVIDIA/NeMo-Guardrails>

Observed facts:

- NeMo Guardrails applies rails at input, retrieval, dialog, execution, and output stages.
- Execution rails control and validate tool/function calls, arguments, and results before/after external systems.
- The rail-types docs list Agentic Security as an execution-rail use case.
- Tracing supports OpenTelemetry semantic conventions, records activated rails, LLM calls, performance, errors, and optionally content capture.
- Content capture defaults to false and has privacy implications.
- The GitHub README describes NeMo Guardrails as programmable guardrails around LLM applications, including safeguards for jailbreaks/prompt injection and secure tool connections.

Build implications:

- For AE, NeMo Guardrails is the correct NVIDIA-shaped evidence layer for tool-call governance.
- Use execution rails to decide whether Hermes may call Link/Stripe/provisioning tools.
- Emit guardrail traces as private evidence refs.
- Do not publicize raw prompts, user inputs, or model outputs by default.
- Do not claim OS/process sandboxing from Nemotron/NeMo Guardrails alone. If the demo needs a sandbox, source it from a separate sandbox project and record it as separate evidence.

### x402 / Agentic.Market

Sources:

- <https://docs.cdp.coinbase.com/x402/welcome>
- <https://docs.cdp.coinbase.com/x402/quickstart-for-sellers>
- <https://github.com/coinbase/x402>
- <https://agentic.market/llms.txt>

Observed facts:

- x402 is an HTTP-native payment protocol around `402 Payment Required`.
- It is designed for APIs, paid resources, microtransactions, and AI agents paying programmatically without accounts or manual payment flows.
- The x402 flow has resource server, client, facilitator, verify, settle, and payment response concepts.
- Agentic.Market advertises x402-enabled callable services, no API keys, no accounts, and pay-per-request USDC.
- Agentic.Market API rows include endpoints, method, URL, USDC pricing, category, networks, and quality metrics.

Build implications:

- This is exactly the lane AE should avoid as its primary wedge.
- If AE builds callable paid endpoints, it will look derivative unless it adds source-owned authority and receipts before payment.
- Borrow only the protocol discipline:
  - explicit payment requirement,
  - exact amount/currency,
  - verification before fulfillment,
  - response receipt.
- Reject x402-first Phase 6 unless the goal changes to API microtransactions.

### Shopify catalogs

Source: <https://shopify.dev/docs/api/admin-graphql/latest/queries/catalogs>

Observed facts:

- Shopify catalogs control product publication and pricing for markets, B2B company locations, and sales channels.
- Catalog queries expose catalog id, title, status, and filtering/pagination.

Build implications:

- Shopify is the product-catalog-commerce analogy.
- AE should avoid looking like a weaker Shopify catalog plus Stripe checkout.
- AE's `BusinessActionCard` should describe a bounded business operation and authority requirements, not product inventory or pricing truth.

## Recommended Phase 6 build posture

### Use these external rails

| Rail | Source-backed capability | AE posture |
|---|---|---|
| Link CLI spend request | Human-approved one-time-use virtual card or SPT; spend request lifecycle; test mode | External spend evidence only. AE records request, approval/refusal, limits, expiry, and outcome hash. |
| Stripe SPT | Scoped payment credential with max amount/currency/expiry and lifecycle webhooks | External payment credential evidence only. AE never stores raw credential. |
| Stripe PaymentIntent / Checkout / Payment Link | Customer payment/revenue collection, webhooks/readback, idempotency | External revenue evidence only. AE creates/records only after authorization checkpoint. |
| Stripe MCP | Agent access to Stripe API/docs with OAuth or restricted keys | Optional operator/dev tool. Do not grant broad writes to Hermes without human confirmation and least privilege. |
| Nemotron | Reasoning/tool-calling/safety model family | Model reasoning/safety evidence only. Not authority. |
| NeMo Guardrails | Input/retrieval/dialog/execution/output rails; OpenTelemetry tracing | Tool-call governance and trace evidence. Not OS sandbox. |
| x402/MPP | Paid HTTP resources and machine payments | Pattern to study; not default AE Phase 6 rail. |

### Do not use these as the primary wedge

| Source lane | Why not now |
|---|---|
| Stripe ACS product feeds | Product/inventory/tax/fulfillment/marketplace-facilitator complexity. |
| x402/Agentic.Market | API endpoint microtransaction directory. Too derivative. |
| Shopify catalog model | Product publication/pricing, not source-owned business authority. |
| Stripe Treasury / agentic finance preview | Too broad; money movement and cards require separate decision record. |

## Source-grounded Phase 6 state machine

```text
customer_request_received
  -> hermes_scoped_operation
  -> business_action_card_selected
  -> mandate_created
  -> capability_request_proposed
  -> nemo_guardrails_execution_check
  -> ae_authorization_checkpoint
  -> refused
       -> receipt_recorded_no_consequence
  -> approved
       -> link_spend_request_created_optional
       -> user_spend_approval_required_optional
       -> credential_issued_optional
       -> stripe_or_external_attempt_recorded
       -> provider_result_or_block_recorded
       -> payment_link_or_payment_intent_created_optional
       -> stripe_webhook_or_readback_reconciled_optional
       -> receipt_recorded
       -> verifier_reconstructs_chain
```

## Receipt binding requirements

A Phase 6 receipt must bind these hashes/refs:

- `businessActionCardHash`
- `businessActionCardVersion`
- `mandateHash`
- `capabilityRequestHash`
- `authorizationCheckpointHash`
- `policyHash`
- `idempotencyKey`
- `correlationId`
- `merchantNameHash` / `merchantUrlHash` when Link spend is used
- `amountCents` and `currency`
- `maxAmountCents`, `expiresAt`, and `credentialType` when SPT/Link is used
- `stripeObjectRefHash` for PaymentIntent, Checkout Session, Payment Link, SPT, or webhook event
- `nemoGuardrailsTraceRefHash` if guardrails are used
- `nemotronModelRef` / `safetyDecisionHash` if Nemotron is used
- `providerOutcome`
- `receiptOutcome`

Public verifier should expose only status, hashes, timestamps, and non-sensitive labels.
Owner/operator readback may expose richer private evidence refs.

## Security rules

1. No raw card data in AE.
2. No Link auth tokens in AE.
3. No Stripe secret or restricted keys in source.
4. No raw SPT in public receipt/verifier.
5. No provider screenshot as proof.
6. No webhook acceptance without Stripe signature verification and raw body handling.
7. No provider mutation without idempotency key.
8. No agent self-approval for spend.
9. No public `callable` or `paymentRequired` claim before source-owned authority and receipt enforcement exist.
10. No model output treated as authority.
11. No Nemotron/Guardrails claim of OS sandboxing unless separate sandbox docs prove it.

## Demo recommendation after source grounding

Best 90-second demo:

1. Customer asks Hermes to provision a paid diagnostic intake endpoint for one business under a tight test-mode budget.
2. Hermes scopes the work and finds the AE `BusinessActionCard` for `provision-paid-intake-endpoint`.
3. Hermes creates a `CapabilityRequest` with amount, merchant/tool, deadline, and result artifact expectation.
4. NeMo Guardrails execution rail approves or blocks the proposed tool/payment call.
5. AE authorization checkpoint accepts or refuses.
6. If accepted, Stripe creates a test-mode Checkout Session, PaymentIntent, or Payment Link for the paid intake, with webhook/readback evidence.
7. Optional Link CLI spend request or SPT evidence appears only if a bounded external provisioning purchase is actually part of the demo and human-approved.
8. Hermes creates the endpoint descriptor/schema or records a blocked/proof-gap result.
9. AE records receipt and verifier reconstructs the full chain.

Best line:

> Hermes can run the business operation; AE proves the operation stayed inside mandate.

## Open source-doc gaps

These need current source docs before implementation claims:

- Whether Link agent wallet availability is acceptable for an AU-centered demo; current public Link page says US-only / coming soon globally.
- Whether `NemoClaw` is an actual source-backed sandbox product in this project or only shorthand. Current NVIDIA/Nemotron docs support model safety and guardrails, not OS sandboxing.
- Whether Stripe Payment Links are better than Checkout Session or PaymentIntent for the customer revenue leg in this specific demo.
- Whether a real sponsor-hackathon environment grants access to Stripe ACS, SPT previews, machine payments, or Link CLI live mode.
