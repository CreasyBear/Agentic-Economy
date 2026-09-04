# Package 5 mature-scavenge comparison

**Status:** implementation comparison; external release evidence remains separate

**Reviewed:** 2026-09-04

**Scope:** roadmap Package 5A–5D only

**Decision:** use hosted and official maintained primitives for provider-owned mechanics; build only Agentic Economy's domain projection and cross-authority coordination.

## Executive decision

Whop, Locus and Nevermined do not provide one transferable “supplier operations” module. They do provide mature primitives that make most generic implementation unnecessary:

- Whop proves the hosted connected-account pattern: create a stable provider resource, send the person to an expiring hosted account link, then retrieve current verification/capability/payout state. Its webhooks are signed, at-least-once and unordered.
- Locus proves the connection and recovery contract: OAuth for interactive clients, immutable expiring scoped credentials for unattended agents, a live default-deny catalog, caller-scoped discovery, caller-supplied idempotency and result reread by receipt.
- Nevermined proves official Agent/Plan registration, atomic creation, payment-gate integration and request/cost/revenue observability through maintained SDKs/APIs.

Package 5 should therefore **not** build KYC/KYB, payout-method collection, OAuth token lifecycle, webhook cryptography/delivery, provider registration frameworks, metering, payout state, queues, workflow engines or provider status machines. It should build only:

1. the roadmap's exact eight-state AE projection;
2. stable reason codes and one continuation;
3. Operation-scoped paid non-delivery and Qualified Use evidence;
4. exact authority enforcement; and
5. AE's unique offboarding composition across publication, Calls, Provider obligations, Payouts, connections and retention.

## Implementation closeout — 2026-09-04

The final source implementation follows the shared reference pattern:

```text
stable AE connection or source-selection draft
→ expiring owner handoff or official SDK connection
→ authoritative source/connection readback
→ exact candidate-bound continuation
→ AE admission and publication
```

| Reference lesson | Implemented AE behavior | Proof boundary |
|---|---|---|
| Whop: hosted return is navigation, not completion | Protected HTTP and MCP setup returns to the exact attempt-bound source draft; publication proceeds only after live source/connection verification. | Provider attempt/callback, source-first owner and publication drift tests. |
| Locus: connection is durable and distinct from its credential | `connectionRef`, origin/resource, scheme, authority digest, generation and lifecycle remain stable while secret generations rotate in Infisical; local revoke fails closed before upstream cleanup completes. | Connection attempt, refresh/restart, cross-Business isolation, revocation and cleanup tests. |
| Nevermined: use maintained protocol/API primitives and retain stable IDs | Scalar parses OpenAPI; the official MCP v2 client owns initialization, OAuth, callback completion and `tools/list`; official Agent Plugins schemas and x402 packages validate their lanes. AE retains source revisions, remote refs, connection refs, admission cases and Operation refs as evidence. | Source-preview, MCP transport, Agent Plugin, x402 and publication contract tests. |
| All three: current readback beats redirect, webhook or metadata | Candidate selection is re-fetched before write; health and routeability use current AE qualification; Workflow status alone cannot retire a Provider. | Source-drift, routeability, offboarding completion and child-authority tests. |

The final closeout also removes the competing Offering editor, manual protocol JSON, `ae_envelope` writes, separate readiness/test/promotion ceremonies, and low-level MCP `auth()` orchestration. Supplier fleets are cursor-paginated; offboarding targets are processed in pages; the old 100-Offering ceiling is gone.

Deterministic changed-cone proof is **505 passing tests across 61 extant Package 5 files**. Three failures in the combined dirty-tree run are attributable to concurrent non-Package-5 work. This is implementation evidence, not live release evidence: real deployed OpenAPI, MCP, Agent Plugin and x402 publication-to-Invocation, Infisical-backed credentials, backup restoration and actual-client/package proof remain open.

## Authority and evidence rules

Product scope comes from [`PRODUCT.md`](../PRODUCT.md), canonical language from [`CONTEXT.md`](../CONTEXT.md), and exact Package 5 scope from [`IMPLEMENTATION_ROADMAP.md`](../IMPLEMENTATION_ROADMAP.md). The broad Package 5 evidence inventory is [`PACKAGE-5-SUPPLIER-OPERATIONS-PRIMITIVES-RESEARCH.md`](./PACKAGE-5-SUPPLIER-OPERATIONS-PRIMITIVES-RESEARCH.md).

