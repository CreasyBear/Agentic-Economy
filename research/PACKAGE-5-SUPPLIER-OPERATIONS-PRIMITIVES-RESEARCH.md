# Package 5 supplier-operations primitives and equivalence research

**Date:** 2026-09-03

**Status:** Planning research only. This document does not authorize implementation, dependency changes, schema changes, deployment, external writes, or production activation.

**Scope authority:** [`IMPLEMENTATION_ROADMAP.md`](../IMPLEMENTATION_ROADMAP.md#L850-L899) only.
**Question:** Which current repository foundations, maintained vendor primitives, and external maturity evidence are relevant to the exact Package 5 supplier-operations scope?

## Executive finding

Package 5 is not a new supply system. It is the supplier-facing operating projection and coordination layer over the system already present: canonical Operations, source admission, Provider connections, publication, exact routeability, Invocation outcome evidence, Provider obligations, and Payout state.

The repository already contains most of the hard lower-level primitives, but it exposes several overlapping lifecycle vocabularies rather than the roadmap's one eight-state supplier lifecycle. The mature direction is therefore:

1. keep the existing records as their respective authorities;
2. derive one supplier-facing Operation lifecycle from those records;
3. retain the existing fail-closed routeability predicate;
4. express every corrective action as a durable command with authoritative readback;
5. coordinate offboarding across publication, connection, outstanding-Call, and payout authorities without making any one of them imply the others; and
6. add no second workflow engine, secret store, protocol parser, payment ledger, incident system, or market object unless a concrete Package 5 gap cannot be met by the maintained primitives already in use.

No new dependency is justified by the evidence gathered here. Convex's official Workflow component is a candidate for a later, explicit dependency decision only if an offboarding coordinator demonstrably needs persisted multi-step semantics that the current command journal and installed Workpool cannot provide.

Package 4 is deployed in a synthetic release environment but is not closed. Package 5 may consume its contracts and evidence shapes, but must not claim production-grade health, delivery, earnings, or payout evidence until the remaining Package 4 black-box, recovery, restore, x402, and external canary gates pass ([release evidence, lines 5–18](../docs/guides/package-4-release-evidence.md#L5-L18); [deployment maturity, lines 71–88](../docs/operations/deployment-maturity.md#L71-L88)).

## Evidence and authority order

This research applies the repository's declared hierarchy:

1. [`PRODUCT.md`](../PRODUCT.md) defines the product and commercial boundary.
2. [`CONTEXT.md`](../CONTEXT.md) defines canonical language and role distinctions.
3. [`IMPLEMENTATION_ROADMAP.md`](../IMPLEMENTATION_ROADMAP.md) defines Package 5 scope.
4. Current source and tests establish implemented behavior.
5. Package 4 plans and release evidence establish inherited design decisions and unfinished external gates.
6. Repository studies and external products are comparison evidence only. They cannot enlarge Package 5 or override the product charter.

The controlling product invariants remain:

- the Operation is the only unit of supply;
- commercial closure is a terminal state of the Operation purchase, not a second market object;
- funding is not authority, authority is not purchase, settlement is not delivery, and delivery is not commercial closure;
- Provider, Seller, and payment recipient are separate roles;
- external registry metadata is not canonical supply until admitted and published; and
- Agentic Economy does not own the supplier's internal workflow, the buyer's project, a general agent runtime, or final accounting classification.

## Exact Package 5 scope

The roadmap defines four and only four Package 5 areas ([roadmap, lines 850–899](../IMPLEMENTATION_ROADMAP.md#L850-L899)).

### 5A — Supplier onboarding

- eligibility and fit check;
- supported source types;
- required connection setup;
- admission expectations; and
- one clear starting action.

### 5B — Operation lifecycle management

The exact supplier-facing lifecycle is:

1. `Draft`
2. `Needs setup`
3. `Submitted`
4. `Under review`
5. `Published`
6. `Paused`
7. `Action required`
8. `Retired`

These are lifecycle states, not a license to replace the lower-level publication, connection, readiness, Invocation, or payout state machines.

### 5C — Operational health

- connection failures;
- validation failures;
- publication blockers;
- stale Operation data;
- corrective actions;
- supplier-facing incident information;
- verified paid non-delivery and useful-outcome evidence, including sample size, recency, and provenance; and
- removal from routeability when current contract, authority, readiness, or evidence expires, fails, is withdrawn, or materially drifts.

For an actually admitted streaming Operation, the lifecycle must distinguish upstream acceptance, Charge capture, bytes or units delivered, completion, disconnect, and remedy. Payment or stream acceptance cannot imply useful delivery. The roadmap explicitly does not require a general streaming platform before such an Operation exists.

### 5D — Supplier offboarding

- unpublish Operations;
- revoke connections;
- resolve outstanding Calls;
- complete payout obligations; and
- explain retained records.

### Explicit non-scope

Package 5 does not include:

- Package 6 agent onboarding, public supplier-page content work, or a broad language-system migration;
- Package 7 generalized operating controls, fleet-wide observability, or broad trust surfaces;
- Package 8 support and incident-governance ownership;
- Package 9 production launch, legal, tax, accounting, or treasury approval;
- Package 10 growth loops;
- a second market object beside Operation;
- a second money or ledger authority;
- a wallet, generic connector marketplace, code sandbox, workflow product, event bus, or streaming platform;
- treating an imported registry row, credential, endpoint, payment challenge, or successful probe as an admitted Operation; or
- treating payment, settlement, transport acceptance, bytes delivered, or a nominal completion status as useful outcome or commercial closure.

## Package 4 inheritance and current release constraint

The authoritative Package 4 plan is [`PACKAGE-4-ATOMIC-FEATURE-BUILD-PLAN.md`](../PACKAGE-4-ATOMIC-FEATURE-BUILD-PLAN.md), supported by the [operations reconstruction research](./PACKAGE-4-OPERATIONS-RECONSTRUCTION-RESEARCH.md), [Australian prepaid-ledger perimeter research](./PACKAGE-4-AUSTRALIAN-PREPAID-LEDGER-REGULATORY-PERIMETER.md), [cutover evidence](../docs/guides/package-4-cutover-evidence.md), [release evidence](../docs/guides/package-4-release-evidence.md), and [deployment maturity record](../docs/operations/deployment-maturity.md).

The Package 4 lessons that constrain Package 5 are:

- **One-system design.** Formance is the money authority; Convex coordinates application state and projections. Package 5 must consume Provider-obligation and Payout readback, not create a supplier balance or parallel payout truth.
- **Maintained primitives first.** Stripe, CDP/x402, Convex, and Formance integrations use maintained contracts and SDKs. Package 5 should retain that rule for source protocols, secrets, scheduling, and observability.
- **Durable command/readback recovery.** Consequential external work follows prepare → external effect → finalize/readback. An unknown outcome is a state requiring reconciliation, never permission to blind-retry.
- **Exact authority boundaries.** Connection ownership, authority grant/generation, Provider role, Seller role, payment recipient, and buyer authority remain distinct.
- **Staged migrations.** Compatibility, data census, value-preserving movement, readback, and removal are separate gates. An eight-state supplier projection must not begin with destructive replacement of current lifecycle fields.
- **Clean-worktree blast-radius control.** Package 4's cutover stopped if production value-bearing rows existed and preserved unrelated identity fixtures ([cutover evidence, lines 9–40 and 64–88](../docs/guides/package-4-cutover-evidence.md#L9-L40)). Package 5 migration work will require the same census-first discipline.
- **Black-box acceptance.** Package 4 closure requires complete HTTP/MCP/CLI/chat and authenticated commercial journeys, not internal-unit success alone.
- **External gates stay external.** A passing local suite does not replace provider readback, restore rehearsal, alert delivery, Stripe replay/refund, or a real x402 canary ([release evidence, lines 66–110](../docs/guides/package-4-release-evidence.md#L66-L110)).

Current Package 4 status is material to Package 5 research: the dedicated release environment and first authenticated Stripe funding journey work, while Stripe replay/refund, managed-x402 success/refusal/recovery, Calls/Usage/Spend documents and signed close, protocol parity, current-environment restore, and Base Sepolia canary remain open. Production funding and mainnet effects remain disabled ([release evidence, lines 5–18](../docs/guides/package-4-release-evidence.md#L5-L18)).

## Current repository evidence

### Existing source and admission primitives

The canonical publication table already recognizes the exact current source families `ae_envelope`, `openapi_http`, `mcp`, `agent_plugin_mcp`, and `x402`; it also records source revision/digest, authority mode, connection snapshot, credential state, health state, bounded readiness timestamps, response evidence, and disposition ([schema, lines 175–248](../src/modules/capability-supply/internal/convex-schema.ts#L175-L248)).

The OpenAPI importer deliberately accepts only OpenAPI `3.1.x`, bounds and inspects the source, refuses credential-bearing material, requires a valid selector, and accepts one HTTPS server ([importer, lines 45–74](../src/modules/capability-supply/internal/openapi-import/import.ts#L45-L74)). Package 5 should explain this current supported profile; it must not silently widen protocol scope to OpenAPI 3.2.

The owner funnel already models four black-box steps—`describe`, `admission`, `readiness`, and `test`—with `not_started`, `in_progress`, `completed`, `refused`, and `stale` states plus typed refusal reasons ([funnel contracts, lines 27–115](../src/modules/capability-supply/internal/supply-funnel/types.ts#L27-L115)). This is the strongest existing basis for the 5A eligibility, setup, expectations, and starting-action projection.

### Several lifecycle vocabularies already exist

Current supplier records expose all of these:

| Authority | Current states | What it owns |
|---|---|---|
| Business offering | `draft`, `published`, `paused`, `retired` | Supplier's intent for the offering ([funnel type, lines 1–7](../src/modules/capability-supply/internal/supply-funnel/types.ts#L1-L7)). |
| Publication lifecycle | `inactive`, `active`, `withdrawn`, `incompatible`, with exact reason codes | Admission, conformance, credential/readiness, and compatibility result ([publication lifecycle, lines 15–29 and 81–128](../src/modules/capability-supply/internal/publication/lifecycle.ts#L15-L29)). |
| Owner management summary | `Validating`, `Live`, `Action needed`, `Degraded`, `Removed` | Existing supplier-facing projection ([owner projection contract, lines 104–195](../convex/capabilitySupplyOwnerFunnelProjection/contracts.ts#L104-L195)). |
| Provider connection | `active`, `reauthorization_required`, `revocation_pending`, `revoked`, `cleanup_required` | Credential/authority lifecycle and cleanup ([connection types, lines 1–22](../src/modules/capability-supply/internal/provider-connection/types.ts#L1-L22)). |
| x402 seller onboarding | `draft`, claim/admission/canary pending or failed, `published`, `reconciliation_required`, `stale`, `withdrawn` | Lane-specific seller identity, admission, paid canary, drift, and withdrawal ([lifecycle, lines 112–245](../src/modules/capability-supply/internal/x402-seller-onboarding/lifecycle.ts#L112-L245)). |

The roadmap's eight states are not yet one exact implemented contract. Package 5 research therefore supports a **derived supplier-facing projection**, not a new competing state authority. For example, `Action required` may be caused by a stale connection, failed validation, expired readiness, material drift, unresolved external outcome, or payout setup issue; the causal authority must remain visible and the corrective action must target that authority.

### Routeability already fails closed

The supply graph has one explicit quality gate. It requires current origin, catalog access path, business, publication, seller canary where applicable, contract, offering, binding, pricing, and active lifecycle, with exact Operation and endpoint identity ([quality gate, lines 5–67](../src/modules/capability-supply/internal/graph/quality-gate.ts#L5-L67)).

Candidate qualification reads the current Provider connection when required, maps lifecycle failures into explicit reasons, requires observed and unexpired readiness evidence, records evidence references and digests, and only then evaluates the single routeability gate ([qualification, lines 251–339](../src/modules/capability-supply/internal/graph/qualify-candidate.ts#L251-L339)).

This is the correct Package 5 health boundary. A supplier dashboard may summarize it, but no UI field, incident flag, registry record, or probe result should independently make an Operation routeable.

### Connection revocation is already a recoverable command boundary

Provider connections bind owning Account, installing Principal, authority grant and generation, Business, Provider account, adapter, secret pointer, exact scopes/resources, health evidence, expiry, and command identity. Revocation and cleanup record expected authority generation/digest, cleanup attempt/work/request identities, outcomes including `outcome_unknown`, and evidence references ([connection types, lines 31–124](../src/modules/capability-supply/internal/provider-connection/types.ts#L31-L124)).

Package 5 should coordinate this primitive; it should not replace it with a boolean `connected` field or delete a credential before the revocation outcome is known.

### The x402 lane already separates payment evidence from usable delivery

The x402 onboarding canary requires a payment outcome and evidence digest, but promotion additionally requires a current contract and a usable result with its own evidence digest. Ambiguous payment enters `reconciliation_required`; identity drift enters `stale`; withdrawal is explicit ([x402 lifecycle, lines 91–109 and 195–245](../src/modules/capability-supply/internal/x402-seller-onboarding/lifecycle.ts#L91-L109)).

This is the strongest current precedent for 5C's paid non-delivery and useful-outcome distinction. It remains lane-specific and does not yet provide a cross-lane sample/recency/provenance aggregate.

### Existing black-box evidence to preserve

Relevant acceptance behavior already lives in:

- [`tests/integration/capability-supply-owner-funnel-publish.test.ts`](../tests/integration/capability-supply-owner-funnel-publish.test.ts)
- [`tests/integration/capability-supply-owner-funnel-withdraw-republish.test.ts`](../tests/integration/capability-supply-owner-funnel-withdraw-republish.test.ts)
- [`tests/integration/provider-connection-owner-x402-onboarding.test.ts`](../tests/integration/provider-connection-owner-x402-onboarding.test.ts)
- [`tests/integration/supplier-business-bootstrap.test.ts`](../tests/integration/supplier-business-bootstrap.test.ts)
- [`tests/integration/capability-supply-registration-eligibility.test.ts`](../tests/integration/capability-supply-registration-eligibility.test.ts)
- publication, Provider-connection, x402 seller-lifecycle, owner-workspace, earnings, and payout policy unit suites under [`tests/unit`](../tests/unit).

These prove current behavior, not Package 5 completion. Package 5 closure will ultimately need journeys spanning supplier entry through routeability loss and offboarding, but this research artifact does not draft that implementation plan.

## Maintained primitives and primary documentation

### Convex: durable coordination, not a second business authority

The repository already depends on `convex@1.45.0` and `@convex-dev/workpool@0.4.10`; it does not depend on `@convex-dev/workflow` ([package manifest](../package.json)).

- Convex mutations are transactional and automatically retried on optimistic concurrency conflicts. External side effects do not belong in mutations; actions are the boundary for non-deterministic work ([Convex optimistic concurrency control](https://docs.convex.dev/database/advanced/occ)).
- Scheduled functions are durably stored. Scheduling from a mutation is atomic with the mutation, but actions are at-most-once and are not automatically retried; application-level command identity and readback therefore remain necessary ([Convex scheduled functions](https://docs.convex.dev/scheduling/scheduled-functions)).
- Cron jobs guarantee at most one active execution for a given cron; a run may be skipped when the previous run is still active. This suits bounded stale-evidence sweeps, not correctness that depends on every tick occurring ([Convex cron jobs](https://docs.convex.dev/scheduling/cron-jobs)).
- Convex Workpool is the maintained bounded-parallelism component already installed. It supports retries for idempotent actions and completion callbacks; retry permission must follow the external effect's semantics, not convenience ([official Workpool component](https://www.convex.dev/components/workpool)).
- Convex Workflow is the maintained durable multi-step component. It persists step completion and resumes after transient failures, and is built on Workpool ([official Workflow component](https://www.convex.dev/components/workflow); [Convex workflow documentation](https://docs.convex.dev/agents/workflows)). It is relevant to a possible offboarding coordinator, but current evidence does not justify adding it before proving that the existing command journal and Workpool cannot express the required sequence.

**Research disposition:** keep Convex mutations as atomic state transitions and the installed Workpool as the default external-work primitive. Do not hand-roll a generic workflow engine. Do not add Workflow merely to rename the roadmap states.

### OpenAPI and JSON Schema: source description, not authority

- OpenAPI 3.1 is a language-neutral HTTP API description format. An Operation Object carries the operation identity, parameters, request body, responses, and security requirements needed for bounded import ([OpenAPI 3.1.1 specification](https://spec.openapis.org/oas/v3.1.1.html)).
- The OpenAPI specification warns that externally referenced descriptions can be untrusted and can create cycles or resource-exhaustion risks. Package 5 onboarding must preserve the repository's bounded dereference, size/depth, credential-leak, HTTPS, and selector checks rather than delegate admission to a generic parser ([OpenAPI 3.1.1 specification](https://spec.openapis.org/oas/v3.1.1.html)).
- OpenAPI 3.1 aligns schema use with JSON Schema Draft 2020-12 ([JSON Schema Core](https://json-schema.org/draft/2020-12/json-schema-core); [JSON Schema Validation](https://json-schema.org/draft/2020-12/json-schema-validation)).

**Research disposition:** retain the current 3.1.x profile and importer. OpenAPI describes a candidate interface; it cannot prove Provider authority, price, effects, readiness, useful delivery, or admission.

### MCP: official discovery and liveness primitives, not inferred trust

The repository already uses `@modelcontextprotocol/sdk@1.30.0` ([package manifest](../package.json)).

- MCP servers declare the `tools` capability; clients discover tools with paginated `tools/list`, and servers may advertise and emit `notifications/tools/list_changed` when their tool set changes ([MCP tools specification](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)).
- MCP defines `ping` as a liveness check whose receiver must respond promptly or may be disconnected ([MCP schema reference](https://modelcontextprotocol.io/specification/2025-11-25/schema)).
- Tool annotations are untrusted unless they come from a trusted server; clients must not convert descriptions or annotations directly into economic authority or effects truth ([MCP specification](https://modelcontextprotocol.io/specification/2025-11-25); [MCP tools specification](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)).

**Research disposition:** use the official SDK for negotiation, listing, change notifications, calls, and ping. Continue AE's own admission, authority, effects, and readiness checks. Do not hand-roll JSON-RPC or treat `ping`/`tools/list` success as useful Operation delivery.

### x402: payment protocol evidence, not useful-outcome evidence

The repository already pins `@x402/core`, `@x402/evm`, and `@x402/extensions` at `2.23.0` ([package manifest](../package.json)).

- x402 v2 separates the Resource Server, Client, and Facilitator and defines `PaymentRequired`, `PaymentPayload`, verification, and settlement response contracts ([x402 v2 specification](https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md)).
- The current specification explicitly supports different orderings: authorization (`verify → resource → settle → respond`), upfront (`settle → resource → respond`), and escrow (`settle → resource → settle → respond`). Therefore settlement timing cannot stand in for delivery or usefulness ([x402 v2 specification, payment-flow models](https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md#61-asset-transfer-methods-and-payment-flow-models)).
- Offer/receipt extensions can sign advertised terms and a successful interaction receipt, but they remain protocol evidence; AE still needs its own exact Operation, usable-result, remedy, and outcome provenance ([x402 offer/receipt extension](https://docs.x402.org/extensions/offer-receipt)).

**Research disposition:** keep the official packages and existing x402 seller lifecycle. Do not build custom headers, payment parsers, or a second x402 state machine. Never promote payment acceptance or settlement to useful outcome.

### Stripe Connect: hosted onboarding and payout readback

- Stripe recommends hosted or embedded onboarding because those maintained surfaces track changing verification requirements. An Account Link `return_url` only proves that the user exited the flow; the platform must retrieve current Account requirements or consume `account.updated` before treating onboarding as complete. Expired or previously visited single-use links should be regenerated through `refresh_url` ([Stripe hosted onboarding](https://docs.stripe.com/connect/custom/hosted-onboarding); [Stripe Connect onboarding](https://docs.stripe.com/connect/onboarding)).
- Stripe supports idempotency keys for POST requests; the same key returns the stored result, including a server error, while changed parameters are rejected. Keys may be pruned after at least 24 hours, so AE's durable command identity must outlive Stripe's cache ([Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests)).
- Connect balances distinguish pending and available funds. Failed transfers are not automatically retried, and payout failures can disable the associated external account; the platform needs authoritative status and an explicit corrective path ([Stripe Connect account balances](https://docs.stripe.com/connect/account-balances); [Stripe payout tasks](https://docs.stripe.com/connect/marketplace/tasks/payout)).
- Refunds of separate charges do not automatically reverse associated transfers, so offboarding cannot infer that a buyer refund resolved the Provider obligation ([Stripe separate charges and transfers](https://docs.stripe.com/connect/separate-charges-and-transfers)).
- A platform can delete eligible managed live accounts only when balances are zero; Standard accounts are not deleted by the platform through that endpoint ([Stripe delete an account](https://docs.stripe.com/api/accounts/delete)).

**Research disposition:** use hosted onboarding and Stripe account/payout readback as the processor-side evidence. AE's Package 4 ledger remains the commercial authority. Offboarding must complete or explicitly retain unresolved obligations before account deletion or detachment.

### Infisical: secret lifecycle and scoped machine access

- Infisical provides versioned secret storage, scoped access controls, machine identities, and short-lived authentication rather than application-owned plaintext credential storage ([secrets overview](https://infisical.com/docs/documentation/platform/secrets-mgmt/overview); [machine identities](https://infisical.com/docs/documentation/platform/identities/machine-identities); [access control](https://infisical.com/docs/documentation/platform/secrets-mgmt/concepts/access-control)).
- Every secret change creates a version, and Infisical exposes a maintained delete-secret API ([secret versioning](https://infisical.com/docs/documentation/platform/secret-versioning); [delete secret API](https://infisical.com/docs/api-reference/endpoints/secrets/delete)).

**Research disposition:** preserve the existing opaque secret pointer and generation model. Revocation should coordinate Provider-side revocation, Infisical deletion/rotation, and AE readback without copying secret material into Convex or logs. Do not build another vault.

### OpenTelemetry, W3C Trace Context, and PROV: correlation vocabulary, not a new source of truth

- OpenTelemetry's stable HTTP semantic conventions define request/response attributes, per-attempt spans, retry counts, and error/status rules suitable for correlating connection probes and upstream Calls ([OpenTelemetry HTTP spans](https://opentelemetry.io/docs/specs/semconv/http/http-spans/)).
- W3C Trace Context defines interoperable `traceparent` and `tracestate` propagation across services ([W3C Trace Context](https://www.w3.org/TR/trace-context-2/)).
- W3C PROV defines a conceptual model of entities, activities, agents, derivations, and time. It is useful for checking that outcome evidence states who observed what, from which Invocation and source, and when ([W3C PROV-DM](https://www.w3.org/TR/prov-dm/)).

**Research disposition:** reuse existing tracing identifiers and model Package 5 evidence with explicit subject, observer/source, Invocation, timestamp, validity window, digest, and evidence references. Do not add RDF, a provenance ontology runtime, or a second telemetry database merely to claim standards alignment.

### Sentry: incident input, not supplier-lifecycle authority

Sentry exposes project service hooks for event creation/alerts and APIs for monitor alerts ([Sentry service hooks](https://docs.sentry.io/api/projects/register-a-new-service-hook/); [Sentry monitor alerts](https://docs.sentry.io/api/monitors/create-an-alert-for-an-organization/)). This can supply incident evidence, but Sentry cannot decide whether an Operation is admitted, routeable, delivered, remedied, or commercially closed.

**Research disposition:** project relevant incident facts into the supplier view from canonical AE evidence. Do not create a Package 5 notification or incident-management platform; broad incident governance belongs to Package 8.

### CloudEvents: optional external-envelope standard, not a Package 5 event bus

CloudEvents 1.0.2 defines a small interoperable envelope with required `id`, `source`, `specversion`, and `type`; `source` plus `id` identifies duplicates, and optional attributes include subject, time, and schema ([CloudEvents specification](https://github.com/cloudevents/spec/blob/ce%40stable/cloudevents/spec.md)).

**Research disposition:** use CloudEvents only if Package 5 must expose an actual external event boundary already justified by the product. It does not justify a universal internal event envelope, event bus, or duplicate lifecycle authority.

## Package 5 equivalence pass

The following products and studies are evidence, not scope authority. “Demonstrates” means a first-party published or source-observed mechanism; it does not mean equivalent product semantics, production reliability, or market success.

### Whop

**Repository evidence.** [`research/WHOP-AE-MATURITY.md`](./WHOP-AE-MATURITY.md#L77-L102) identifies the useful benchmark as operational discipline: separate capability/authority/credential/resource readiness; stable identities and recoverable consequential work; sandbox-versus-production separation; refreshed discovery facts; explicit money states; durable sellable-unit lifecycle; use/economic/failure evidence; inspectable operational history; and resumable human action.

**What Whop actually demonstrates for Package 5.** Whop publishes scoped app permissions and renewed approval when permissions expand, OAuth installation/revocation behavior, sandbox limitations, signed and replayable webhooks, idempotent request semantics, product status management, connected-account enrollment, payout state, and payout troubleshooting ([permissions](https://docs.whop.com/developer/guides/permissions); [OAuth](https://docs.whop.com/developer/guides/oauth); [sandbox](https://docs.whop.com/developer/guides/sandbox); [webhooks](https://docs.whop.com/developer/guides/webhooks); [idempotency](https://docs.whop.com/developer/api/idempotency); [manage products](https://docs.whop.com/manage-your-business/products/manage-products); [connected accounts](https://docs.whop.com/developer/platforms/enroll-connected-accounts); [manual payouts](https://docs.whop.com/developer/platforms/manual-payouts); [payout troubleshooting](https://docs.whop.com/manage-your-business/manage-payouts/troubleshoot-payouts)).

This is evidence for explicit onboarding requirements, permission changes as a new consent state, durable operational history, and payout corrective actions.

**Non-equivalence.** A Whop product/membership is not an AE Operation; app installation is not Provider authority; a payment or membership state is not Invocation delivery, useful outcome, or commercial closure; and Whop's merchant/platform model does not establish AE's Provider/Seller/payment-recipient distinctions.

**Do not copy or hand-roll.** Do not import Whop's product/membership ontology, make app permissions the economic Mandate, duplicate Stripe/Whop payment state in AE, or build a custom webhook/idempotency framework where the current durable command/readback pattern already applies.

### Locus

**Repository evidence.** [`research/LOCUS-AE-MATURITY.md`](./LOCUS-AE-MATURITY.md#L55-L76) distinguishes current Locus Pro from its legacy wrapped API and other Locus products. Its operating-parity matrix highlights authoritative call recovery, retained webhook attempts, heterogeneous supply authority, reviewed contracts, strikes/automatic disablement for paid non-delivery, and earnings separated into accrued, matured, payable, and paid states.

**What Locus actually demonstrates for Package 5.** Locus Pro publishes catalog tiers and limitations, reviewed Provider contracts, authenticated catalog documents, final streaming/billing status, retained webhook delivery attempts, and margin-earnings states ([catalog](https://docs.paywithlocus.com/locus-pro/catalog); [catalog directory](https://docs.paywithlocus.com/locus-pro/catalog-directory); [full Provider catalog document](https://docs.paywithlocus.com/api-reference/catalog/get-one-full-provider-catalog-document); [reviewed model contract](https://docs.paywithlocus.com/api-reference/catalog/read-the-reviewed-inference-model-contract); [authoritative stream state and final billing](https://docs.paywithlocus.com/api-reference/burn/read-authoritative-stream-state-and-final-billing); [webhook event and attempts](https://docs.paywithlocus.com/api-reference/webhooks/inspect-an-event-and-every-delivery-attempt); [margin earnings](https://docs.paywithlocus.com/api-reference/ledger/margin-earnings)).

This is the closest external evidence for separating catalog quality tiers, automatically removing failing paid supply, retaining recovery history, separating stream acceptance from final delivery/billing, and projecting earnings maturity.

**Non-equivalence.** Locus catalogs can include registered, reviewed, parsed, and live-priced pass-through supply. Those tiers are not one exact supplier-owned AE Operation. A Locus provider endpoint or router result does not prove AE admission, exact commercial roles, useful outcome, remedy, or coordinated supplier offboarding.

**Do not copy or hand-roll.** Do not copy the wallet, PaaS, router, task, or generic provider-endpoint model. Do not treat paid delivery as usefulness. Do not add a parallel earnings ledger or let a heterogeneous catalog tier bypass AE's one routeability predicate.

### Nevermined

**Repository evidence.** [`research/NEVERMINED-AE-OPPORTUNITY-AND-STRUCTURE.md`](./NEVERMINED-AE-OPPORTUNITY-AND-STRUCTURE.md#L90-L203) separates Nevermined's native seller Agent/Plan lane from its external Catalog/Router lane and records durable connection, delegation, idempotency, payment-state, structured-error, webhook-history, and versioning patterns. The same study warns that SDK adapters differ and that delivery can diverge from settlement ([lines 205 onward](./NEVERMINED-AE-OPPORTUNITY-AND-STRUCTURE.md#L205)). The earlier maturity record is [`.planning/nevermined-docs/05-MATURITY-AND-OPPORTUNITIES.md`](../.planning/nevermined-docs/05-MATURITY-AND-OPPORTUNITIES.md).

**What Nevermined actually demonstrates for Package 5.** Nevermined publishes service/Agent registration linked to payment Plans, an external service Catalog and Router, organization-level analytics/observability, and maintained TypeScript and Python SDKs ([overview](https://nevermined.ai/docs/getting-started/overview); [AI services catalog](https://nevermined.ai/docs/products/catalog/ai-services); [catalog overview](https://nevermined.ai/docs/products/catalog/overview); [Router](https://nevermined.ai/docs/products/catalog/router/how-it-works); [observability](https://nevermined.ai/docs/development-guide/observability); [TypeScript SDK](https://github.com/nevermined-io/payments); [Python SDK](https://github.com/nevermined-io/payments-py)). Its public issue trackers document real delivery/settlement divergence rather than permitting payment success to erase it ([Python issue 218](https://github.com/nevermined-io/payments-py/issues/218); [TypeScript issue 367](https://github.com/nevermined-io/payments/issues/367)).

Repository evidence also records a documented service-health lifecycle with initial validation, a rolling health window, degraded status after failures, and eventual unlisting. This is useful operational evidence, but any exact threshold remains Nevermined policy—not an AE default.

**Non-equivalence.** A Nevermined `Agent` is commonly a seller-side monetized service record, not AE's buyer-side Agent Principal. A Plan is not an Operation; a Delegation or x402 permission is not a Mandate; catalog presence is not AE admission; and a payment status is not useful delivery or commercial closure.

**Do not copy or hand-roll.** Do not adopt Agent/Plan/credit terminology as universal AE semantics, copy adapter-specific state divergence, rely on process-local replay guards, or use Nevermined's health thresholds without AE evidence and an explicit policy decision.

### TREG

**Repository evidence.** The pinned TREG reference maps one shared backend, normalized catalog, organization-scoped connections, OAuth refresh/probes, credential injection, health/cleanup, call/run/audit history, and hold/settle/replay ([architecture, lines 31–93, 116–198](../.planning/reference/treg/ARCHITECTURE.md#L31-L93); [surface inventory](../.planning/reference/treg/SURFACES.md)). The external-registry promotion audit proves that TREG's public catalog metadata does not carry the account token, Provider authority, balance, or admission evidence required to become an AE Operation ([promotion audit, lines 141–180](./architecture/external-registry-promotion-audit.md#L141-L180)).

**What TREG actually demonstrates for Package 5.** The pinned first-party source exposes browser and CLI onboarding, provider/resource selection, connections, reconnect/disconnect, source catalog normalization, live verification examples, health checks, OAuth refresh, stale-consent cleanup, call/run/audit history, and retained billing state ([TREG pinned source](https://github.com/superdesigndev/treg/tree/603540f653994080d4f507a9a3564e1017c28eef); [TREG agent contract](https://treg.to/llms.txt); [live platform catalog](https://treg.to/catalog/platforms)). The pinned architecture notes that periodic health execution is external to that snapshot, which prevents overstating the maturity of its scheduler ([architecture, lines 184–198](../.planning/reference/treg/ARCHITECTURE.md#L184-L198)).

This is evidence for one clear onboarding action, connection-specific corrective actions, shared catalog normalization, and retaining operational history independently from best-effort analytics.

**Non-equivalence.** TREG is principally an authenticated connector/proxy and prepaid execution surface. Its YAML endpoint catalog is not AE's canonical market; a TREG connection does not establish independent-supplier authority; a successful health probe does not establish useful outcome; and its disconnect flow is not a coordinated AE offboarding across Calls and Provider obligations.

**Do not copy or hand-roll.** Do not promote TREG registry rows directly, copy its Integration/Connection ontology as the market model, use its encrypted database secret store instead of Infisical, adopt broad admin tokens, or vendor its source. Learn from the observed behavior without making TREG a Package 5 dependency.

### AgentMuxer

**Repository evidence and identity warning.** The repository previously had incomplete or time-sensitive information about Amorphic Labs' AgentMuxer. [`.planning/research/2026-08-27-donor-alpha-mining.md`](../.planning/research/2026-08-27-donor-alpha-mining.md#L48-L53) recorded a closed buyer-facing protocol at that date. [`.planning/research/POST-CALL-AGENT-EXPERIENCE-PRIMARY-SOURCES.md`](../.planning/research/POST-CALL-AGENT-EXPERIENCE-PRIMARY-SOURCES.md#L43-L45) correctly warns that the open-source AgentMux project is a different product and its implementation findings must not be attributed to AgentMuxer.

**What AgentMuxer currently demonstrates for Package 5.** As of this research date, AgentMuxer publicly presents a runtime market with a unified balance, priced capabilities, routing, and reported outcomes ([AgentMuxer](https://www.agentmuxer.com/)). Its public listing surface exposes a Provider, price, Operation/interface identity, interface and manifest digests, tier, and verification area ([example market listing](https://app.agentmuxer.com/market/x402-api-browser-use-com-api-v3-sessions)). Its Acceptable Use Policy requires Provider submissions to be authorized and accurate and permits restriction, suspension, or removal when requirements fail ([Acceptable Use Policy](https://app.agentmuxer.com/acceptable-use)). Its Privacy Policy describes Provider submissions, interface manifests, prices, availability/verification evidence, resolution handles, policy decisions, outcome reports, browser-local seller-form drafts before submission, and retention that can include append-only financial/security records ([Privacy Policy](https://app.agentmuxer.com/privacy)).

This demonstrates a public market listing with digests, a verification claim, Provider submission obligations, a platform removal power, and coarse outcome reporting.

**Non-equivalence and evidence limit.** The public surface does not disclose a supplier lifecycle state machine, corrective-action readback, paid non-delivery sampling policy, useful-outcome provenance policy, payout coordination, or offboarding implementation. Published terms and UI are not implementation proof. AgentMuxer is a managed/gated service, and its “offering” or `resolutionHandle` vocabulary does not override AE's Operation, Commitment, and Invocation model.

**Do not copy or hand-roll.** Do not infer private mechanisms, opaque ranking, or operational maturity from a listing page; do not copy the one-wallet/closed-curation model; do not adopt `offering`/`resolutionHandle` terms; and do not attribute open-source AgentMux implementation details to AgentMuxer. No AgentMux tools were used in this research.

### executor.sh

**Repository evidence.** [`.planning/research/2026-08-26-executor-managed-tools-and-ae-wedge.md`](../.planning/research/2026-08-26-executor-managed-tools-and-ae-wedge.md#L18-L139) observes a normalized MCP/OpenAPI/GraphQL/custom integration catalog, separate Integration and Connection resources, host-side secret resolution, progressive tool discovery, resumable approval, policy enforcement, and execution records. It also establishes that Executor's current commercial unit is execution infrastructure, not independent supply.

**What Executor actually demonstrates for Package 5.** Executor documents integrations separately from configured connections, supports multiple connections to one integration, injects credentials outside model-written code, presents MCP and other tools through a compact proxy, and implements policy/approval around calls ([product](https://executor.sh/); [integrations](https://executor.sh/docs/concepts/integrations); [connections](https://executor.sh/docs/concepts/connections); [MCP proxy](https://executor.sh/docs/mcp-proxy); [pinned source](https://github.com/UsefulSoftwareCo/executor/tree/eb34d049d76fb8aab8b0f765bac7aadb12f56950)).

This demonstrates mature separation of reusable interface description from account-specific connection, progressive discovery, credential isolation, and resumable approval. Its public page describes broader audit capability as forthcoming, so public claims must not be upgraded to shipped supplier-health or offboarding evidence without source/readback proof.

**Non-equivalence.** Executor connects a principal to capabilities it already controls. An Integration is not an AE Operation, a Connection is not Provider economic authority, a tool run is not a purchase, imported HTTP/MCP annotations are not an effects contract, and an execution trace is not a useful-outcome or commercial-closure record.

**Do not copy or hand-roll.** Do not import Executor's Integration/Connection ontology or OpenAPI parser, add its code sandbox or workflow engine, create a generic connector marketplace, or treat imported protocol annotations as authority. Preserve AE as one compact market integration above replaceable connector/execution substrates.

## Cross-study findings by Package 5 concern

| Package 5 concern | Strongest evidence | What transfers | What does not transfer |
|---|---|---|---|
| Supplier entry and eligibility | Existing AE funnel; Whop permissions; TREG onboarding; Nevermined service registration | One clear start, explicit requirements, source/connection separation, resumable external consent | Product/membership/Plan as Operation; endpoint import as admission |
| Eight-state lifecycle | Existing AE offering/publication/connection/x402 states; AgentMuxer submission/removal claims | One supplier-facing projection with causal reasons and authoritative next actions | Replacing lower-level state machines; copying another vendor's labels |
| Connection health | AE connection generation/digest and cleanup; MCP list-change/ping; TREG OAuth probes; Executor connections | Source-specific probes, expiry, drift, reauthorization, durable cleanup outcomes | Generic HTTP 2xx or ping as Operation usefulness |
| Validation/publication health | AE routeability quality gate; OpenAPI/MCP specifications; Locus reviewed tiers | Fail closed on exact current contract, authority, readiness, price, and evidence | Catalog presence, parser success, or payment challenge as publication |
| Paid non-delivery | AE x402 canary; Locus disablement/final billing; Nevermined delivery/settlement issues | Keep payment, transport, delivered units, completion, usefulness, and remedy separate | Payment/settlement/receipt as useful outcome |
| Useful-outcome evidence | Roadmap requirement; Whop maturity study; AE result evidence | Subject, sample size, recency, provenance, Invocation binding, replay exclusion | Opaque ratings, vendor scoring, or unverified self-report as routeability fact |
| Corrective action | AE command identities/readback; Stripe refresh and payout state; TREG reconnect; Executor resume | Exact reason, owner, safe action, original command identity, readback, unknown outcome | Stateless “retry” buttons or destructive reset |
| Offboarding | AE withdraw/revoke/cleanup; Stripe balance/payout/delete constraints | Ordered coordination while preserving each authority and retained evidence | Disconnect/delete as proof that Calls, refunds, or Provider obligations are complete |

## Patterns Package 5 must not hand-roll

The evidence rules out the following designs:

1. **A second lifecycle source of truth.** The roadmap's eight states should be a supplier-facing projection over existing authorities, with causal drill-down and deterministic mapping.
2. **A generic workflow engine.** Use current Convex mutations and Workpool first; consider the official Workflow component only through a separate dependency and migration decision backed by a concrete coordinator need.
3. **A protocol stack.** Use the existing official MCP and x402 packages and the bounded OpenAPI 3.1 importer. Do not implement JSON-RPC, payment headers, OAuth, schema resolution, or source health as ad hoc shared utilities.
4. **A secret store.** Infisical owns secret material; Convex retains opaque references, generations, authority digests, and evidence.
5. **A supplier money ledger.** Formance and Package 4 records own balances, Provider obligations, refunds, recovery, and Payout truth.
6. **A routeability override.** No dashboard state, incident dismissal, admin switch, payment result, or registry feed can bypass the existing exact quality gate.
7. **A general incident platform.** Package 5 needs supplier-facing incident information tied to an Operation and corrective action; Package 8 owns broader incident governance.
8. **A universal event/provenance system.** Existing durable records, evidence references, traces, and digests should carry Package 5 provenance. Standards can shape fields without creating another storage authority.
9. **A generic streaming platform.** Only an admitted streaming Operation can justify its bounded acceptance/capture/delivery/completion/disconnect/remedy evidence.
10. **Vendor ontology leakage.** Whop Product/Membership, Nevermined Agent/Plan, TREG Tool, AgentMuxer Offering/Resolution Handle, Locus endpoint/router, and Executor Integration/Connection do not become AE domain objects.

## Unresolved research questions that must become planning gates

These are not requests to expand scope. They are decisions the implementation plan must close before code changes:

1. **Deterministic lifecycle projection.** What exact precedence maps offering intent, funnel progress, publication reasons, connection state, x402 lane state, routeability, and offboarding progress into each of the eight roadmap states? Every input must retain its owning authority and evidence.
2. **Intent versus fault.** `Paused` must represent deliberate supplier/platform intent; `Action required` must represent a remediable fault or expired prerequisite. The mapping must prevent one from masking the other.
3. **Submission and review boundary.** The repository has lane-specific claim/admit/canary transitions but no proven cross-lane `Submitted`/`Under review` authority. The plan must identify the existing durable fact that owns each transition or define the smallest compatible addition.
4. **Useful-outcome policy.** Which Package 4 records can prove paid non-delivery and useful outcome, how are replay and synthetic canaries excluded, who may assert usefulness, what sample/recency thresholds affect routeability, and how is provenance read back?
5. **Incident projection.** Which existing operational facts qualify for supplier-facing incident information, and how are status, affected Operations, timestamps, mitigation, and corrective action presented without building Package 8?
6. **Outstanding-Call drain.** What exact Invocation states block connection revocation or retirement, which can be cancelled, which require reconciliation, and what timeout/owner governs unresolved external effects?
7. **Payout completion.** Which Formance/Package 4 Provider-obligation and Stripe Connect states prove `complete payout obligations`, and which retained unresolved states prevent destructive processor offboarding?
8. **Record retention explanation.** Which records are retained for ledger integrity, evidence, audit, security, tax/legal hold, dispute/recovery, and product learning; which authority defines each retention period; and which data can be deleted or de-identified? Legal policy remains an external gate, not an engineering invention.
9. **Workflow-component threshold.** Does offboarding require durable multi-step resume/cancel/status beyond current commands and Workpool? If yes, the plan must include exact package/version review, source inspection, migration/rollback, failure injection, and release proof before adding `@convex-dev/workflow`.
10. **Package 4 evidence readiness.** Which Package 5 surfaces remain synthetic or feature-gated until the open Package 4 managed-call, payout, recovery, restore, and canary evidence is closed?

## Research conclusion

The exact Package 5 opportunity is to turn the current collection of strong supply authorities into one coherent supplier operating experience while preserving their boundaries. Existing AE source is ahead of the comparison set on exact Operation identity, fail-closed routeability, authority generations, and payment-versus-usefulness separation. It is behind the roadmap on one canonical supplier-facing lifecycle, cross-lane corrective-action projection, sampled/provenanced useful-outcome health, and coordinated offboarding.

The external equivalence pass reinforces the same conclusion:

- Whop demonstrates operational discipline and payout remediation, not Operation semantics.
- Locus demonstrates mature catalog/recovery/paid-non-delivery/earnings patterns, but its heterogeneous supply tiers are not AE admission.
- Nevermined demonstrates seller registration and health/payment operations, while also proving that SDK and settlement/delivery divergence are real risks.
- TREG demonstrates connector onboarding, health, cleanup, and audit patterns, not an independent-supplier market lifecycle.
- AgentMuxer publicly demonstrates digested listings, Provider submission duties, removal authority, and coarse outcomes, but not the private mechanics needed for Package 5 equivalence.
- executor.sh demonstrates maintained connector substrate and connection isolation, not procurement, Provider obligation, useful outcome, or offboarding.

The dependency result is conservative: retain current official SDKs and components, rely on current Convex/Workpool coordination, Stripe Connect, Infisical, and existing evidence/routeability contracts, and make any new Workflow-component adoption a separately proved decision. The implementation plan should be atomic and PR-shaped, but it must be authored separately; this artifact deliberately stops at research evidence and planning gates.
