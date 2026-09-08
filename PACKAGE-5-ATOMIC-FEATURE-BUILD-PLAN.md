# Package 5 atomic feature-build plan — supplier operations

**Status:** core implementation landed on `main`; later handoff corrections locally verified but uncommitted; external release proof outstanding

**Date:** 2026-09-04

**Scope authority:** [`IMPLEMENTATION_ROADMAP.md`](./IMPLEMENTATION_ROADMAP.md#L850-L899)

**Prerequisites:** Package 4 contracts may be consumed, but Package 5 production claims remain gated by the open Package 4 release evidence in [`docs/guides/package-4-release-evidence.md`](./docs/guides/package-4-release-evidence.md).

**Research basis:** [`research/PACKAGE-5-SUPPLIER-OPERATIONS-PRIMITIVES-RESEARCH.md`](./research/PACKAGE-5-SUPPLIER-OPERATIONS-PRIMITIVES-RESEARCH.md)

This document is the user-approved Package 5 execution authority. It authorises the additive dependencies, contracts, schema, migration code and local implementation described below. Production activation and destructive migration remain separately gated by signed release evidence.

## Implementation record — 2026-09-04

**Reconciled 2026-09-05:** the core described below is present in `main` at
`987cdec5085c207eb6b9024b66ef4a20de8a3da0`; later connection-handoff and resume
corrections are uncommitted. The [transition review addendum](./PACKAGE-6-REVIEW.md#provider-handoff-and-recovery-transitions-source-and-focused-tests-verified)
records their focused local verification (4 files / 27 tests, typecheck and
narrow lint passing), while the repository import gate remains red on four
baseline imports in two Package 5 test files. This is not deployed or native
client proof. The 2026-09-04
changed-cone result was **505 passed, 3 failed across 61 files**, with the
concurrent-work failures detailed below. Neither that result nor the deployed
reference Provider added in `987cdec50` proves the complete staging journey.
This reconciliation did not rerun tests or deployed acceptance. The original
scope and release requirements are unchanged.

Implemented in the current worktree:

- Scalar-backed OpenAPI 3.0/3.1 validation and source preview for OpenAPI, MCP, Agent Plugins 1.0 and x402.
- Official MCP SDK discovery, pagination and exact tool contract projection.
- Credential-free resumable integration drafts on the existing Offering/access-path boundary.
- Owner and Agent publication paths both resolve the selected live Provider connection before preparing protected or x402 supply; cross-Business, inactive and unavailable connections fail closed.
- `supply.publish:v2`, canonical `sourceRouteRef`, admission cases and collision-safe publication identity.
- One `supplier_operations:v1` lifecycle projection across HTTP, MCP, CLI and owner UI.
- Operation-scoped delivery and Qualified Use evidence with bounded reads and retained last-healthy evidence.
- Official Convex Workflow Provider offboarding, strict Clerk reverification, owner start/resume/readback, Agent read-only status, routeability-first freeze and authoritative completion gates.
- Generated Convex bindings, packaged CLI status support, action-registry parity and owner UI integration.
- Exact MCP Registry and Agent Plugin remote selection before endpoint access; unsupported siblings cannot suppress a valid remote and no tool namespaces are merged.
- An attempt-bound pre-admission source-selection draft, so protected MCP discovery resumes the exact source after OAuth instead of the latest browser draft.
- MCP OAuth start and completion through the pinned official v2 client and `StreamableHTTPClientTransport`; complete callback parameters reach `finishAuth`, reconnection uses a fresh transport, and refreshed tokens remain in Infisical.
- JSON file intake for official Agent Plugins 1.0 documents; no Provider is asked to paste tool definitions or AE-specific source envelopes.
- Cursor-paginated Supplier Operations and paged offboarding targets with the former 100-Offering fleet ceiling removed.
- Removal of the competing Offering editor, public v1-style writer, and separate preflight/readiness/test/promotion ceremonies from shipped web, HTTP/action, MCP and CLI surfaces.

Release claims intentionally remain open for:

- hosted API-key/Bearer secret entry through the configured Infisical deployment;
- complete MCP OAuth callback, refresh and upstream revocation against real Provider servers;
- active admission/offboarding backup-and-restore rehearsal;
- staging fixtures for every source family, packaged CLI proof and live buyer invocation;
- Package 4 legal, tax, accounting, retention and real-money gates.

No maturity item may be closed from the local implementation record alone.

## 1. Outcome

Package 5 closes the supplier operating loop over the supply system already in the repository:

```text
one start
  -> source and connection fit
  -> submission and admission
  -> one exact eight-state Operation lifecycle
  -> routeability and evidence health
  -> corrective action with durable readback
  -> ordered Provider offboarding
  -> Calls and payout obligations resolved
  -> retained records explained
```

The implementation must make the same facts and valid next action available through owner UI, HTTP/action contracts, MCP and CLI. It must not create a second market, second lifecycle authority, second money ledger, or supplier-only operational truth.

Package 5 is complete only when a Provider can:

1. learn whether the currently supported source lane fits and what setup is missing;
2. take one machine-readable starting action;
3. observe every Operation in exactly one of `Draft`, `Needs setup`, `Submitted`, `Under review`, `Published`, `Paused`, `Action required`, or `Retired`;
4. see the causal authority, evidence freshness, sample size, provenance, incident condition, and one valid corrective action behind that state;
5. lose routeability immediately when the current contract, authority, readiness, required admission evidence, publication intent, or material identity is invalid;
6. distinguish paid non-delivery from Qualified Use without treating payment, HTTP success, a rating, or Provider assertion as useful outcome; and
7. start, leave, resume and recover a durable offboarding operation that withdraws Operations first, drains or reconciles Calls, waits for Provider obligations and Payouts, revokes connections last, and explains retained records.

## 2. Exact roadmap scope

Only the following work is authorised by Package 5.

### 5A — Supplier onboarding

- eligibility and fit check;
- current supported source types;
- required connection setup;
- admission expectations; and
- one clear starting action.

### 5B — Operation lifecycle management

- `Draft`;
- `Needs setup`;
- `Submitted`;
- `Under review`;
- `Published`;
- `Paused`;
- `Action required`; and
- `Retired`.

### 5C — Operational health

- connection and validation failures;
- publication blockers and stale Operation data;
- exact corrective actions;
- supplier-facing incident information;
- verified paid non-delivery and useful-outcome evidence with sample size, recency and provenance; and
- removal from routeability when current contract, authority, readiness or required evidence expires, fails, is withdrawn or materially drifts.

### 5D — Supplier offboarding

- unpublish Operations;
- revoke connections;
- resolve outstanding Calls;
- complete payout obligations; and
- explain retained records.

Package 5 consumes Package 4 evidence. It does not reopen Package 4's ledger, Provider-obligation, recovery, Charge, refund or Payout ownership decisions.

## 3. Locked decisions

1. **One supply system.** Package 5 is a projection and coordination layer over current Operation, publication, connection, Invocation, Qualified Use, Provider-obligation and Payout authorities.
2. **The eight roadmap states are external projection states.** They are derived from existing authorities plus a minimal durable admission/offboarding process record. They do not replace lower-level state machines.
3. **One projector.** UI, HTTP, MCP and CLI consume the same versioned supplier-operations contract and never maintain local label maps.
4. **One routeability predicate.** Existing candidate qualification and the supply quality gate remain the only way to become routeable. The new lifecycle can explain routeability; it cannot override it.
5. **Useful outcome means Qualified Use.** It is production, contract-valid, released, non-self and not refunded before delivery. Ratings, HTTP status, payment acceptance, settlement and Provider self-report do not count.
6. **Observational performance is not an automatic routing score.** Paid non-delivery and Qualified Use are shown with provenance. Package 5 removes routeability for failed current prerequisites and required evidence, not for popularity or an invented quality threshold.
7. **Intent and fault remain separate.** `Paused` is deliberate reversible intent. `Action required` is a remediable fault, expiry, drift, unresolved consequence or blocked offboarding step, and takes precedence over `Paused`.
8. **Maintained durable orchestration.** Add the official `@convex-dev/workflow` component only after PR 0 compatibility, interruption and restore proof, and use it for Provider offboarding. Ordinary admission reuses the current exact commands, Workpool/scheduled reconciliation and provider current-resource readback. Workflow may enter one admission lane only if PR 0 demonstrates a real long-lived pause/resume sequence that those primitives cannot express. Provider-owned setup, verification, OAuth, payout configuration, publication and revocation use the provider's hosted flow or official SDK/API. Do not implement a workflow engine, provider setup flow, webhook framework, custom cron loop, retry counter or generic step table.
9. **Workflow and upstream status are not domain truth.** Workflow coordinates exact idempotent commands; provider resources report provider state. Publication, Call, Formance, Payout, connection and current provider-resource readback decide whether an AE step completed. Package 5 stores stable references and evidence, not a shadow copy of either state machine.
10. **External effects are never blindly retried.** Every consequential step follows prepare -> external effect -> finalize/readback. Ambiguous outcomes become `Action required` or remain under bounded reconciliation.
11. **Offboarding reduces authority before deleting access.** New routeability is frozen first; outstanding Calls and money are resolved before connection revocation and secret deletion.
12. **Offboarding never creates a payout shortcut.** The workflow waits on Package 4 obligations and the existing separately authorised Payout command. A blocked or unknown payout blocks completion.
13. **No fabricated retention policy.** Product, money, authority and audit records are retained according to an approved record-class schedule. Production offboarding completion is gated if that schedule is absent.
14. **Migration is additive, measured and removable.** Add the canonical projection and indexes first, migrate every consumer, prove zero use of legacy supplier status shapes, then remove them in a later deployment. No dual truth and no unbounded compatibility period.
15. **Streaming is conditional.** Streaming evidence fields ship only for an admitted streaming Operation. Package 5 does not build a general streaming platform.

## 4. Governing evidence and primary references

### Repository authority

- [`PRODUCT.md`](./PRODUCT.md) owns the product and commercial boundary.
- [`CONTEXT.md`](./CONTEXT.md) owns canonical domain language.
- [`DESIGN.md`](./DESIGN.md) requires machine parity, visible provenance, separate commercial roles, and one valid next action.
- [`IMPLEMENTATION_ROADMAP.md`](./IMPLEMENTATION_ROADMAP.md#L850-L899) owns Package 5 scope.
- [`PACKAGE-4-ATOMIC-FEATURE-BUILD-PLAN.md`](./PACKAGE-4-ATOMIC-FEATURE-BUILD-PLAN.md) and its release evidence own inherited Package 4 decisions and gates.
- [`convex/_generated/ai/guidelines.md`](./convex/_generated/ai/guidelines.md) owns project-specific Convex rules.
- Current source and black-box tests own implemented truth.

### Maintained primitives

| Concern | Maintained primitive | Decision |
|---|---|---|
| Provider offboarding | [Convex Workflow](https://www.convex.dev/components/workflow), built on Workpool | Adopt after PR 0 proves the exact pinned version, generated API, interruption recovery, cancellation and restore. Each step calls an existing idempotent domain command or an official provider action with authoritative readback. Admission stays on current commands + Workpool/scheduling unless PR 0 proves a genuine long-lived lane-specific gap. |
| Bounded external work | Installed [Convex Workpool](https://www.convex.dev/components/workpool) | Retain for probes, connection cleanup and bounded child work. Retry only steps proven idempotent or backed by authoritative readback. |
| Durable scheduling | [Convex scheduled functions](https://docs.convex.dev/scheduling/scheduled-functions) | Use atomic mutation-to-schedule handoff and existing cron only for bounded freshness sweeps. Never depend on every cron tick for correctness. |
| Bounded reads | [Convex pagination](https://docs.convex.dev/database/pagination) and installed `@convex-dev/aggregate` | Add indexes and maintained aggregates before supplier-wide evidence reads. No table scans, growing `.collect()`, or in-memory fleet joins. |
| Provider payout setup/status | [Stripe Connect API onboarding](https://docs.stripe.com/connect/api-onboarding), [verification requirements](https://docs.stripe.com/connect/handling-api-verification), and [connected-account payouts](https://docs.stripe.com/connect/payouts-connected-accounts) | Read the Account/capability and Payout state or webhook-derived readback. A return URL is not completion. Package 4 remains the commercial money authority. |
| Hosted provider setup | Current lane's official hosted onboarding/OAuth/account-link surface. [Whop account links](https://docs.whop.com/developer/platforms/enroll-connected-accounts), [Whop hosted payout portal](https://docs.whop.com/developer/platforms/render-payout-portal), and [Locus OAuth/Agent Connections](https://docs.paywithlocus.com/locus-pro/connect-agents) are maturity references. | Adopt the equivalent official flow for an already-supported lane; store only stable resource IDs, expiry, scopes/capabilities and readback evidence. Do not build KYC/KYB, payout-method, OAuth-token-lifecycle or provider-consent UI/backend. |
| Provider events | Current lane's official SDK verifier and resource client. [Whop uses Standard Webhooks](https://docs.whop.com/developer/guides/webhooks); Nevermined advertises signed webhooks plus queryable history for platform integrations in its [agentic payments infrastructure](https://nevermined.ai/use-cases/agentic-payments-infrastructure/). | Verify with the maintained SDK, deduplicate the provider event ID, acknowledge promptly, then fetch the current resource before changing a projection. No generic webhook framework, custom signature implementation or event-as-current-state shortcut. |
| Payment uncertainty | [x402 protocol v2](https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md) and installed official x402 packages | Preserve `settlement_pending` transaction/network evidence and reconcile before retry. Settlement remains separate from delivery and usefulness. |
| MCP source discovery | [MCP 2026-07-28 tools specification](https://modelcontextprotocol.io/specification/2026-07-28/server/tools) and pinned `@modelcontextprotocol/client` v2 | Use `Client`, `StreamableHTTPClientTransport`, OAuth, `tools/list` and pagination through the SDK. Tool annotations and ping remain untrusted readiness inputs. |
| HTTP source description | [OpenAPI 3.1.1](https://spec.openapis.org/oas/v3.1.1.html) and [JSON Schema 2020-12](https://json-schema.org/draft/2020-12/json-schema-core) | Retain the bounded existing OpenAPI 3.1 importer. Do not widen to 3.2 or infer authority/readiness from a parsed document. |
| Secret material | Existing Infisical adapter and [machine-identity/access-control primitives](https://infisical.com/docs/documentation/platform/identities/machine-identities) | Keep only opaque references and generations in Convex. Revoke/rotate through the maintained provider/vault boundary; never copy credentials into workflow input, evidence or logs. |

No generic event bus, incident product, telemetry store, protocol parser, secret vault, ledger or ranking dependency is authorised. Whop, Locus and Nevermined are reference implementations, not Package 5 dependencies: add one of their SDKs only if a separately authorised existing source lane actually integrates that provider and PR 0 proves the exact official client surface needed.

## 5. Equivalent maturity references

The broad evidence pass is in [`research/PACKAGE-5-SUPPLIER-OPERATIONS-PRIMITIVES-RESEARCH.md`](./research/PACKAGE-5-SUPPLIER-OPERATIONS-PRIMITIVES-RESEARCH.md). The feature-by-feature build/buy decision is in [`research/PACKAGE-5-MATURE-SCAVENGE-COMPARISON.md`](./research/PACKAGE-5-MATURE-SCAVENGE-COMPARISON.md). These products shape operating standards, not AE domain scope.

| Reference | Package 5 maturity it demonstrates | Reuse in AE | Explicit rejection |
|---|---|---|---|
| Whop | a stable connected-company resource followed by expiring hosted account links for onboarding/KYC or payouts; verification resources expose current status/error; signed at-least-once webhooks are verified by its SDK; transfers require cause correction before retry | copy the hosted-handoff + stable-resource + current-readback shape, using the official primitive for the actual configured lane | do not add Whop merely to imitate it; Product/Membership is not Operation; a return URL or webhook is not completion; Whop payment roles cannot overwrite AE Seller/Provider/payment-recipient roles |
| Locus | resumable self-service provisioning; browser OAuth or immutable, expiring, budget/scoped Agent Connections; a live account-specific default-deny catalog; exact execution idempotency and result reread by receipt; append-only attributed activity | copy the durable resource, least-privilege scope, fail-closed catalog, caller-specific capability and receipt-readback contracts; use its official SDK only if Locus becomes an authorised lane | do not copy its catalog, credits ledger, routing or provider abstraction into Package 5; no pass-through endpoint tier can bypass AE admission; usage spend is not Qualified Use |
| Nevermined | official SDK/API registration of an Agent and Plan, including atomic registration; payment libraries own x402 verification/settlement; App/API observability tracks requests, credits and revenue; current public docs do not establish a complete supplier-offboarding or AE-equivalent usefulness contract | copy atomic provider-resource creation where supported, retain stable Agent/Plan/request IDs as upstream evidence, and use the official payments library for a Nevermined lane | do not hand-build its gateway, payment verifier, metering or observability; Agent/Plan/credit and request-success terms do not replace Agent Principal, Operation, Commitment, delivery, commercial closure or Qualified Use |
| TREG | one clear connector start, normalized catalogs, connection probes/reconnect, secret injection, call/run/audit history | reuse the integration-versus-connection distinction below the market and expose exact corrective actions | a registry row, endpoint, connection or health probe cannot become an Operation |
| AgentMuxer | priced capability listings, interface/manifest digests, Provider submission duties, restriction/removal, coarse outcomes | visible immutable identity/digest and Provider-facing compliance state | no inference about private lifecycle, payout, health thresholds, ranking or offboarding; do not confuse it with open-source AgentMux |
| executor.sh | normalized MCP/OpenAPI/GraphQL/custom substrate, per-user connections, host-side credentials, search/describe/call, resumable approval | treat connectors/execution as replaceable substrate; keep credentials outside model-authored code | Integration/Connection is not an Operation or purchase; do not add its sandbox, connector marketplace or workflow product |

AE is already ahead of these references on exact Operation identity, authority generations, fail-closed routeability and payment-versus-usefulness separation. Package 5 closes the gap in one external lifecycle, cross-lane corrective action, sampled/provenanced outcome evidence and coordinated offboarding.

### Package 5 scavenge contract: adopt, adapt, prohibit

| Package 5 function | Exact mature mechanism | Package 5 decision | Prohibited handroll |
|---|---|---|---|
| 5A account/compliance/payout setup | Whop creates a stable connected Company then returns an expiring hosted account link with `refresh_url`, `return_url` and a declared use case; its hosted payout portal owns KYC, payout methods and withdrawals. Locus uses OAuth 2.1 + PKCE for interactive clients and immutable, expiring Agent Connections for unattended runtimes. | For each existing lane, return the official hosted URL or official OAuth/connection start, plus stable provider resource ID, expiry and a status action. Today that means the existing Stripe Connect/Clerk/provider-connection primitives, not a new Whop/Locus dependency. | custom KYC/KYB forms; custom payout-method collection; custom OAuth discovery, PKCE, refresh rotation or revocation; storing provider secrets/tokens in Convex; treating redirect return as setup completion |
| 5A/5B submission | Nevermined exposes official Agent and Plan registration and an atomic Agent+Plan endpoint; Whop and Locus keep resource identity separate from enablement/availability. | AE creates/updates only its Operation and exact admission command. If an existing lane has an upstream resource, its official SDK/API creates it and the AE case stores the stable upstream ID. Missing vendor atomicity is handled by current Workpool/scheduled reconciliation and readback unless PR 0 proves a real pause/resume need. | a universal provider-registration engine; duplicate Agent/Product/Plan domain objects; provider-specific process columns in the Operation; success inferred from a 2xx without resource retrieval |
| 5B lifecycle | Locus's catalog is live, account-specific and default-disabled; Whop verification exposes explicit in-progress/action-required/terminal statuses; Nevermined's scavenged Catalog lifecycle separates validation, live, degraded and removal. | Preserve the roadmap's eight AE states as one pure precedence projection. Preserve upstream status/code/observed time as evidence and translate it through a lane adapter; never persist vendor status as AE lifecycle authority. Nevermined's 24-hour/72-hour timings remain vendor-specific evidence, not AE-wide policy. | copying a vendor enum into AE; hard-coded catalog snapshots; per-surface status maps; a second publication state machine; universal strike/auto-unlist thresholds borrowed from a vendor |
| 5B/5C asynchronous change | Whop delivers signed, at-least-once, unordered webhooks and tells consumers to deduplicate and fetch the current resource when order matters. Locus makes the live catalog/result receipt rereadable. Nevermined advertises signed webhooks, a live stream and queryable transaction history, but its public docs do not prove all delivery semantics. | Use the actual provider's official verifier/client. Event receipt schedules bounded work; current resource readback is evidence. Preserve event/resource IDs and observed times in existing evidence/observability records. Poll only where the provider documents polling and no event exists. | generic Package 5 webhook/event bus; custom signature crypto; raw webhook body as current truth; assuming order or exactly-once; creating a second event-attempt store; correctness dependent on cron delivery |
| 5C paid non-delivery | Locus distinguishes rejection before dispatch, accepted streaming, refund/release and result reread. Nevermined validates before the service and settles/redeems through its official library. | Keep AE's existing Charge/payment, delivery/recovery and commercial-closure authorities separate. Project `paid + not_delivered`, `paid + delivery_unknown` and recovered outcomes from those records only. | equating 2xx, accepted stream, webhook receipt, credit burn or settlement with delivery; copying a provider's refund/strike state; a parallel delivery ledger |
| 5C useful outcome/provenance | Locus preserves raw provider output, bounded normalized context, receipts and source provenance; Nevermined observability records request/cost/status; neither proves AE's declared useful outcome. | Keep Qualified Use as the sole usefulness event. Reuse immutable receipts and show window, sample, exclusions, recency and evidence refs. Vendor telemetry is operational evidence only. | ratings/reviews as outcome truth; Provider self-attestation; model-generated quality scores; vendor request success as Qualified Use; automatic routing/ranking from observational rates |
| 5D payout remediation | Whop and Stripe provide hosted payout/compliance flows plus current account/payout readback; Whop says to fix a failed transfer's cause before retry. Locus separates gross usage, refunds, margin and payout treatment. | Link to the official hosted remediation surface and reread the current Account/Payout/obligation authority. Package 5 may wait and explain; it never initiates or marks a payout paid. | payout UI, KYC UI, payout balance or payout state machine; blind transfer retry; deleting a blocked payout requirement; conflating earned, payable, available and paid |
| 5D Provider exit | Locus provides official idempotent credential revocation; Whop/Stripe expose provider-owned account and payout actions. None of Whop, Locus or current Nevermined public docs proves an AE-equivalent cross-Operation, in-flight Call, Provider-obligation and retention-aware closure primitive. | This is the justified AE-owned composition: official Workflow orders existing AE commands and provider SDK/API actions, while authoritative child readbacks prove completion. Freeze routeability first and revoke connections last. | custom saga engine, step table or retry scheduler; upstream account deletion as AE retirement; credential deletion before Call/money reconciliation; hard deletion without retention authority |

The only Package 5 code that may be bespoke is AE domain code: the eight-state projector, reason/continuation mapping, exact Operation-scoped evidence projection, authority checks, and the ordered composition of existing authorities. Transport, identity, compliance, OAuth, payments, payouts, secrets, queues, workflows, webhook verification and provider resource management must use the maintained primitive already chosen for that lane.

## 6. What already exists

| Existing implementation | Evidence | Package 5 disposition |
|---|---|---|
| Five admitted source kinds and publication readiness/provenance | [`src/modules/capability-supply/internal/convex-schema.ts`](./src/modules/capability-supply/internal/convex-schema.ts#L175-L248) | Reuse. Package 5 documents exactly these source profiles and adds no source lane. |
| Fail-closed publication lifecycle and 24-hour maximum readiness | [`src/modules/capability-supply/internal/publication/lifecycle.ts`](./src/modules/capability-supply/internal/publication/lifecycle.ts#L15-L128) | Reuse as an input authority. Do not rename it into the external lifecycle. |
| Owner onboarding funnel and one UI CTA | [`AeSupplySourceNativeStart.tsx`](./src/components/ae/supply/AeSupplySourceNativeStart.tsx), assembled by [`owner.offerings.new.tsx`](./src/routes/_operator/owner.offerings.new.tsx) | Keep the user journey; replace inferred/ad hoc status with the shared contract and machine-equivalent start action. |
| Current five-state management summary | [`src/modules/capability-supply/tool-health.ts`](./src/modules/capability-supply/tool-health.ts) | Supersede through an additive adapter, consumer migration and measured removal. |
| Ad hoc owner labels | [`src/components/ae/offerings/provider-workspace-projection.ts`](./src/components/ae/offerings/provider-workspace-projection.ts) | Delete after every surface consumes the canonical projector. No second label map survives. |
| Routeability quality gate and candidate qualification | [`src/modules/capability-supply/internal/graph/quality-gate.ts`](./src/modules/capability-supply/internal/graph/quality-gate.ts), [`qualify-candidate.ts`](./src/modules/capability-supply/internal/graph/qualify-candidate.ts) | Reuse without bypass. Add only required evidence freshness inputs supported by the roadmap. |
| Provider connection authority, generation, leases, revoke and cleanup | [`src/modules/capability-supply/internal/provider-connection/types.ts`](./src/modules/capability-supply/internal/provider-connection/types.ts), [`convex/capabilityProviderConnectionCleanup.ts`](./convex/capabilityProviderConnectionCleanup.ts) | Reuse as child commands/readbacks in offboarding. |
| x402 seller admission/canary/reconciliation | [`src/modules/capability-supply/internal/x402-seller-onboarding/lifecycle.ts`](./src/modules/capability-supply/internal/x402-seller-onboarding/lifecycle.ts) | Reuse as lane-specific admission and evidence input. Do not build another x402 lifecycle. |
| Package 4 Call projection | [`src/modules/capability-execution/internal/convex-schema.ts`](./src/modules/capability-execution/internal/convex-schema.ts#L286-L324) | Reuse as paid non-delivery and drain authority; add provider/business bounded indexes before fleet reads. |
| Immutable Qualified Use receipt | [`src/modules/money/internal/delivery.ts`](./src/modules/money/internal/delivery.ts#L1-L138) | Reuse as the only useful-outcome evidence. Repair missing Operation scoping in its market-evidence projection. |
| Provider earnings and Payout readbacks | [`src/modules/money/public.ts`](./src/modules/money/public.ts), [`src/modules/money/internal/convex-schema.ts`](./src/modules/money/internal/convex-schema.ts) | Reuse. Offboarding observes and waits; it does not write balances or infer settlement. |
| Durable command identities and exact replay/conflict | [`src/modules/capability-supply/supply-actions.ts`](./src/modules/capability-supply/supply-actions.ts), connection command model and Package 4 execution | Apply to submission, correction and offboarding commands. |
| Hourly readiness refresh | [`convex/crons.ts`](./convex/crons.ts) | Keep as freshness maintenance, not completion authority. |

The current owner projection is not a foundation to extend blindly. [`convex/capabilitySupplyOwnerFunnelProjection.ts`](./convex/capabilitySupplyOwnerFunnelProjection.ts) has fixed-cap incomplete reads, per-publication connection/binding queries, query-time `Date.now()`, and empty activity/event inputs. Package 5 replaces those fleet joins with indexed paginated projections and materialized evidence windows.

## 7. Authority and data ownership

| Fact | Sole authority | Package 5 may do |
|---|---|---|
| Operation definition and revision | capability contract/offering/publication records | display exact refs/digests and derive lifecycle |
| Provider authority and credential readiness | current connection, grant/generation and secret-provider readback | explain, request correction, revoke through existing command |
| Admission/conformance/readiness | binding, publication and lane-specific admission evidence | coordinate review and project state; never forge acceptance |
| Routeability | existing candidate qualification + quality gate | consume and explain; never override |
| Invocation delivery/uncertainty | Invocation/Call projection and recovery evidence | aggregate paid non-delivery and block offboarding drain |
| Useful outcome | immutable Qualified Use receipt | count by Operation/window with provenance |
| Buyer Charge and Provider obligation | Package 4 Convex product records plus Formance authority | read; never infer one from the other |
| Payout | Package 4 payout command/readback plus Stripe state | wait and expose correction; never auto-bypass authority |
| Offboarding Workflow progress | Convex Workflow | coordinate only; completion requires child-authority readback; ordinary admission stays on current commands/Workpool/scheduling |
| Supplier-facing lifecycle | one pure Package 5 projector | derive external state, reason codes, freshness and continuation |

### Offboarding authority

- Starting Provider offboarding is a protected, high-consequence action bound to the exact owning Account, Business, Provider, authority generation, current Operation revisions and connection generations.
- An interactive Business Principal must provide current strict Clerk reverification. Funding, a wallet, a payout recipient, a Provider endpoint or a broad admin role is not authority.
- An Agent Principal may read status and perform separately delegated corrective actions. It cannot originate whole-Provider offboarding unless a future explicit product decision adds a dedicated exact grant; that is not part of Package 5.
- The signed authority snapshot authorises only the case's listed reduction steps. Any material generation/digest drift stops the workflow in `Action required` and requires a new command; it is never silently widened.
- Payout creation/approval retains Package 4's own strict authority. The offboarding case cannot exercise or inherit it.

## 8. Canonical supplier-operations contract

Create one action-specific versioned result, `supplier_operations:v1`, shared by UI, HTTP, MCP and CLI.

```ts
type SupplierOperationState =
  | 'Draft'
  | 'Needs setup'
  | 'Submitted'
  | 'Under review'
  | 'Published'
  | 'Paused'
  | 'Action required'
  | 'Retired'

type SupplierOperationStatus = {
  schemaVersion: 'supplier_operations:v1'
  businessRef: string
  providerRef: string
  operationRef: string
  revision?: number
  state: SupplierOperationState
  reasonCodes: readonly SupplierOperationReasonCode[]
  observedAt: number
  validUntil?: number
  source: { kind: CurrentSupportedSourceKind; revision?: string; digest?: string }
  routeability: { state: 'routeable' | 'not_routeable'; evidenceRefs: readonly string[] }
  health: SupplierOperationHealth
  authority: SupplierOperationAuthoritySummary
  continuation?: SupplierOperationContinuation
  ownerHandoff?: SupplierOwnerHandoff
}
```

Constraints:

- strict validation on every public and internal boundary;
- exact identifiers and revision/digest fields, not labels, as command inputs;
- at most one machine continuation and optional owner handoff;
- no secret, wallet, treasury routing, internal Formance account or raw provider response;
- reason codes are stable machine values; prose is presentation-only;
- `observedAt` comes from the command/query boundary, not hidden `Date.now()` inside a reactive projector; and
- pagination is part of list contracts from first release.

### Lifecycle precedence

The pure projector evaluates this table from top to bottom. Every result keeps all causal reason codes, but only one external state and one valid continuation.

| Priority | External state | Exact predicate |
|---:|---|---|
| 1 | `Retired` | offering is retired, or an offboarding case has authoritative completion readback; retained obligations cannot be hidden by this state |
| 2 | `Action required` | integrity conflict; stale authority generation/digest; required contract/admission/readiness evidence failed or expired; connection needs reauthorisation/cleanup; external outcome exhausted automatic reconciliation; payout/drain/offboarding is blocked; or material source identity drifted |
| 3 | `Paused` | supplier/platform deliberately paused or withdrew the current Operation, or offboarding has frozen new routeability and is still progressing, with no higher-priority fault |
| 4 | `Published` | the exact current revision passes existing qualification and routeability now |
| 5 | `Under review` | the exact admission command has started and current Workpool/upstream readback shows validating/admitting/canarying/reconciling within policy, but no terminal fault or current publication |
| 6 | `Submitted` | the exact submission command was durably accepted and queued but its first review step has not started |
| 7 | `Needs setup` | an Operation draft exists but a declared fit, source, connection, payout/admission prerequisite or required definition is missing before submission |
| 8 | `Draft` | the supplier has begun or saved the Operation definition and no higher predicate applies |

`Action required` outranks `Paused` so deliberate intent cannot conceal a fault. `Retired` is terminal for the supplier-facing lifecycle, but immutable commercial, authority and evidence records remain readable under the retention contract.

### Submission and review ownership

Current funnel code infers admission `in_progress` from “revision exists and publication does not,” which cannot distinguish queued, executing, failed or lost work. Package 5 adds the smallest durable process authority:

- one `capabilitySupplyAdmissionCases` row per exact Operation revision;
- command ID/digest, Account/Business/Provider, source/publication/contract refs and authority snapshot;
- coordinator/readback refs: current admission job/schedule and stable upstream operation/resource IDs, with optional `workflowId` only for a PR-0-proven long-lived admission lane;
- stable upstream operation/resource refs, when the configured lane has them;
- terminal admission decision, blocker/evidence refs and timestamps; and
- indexes by exact case ref, business/update time and operation/revision.

The case does **not** duplicate Workpool/Workflow step, attempt, retry or provider-status state. `Submitted` and `Under review` are projected from the accepted command, current worker/schedule status and upstream-resource readback; acceptance/refusal/reconciliation come from the existing admission/publication authorities and evidence. An ambiguous child effect remains readback-recoverable and projects `Action required`; it does not become a hand-written process state.

`accepted` never means published or routeable. Binding admission, publication lifecycle and qualification remain the acceptance authorities. The case is terminal only after those records are read back.

### Onboarding decision

The onboarding projection returns:

- current supported source kinds only;
- exact fit/refusal reason;
- required connection and payout/admission setup;
- expected evidence and review/canary steps;
- current saved Operation, if any; and
- one of `create_draft`, `connect_provider`, `complete_payout_setup`, `submit_operation`, `read_status`, or `correct_blocker`.

The current landing CTA remains, but it is driven by this projection. HTTP, MCP and CLI receive the same continuation; no harness-specific instruction handoff is accepted as onboarding completion.

## 9. Health and evidence contract

```text
current contract/revision --------------------+
current authority/connection -----------------+
admission/conformance/readiness ---------------+--> routeability predicate
required lane evidence/canary -----------------+          |
publication intent ----------------------------+          +--> Published / not routeable

Call payment + delivery + recovery -----------------------> paid non-delivery window
Qualified Use receipts -----------------------------------> useful-outcome window
operational conditions -----------------------------------> incidents + correction
```

Each `SupplierOperationHealth` contains independent dimensions rather than one blended score:

- `connection`: state, observed time, validity, reason, evidence refs;
- `validation`: contract/admission/conformance state, revision and evidence refs;
- `publication`: blocker/routeability state and causal reasons;
- `freshness`: source/readiness observed time, valid-until and drift digest;
- `delivery`: paid Calls, delivered, not delivered, unknown and reconciled counts;
- `usefulOutcome`: Qualified Use count only;
- `window`: start, end, sample size and last observation;
- `provenance`: source authority, aggregate revision and evidence refs;
- `incidents`: current supplier-scoped operational conditions; and
- `continuation`: one exact corrective action.

### Evidence rules

1. Paid non-delivery requires authoritative buyer payment/Charge evidence and `deliveryState = not_delivered`. Unknown payment or delivery remains unknown.
2. Qualified Use uses the immutable Package 4 receipt and its exclusions. Synthetic canaries, sandbox calls, owner self-invocation, invalid output, unreleased settlement and refunded-before-delivery Calls are excluded.
3. Counts are grouped by exact `operationRef` and immutable window boundaries. Every read shows sample size, window, recency and provenance.
4. No percentage appears without numerator, denominator and exclusion definition.
5. No rating or Provider claim becomes useful-outcome evidence.
6. Evidence windows may become stale or incomplete; they never silently become zero.
7. Required admission/readiness/canary evidence can fail routeability. Observational delivery/usefulness rates are information in Package 5, not an automatic quality or ranking policy.
8. Repair [`convex/qualifiedUse.ts`](./convex/qualifiedUse.ts#L219-L224) so `ae_qualified_use` market evidence is scoped to the receipt's exact Operation. Existing rows are censused and rebuilt from immutable Qualified Use receipts; no synthetic counts are invented.

### Supplier-facing incidents

Package 5 exposes a bounded operational-condition projection tied to an exact Operation or offboarding case:

- condition ID/type and affected exact refs;
- `investigating`, `identified`, `monitoring`, `resolved`, or `unknown` status;
- first/last observed timestamps and evidence refs;
- impact stated as routeability, Calls, connection, admission, evidence or payout;
- current mitigation/readback; and
- one supplier action when supplier action is actually valid.

This is not a general incident platform, status page, support ticket system, paging system or postmortem workflow. Package 8 owns broad incident governance.

Provider webhooks and health callbacks enter through the existing lane adapter only. The adapter uses that provider's official SDK verifier, deduplicates the provider event ID, acknowledges promptly, and schedules bounded current-resource readback. Package 5 stores the resulting evidence in existing observability/evidence authorities; it does not add a provider-neutral webhook endpoint, webhook-attempt product or raw-payload archive.

### Streaming condition

Do not add streaming tables or UI until a current admitted Operation declares a streaming delivery contract. When one exists, extend that Operation's evidence contract to keep these separate:

```text
upstream accepted
  != Charge captured
  != bytes/units delivered
  != stream completed
  != useful outcome

disconnect -> exact delivered units -> Charge/remedy readback -> commercial closure
```

## 10. Durable Provider offboarding

### Domain record

Add one `capabilityProviderOffboardingCases` record as the supplier-facing command/readback object:

- case ref, command ID/digest and exact Account/Business/Provider;
- protected-action receipt and actor/authority snapshot;
- frozen current Operation revision/publication refs and connection generations;
- official Workflow ID;
- stable upstream account/revocation/resource refs where the configured provider exposes them;
- current blocking reason and exact child command/readback refs;
- requested/updated/completed timestamps; and
- retention-policy version plus retained record classes shown to the supplier.

This record owns command identity, scope, linkage, blockers and closure evidence only. The supplier-facing phase is derived from Workflow status and authoritative publication, Call, obligation, Payout, connection, secret-provider and upstream-resource readbacks. It does not store a generic step machine, attempt counters or duplicate publication, Call, Formance, Payout, Stripe, connection, provider-verification or secret state.

### Ordered workflow

```text
[strictly authorised request]
            |
            v
[freeze new routeability]
  - exact Provider/Business generation
  - withdraw every current Operation
  - invalidate unused connection leases
            |
            v
[authoritative readback: zero routeable Operations]
            |
            v
[drain/reconcile outstanding Calls]
  pending/running/reconciliation_required -> wait or recover
  unknown external effect                 -> read back, never blind retry
            |
            v
[await Provider obligations and Payouts]
  accrued/held/payable/disputed/unknown -> Action required or wait
  settled/reversed                       -> proceed
  payout command remains separately authorised
            |
            v
[revoke connections and delete/rotate secrets]
  existing connection revoke -> Workpool cleanup -> provider/vault readback
            |
            v
[verify from every authority]
  zero routeable Operations
  zero active/unknown Calls
  zero unresolved Provider obligations
  zero active/revocation-pending connections
  retained-record explanation fixed to policy version
            |
            v
[completed -> Retired]
```

Rules:

- The first committed step makes all exact current Operations non-routeable before slow work begins.
- Calls that are already terminal do not block. `pending`, executing, reconciliation-required or outcome-unknown Calls block until their own recovery reaches a terminal state.
- The workflow does not cancel a Call unless its existing contract explicitly supports cancellation and authoritative readback proves the result.
- A Provider obligation blocks completion unless it is `settled` or `reversed` under Package 4. `held`, `payable`, `disputed`, unknown and processor failure remain visible and actionable.
- The workflow never initiates, approves or marks a Payout paid. It waits on the existing separately authorised Payout flow.
- Connections are revoked after Calls and obligations because early credential removal can destroy recovery evidence or the ability to complete in-flight work.
- Cleanup outcomes `refused`, `unsupported` and `unknown` remain `Action required`; deleting the local row is forbidden.
- Cancel is permitted only before routeability freeze. After freeze, “resume” and corrective action are available, not rollback into an unknowable active state.
- Completion is a conjunction of authoritative readbacks, not “workflow returned success.”

## 11. Schema, index and migration contract

### Additive schema

1. Install and register the pinned official Workflow component for offboarding after PR 0 proof; admission does not depend on it by default.
2. Add `capabilitySupplyAdmissionCases` and its exact/paginated indexes.
3. Add `capabilityProviderOffboardingCases` and exact Business/update indexes.
4. Add provider/business/state/time indexes required to drain Calls without account-wide scans.
5. Add Operation/time and Provider/time aggregate keys for paid-delivery and Qualified Use windows using installed `@convex-dev/aggregate`.
6. Add a bounded supplier operational-condition projection only if existing observability event records cannot provide indexed exact reads; do not create a second incident store.

Neither case table may contain Workflow step definitions, generic retry/attempt rows, copied provider status enums, webhook payloads, credentials or balances. Official Workflow owns orchestration mechanics; provider SDK/API resources own provider mechanics; the case rows supply only AE command/readback linkage that those components cannot own.

### Migration sequence

```text
Deployment A: schema + indexes + offboarding Workflow component, inert
  -> generated API/typecheck
  -> backup/restore and interruption proof
  -> no changed reads or effects

Deployment B: dual-read validation, one canonical projector
  -> build admission/evidence projections from current immutable authorities
  -> compare old and new supplier status offline
  -> no routeability changes

Deployment C: enable new submission/status contracts per surface
  -> UI -> HTTP -> MCP -> CLI all use supplier_operations:v1
  -> legacy adapters call the same projector only
  -> measure legacy contract use

Deployment D: enable offboarding for synthetic suppliers
  -> interruption/recovery and external sandbox gates
  -> production flag remains off

Deployment E: production activation after Package 4 + legal/retention gates
  -> canary Account/Provider
  -> observe one full lifecycle and offboarding rehearsal
  -> bounded cohort rollout

Deployment F: remove legacy status labels/contracts
  -> only after zero-use census and rollback window
  -> no permanent dual path
```

### Data rules

- Preflight every deployment with table counts, state distribution, oldest/newest row, invalid refs and live-value classification.
- Rebuild useful-outcome aggregates only from immutable Qualified Use receipts.
- Never infer missing timestamps, authority, outcomes, Provider obligations or payout state.
- Mark insufficient historical evidence `incomplete`; do not backfill synthetic success.
- Use staged indexes as required by Convex. No production query deploy precedes index readiness.
- Keep a rollback-compatible reader through the measured migration window. Rollback disables new starts; it never deletes in-progress cases or rewrites authoritative child state.

## 12. Atomic delivery sequence

Every PR must start from a clean tracked worktree, record its exact file manifest before edits, and contain one behavior change plus its black-box proof. Existing unrelated untracked `.impeccable/`, `.scratch/` and `tmp/` content is out of scope and must remain untouched.

### PR 0 — `test(supply): freeze Package 5 contracts and durable primitives`

**Outcome:** establish a green, reproducible baseline and prove the maintained orchestration choice before feature code.

**Changes:**

- root-fix the current owner-funnel return-validator regression; do not weaken validation or delete the test;
- pin the exact compatible `@convex-dev/workflow` 0.4.x version and register it inertly;
- prove generated API compatibility with Convex 1.45.0 and installed Workpool 0.4.10;
- add a tiny throwaway-in-test offboarding-shaped workflow that survives interruption, resumes once, rejects changed command material, exposes status, cancels before effect and restores from backup;
- prove current admission commands plus Workpool/scheduling and upstream-resource readback cover ordinary validation/promotion; record any lane that genuinely requires Workflow before authorising it there;
- inventory each supported lane's official SDK/API for hosted setup, OAuth/account links, current-resource retrieval, webhook verification, publish/unpublish and revoke semantics; mark every unavailable operation as an external gate rather than creating a substitute;
- freeze `supplier_operations:v1`, lifecycle precedence, reason codes, continuation vocabulary, admission-case and offboarding-case contracts;
- capture current status-shape consumers, data census, indexes, deployment flags and Package 4 open gates; and
- record a clean-worktree file manifest and external-gate ledger.

**Expected blast radius:** package manifest/lock, Convex component registration/generated files, shared contract module, lane-adapter contract tests and the narrow existing failing test. No provider SDK is added unless an existing authorised lane requires it; no production enablement.

**Proof:** typecheck, generated API check, focused baseline suites, offboarding Workflow interruption/restore test, admission recovery proof on current primitives, zero changed routeability, and no shared deployment mutation.

**Stop gate:** if official Workflow cannot pass interruption, exact replay/conflict, cancellation and restore on the pinned stack, stop Package 5D. Do not hand-roll a substitute.

### PR 1 — `feat(supply): return one onboarding and lifecycle projection`

**Outcome:** one supported-source fit decision, one start action and one exact eight-state readback across the shared action contract.

**Changes:**

- add the pure lifecycle/onboarding projector and exhaustive precedence tests;
- add the minimal admission-case linkage schema/indexes without step/attempt shadow state;
- route existing admission/publication/canary commands through current exact commands, Workpool/scheduled reconciliation, official provider API operations where applicable, and authoritative readback;
- expose paginated `supplier_operations:v1` detail/list/start/status actions;
- adapt the current owner funnel to the new projector; and
- retain legacy status adapters as thin calls into the same projector with telemetry and a removal deadline.

**Expected blast radius:** capability-supply contracts/domain/Convex projections/actions plus generated API. No money or execution write-path changes.

**Proof:** all eight states, precedence collisions, stale generation, duplicate submission, changed-material conflict, refresh/restart recovery, cross-account refusal and one-continuation parity through direct action + HTTP + MCP + CLI contract tests.

### PR 2 — `feat(supply): expose verified supplier health and corrective action`

**Outcome:** each Operation has bounded current prerequisite health, paid non-delivery and Qualified Use windows with sample size, recency and provenance.

**Changes:**

- repair Qualified Use market-evidence Operation scoping;
- add staged Call/evidence indexes and maintained aggregate keys;
- build immutable receipt-driven useful-outcome and authoritative Call-driven delivery windows;
- project current connection, validation, publication, freshness and routeability reasons;
- project supplier-scoped operational conditions from existing observability facts;
- expose exactly one correction/status continuation; and
- replace owner UI's empty activity inputs and ad hoc health labels with the shared contract.

**Expected blast radius:** supply read models, Qualified Use projection call, Call/evidence indexes/aggregates, action serializers and owner UI. No Formance or payout writes.

**Proof:** exact Operation isolation, replay exclusion, self/sandbox/refund exclusion, paid-not-delivered/unknown separation, stale/incomplete windows, 10,000-row pagination, aggregate repair census and no routeability change from observational rates.

### PR 3 — `feat(supply): make routeability loss and correction exact`

**Outcome:** every current prerequisite expiry/failure/withdrawal/drift removes routeability and produces one safe correction without waiting for UI refresh or a best-effort cron.

**Changes:**

- thread required evidence freshness through existing qualification only;
- make connection, contract, source, publication and lane-evidence drift reason codes exhaustive;
- invalidate relevant leases atomically with authority/publication reduction;
- use the hourly sweep only to materialize time-based expiry, while every read/invoke still fails closed using caller-supplied observed time;
- migrate UI/HTTP/MCP/CLI status and correction flows; and
- add supplier-visible operational conditions for unknown or externally blocked correction.

**Expected blast radius:** existing qualification/lifecycle boundary, lease invalidation, status actions and surfaces. No ranking changes.

**Proof:** expiry at the boundary, stale open tab, concurrent invoke versus pause/withdraw, lost cleanup callback, readback recovery and no routeability bypass.

### PR 4 — `feat(supply): coordinate durable Provider offboarding`

**Outcome:** a strictly authorised, resumable offboarding case withdraws Operations, drains Calls, waits for obligations/Payouts, revokes connections and reaches `Retired` only after authoritative readback.

**Changes:**

- add the minimal offboarding command/readback linkage schema/indexes and protected-action contract;
- implement the official Workflow sequence over exact idempotent AE child commands and the configured provider's official SDK/API actions; do not persist a second step machine;
- add provider/business bounded Call and obligation queries required by gates;
- expose start/status/resume/correct actions through the shared contract;
- integrate existing connection revoke/cleanup, hosted payout remediation and secret-provider readback; provider-owned account deletion is not a closure shortcut;
- surface the approved retained-record classes and policy version; and
- add owner UI confirmation with fresh proof and irreversible-after-freeze language.

**Expected blast radius:** capability-supply offboarding, authority policy, execution/money read indexes, connection cleanup integration, UI/action surfaces. No ledger schema or automatic Payout authority.

**Proof:** duplicate/reordered callbacks, process interruption at every step, 10,000 Operations/Calls/connections, payout held/failed/unknown, unknown provider revoke, stale authority, cross-account attack, no new Invocation after freeze, and exact completion conjunction.

### PR 5 — `chore(package5): migrate surfaces and prove release closure`

**Outcome:** remove legacy supplier status paths and produce black-box, recovery, deployment and external evidence for Package 5.

**Changes:**

- prove UI/HTTP/MCP/CLI all return the same state/reason/continuation for identical facts;
- run a packaged CLI against the deployed public contract, including no-result, error, pagination and next-command behavior;
- complete synthetic supplier onboarding -> publish -> expiry -> correct -> republish -> offboard journeys;
- complete Stripe test-mode and current x402 external gates;
- prove each enabled lane's hosted onboarding/remediation link, official webhook verifier, current-resource readback and revoke/unpublish semantics; unsupported operations remain feature-gated;
- rehearse backup/restore with in-progress admission and offboarding;
- remove legacy management-status labels/contracts only after zero-use census; and
- scan the diff for custom OAuth/KYC/payout/webhook/workflow/retry/provider-status machinery forbidden by the scavenge contract; and
- update operational runbooks and Package 5 evidence ledger.

**Expected blast radius:** compatibility adapters, client surfaces, tests and release documentation. Production activation remains separately gated.

**Proof:** closure matrix in section 17 and a clean diff containing no unrelated files.

## 13. Test and acceptance coverage

Tests are black-box, isolated and behavior-owned. They do not assert internal Workflow step names, private function calls or component tables. Every asynchronous public command exposes status/readback that tests can await.

```text
CODE PATHS                                             USER JOURNEYS
[PLANNED ★★★] onboarding decision                     [PLANNED ★★★] first supplier entry [->E2E]
  +-- fit supported / refused                           +-- zero draft -> one start action
  +-- source requires / does not require connection     +-- OAuth/connection leave + return
  +-- payout/admission prerequisite                     +-- stale tab and expired session
  +-- exact one continuation                            +-- HTTP/MCP/CLI parity

[PLANNED ★★★] lifecycle projector                     [PLANNED ★★★] Operation lifecycle [->E2E]
  +-- Retired precedence                                +-- Draft -> Needs setup
  +-- Action required over Paused                       +-- Submitted -> Under review
  +-- Paused intent                                     +-- Published -> Action required
  +-- Published exact routeability                      +-- correct -> Published
  +-- Under review / Submitted                          +-- pause -> republish -> retire
  +-- Needs setup / Draft                               +-- duplicate and concurrent commands

[PLANNED ★★★] health/evidence                         [PLANNED ★★★] supplier diagnosis [->E2E]
  +-- connection/validation/publication/freshness       +-- see exact blocker and provenance
  +-- paid delivered / not delivered / unknown          +-- paid failure does not look useful
  +-- Qualified Use and every exclusion                 +-- stale/incomplete sample is explicit
  +-- sample/window/provenance                           +-- one correction and readback
  +-- incident state and recovery

[PLANNED ★★★] routeability                            [PLANNED ★★★] buyer protection [->E2E]
  +-- contract/authority/readiness/evidence expiry      +-- stale Operation disappears/fails closed
  +-- withdrawal and material drift                     +-- concurrent invoke cannot cross freeze
  +-- lease invalidation                                +-- correction restores exact revision only
  +-- observational rates never override

[PLANNED ★★★] offboarding workflow                    [PLANNED ★★★] Provider exit [->E2E]
  +-- strict authority / stale generation               +-- review consequences + fresh proof
  +-- freeze + unpublish all pages                       +-- leave/reload/resume from readback
  +-- Call drain/reconciliation                          +-- payout blocker has valid handoff
  +-- obligation/Payout gate                            +-- connection revoked last
  +-- provider/vault cleanup outcomes                    +-- retained records explained
  +-- interruption/callback replay                       +-- completion only after all authorities
  +-- cancellation before freeze only

CURRENT: 5/5 Package 5 capability paths implemented locally. External source, deployed-secret, backup/restore and actual-client proof remain release gates rather than source gaps.
FOCUSED PROOF: 505/508 tests passed across the 61 extant test files changed by Package 5 on 2026-09-04. The three failures belong to concurrent dirty work: two changed market-terminal expectations and the Package 4 Stripe webhook inbox schema census.
TARGET: the staging matrix must still prove every supported source family through publication and buyer Invocation on one deployed revision; no LLM/prompt eval applies.
```

### Required suites

- Pure unit tests for lifecycle precedence, reason normalization, authority material digests, evidence-window math and completion conjunction.
- Convex integration tests for durable admission commands/Workpool reconciliation, official offboarding Workflow interruption/readback, indexes/aggregates, exact authority, cross-account isolation and concurrent routeability reduction.
- Action-contract tests proving strict schemas, one continuation and identical facts across HTTP/MCP/CLI serializers.
- Browser journeys for onboarding, lifecycle correction and Provider offboarding, including refresh, two tabs, slow work, session expiry and accessible error/focus behavior.
- Capacity tests at 10,000 Operations, Calls, evidence receipts and connections, with pagination and bounded query assertions.
- Deployment tests for generated API, staged indexes, feature flags, backup/restore and version rollback.
- External canaries kept outside deterministic CI: Stripe Connect test-mode onboarding/Payout failure readback, managed x402 success/refusal/`settlement_pending` recovery, provider revoke/secret cleanup, and published CLI against deployed HTTP/MCP contracts.
- Lane contract tests using official provider test fixtures/SDKs for expiring hosted links, return-without-completion, duplicate/out-of-order webhooks, current-resource readback, capability regression and idempotent revoke/unpublish. A provider without a documented/testable primitive stays disabled for that operation.

### Test-file ownership

| Behavior | Existing suite to extend or planned suite | Exact assertion |
|---|---|---|
| PR 0 validator regression | `tests/integration/capability-supply-owner-funnel-run-test.test.ts` | the public return validator accepts every canonical projected state without weakening the schema |
| Lifecycle precedence and reason codes | `tests/unit/capability-supply/supplier-operation-lifecycle.test.ts` | every predicate and collision maps to one exact state/reason/continuation |
| Provider-lane primitive boundary | `tests/integration/capability-supply-provider-lane-primitives.test.ts` | hosted return is not completion; official verifier handles duplicate/out-of-order events; current resource wins; undocumented setup/cleanup stays disabled; no secret or raw payload enters AE records |
| Submission recovery | `tests/integration/capability-supply-admission-recovery.test.ts` | exact command, queued/started worker, callback-loss, restart, replay and changed-material conflict read back correctly without shadow Workflow state |
| Surface parity | extend `tests/unit/capability-supply/supply-actions.test.ts`, `tests/unit/server/supply-action-api.test.ts`, `tests/unit/server/mcp-api-supply.test.ts` and CLI workspace tests | identical facts serialize to the same state, reason and continuation |
| Health and evidence | `tests/integration/capability-supply-operation-health-evidence.test.ts` | paid non-delivery and Qualified Use remain exact, scoped, excluded, sampled, recent and provenance-bearing |
| Routeability loss | extend `tests/unit/capability-supply/supplied-candidate-qualification.test.ts` and `tests/integration/capability-supply-owner-funnel-withdraw-republish.test.ts` | expiry/failure/withdrawal/drift fails closed and correction restores only the current revision |
| Offboarding | `tests/integration/capability-provider-offboarding.test.ts` | strict authority, freeze barrier, Call drain, payout gate, connection-last cleanup and completion conjunction survive interruption |
| Common owner journeys | extend `tests/e2e/owner-operations-compatibility.spec.ts` | onboarding, correction and offboarding survive refresh, two tabs, stale session and slow work |
| Capacity | `tests/integration/capability-supply-package5-capacity.test.ts` | 10,000-row reads paginate and stay within query/latency budgets without N+1/full scan |
| Deploy/restore | extend deployment maturity/release suites | staged indexes, disabled flags, in-progress restore and rollback preserve readback |

### Current baseline evidence

The original pre-plan validator mismatch is closed. The final changed-cone run covered 61 extant Package 5 test files: **505 passed, 3 failed**. All Package 5 suites passed. The three remaining failures are attributable to concurrent non-Package-5 dirty work (`tests/unit/market-terminal/doctor.test.ts`, and a Package 4 Stripe table added without its schema-census update). Full typecheck likewise reaches only the concurrent `convex/moneyAccountFundingFormance.ts` change. These are recorded as repository-baseline blockers and are not absorbed into Package 5.

## 14. Failure modes and premortem

| Production failure | Containment/readback | Required proof | Supplier experience |
|---|---|---|---|
| Lifecycle state differs between UI and MCP | one projector and strict serializer; reject unknown version | parity contract test | same state/reason/action everywhere |
| Admission accepted but worker never starts | accepted command + Workpool/schedule readback keeps `Submitted`; bounded reconciliation | interrupt before first worker action | status says queued; safe read-status action |
| Admission effect succeeds but callback is lost | authoritative binding/publication readback before retry | drop callback after effect | review resumes without duplicate publication |
| Hosted onboarding returns but verification is incomplete | retrieve current provider account/capability/requirement state | return-without-completion sandbox test | exact remaining action, never false readiness |
| Provider webhook is duplicated or arrives out of order | official SDK verification + event-ID dedupe + current-resource retrieval | duplicate/reorder fixture | current state wins; one bounded reread |
| Provider event semantics are undocumented | lane feature remains disabled; polling only when officially documented | missing-capability contract test | explicit external gate, no guessed integration |
| Same idempotency key carries changed Operation | command digest conflict | replay/conflict test | explicit stale/changed-command error |
| Readiness expires between display and invoke | invoke re-runs current qualification with exact time | boundary/concurrency test | Operation fails closed with correction |
| Cron misses a freshness sweep | correctness remains in read/invoke predicate | disabled-cron test | no stale routeability |
| Qualified Use counted against wrong Operation | exact Operation aggregate key and rebuild from immutable receipts | cross-operation isolation regression | sample/provenance stays correct |
| Rating or Provider assertion leaks into useful count | source allowlist accepts Qualified Use only | hostile evidence-source test | unsupported claims remain labelled/excluded |
| Paid Call has unknown delivery | separate unknown bucket and recovery ref | payment/delivery matrix | not shown as success or failure |
| Owner projection hits fixed cap or N+1 timeout | indexed pagination and aggregate reads | 10,000-row budget test | partial page is explicit and resumable |
| Offboarding races with new Invocation | atomic routeability freeze + lease invalidation | barrier/concurrency test | no new Calls after accepted freeze |
| Offboarding revokes connection before unresolved Call | ordered Workflow gate | attempt forced reordering | workflow refuses and names blocker |
| External Payout succeeds but callback is lost | Package 4/Stripe readback before any action | callback-loss sandbox test | payout shown unknown/reconciling, never duplicated |
| Payout is held or disputed | offboarding `Action required`; separate payout authority | held/disputed matrix | exact owner handoff, no false retirement |
| Provider revoke returns timeout after effect | connection generation/provider/vault readback; no blind retry | response-loss test | cleanup remains recoverable |
| Secret deletion succeeds but provider revoke is unknown | separate cleanup outcomes and evidence | partial-cleanup test | explicit residual exposure, not “done” |
| Workflow reports complete while child state is not | completion conjunction queries all authorities | falsified workflow-result test | case stays verifying/action required |
| Authority changes mid-workflow | generation/digest mismatch stops case | revoke/grant drift test | new owner confirmation required |
| Retention schedule is missing | production completion feature gate | policy-absent test | retained-record policy pending; no false completion |
| Rollback occurs with in-progress cases | disable new starts; old readers retain cases; Workflow status remains readable | deployment rollback rehearsal | existing work remains visible/recoverable |

No failure path may be silent. Each returns a stable reason, evidence/readback reference and one safe continuation or owner handoff.

## 15. Performance and operating budgets

- All supplier lists are cursor-paginated from release one; default 50, hard maximum 100.
- No query uses growing `.collect()` or fixed-cap pseudo-pagination for supplier fleets.
- Operation health reads are index/aggregate backed and O(page size), not O(total Calls or receipts).
- Supplier list/status reads use persisted, freshness-bounded provider evidence and never fan out to live provider APIs per row. A detail/status correction may request one bounded current-resource reread through the lane adapter; event and sweep workers refresh evidence off the read path.
- Offboarding snapshots identifiers page by page; Workflow input stores refs/digests, never full records or secrets.
- Child work uses bounded concurrency through Workflow/Workpool. Initial cap is the lowest current external/provider limit; raise only from measured evidence.
- The exact completion verifier performs bounded indexed counts/pages and can resume; it never loads every Operation, Call or connection into one action.
- `observedAt` is explicit so reactive reads are cacheable and deterministic.
- Status/detail stays inside existing action payload limits. Evidence lists are paginated or summarized with stable drill-down refs.
- PR 0 records baseline p50/p95 and query counts; each later PR may not regress the owner status page or machine status action by more than 10% without an explained budget change.

## 16. Deployment, rollback and blast-radius controls

### Deployment gates

1. tracked worktree clean and exact manifest reviewed;
2. current table/state/value census captured;
3. backup and restore rehearsal current for the target deployment;
4. staged indexes ready before code reads them;
5. official offboarding Workflow interruption/cancel/restore proof and current-primitive admission recovery proof green;
6. Package 4 release gates required by the enabled evidence/payout lane green;
7. Stripe/x402/provider/secret external sandbox canaries green where used;
8. enabled-lane official SDK/API capability matrix proves hosted setup, event verification, current-resource readback and cleanup semantics without substitute machinery;
9. approved retention-class schedule and supplier wording current;
10. production flags default off; synthetic Account first;
11. zero legacy-consumer census before removal; and
12. rollback rehearsal preserves in-progress case readback.

### Rollback

- Disable new submission/offboarding starts through server-side flags.
- Keep status/readback and the offboarding Workflow component deployed while any offboarding case is non-terminal.
- Do not roll back or delete authoritative publication, Call, obligation, Payout, connection or evidence rows.
- Do not “reactivate” Operations after a partially executed offboarding. Require a new exact republish flow after reconciliation.
- A schema rollback is allowed only after zero non-terminal cases and compatibility census. Otherwise roll forward.

### External/deployment implications

- Adding a Convex component and indexes requires staged deployment and generated API review.
- Stripe onboarding/payout states can regress; webhook receipt is input and Account/Payout retrieval is readback.
- x402 `settlement_pending` is non-terminal and must retain transaction/network for reconciliation.
- Secret-provider cleanup may require environment-specific machine identity and network access; no local success substitutes for deployed readback.
- No real-value activation is permitted while Package 4's managed PostgreSQL/PITR, security, legal, tax, accounting and operating gates remain open.

## 17. Closure criteria

Package 5 closes only when all are true:

1. roadmap scope 5A–5D is traceable to shipped behavior and no extra product scope was introduced;
2. all eight external states are reachable from black-box facts, exhaustively projected and identical across UI/HTTP/MCP/CLI;
3. every state includes stable reason codes, freshness/provenance and at most one valid machine continuation;
4. supported source fit, required connection setup, admission expectations and one start action are machine-readable;
5. the current exact routeability predicate remains sole authority and fails closed on expiry/failure/withdrawal/drift;
6. paid non-delivery and Qualified Use are separate, Operation-scoped, sampled, recent and provenance-bearing;
7. no rating, payment, settlement, HTTP response, Provider claim or stream acceptance is represented as useful outcome;
8. supplier-scoped incident information is readable without creating Package 8's incident platform;
9. admission recovery uses current exact commands, Workpool/scheduling and official upstream readback by default; official Workflow, not custom orchestration, coordinates offboarding and any separately proven long-lived admission lane;
10. offboarding prevents new Calls first, resolves existing Calls, waits for all Provider obligations/Payouts, revokes connections last and explains retained records;
11. offboarding completion is proven from every child authority and cannot be caused by Workflow status alone;
12. exact authority, fresh proof, generation drift, cross-account isolation, replay/conflict and unknown-outcome recovery pass;
13. 10,000-row pagination/concurrency tests meet budgets without N+1 or full scans;
14. focused, full, browser, deployment and external gate matrices are green with commands/results recorded;
15. the pre-existing owner-funnel validator regression is closed;
16. legacy status consumers are zero before old labels/contracts are removed;
17. backup/restore and rollback retain all in-progress readback;
18. production flags remain off until Package 4 and external/legal/retention gates are signed; and
19. the final diff is clean, limited to the declared PR manifest and contains no debug, fallback, parallel truth or unrelated work; and
20. the scavenge matrix is proven lane by lane: hosted/provider-owned setup is linked rather than rebuilt, official SDK/API verification and current-resource readback are exercised, and repository scans find no custom OAuth, KYC/KYB, payout-method, webhook-signature, workflow-step, retry-counter or provider-status machinery.

## 18. NOT in scope and explicit prohibitions

- No Package 6 Agent onboarding or broad language migration.
- No Package 7 generalized control plane, trust score or fleet observability programme.
- No Package 8 support desk, status page, paging, incident governance or postmortem system.
- No Package 9 production launch approval, legal/tax/accounting policy invention or treasury redesign.
- No Package 10 ranking/growth loop.
- No new source kind, connector marketplace, OAuth platform, code sandbox or agent runtime.
- No Whop, Locus or Nevermined dependency merely to imitate its product. An official SDK is admissible only for a separately authorised existing provider lane that actually calls that provider.
- No external registry promotion without AE admission and publication.
- No second lifecycle state authority or per-surface state/label map.
- No custom workflow engine, workflow-step table, retry counter/loop, scheduler, queue, event bus, webhook framework, signature verifier or generic saga framework.
- No custom KYC/KYB, payout-method, hosted-account, OAuth discovery/PKCE/refresh/revocation or provider-consent implementation when the configured lane exposes an official hosted flow or SDK.
- No copied Whop/Locus/Nevermined status enum, review clock, strike policy, webhook payload or catalog snapshot as AE authority.
- No new ledger, supplier balance, payout balance, escrow model or monetary dual write.
- No automatic Payout from offboarding and no conflation of Seller, Provider and payment recipient.
- No secret material in Convex, Workflow payloads, evidence, telemetry or logs.
- No routeability override from UI, admin dismissal, incident state, ratings, opaque score or payment result.
- No quality threshold, strike policy or automatic ranking copied from Locus, Nevermined, Whop or AgentMuxer.
- No general streaming platform before a real admitted streaming Operation exists.
- No blind retry after unknown payment, Invocation, revocation or cleanup outcome.
- No hard deletion of commercial, authority, evidence or audit records without the approved retention authority.
- No permanent compatibility adapter and no two implementations of supplier status.
- No production/shared deployment mutation in the planning phase.

## 19. Sequential dependency and worktree strategy

Sequential implementation, no parallelization opportunity. PRs 1–4 all touch the same capability-supply contracts, Convex schema/generated API and black-box surface contracts. Parallel worktrees would increase merge risk exactly where one-system consistency matters.

```text
PR 0 contracts + maintained primitive proof
  -> PR 1 onboarding/lifecycle
      -> PR 2 health/evidence
          -> PR 3 routeability/correction
              -> PR 4 offboarding
                  -> PR 5 migration/release closure
```

Tests and release evidence may be prepared concurrently inside each PR only after its contract is frozen, but they land with that PR. No independent branch may invent a surface-specific contract.

Implementation comments must preserve two non-obvious diagrams at the owning code boundary: the lifecycle precedence beside the pure supplier-state projector, and the freeze -> Calls -> obligations/Payouts -> connections -> verify sequence beside the offboarding Workflow definition. Existing nearby diagrams must be reviewed in the same PR; no diagram is added to simple serializers or UI components.

## 20. Implementation tasks

- [x] **P5-0 (P1)** — Exact contracts, admission recovery and official Workflow interruption/resume/cancellation proofs are implemented and green in the Package 5 cone.
- [x] **P5-1 (P1)** — One source-native onboarding path and the exact shared eight-state lifecycle ship across Provider surfaces.
- [x] **P5-2 (P1)** — Qualified Use is keyed to exact Operations and health windows are bounded, provenance-bearing and independently projected.
- [x] **P5-3 (P1)** — Current prerequisite loss fails routeability closed and returns one shared correction.
- [x] **P5-4 (P1)** — Strictly authorised, paged Provider offboarding uses official Workflow and authoritative child readbacks.
- [ ] **P5-5 (P1)** — Source migration and deterministic Package 5 proof are complete, including the clean-source packaged CLI. Staging publication/Invocation for all four source families, deployed Infisical/MCP OAuth, backup restoration and actual-client proof remain required before release closure.

No `TODOS.md` exists and this plan intentionally creates no deferred TODO. Anything not required for Package 5 is listed in `NOT in scope`; any newly discovered blocker stops the affected PR rather than becoming an unowned follow-up.

## 21. Plan completion summary

- Exact scope: roadmap Packages 5A–5D only.
- Architecture: one derived supplier projection and one durable coordinator over existing authorities.
- Maintained primitives: current official lane SDKs/hosted flows/components plus gated adoption of official Convex Workflow only for demonstrated AE-owned multi-step coordination.
- Current-state evidence: existing onboarding, publication, routeability, connection recovery, Qualified Use, Call, earnings and Payout foundations reused.
- Reference pass: Whop, Locus and Nevermined converted into an exact adopt/adapt/prohibit matrix; TREG, AgentMuxer and executor.sh retained as substrate evidence with explicit non-equivalence.
- Migration: additive schema/indexes, inert component first, measured consumer migration, then removal.
- Acceptance: black-box supplier journeys, exact recovery/readback, 10,000-row bounds, restore/rollback and external gates.
- Implementation closeout: source, contracts, tests, generated public CLI and evidence are committed; deployed external proof remains deliberately open.

## 22. Engineering review completion

- Step 0 Scope Challenge: roadmap scope remains exactly 5A–5D. The mature-scavenge pass reduced accidental scope by retaining current admission commands/Workpool/readback, reserving maintained Workflow for cross-authority offboarding, and refusing a generic provider framework.
- Architecture Review: no unresolved issues. Existing authorities remain isolated; official provider primitives own provider setup and transport, existing AE admission machinery owns ordinary admission, and Workflow coordinates offboarding without owning domain completion.
- Code Quality Review: no unresolved issues. Admission/offboarding case rows are linkage and readback records, not workflow-step, retry or provider-status replicas. One projector removes status/label duplication; compatibility adapters call it and have a measured deletion gate.
- Test Review: coverage diagram produced; every planned branch and user journey has a named black-box suite, including provider-lane primitive verification/readback and offboarding interruption recovery. No uncovered Package 5 gap remains in the plan.
- Performance Review: no unresolved issues. Supplier-wide reads use freshness-bounded persisted evidence and indexed, paginated projections; they never fan out to provider APIs per row.
- NOT in scope: written.
- What already exists: written.
- `TODOS.md`: zero items proposed; the file does not exist and Package 5 creates no unowned deferral.
- Failure modes: hosted-return ambiguity, duplicate/out-of-order provider events and undocumented provider semantics are explicit gates; zero silent critical gaps remain in the plan.
- Outside voice: free in-host challenge ran because this task already runs under Codex; nested Codex was skipped. The independent research pass found no contrary architecture and tightened admission/offboarding boundaries.
- Parallelization: one sequential lane; test/evidence preparation may overlap only after each PR contract freezes.
- Lake Score: 5/5 review dimensions use the complete option; no shortcut was selected.
- Review tasks artifact: zero-byte JSONL records that the review ran with zero new findings.
- QA artifact: owner pages/routes, machine surfaces, edge cases and four critical journeys recorded for later `/qa` consumption.
- Durable learning: Package 5 lifecycle is a projection; admission stays on current exact commands/Workpool/provider readback unless a real long-lived gap is proven, while offboarding uses maintained Workflow coordination without moving domain authority.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|---|---|---|---:|---|---|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | Not run for this plan |
| Codex Review | `/codex review` | Independent second opinion | 1 | CLEAR | In-host challenge; 0 findings |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 10 | CLEAR | Mature-scavenge run: 0 issues, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 2 | CLEAR | Prior current design-system reviews; Package 5 reuses `DESIGN.md` |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | Not run |

**CODEX:** Nested review was intentionally skipped under Codex; the required free in-host pass found no missed logical, feasibility, sequencing or scope problem.

**VERDICT:** SOURCE IMPLEMENTATION CLEARED — Package 5's code and deterministic behavior are complete. Release remains blocked, truthfully, on the external evidence listed under P5-5 and on Package 4 production gates; no additional Package 5 framework or compatibility layer is authorised.

NO UNRESOLVED DECISIONS
