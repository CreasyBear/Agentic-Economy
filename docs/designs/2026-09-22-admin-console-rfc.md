# Admin console RFC: adapted operations console

Date: 22 September 2026  
Status: proposed  
Decision owner: Joel  
Design thesis: build a search-and-exceptions console in which the object is the unit of work, using mature admin interaction patterns while keeping Agentic Economy's schema, authority and mutations as the only source of truth.

## 1. Problem

Agentic Economy has two admin routes. Audit returns the latest 100 global events, and catalog health derives one synthetic row from the first Business (`src/routes/_operator/admin.audit-events.tsx:11-14`; `src/routes/_operator/admin.index-health.tsx:12-15`; `convex/securityAdminReadbacks.ts:16-23,65-78`). An operator cannot yet search across accounts by canonical ref, open a joined Call or Provider record, work an exception list, or page and filter Audit.

The answer is not a generic CRUD admin, a new low-code sidecar, or a copy of another product's domain model. It is an adaptation of proven index, detail, review, search and timeline patterns onto existing Convex facts and existing mutations.

## 2. Goals and non-goals

### Goals

- Find a Call, Quote, Tool version, Provider, Workspace or Agent by exact canonical ref and open one authoritative object page.
- Show joined Call money truth through `projectFoundCallPurchaseStatus`, which keeps uncertain outcomes open rather than smoothing contradictions (`src/modules/capability-execution/call-receipt-view.ts:156-180`).
- Show Provider publications, connections, admission cases, removal disputes, suppression and a Stripe payout-state link-out.
- Put Purchase resolutions, removal disputes, source-authority reviews, admission cases and uncertain Calls into one oldest-first exception feed.
- Expose only the six existing mutation entry points specified in section 10.
- Provide cursor-paginated, filterable Audit and an Overview that distinguishes unavailable or unconfigured facts from zero.
- Keep every read and write behind the existing `adminMemberships` authority model (`src/modules/security/internal/schema.ts:14-28`; `src/modules/security/internal/admin-authority.ts:13-53`).

### Non-goals

- Refunds, Credit adjustments or payout holds until the money rail and commands are live.
- Incident publishing, assignment, SLA, presence, impersonation, raw-row editing or generic CRUD.
- Rebuilding Clerk identity operations or Stripe payout onboarding. Link to their hosted controls.
- Exposing break-glass or kernel-incident controls. `authorizeRecoveryOperation` resolves a recovery operator and applies account effects without the admin-authority permission seam (`convex/recoveryBreakGlass.ts:416-440,445-465`). This ROOT-AUTH defect must close first.

## 3. Reference designs adopted

Shopify's former Polaris URLs now redirect to the current Shopify design documentation. We adopt the documented patterns, not the implementation. The source set is the [Polaris patterns index](https://polaris.shopify.com/patterns), [IndexTable](https://polaris.shopify.com/components/tables/index-table), [ResourceList](https://polaris.shopify.com/components/lists/resource-list), [Page](https://polaris.shopify.com/components/layout-and-structure/page), [Banner](https://polaris.shopify.com/components/feedback-indicators/banner), [actionable language](https://polaris.shopify.com/content/actionable-language) and [common actions](https://polaris.shopify.com/patterns/common-actions). Current equivalents document full-width resource indexes, dual-column details, settings grouping, one primary page action, contextual banners and date-range inputs ([patterns](https://shopify.dev/docs/api/app-home/latest/patterns), [index](https://shopify.dev/docs/api/app-home/latest/patterns/templates/resource-index), [details](https://shopify.dev/docs/api/app-home/latest/patterns/templates/details), [settings](https://shopify.dev/docs/api/app-home/latest/patterns/templates/settings), [page](https://shopify.dev/docs/api/app-home/latest/web-components/layout-and-structure/page), [banner](https://shopify.dev/docs/api/app-home/latest/web-components/feedback-and-status-indicators/banner), [date picker](https://shopify.dev/docs/api/app-home/latest/web-components/forms/date-picker)).