The local scavenges remain useful because they preserve previously inspected vendor behavior and gaps:

- [Whop scavenge](../.planning/whop-docs/WHOP-SCAVENGE-PAPERCUTS.md)
- [Locus scavenge](../.planning/locus-docs/LOCUS-SCAVENGE-PAPERCUTS.md)
- [Nevermined scavenge](../.planning/nevermined-docs/NEVERMINED-SCAVENGE-PAPERCUTS.md)
- [Whop maturity study](./WHOP-AE-MATURITY.md)
- [Locus maturity study](./LOCUS-AE-MATURITY.md)
- [Nevermined opportunity/structure study](./NEVERMINED-AE-OPPORTUNITY-AND-STRUCTURE.md)

Current first-party vendor documentation controls any dependency or wire-level recommendation. Marketing pages and local scavenges may establish a pattern or research gap; they cannot establish an undocumented API contract.

## Feature-by-feature comparison

### 5A — supplier onboarding

#### Whop

Whop's platform flow creates a stable connected `Company` resource, then creates an expiring account link with `refresh_url`, `return_url` and `use_case: account_onboarding`. The person completes KYC on Whop's hosted surface. A separate `payouts_portal` account-link use case owns withdrawals, payout methods, KYC and identity verification. The return URL is navigation, not proof of completion. Sources: [enrol connected accounts](https://docs.whop.com/developer/platforms/enroll-connected-accounts), [create account link](https://docs.whop.com/api-reference/account-links/create-account-link), [hosted payout portal](https://docs.whop.com/developer/platforms/render-payout-portal), and [verification resource](https://docs.whop.com/api-reference/verifications/verification).

**Transferable mechanism:** stable upstream account ID → expiring hosted handoff → current resource/capability readback → exact required action.

**Direct AE adoption:** use the equivalent official hosted setup already selected for the configured lane, currently Stripe Connect and existing provider-connection/Clerk boundaries. Retain only opaque resource references, expiry, observed capabilities/requirements and evidence.

**Do not transfer:** Whop Company/Product/Membership roles, platform payment allocation or compliance conclusions. A Whop Company does not establish AE Provider authority, and Whop is not added merely to imitate its onboarding.

#### Locus

Locus separates sign-in identity, account/workspace and agent connection. Interactive clients use OAuth 2.1 with PKCE. Unattended enterprise agents use an Agent Connection that binds one account, immutable exact endpoint scope, expiry, per-call ceiling and per-loop budget. The credential is shown once; rotation preserves the connection and revocation permanently ends it. Sources: [account setup and recovery](https://docs.paywithlocus.com/locus-pro/account-setup) and [connect an agent](https://docs.paywithlocus.com/locus-pro/connect-agents).

**Transferable mechanism:** account identity is not the connection; the connection is a durable, inspectable, least-privilege setup, not merely a token.

**Direct AE adoption:** continue the existing AE distinction between Integration, Connection, credential, Account and Provider. The onboarding response must contain a native start/status action, not generated prose that asks the supplier to wire a harness manually.

**Do not transfer:** Locus's buyer wallet, credit account, provider catalog or Agent Connection as an AE Provider identity. Package 5 is supplier onboarding, not Package 6 Agent Principal onboarding.

#### Nevermined

Nevermined exposes official SDK/API registration for Agents and Plans and an atomic endpoint that creates an Agent plus associated Plan. The resource IDs are returned as stable readback. Sources: [Nevermined overview](https://nevermined.ai/docs/getting-started/overview), [atomic Agent and Plan registration](https://nevermined.ai/docs/api-reference/protocol/register-agent-and-plan), and the maintained [TypeScript payments SDK documentation](https://nevermined-io.github.io/payments/).

**Transferable mechanism:** where two provider resources must be born together, prefer a vendor-owned atomic operation; otherwise retain exact IDs and reconcile after each official call.

**Direct AE adoption:** use Nevermined's official SDK/API only if an existing authorised lane is actually Nevermined-backed. Store Agent/Plan/request IDs as upstream evidence beneath the AE Operation.

**Do not transfer:** Agent and Plan do not replace Agent Principal, Provider, Operation, Commitment or buyer consideration. Package 5 does not build a generic “register everywhere” provider framework.

#### 5A decision

| Function | Decision | Why |
|---|---|---|
| Business identity and authentication | Reuse current AE Account/Business/Provider authority | None of the vendors can establish AE authority from a connected account, wallet or credential. |
| KYC/KYB and payout method | Official hosted provider flow only | Whop/Stripe show this is provider-owned compliance and financial UI. |
| OAuth and token lifecycle | Official provider/client SDK only | Locus demonstrates complete PKCE, discovery, refresh rotation and revocation; rebuilding it creates security and recovery debt. |
| Provider resource creation | Official provider SDK/API, atomic when offered | Nevermined exposes atomic Agent+Plan creation; a 2xx without reread is insufficient. |
| Supplier start/status experience | AE shared action contract over stable refs/readback | This is AE's cross-lane user and machine projection, not vendor transport. |

### 5B — exact eight-state Operation lifecycle

#### Whop

Whop keeps resource identity separate from verification and sellability. Its verification resource has explicit created/started/submitted/processing/review/verified/action-required/declined/expired-style states plus machine and human error detail. Source: [Whop verification resource](https://docs.whop.com/api-reference/verifications/verification).

The useful lesson is not the enum. It is that provider state remains an inspectable resource with an exact blocker and that hosted return is not completion.

#### Locus

Locus documents its catalog as live and account-specific. Ordinary endpoints start disabled; configured enablement is the complete answer, and callers must not hard-code directory snapshots. Caller-visible catalogs apply tenant and user policy and expose stable IDs plus exact/dynamic/unavailable price state. Sources: [Locus catalog](https://docs.paywithlocus.com/locus-pro/catalog) and [connect an agent](https://docs.paywithlocus.com/locus-pro/connect-agents).

The useful lesson is default deny, live current readback and caller-specific executability. Catalog presence is not executable authority.

#### Nevermined

Nevermined's current public documentation establishes Agent/Plan registration and “publish your agent” flows, but the public pages inspected for this review do not establish a complete wire-level lifecycle equivalent to AE's Draft → Needs setup → Submitted → Under review → Published → Paused → Action required → Retired contract. The local scavenge records a Catalog validation/live/degraded/removal model and review timing; that remains a maturity reference, not an AE policy or current API guarantee. Sources: [monetize your AI](https://nevermined.ai/docs/solutions/agent-to-agent-monetization) and [static resource publication](https://nevermined.ai/docs/solutions/access-control-monetization-static-resources).

#### 5B decision

Keep the eight roadmap states as a pure precedence projection over current AE authorities. For an upstream-backed lane, retain:

- provider kind and stable resource/operation ID;
- raw status/code as bounded evidence, not as an AE enum;
- observed time and freshness/expiry;
- official current-resource retrieval evidence; and
- exact corrective action or external gate.

Do not persist Workflow steps, retry attempts or copied vendor states in the admission case. `Submitted` and `Under review` derive from the existing AE admission command plus current upstream readback. Acceptance, publication and routeability remain existing AE authorities. Admission continues to use the current Workpool/scheduled-reconciliation path unless PR 0 proves a concrete long-lived pause/resume gap that only maintained Workflow can close.

The Nevermined scavenge's 24-hour review and 72-hour degraded removal timings are not universal Package 5 policy. A provider-specific adapter may report those timings when the provider contract establishes them.

### 5C — operational health, outcomes and correction

#### Whop

Whop uses Standard Webhooks. Its official guide says deliveries are signed, at-least-once and unordered; consumers should verify with the SDK, deduplicate by webhook ID, acknowledge promptly and retrieve current resource state when ordering matters. Source: [Whop webhooks](https://docs.whop.com/developer/guides/webhooks).

Whop also tells platforms to fix a transfer failure's underlying cause before retrying. Direct charges and transfers assign different refund/dispute responsibility. Source: [collect payments for connected accounts](https://docs.whop.com/developer/platforms/collect-payments-for-connected-accounts).

**Transferable mechanism:** event = trigger/evidence, current resource = state; corrective action addresses the cause; money role and responsibility stay explicit.

#### Locus

Locus applies scope to discovery, schemas, estimates and execution; stale or forged execution is rejected before provider dispatch. Caller-supplied idempotency keys replay indefinitely for that key, while `get_call_result` rereads prior results by receipt. Locus separates pre-dispatch rejection/refund release from accepted streaming settlement and keeps raw provider output, normalized bounded context, receipts, per-step charges and provenance separate. Sources: [connect an agent](https://docs.paywithlocus.com/locus-pro/connect-agents), [catalog](https://docs.paywithlocus.com/locus-pro/catalog), [capability routing](https://docs.paywithlocus.com/locus-pro/capability-routing), and [activity and analytics](https://docs.paywithlocus.com/locus-pro/activity-and-analytics).

**Transferable mechanism:** exact idempotency survives caller retry; payment acceptance, provider result, delivered units and synthesized usefulness are separate; every aggregate has attributable drill-down.

#### Nevermined

Nevermined's official libraries provide payment validation and settlement/redemption around agent requests. Its observability integration records request/response status, usage, costs and revenue. Its A2A integration supports intermediate/final state events, polling/streaming and re-subscribe. Sources: [observability](https://nevermined.ai/docs/development-guide/observability), [x402 API](https://nevermined.ai/docs/api-reference/typescript/x402), and [A2A integration](https://nevermined.ai/docs/integrations/google-a2a).

**Transferable mechanism:** use the maintained library at the payment/protocol boundary and preserve request IDs for readback. Operational telemetry is evidence, not commercial truth.

#### 5C decision

1. Provider events enter only through an existing lane adapter using the provider's official verifier/client.
2. Deduplicate the provider event ID, acknowledge promptly and schedule bounded current-resource readback through existing Workpool/scheduling.
3. Persist the resulting observed fact in existing AE evidence/observability records. Do not create a generic Package 5 webhook endpoint, event bus, webhook-attempt product or raw-body archive.
4. Supplier list reads use persisted freshness-bounded evidence. They never call every provider live. A detail/correction action may make one bounded current-resource read.
5. Paid non-delivery derives only from AE Charge/payment plus delivery/recovery state. Unknown remains unknown.
6. Useful outcome derives only from the immutable Qualified Use receipt. Vendor request success, credit burn, settlement, rating, review or Provider claim never qualifies.

### 5D — supplier offboarding

#### What vendors solve

- Whop and Stripe provide hosted payout/compliance remediation and account/payout readback. Whop's connected-account docs do not establish an AE-equivalent cross-market retirement protocol. Sources: [Whop payout portal](https://docs.whop.com/developer/platforms/render-payout-portal) and [connected accounts](https://docs.whop.com/manage-your-business/manage-payouts/connected-accounts).
- Locus exposes official idempotent connection revocation and rotation. Revocation is permanent and should follow recovery of in-flight work. Source: [Locus connection lifecycle](https://docs.paywithlocus.com/locus-pro/connect-agents).
- Nevermined's current public documentation inspected here does not establish a Provider offboarding flow that drains AE Calls, waits for separate Provider obligations/Payouts, revokes every connection and explains retained records.

#### What remains uniquely AE-owned

No mature reference can retire an AE Provider because no reference owns all of AE's authorities. The justified custom composition is:

```text
fresh authorised request
  -> freeze AE routeability and unused leases
  -> prove zero routeable Operations
  -> drain/reconcile Calls through existing recovery
  -> wait for Package 4 Provider obligations and Payout readback
  -> call official provider unpublish/revoke APIs where configured
  -> revoke connections and vault material last
  -> verify every child authority
  -> Retired projection + retained-record explanation
```

The composition uses official Convex Workflow because it is a long-lived AE-owned sequence. The case record stores command identity, exact scope, Workflow ID, upstream refs, blockers, child readback refs, retention policy version and closure evidence. It does not contain a custom step engine, attempt counters, provider status state machine, payout state or credentials.

If a provider has no documented/testable unpublish, revoke or account-close primitive, that child action remains disabled or `Action required`. Package 5 must not invent a request, scrape a dashboard or equate deletion of a local row with external completion.

## Decisive no-handroll matrix

| Capability | Use | Do not build | Package 5 boundary |
|---|---|---|---|
| Human/business auth | Existing Clerk/AE Account and authority records | identity provider, session system | AE owns Business/Account/Provider authority semantics. |
| KYC/KYB/payout setup | Stripe Connect or configured lane's hosted portal | forms, document handling, bank/payout-method UI | Provider result is prerequisite evidence, not AE authority. |
| OAuth | Provider/client official SDK and hosted consent | discovery, PKCE, refresh rotation, revocation | AE stores opaque connection refs/generations only. |
| Provider registration | Configured provider's official SDK/API | universal provider registration framework | AE Operation remains canonical market supply. |
| Webhook verification | Provider official SDK; Standard Webhooks where provider specifies it | HMAC/signature implementation, generic webhook framework | Event triggers current-resource readback. |
| Durable cross-authority offboarding | Official `@convex-dev/workflow`, after PR 0 proof | saga engine, step table, retry counters | Workflow coordinates offboarding; child authorities prove completion. Ordinary admission remains on existing commands, Workpool/scheduling and readback unless a real long-lived gap is proven. |
| Bounded concurrency | Existing Convex Workpool | queue/worker system | Retry only idempotent/readback-recoverable work. |
| Aggregation | Existing `@convex-dev/aggregate` + indexed pagination | scans, in-memory fleet joins | Evidence remains exact Operation-scoped. |
| Payments and payout truth | Existing x402, Stripe and Package 4 Formance/obligation/Payout authorities | ledger, supplier balance, payout engine | Package 5 reads and explains; it does not pay. |
| Secrets | Existing Infisical adapter | vault, copied tokens in Convex/Workflow/logs | Revoke/rotate via maintained boundary. |
| Provider health | Official resource endpoint/webhook plus lane adapter | generic ping/status service, copied vendor state machine | AE projects exact prerequisite evidence and freshness. |
| Publication/lifecycle | Existing AE admission/publication/qualification + pure eight-state projector | second lifecycle database or per-surface label map | Upstream status is evidence only. |
| Useful outcome | Existing Qualified Use receipt | rating, review, LLM score, vendor success proxy | Outcome is AE-defined and provenance-bearing. |
| Provider exit | Official Workflow coordinating existing AE commands and official provider APIs | bespoke saga, blind retries, dashboard automation | This composition is unique AE domain work. |

## Required changes to the Package 5 build plan

The authoritative plan must require all of the following:

1. PR 0 inventories official hosted setup, OAuth/account-link, webhook verification, current-resource retrieval, publish/unpublish and revoke semantics for every enabled lane.
2. Whop/Locus/Nevermined SDKs are not dependencies unless an existing separately authorised lane actually integrates that provider.
3. Admission/offboarding case records are linkage and readback records, not shadow process state machines.
4. Provider webhooks use official verification and current-resource retrieval; no generic Package 5 webhook/event subsystem is created.
5. Supplier list reads never fan out to provider APIs.
6. Unsupported or undocumented provider operations are external/deployment gates, not implementation prompts.
7. Black-box tests prove return-without-completion, duplicate/out-of-order event delivery, current-resource precedence, changed-material replay conflict, revocation uncertainty and zero secret/raw-body persistence.
8. Closure includes a repository scan proving no custom OAuth, KYC/KYB, payout-method, webhook-signature, workflow-step, retry-counter or copied provider-status machinery landed.

## Vendor gaps that remain gates

| Gap | Evidence status | Package 5 treatment |
|---|---|---|
| Whop platform commercial availability | Connected Accounts docs say Platforms API is invite-only. | Reference only unless a commercial integration is separately authorised. |
| Whop complete provider/account closure | Not established in the public docs inspected. | Do not make Whop deletion an offboarding dependency or invent it. |
| Locus supplier publication/offboarding | Current public Locus Pro docs focus buyer catalog, credentials, metering and activity. | Use as connection/recovery maturity, not supplier lifecycle authority. |
| Locus webhook contract for this use | Not established in the current public docs inspected. | Do not copy webhook semantics from another vendor into Locus. |
| Nevermined exact catalog review/degradation wire contract | Local scavenge has maturity evidence; current public docs inspected do not establish the full API/status contract. | Keep as pattern only until current primary API docs prove it. |
| Nevermined Provider closure | Not established in the current public docs inspected. | AE offboarding remains a composition; provider-specific cleanup stays gated. |
| Cross-vendor useful outcome | None establishes AE Qualified Use. | Keep AE receipt and exclusions as sole authority. |

## Closure conclusion

The mature answer is not to choose Whop, Locus or Nevermined as Package 5's new system. It is to adopt their maintained provider mechanics at the boundary where they actually own the work, and refuse to rebuild those mechanics inside AE.

Package 5's custom surface is consequently narrow: one AE lifecycle projector, one exact health/evidence projection, one continuation contract, and one durable offboarding composition over existing authorities. Everything else is an official hosted flow, official SDK/API call, existing maintained component, or an explicit external gate.