Medusa documents resource-shaped admin domains, file-based UI routes, nested settings, routed detail pages and a DataTable with row navigation, search, filtering, sorting and pagination ([Admin](https://docs.medusajs.com/learn/fundamentals/admin), [UI](https://docs.medusajs.com/ui), [UI routes](https://docs.medusajs.com/learn/fundamentals/admin/ui-routes), [routing](https://docs.medusajs.com/learn/fundamentals/admin/routing), [DataTable](https://docs.medusajs.com/ui/components/data-table)). Its User module, auth provider and RBAC role/policy APIs separate users, authentication and policy assignment ([User](https://docs.medusajs.com/resources/commerce-modules/user), [admin auth](https://docs.medusajs.com/resources/how-to-tutorials/how-to/admin/auth), [RBAC role](https://docs.medusajs.com/resources/references/js-sdk/admin/rbacRole), [RBAC policy](https://docs.medusajs.com/resources/references/js-sdk/admin/rbacPolicy)).

Stripe documents grouped global search with direct object-ID navigation and URL-persisted queries, prioritized review queues, actionable connected-account lists, evidence-first dispute decisions and immutable event objects ([search](https://docs.stripe.com/dashboard/search), [Radar reviews](https://docs.stripe.com/radar/transaction-reviews), [Connect account review](https://docs.stripe.com/connect/dashboard/review-actionable-accounts), [disputes](https://docs.stripe.com/disputes/responding), [events](https://docs.stripe.com/api/events)).

Polaris React components are Polaris-styled and Shopify-licensed, so we adopt only the documented patterns and render them with the repository's Base UI and shadcn-derived primitives. We do not take Shopify styling or information architecture. We do not take Medusa's runtime, Admin API, offset pagination, auth or RBAC. We keep Convex, Clerk and `adminMemberships`. We do not import Stripe's risk model, dispute state machine or financial authority. Stripe remains the hosted owner of payout onboarding and its own disputes.

## 4. Adaptation mapping

| Reference pattern | AE surface and adaptation |
|---|---|
| Polaris resource index, IndexTable and ResourceList ([index](https://polaris.shopify.com/patterns), [IndexTable](https://polaris.shopify.com/components/tables/index-table), [ResourceList](https://polaris.shopify.com/components/lists/resource-list)) | Exceptions, Audit and Provider lists use stable columns, server filters, cursor pagination and row-to-object navigation. No bulk consequential actions. |
| Polaris resource details layout ([patterns](https://polaris.shopify.com/patterns); [current details](https://shopify.dev/docs/api/app-home/latest/patterns/templates/details)) | Call and Provider object pages use identity and status first, primary evidence in the main column, related refs in the rail, timeline next, guarded actions last. |
| Polaris Page and common actions ([Page](https://polaris.shopify.com/components/layout-and-structure/page); [common actions](https://polaris.shopify.com/patterns/common-actions)) | One contextual primary action at most. Secondary actions remain in the header. Destructive actions sit in a separated action area and require confirmation. |
| Polaris Banner and actionable language ([Banner](https://polaris.shopify.com/components/feedback-indicators/banner); [language](https://polaris.shopify.com/content/actionable-language)) | Configuration gaps, uncertain money outcomes and required evidence use concise banners that state impact and the next action. |
| Polaris settings and date picking ([patterns](https://polaris.shopify.com/patterns); [date picking](https://shopify.dev/docs/api/app-home/latest/web-components/forms/date-picker)) | Overview groups configuration truth by system. Audit uses bounded date ranges with explicit locale and timezone labels. |
| Medusa order, customer and product domains ([Admin](https://docs.medusajs.com/learn/fundamentals/admin)) | Adapt order to Call, customer to Workspace, and product to Tool plus Provider. These are analogies for page anatomy, not shared models. |
| Medusa UI routes and routing ([UI routes](https://docs.medusajs.com/learn/fundamentals/admin/ui-routes); [routing](https://docs.medusajs.com/learn/fundamentals/admin/routing)) | Keep thin TanStack route controllers and dynamic object routes. Navigation remains in `ADMIN_NAVIGATION`, not scattered route metadata (`src/components/ae/layout/app-shell/app-shell.contracts.ts:37-49`). |
| Medusa DataTable ([DataTable](https://docs.medusajs.com/ui/components/data-table)) | Reuse the existing TanStack-backed `AeRecordTable`; extend it for server cursor state rather than adding Medusa UI (`src/components/ae/operator/AeOperatorDataTable.tsx:3-15,61-113`). |
| Medusa auth and RBAC ([admin auth](https://docs.medusajs.com/resources/how-to-tutorials/how-to/admin/auth); [RBAC policy](https://docs.medusajs.com/resources/references/js-sdk/admin/rbacPolicy)) | Adopt the separation of authentication from permission policy. Keep Clerk authentication and AE's fixed permission matrix. Do not create configurable RBAC CRUD. |
| Stripe Dashboard search ([search](https://docs.stripe.com/dashboard/search)) | Exact canonical refs jump to objects; grouped results and filters persist in the URL. AE deliberately excludes fuzzy PII search in alpha. |
| Stripe Radar review ([reviews](https://docs.stripe.com/radar/transaction-reviews)) | Purchase-resolution and uncertain-Call queues put evidence beside the current item, preserve list context in a Sheet, and record every decision in the timeline. Assignment remains absent. |
| Stripe Connect actionable accounts ([Connect](https://docs.stripe.com/connect/dashboard/review-actionable-accounts)) | Provider queues group admission, source-authority, connection and payout-onboarding states. Stripe-owned remediation opens in Stripe. |
| Stripe disputes and events ([disputes](https://docs.stripe.com/disputes/responding); [events](https://docs.stripe.com/api/events)) | Decisions remain evidence-first and finality is explicit. Call and Provider timelines project immutable AE audit and attempt history, not mutable notes. |

## 5. Functional and non-functional requirements

### Functional

- **F1 Search.** Exact ref lookup for Call, Quote, Tool version, Provider, Workspace and Agent. A valid ref has one object route; malformed and absent refs are different outcomes.
- **F2 Call object.** Join Call, attempt/control history, Quote, usage/x402, receipt, obligation and Purchase resolution. Project money truth through `projectFoundCallPurchaseStatus` (`src/modules/capability-execution/call-receipt-view.ts:164-180`).
- **F3 Provider object.** Join Business, publications, connections, admission cases, removal disputes, suppression and payout readiness. Stripe details are a link-out.
- **F4 Exceptions.** List Purchase resolutions, removal disputes, source-authority reviews, admission cases and uncertain Calls, oldest actionable first.
- **F5 Actions.** Only the existing mutation entry points in section 10. No action is inferred from a generic row editor.
- **F6 Audit.** Cursor-paginated filters for actor, event kind, target ref, correlation ref and date range. URLs preserve filters.
- **F7 Overview.** Show server-read configuration truth. `unavailable`, `not_configured` and `zero` are distinct values.

### Non-functional

- **N1 Authority.** Only server-side `adminMemberships` decides access. Roles are `owner_admin`, `support` and `reviewer`; permissions come from the fixed matrix (`src/modules/security/internal/admin-authority.ts:13-53`).
- **N2 Guarded commands.** Every mutation requires a reason, evidence refs, an operation key, a correlation ref and server-verified fresh `identity.fva`. One atomic audit event records before and after state. The current fresh-MFA rule accepts two non-negative factor ages no older than 10 minutes (`convex/lib/workspaceSecurity/factorVerification.ts:1-17`).
- **N3 CQS.** Queries do not write, consume nonces or create audit rows. Mutations do not masquerade as reads.
- **N4 Search privacy.** Alpha search accepts canonical refs only. No email, name, Clerk ID or Stripe ID search until Joel approves a PII policy.
- **N5 Bounded reads.** All list reads use indexes and cursors. Each object page makes at most three Convex queries.
- **N6 Product contracts.** Routes stay at or below 80 lines; async pages have matching skeletons; states use `getStatusPresentation`; controls retain app accessibility and canonical vocabulary.

## 6. Domain model and bounded context

The admin console is a read-and-command adapter over existing domains. It owns parsers, admin projections, exception projections, URL filters and command envelopes. It does not own Calls, money, supply, identity or audit records.

- **Identity boundary:** Clerk authenticates. `adminMemberships` authorizes (`src/modules/security/internal/schema.ts:15-28`).
- **Execution boundary:** capability-execution owns Calls, Quotes, receipts and Purchase resolutions (`src/modules/capability-execution/internal/convex-schema.ts:289-336,337-458`).
- **Supply boundary:** business and capability-supply own Providers, Tool versions, admission and connections (`src/modules/business/internal/schema.ts:8-26`; `src/modules/capability-supply/internal/convex-schema.ts:177-309,483-550`).
- **Workspace boundary:** principal-account and agent-access own Workspaces and Agents (`src/modules/principal-account/account/convex-schema.ts:231-251`; `src/modules/agent-access/internal/principal-convex-schema.ts:8-30`).
- **Audit boundary:** observability owns append-only audit rows and idempotency keys (`src/modules/observability/internal/schema.ts:15-65`).

No `adminCases` or generic `adminObjects` table is added. Existing domain rows remain authoritative. One deliberate `admin-console` module may hold contracts and projections; it must be registered once in the module boundary manifest (`src/modules/module-boundaries.ts:71-80`).

## 7. Schema and object mapping

SchemaFacts completed before this RFC was committed. `PRESENT` and `ABSENT` below therefore reflect both the dedicated schema inventory and the cited source. Absence still requires a failing query-plan test before an index migration.

| `AdminObjectRef` kind | Tables joined | Required indexes, status | Read contract |
|---|---|---|---|
| `call` | `capabilityCalls`, `capabilityCallProjections`, action attempts/history, `capabilityQuotes`, usage/x402, receipts/obligations, `purchaseResolutionRecords` | `capabilityCalls.by_callRef`, projection `by_callRef`, resolution `by_callRef`: PRESENT. Call state/time indexes are PRESENT but time is scoped (`src/modules/capability-execution/internal/convex-schema.ts:289-336,403-484`). | Add `readAdminCallObject`; reuse buyer receipt projection and `projectFoundCallPurchaseStatus`. |
| `quote` | `capabilityQuotes`, related Call/projection, Tool version, Workspace, Agent | `capabilityQuotes.by_quoteRef` and `by_state_and_expiresAt`: PRESENT. Call-by-quote index: ABSENT (`src/modules/capability-execution/internal/convex-schema.ts:337-458`). | Add `readAdminQuoteObject`; do not reuse owner-scoped reads as authority. |
| `tool_version` | `capabilityPublications`, `capabilitySupplyAdmissionCases`, offering, binding, Provider | Publication and admission-case canonical-ref, state and time indexes: PRESENT (`src/modules/capability-supply/internal/convex-schema.ts:176-309`). | Add `readAdminToolVersionObject`; the canonical `operation:v1:<64 hex>` Tool ref identifies the publication revision. |
| `provider` | `businesses`, publications, connections, admission/offboarding cases, disputes, payout account | Business slug, publication by Business, connection by Provider/lifecycle and dispute by Business/status: PRESENT. Global connection lifecycle/time index: ABSENT (`src/modules/business/internal/schema.ts:8-28`; `src/modules/capability-supply/internal/convex-schema.ts:247-257,327-387,483-550`; `src/modules/security/internal/schema.ts:42-61`). | Add `readAdminProviderObject`; resolve the exact normalized Business slug, then run bounded joins by Business ID. |
| `workspace` | `accounts`, ownerships, memberships, external identity binding | `accounts.by_accountRef`, lifecycle/time and membership/ownership account indexes: PRESENT (`src/modules/principal-account/account/convex-schema.ts:231-245`). | Add `readAdminWorkspaceObject`; return refs and roles, not secrets or Clerk session controls. |
| `agent` | `agentAccessPrincipals`, current credential/grant, Workspace, Call projections | principal `by_principalId` and Call projection account/principal/time: PRESENT (`src/modules/agent-access/internal/principal-convex-schema.ts:8-30`; `src/modules/capability-execution/internal/convex-schema.ts:329-336`). | Add `readAdminAgentObject`; expose credential lifecycle, never credential material. |

Add only indexes justified by these query contracts: `purchaseResolutionRecords.by_resolutionRef`, `purchaseResolutionRecords.by_terminalState_and_resolvedAt`, `disputes.by_status_and_updatedAt`, `capabilityCallProjections.by_state_and_updatedAt`, `capabilityProviderConnections.by_lifecycle_and_updatedAt`, and Audit indexes for `eventType+createdAt`, `actorRef+createdAt`, `targetType+targetRef+createdAt`, and `correlationId+createdAt`. Each is ABSENT in the cited table definitions (`src/modules/capability-execution/internal/convex-schema.ts:289-336`; `src/modules/capability-supply/internal/convex-schema.ts:483-550`; `src/modules/security/internal/schema.ts:42-61`; `src/modules/observability/internal/schema.ts:15-47`). The Call history query may also need `capabilityCalls.by_createdAt`, but it stays out until a measured global-history query proves it.

Audit payload is additive, not a new table. Keep `beforeState`, `afterState`, `reasonCode`, `evidenceRefs`, `idempotencyKey`, `correlationId`, redacted payload and payload hash (`src/modules/common/audit-events.ts:168-190`). The redacted payload gains a versioned admin-command summary with permission, action, canonical object ref, input digest, expected revision when present, a boolean fresh-FVA result and outcome code. Never store raw `fva`, evidence bodies, secrets or PII search text.

## 8. Type design

These are signatures, not implementation.

```ts
type Brand<T, Name extends string> = T & { readonly __brand: Name }
type CallRef = Brand<string, 'CallRef'>
type QuoteRef = Brand<string, 'QuoteRef'>
type ToolVersionRef = Brand<string, 'ToolVersionRef'>
type ProviderRef = Brand<string, 'ProviderRef'>
type WorkspaceRef = Brand<string, 'WorkspaceRef'>
type AgentRef = Brand<string, 'AgentRef'>

type AdminObjectRef =
  | { readonly kind: 'call'; readonly ref: CallRef }
  | { readonly kind: 'quote'; readonly ref: QuoteRef }
  | { readonly kind: 'tool_version'; readonly ref: ToolVersionRef }
  | { readonly kind: 'provider'; readonly ref: ProviderRef }
  | { readonly kind: 'workspace'; readonly ref: WorkspaceRef }
  | { readonly kind: 'agent'; readonly ref: AgentRef }

type AdminObjectView =
  | { readonly kind: 'call'; readonly ref: CallRef; readonly value: AdminCallView }
  | { readonly kind: 'quote'; readonly ref: QuoteRef; readonly value: AdminQuoteView }
  | { readonly kind: 'tool_version'; readonly ref: ToolVersionRef; readonly value: AdminToolVersionView }
  | { readonly kind: 'provider'; readonly ref: ProviderRef; readonly value: AdminProviderView }
  | { readonly kind: 'workspace'; readonly ref: WorkspaceRef; readonly value: AdminWorkspaceView }
  | { readonly kind: 'agent'; readonly ref: AgentRef; readonly value: AdminAgentView }

type AdminException =
  | { readonly kind: 'purchase_resolution'; readonly objectRef: CallRef; readonly openedAt: number }
  | { readonly kind: 'removal_dispute'; readonly objectRef: ProviderRef; readonly openedAt: number }
  | { readonly kind: 'source_authority_review'; readonly objectRef: ToolVersionRef; readonly openedAt: number }
  | { readonly kind: 'admission_case'; readonly objectRef: ToolVersionRef; readonly openedAt: number }
  | { readonly kind: 'uncertain_call'; readonly objectRef: CallRef; readonly openedAt: number }

type AdminActionInput = {
  readonly set_business_suppression: SetBusinessSuppressionInput
  readonly close_removal_dispute: CloseRemovalDisputeInput
  readonly verify_capability_source_authority: VerifyCapabilitySourceAuthorityInput
  readonly grant_admin_membership: GrantAdminMembershipInput
  readonly revoke_admin_membership: RevokeAdminMembershipInput
  readonly change_commercial_policy: ChangeCommercialPolicyInput
}

type AdminCommand<A extends keyof AdminActionInput> = Readonly<{
  action: A
  input: AdminActionInput[A]
  reasonCode: string
  evidenceRefs: readonly string[]
  operationKey: Brand<string, 'OperationKey'>
  correlationId: Brand<string, 'CorrelationId'>
}>

type AdminCommandOutcome<T> =
  | { readonly kind: 'applied'; readonly code: string; readonly value: T; readonly auditEventId: string }
  | { readonly kind: 'replayed'; readonly code: string; readonly value: T; readonly auditEventId: string }
  | { readonly kind: 'refused'; readonly code: AdminRefusalCode; readonly retryable: boolean; readonly auditEventId?: string }

type ParseResult<T> = { readonly kind: 'valid'; readonly value: T } | { readonly kind: 'malformed'; readonly code: string }
declare function parseAdminObjectRef(input: string): ParseResult<AdminObjectRef>

type AdminPermission = AdminAction
declare function requireAdminPermission(membership: AdminMembership | undefined, permission: AdminPermission): AdminAuthorityResult
```

Every parser is total. Formats already exist for Call `operation-invocation:v1:<64 hex>`, Quote `operation-commitment:v1:<64 hex>`, Tool `operation:v1:<64 hex>`, Workspace `acc_<32 hex>` and Agent `prn_<32 hex>` (`src/modules/capability-execution/call-contracts.ts:57-75`; `src/modules/common/tool-ref.ts:1-7`; `src/modules/principal-account/account/registry/validation.ts:20-47`; `src/modules/principal-account/principal/registry.ts:1-8,76-85`). Provider uses the exact normalized Business slug because `businesses.by_slug` is authoritative (`src/modules/business/internal/schema.ts:9-26`). `AdminPermission` is the existing `AdminAction` matrix-key union; the matrix is constrained as `Record<AdminRole, Record<AdminAction, boolean>>` (`src/modules/security/internal/admin-authority.ts:13-53`). `AdminCommand` deliberately omits `fva`; the server reads and verifies it from the authenticated Clerk identity.

## 9. Convex read API contracts

Proposed queries are `searchAdminObjects`, `readAdminObject`, `listAdminExceptions`, `listAdminAuditEvents` and `readAdminOverview`. Each starts with `read_admin_readbacks`; object and exception projections may demand a stronger permission later, but never a weaker one. `readAdminObject` dispatches by parsed ref and uses no more than three parallel query groups. Search accepts exact refs only. Lists take `{ cursor, limit, filters }` and return `{ page, continueCursor, isDone }`.

The current `readAdminAuditEvents` and `readAdminIndexHealth` query façades remain useful names only if their contracts are replaced cleanly. Today they have no args and return the bounded readback union (`convex/security.ts:268-277`); Audit reads `order('desc').take(100)` (`convex/securityAdminReadbacks.ts:65-73`). No compatibility aliases are added.

## 10. Existing action adaptation

Each action extends its existing mutation in place. The shared adaptation adds `operationKeys.by_actor_operation_key`. The six handlers do not currently use that seam consistently: suppression, dispute closure and membership changes key replay through domain or audit material; source verification does not persist a generic key; commercial policy persists idempotency refs without a generic replay row (`convex/businesses.ts:318-391`; `convex/security.ts:354-389,461-480,502-519`; `convex/capabilitySupply.ts:752-829`; `convex/moneyCommercialPolicy.ts:44-73`). The fresh-FVA check runs before domain lookup. Reason/evidence validation precedes effects. The effect and one audit row containing before and after state commit in the same Convex transaction.

| Existing mutation | Permission | Envelope additions or normalization | Audit event kind | Polaris placement | Refusal codes |
|---|---|---|---|---|---|
| `businesses.setBusinessSuppression` (`convex/businesses.ts:288-300`) | `suppress_business` | Retain reason, evidence, operation key and correlation; add server fresh-FVA and generic replay/conflict | Existing `business.suppressed` or `business.unsuppressed` (`convex/businesses.ts:206-209`) | Destructive action area for suppress; secondary for unsuppress | Existing `admin_action_denied`, `admin_invalid_reason`, `admin_missing_evidence`, `business_not_found`, plus `mfa_reverification_required`, `idempotency_conflict`, `target_changed` |
| `security.closeRemovalDispute` (`convex/security.ts:314-324`) | `close_dispute` | Retain reason, evidence and idempotency refs; add fresh-FVA and generic replay/conflict | Existing `dispute.closed` with before/after (`convex/securityRemovalDisputes.ts:355-390`) | Primary decision in evidence Sheet and object page | Existing admin refusals and `dispute_not_found` (`convex/security.ts:205-224`), plus MFA, conflict and target-changed codes |
| `capabilitySupply.verifyCapabilitySourceAuthority` (`convex/capabilitySupply.ts:99-102`) | `register_capability_supply` | Add reason; retain evidence, operation/correlation, expected revision/digest; add fresh-FVA and generic replay/conflict | Add existing-taxonomy kind `capability_supply.eligibility_changed`; the current handler does not write an audit event (`convex/lib/capabilitySupply/sourceAuthority.ts:7-91`; `src/modules/common/audit-events.ts:90-95`) | Primary review action | Existing `authorization_denied`, `evidence_invalid`, `publication_not_found`, `revision_changed`, `source_changed`; add MFA and idempotency conflict |
| `security.grantAdminMembership` (`convex/security.ts:239-252`) | `manage_admin_membership` | Retain reason and evidence; add fresh-FVA and generic replay/conflict; prevent self-escalation outside bootstrap | Existing `admin.membership_granted` (`src/modules/security/internal/admin-authority.ts:344-364`) | Secondary page action with confirmation | Existing admin refusals, plus MFA, idempotency conflict, last-owner and two-person policy codes |
| `security.revokeAdminMembership` (`convex/security.ts:254-266`) | `manage_admin_membership` | Retain reason and evidence; add fresh-FVA, generic replay/conflict, expected membership state and last-owner guard | Existing `admin.membership_revoked` (`src/modules/security/internal/admin-authority.ts:419-439`) | Destructive action area | Existing admin refusals and membership-not-found, plus MFA, idempotency conflict, target-changed and last-owner codes |
| `moneyCommercialPolicy.change` (`convex/moneyCommercialPolicy.ts:460-464`) | `manage_commercial_policy` | Add reason and evidence-ref list around existing evidence ref/digest; retain operation/correlation/proof; add fresh-FVA and generic replay/conflict | Add taxonomy kind `admin.commercial_policy_changed` with policy before/after payload; the current mutation does not audit the policy change itself (`convex/moneyCommercialPolicy.ts:324-367,414-457`; current taxonomy at `src/modules/common/audit-events.ts:72-151`) | Destructive area for suspend/replace; primary only for first activation | Existing commercial-policy refusals (`convex/moneyCommercialPolicy.ts:369-411`), plus reason/evidence/MFA/idempotency codes |

`AdminRefusalCode` is a closed union of the codes above. A refusal is data, not an exception. Unexpected storage or invariant failures remain thrown server faults and receive a correlation ref without claiming that no effect occurred.

## 11. Component architecture

```text
src/modules/admin-console/
  contracts.ts                         # refs, unions, cursors, commands, <=300
  admin-console.view-model.ts          # pure projections, <=300
  internal/                            # indexed query helpers, <=400 each
convex/adminConsole.ts                 # public query façade only, <=200
convex/lib/adminConsole/               # joined reads, <=400 each
src/routes/_operator/admin.*.tsx       # route controllers, <=80 each
src/components/ae/admin/
  overview/
    AeAdminOverview.tsx                # container, <=150
    useAeAdminOverview.ts              # state and queries, <=300
    overview.contracts.ts
    AeAdminOverviewSkeleton.tsx
    components/                        # pure leaves, <=150 each
  object-search/                       # same compound shape
  call-object/                         # same compound shape
  provider-object/                     # same compound shape
  exceptions/                          # same compound shape
  audit/                               # same compound shape
```

Reuse `AeOperatorPage`, `AeRecordHeader`, `AeRecordTable`, TanStack Table, `Sheet`, `AeCopyReference`, `getStatusPresentation`, buyer Call receipt components and `OperatorRouteNotFoundRecovery`. Existing anchors include `AeRecordHeader` (`src/components/ae/layout/AeRecordHeader.tsx:17-20`), TanStack `AeRecordTable` (`src/components/ae/operator/AeOperatorDataTable.tsx:3-15,115-143`), `Sheet` (`src/components/ui/sheet.tsx:9-50`), Call ref display (`src/components/ae/call-receipt/CallReceiptPrimitives.tsx:25-26`) and route recovery (`src/components/ae/layout/AeRouteNotFound.tsx:20-27`). Compose buyer receipt evidence; do not fork it. Add Overview, Search, Exceptions, Providers and Audit to `ADMIN_NAVIGATION`; Call and Provider object routes do not become duplicate nav items.

## 12. Authorization and threat model

| Threat | Control |
|---|---|
| Client or route grants itself authority | Every query and mutation resolves active `adminMemberships` server-side; route visibility is only presentation (`src/modules/security/internal/admin-authority.ts:55-72`). |
| Stolen session performs a consequential action | Verify both `identity.fva` factor ages server-side at 10 minutes or less; absent, stale or malformed values refuse (`convex/lib/workspaceSecurity/factorVerification.ts:1-17`). |
| Replay or changed retry duplicates an effect | Bind actor, mutation name, operation key and request hash in `operationKeys`; same material replays, changed material refuses (`src/modules/observability/internal/schema.ts:49-65`). |
| Cross-account search leaks PII | Alpha accepts canonical refs only, returns the minimum object projection, audits successful and denied access, and never searches reason text or evidence bodies. |
| TOCTOU changes the reviewed object | Commands carry expected revision/digest where the domain has one; mismatch returns `target_changed` before effect. |
| UI invents money truth | Call pages consume `projectFoundCallPurchaseStatus`; uncertain stays uncertain (`src/modules/capability-execution/call-receipt-view.ts:164-180`). |
| Evidence or reason leaks secrets | Store refs and redacted summaries only; `AuditEventContract` already separates evidence refs and redacted payload from payload hash (`src/modules/common/audit-events.ts:168-190`). |
| Break-glass bypass | No break-glass or kernel controls until ROOT-AUTH routes those commands through the permission matrix (`convex/recoveryBreakGlass.ts:416-440`). |

Support can read and annotate triage only; reviewer reads only; owner_admin holds all current permissions (`src/modules/security/internal/admin-authority.ts:13-53`). Two-person policy, if adopted, requires a distinct active owner_admin. Previewing another role changes rendering only.

## 13. Error handling

- Parsers return `malformed_ref`; valid but absent objects return `object_not_found`.
- Permission, MFA, reason, evidence, idempotency, stale-target and domain refusals return `AdminCommandOutcome.kind = 'refused'` with a stable code and retryability.
- `not_configured`, `source_unavailable` and zero remain distinct read states. Overview never converts either of the first two to `0`.
- A mutation result may say "Nothing changed" only for a proved refusal or replay. An unknown server outcome says that the result is unconfirmed and directs the operator to Audit by correlation ref.
- UI copy uses `getStatusPresentation`; alerts name the failed action, state whether an effect is confirmed and offer one next step.

## 14. Observability and audit

The canonical audit taxonomy already covers disputes, suppression, admin membership, capability supply, billing and consequence events (`src/modules/common/audit-events.ts:72-151`). Every admin command records actor, target, permission, reason, evidence refs, operation key, correlation ID, before/after state, outcome code and payload digest. Denials remain auditable through `admin.action_denied` (`src/modules/security/internal/admin-authority.ts:442-460`). Audit pagination is stable on `(createdAt, _id)` descending. A cursor encodes both values and all active filters; changing a filter invalidates the cursor.

Sentry is for unexpected faults, not domain outcomes. Every admin route and command carries the correlation ID as the `ae.request_id` tag, and each object page links to Sentry filtered by that tag. The existing server capture path already reads the request correlation ID, sanitizes context and sets it as a Sentry tag (`src/lib/observability/sentry.server.ts:42-64`). Client observability is booted once at the root and wraps the app in `AeObservabilityErrorBoundary` (`src/routes/__root.tsx:14-25,98-99`; `src/lib/observability/boot-client-observability.ts:10-28`; `src/components/ae/feedback/AeObservabilityErrorBoundary.tsx:34-44`). Refusals remain values and never reach Sentry. Only unexpected storage, invariant or render throws do.

PostHog product analytics use the existing `posthog-node` and `captureServerEvent` path (`src/lib/observability/posthog.server.ts:1,10-23,38-59`). Add an event-specific property builder, following the repository's fixed-property builder pattern (`src/lib/observability/funnel-event-props.ts:19-31`), that allows only: `admin_command` with `{ action, permission, outcome }`; `admin_lookup` with `{ refKind, found }`; and `admin_queue_view` with `{ kind }`. Never send refs, emails, reasons, evidence, object payloads or search text. Call and Workspace object pages may link to PostHog session replay by operator distinct ID only if Joel enables the PII-search/session decision. Demand and supply trend charts remain a linked PostHog dashboard, not in-app charts. Convex tables remain authoritative for money and counts.

## 15. Testing strategy

| Behaviour | Proposed test file | Harness and assertion |
|---|---|---|
| Permission matrix per role | `tests/unit/admin-console/admin-permissions.test.ts` | Pure table test generated from `AdminPermission`; owner_admin allowed as declared, support only read/annotate, reviewer only read. |
| Fresh, stale, absent and malformed `fva` | `tests/unit/convex/admin-command-fva.test.ts` | `convex-test` identities; 0/10 minutes accepted, 11, `-1`, absent and malformed refused before effect. |
| Idempotent replay and changed-material conflict | `tests/unit/convex/admin-command-idempotency.test.ts` | `convex-test`; same operation key and digest returns replay, changed digest refuses, one effect and one audit row. |
| Ref parser totality | `tests/unit/admin-console/admin-object-ref.test.ts` | Property and boundary cases; every string returns valid or malformed and never throws. Canonical Call shape follows `parseCallRef` (`src/modules/capability-execution/call-contracts.ts:57-63`). |
| Joined Call money truth | `tests/unit/admin-console/admin-call-view.test.ts` | Seed contradictory receipt/usage facts; projection remains uncertain and disables unsafe action. |
| Cursor stability | `tests/unit/convex/admin-audit-pagination.test.ts` | Insert between page reads; no duplicates or omissions for the snapshot cursor; filter change rejects old cursor. |
| Exception ordering | `tests/unit/convex/admin-exceptions.test.ts` | Real domain rows; actionable only, oldest first, unavailable source represented, not zeroed. |
| Observability boundary | `tests/unit/admin-console/admin-observability.test.ts` | Refusals do not call Sentry; invariant throws carry `ae.request_id`; PostHog accepts only the declared event/property combinations and excludes refs, emails, reasons and evidence. |
| One operator journey | `tests/e2e/admin-console.spec.ts` | Sign in as owner_admin, exact Call ref search, object page reuses receipt, open evidence Sheet, submit a stale-FVA action and observe refusal plus unchanged state. |

Tests assert behaviour, not JSX wiring or copied field lists. `convex-test` creates separate owner_admin, support, reviewer and non-admin identities using the existing identity fixture helpers (`tests/helpers/convex-fixtures.ts:1-164`). One end-to-end test is enough because domain branches belong in unit and Convex integration tests.

## 16. Rollout

| Wave | Register rows | Deliverable | Gates and required assertions |
|---|---|---|---|
| F1, read-only backbone | R-38 Search, R-39 Call object, R-42 Audit | Total parsers, exact refs, joined Call truth, cursor Audit; no mutation UI | `route-controller-size`, `leaf-purity`, `tsx-type-quarantine`; parser totality, role denial, Call uncertainty, cursor stability green. |
| F2, Provider and exceptions | R-40 Provider object, R-41 Purchase resolutions | Provider joins, Stripe link-out, oldest-first exception feed and evidence Sheet | `file-size-ratchet`, `copy-vocabulary`, `status-vocabulary`; bounded-query count, exception ordering and no-money-command disabled-state assertions green. |
| F3, guarded operations | R-37 Overview plus action portions of R-40 and R-42 | Honest configuration truth and the six adapted mutations after fresh-FVA/idempotency/audit convergence | `route-controller-size`, `file-size-ratchet`, `status-vocabulary`; role matrix, fva matrix, idempotent replay, audit before/after and the one end-to-end journey green. |

Each row stays in review until its named behaviour assertion passes. The Convex façade stays below 200 lines, routes below 80, compound containers below 150, leaves below 150 and all source files below 1,000.

## 17. Risks

- **Join cost and drift.** A convenient "admin object" can become a second domain model. Keep projections read-only, cite source refs, cap each page at three query groups and add only measured indexes.
- **Authority convergence.** Existing mutations have inconsistent guards and result vocabularies. Do not expose an action until its in-place contract satisfies the shared envelope.
- **False money confidence.** Provider payout and Credit aggregates are not equivalent to Stripe or Formance truth. Link out or show unavailable.
- **Audit filter explosion.** Convex cannot satisfy every arbitrary compound filter with one index. Alpha supports one indexed primary filter plus date bounds; add combinations only from measured operator use.
- **Single-owner lockout.** Membership revocation and two-person rules can strand alpha operations. Last-owner refusal is mandatory; two-person actions remain disabled until a second owner exists.
- **Reference drift.** Shopify, Medusa and Stripe can change their components and labels. This RFC adopts stable interaction patterns, not packages or pixel styling.

## 18. Open decisions for Joel

1. **Clerk `fva` template.** Default: add `{{session.factor_verification_age}}` to the Convex JWT template before F3; all guarded actions fail closed until present.
2. **`ADMIN_BOOTSTRAP_PRINCIPAL_IDS`.** Default: Joel's Clerk principal only. The bootstrap reads this environment list (`convex/securityAdminMembership.ts:301-302`).
3. **PII search scope.** Default: canonical refs only. Add Provider/Tool name search later; defer email, Clerk and Stripe identifiers until access, logging and retention policy are approved.
4. **Two-person actions.** Default: require a distinct second owner_admin for Business suppression, money-affecting Purchase resolution and commercial-policy replacement/suspension. Keep these actions disabled while Joel is the only owner.
5. **Purchase-resolution outcomes.** Default: `uphold`, `refuse` and `request_evidence`. Show age without "late" until an SLA exists. Refund remains unavailable until a real refund command and live money rail exist.
