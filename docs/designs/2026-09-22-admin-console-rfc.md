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

Shopify's current App Home documentation supplies the [patterns index](https://shopify.dev/docs/api/app-home/latest/patterns), [resource index layout](https://shopify.dev/docs/api/app-home/latest/patterns/templates/resource-index), [resource details layout](https://shopify.dev/docs/api/app-home/latest/patterns/templates/details), [settings layout](https://shopify.dev/docs/api/app-home/latest/patterns/templates/settings), [index table composition](https://shopify.dev/docs/api/app-home/latest/patterns/compositions/index-table), [resource list composition](https://shopify.dev/docs/api/app-home/latest/patterns/compositions/resource-list), [Page](https://shopify.dev/docs/api/app-home/latest/web-components/layout-and-structure/page), [callout card](https://shopify.dev/docs/api/app-home/latest/patterns/compositions/callout-card) and [date picker](https://shopify.dev/docs/api/app-home/latest/web-components/forms/date-picker). We adopt the documented patterns, not the implementation.

Medusa documents resource-shaped admin domains, file-based UI routes, nested settings, routed detail pages and a DataTable with row navigation, search, filtering, sorting and pagination ([Admin](https://docs.medusajs.com/learn/fundamentals/admin), [UI](https://docs.medusajs.com/ui), [UI routes](https://docs.medusajs.com/learn/fundamentals/admin/ui-routes), [routing](https://docs.medusajs.com/learn/fundamentals/admin/routing), [DataTable](https://docs.medusajs.com/ui/components/data-table)). Its User module, auth provider and RBAC role/policy APIs separate users, authentication and policy assignment ([User](https://docs.medusajs.com/resources/commerce-modules/user), [admin auth](https://docs.medusajs.com/resources/how-to-tutorials/how-to/admin/auth), [RBAC role](https://docs.medusajs.com/resources/references/js-sdk/admin/rbacRole), [RBAC policy](https://docs.medusajs.com/resources/references/js-sdk/admin/rbacPolicy)).

Stripe documents grouped global search with direct object-ID navigation and URL-persisted queries, prioritized review queues, actionable connected-account lists, evidence-first dispute decisions and immutable event objects ([search](https://docs.stripe.com/dashboard/search), [Radar reviews](https://docs.stripe.com/radar/transaction-reviews), [Connect account review](https://docs.stripe.com/connect/dashboard/review-actionable-accounts), [disputes](https://docs.stripe.com/disputes/responding), [events](https://docs.stripe.com/api/events)).

Archived Polaris React's license grants MIT-form permissions with Shopify-specific interoperability and visual-distinctness conditions ([license](https://github.com/Shopify/polaris-react/blob/main/LICENSE.md)); no Polaris package or code is pulled into AE. We render the patterns with the repository's Base UI and shadcn-derived primitives and do not take Shopify styling or information architecture. We do not take Medusa's runtime, Admin API, offset pagination, auth or RBAC. We keep Convex, Clerk and `adminMemberships`. We do not import Stripe's risk model, dispute state machine or financial authority. Stripe remains the hosted owner of payout onboarding and its own disputes.

## 4. Adaptation mapping

| Reference pattern | AE surface and adaptation |
|---|---|
| Shopify resource index, index table and resource list ([index](https://shopify.dev/docs/api/app-home/latest/patterns/templates/resource-index), [index table](https://shopify.dev/docs/api/app-home/latest/patterns/compositions/index-table), [resource list](https://shopify.dev/docs/api/app-home/latest/patterns/compositions/resource-list)) | Exceptions, Audit and Provider lists use stable columns, server filters, cursor pagination and row-to-object navigation. No bulk consequential actions. |
| Shopify resource details layout ([details](https://shopify.dev/docs/api/app-home/latest/patterns/templates/details)) | Call and Provider object pages use identity and status first, primary evidence in the main column, related refs in the rail, timeline next, guarded actions last. |
| Shopify Page and layout guidance ([Page](https://shopify.dev/docs/api/app-home/latest/web-components/layout-and-structure/page); [layout](https://shopify.dev/docs/apps/design/layout)) | One contextual primary action at most. Secondary actions remain in the header. Destructive actions sit in a separated action area and require confirmation. |
| Shopify callout card ([callout](https://shopify.dev/docs/api/app-home/latest/patterns/compositions/callout-card)) | Configuration gaps, uncertain money outcomes and required evidence use concise feedback that states impact and the next action. |
| Shopify settings and date picking ([settings](https://shopify.dev/docs/api/app-home/latest/patterns/templates/settings); [date picking](https://shopify.dev/docs/api/app-home/latest/web-components/forms/date-picker)) | Overview groups configuration truth by system. Audit uses bounded date ranges with explicit locale and timezone labels. |
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

## 6. Application adapter and context map

The admin console is a downstream application adapter, not a new source-data bounded context. Source domains own lifecycle and writes. The adapter owns total ref parsing, query orchestration, operator projections, URL filters and command envelopes. It never owns or exports Calls, money, supply, identity, audit rows, `Doc<>` values or source DTOs.

- **Identity boundary:** Clerk authenticates. `adminMemberships` authorizes (`src/modules/security/internal/schema.ts:15-28`).
- **Execution boundary:** capability-execution owns Calls, Quotes, receipts and Purchase resolutions (`src/modules/capability-execution/internal/convex-schema.ts:289-336,337-458`).
- **Supply boundary:** business and capability-supply own Providers, Tool versions, admission and connections (`src/modules/business/internal/schema.ts:8-26`; `src/modules/capability-supply/internal/convex-schema.ts:177-309,483-550`).
- **Workspace boundary:** principal-account and agent-access own Workspaces and Agents (`src/modules/principal-account/account/convex-schema.ts:231-251`; `src/modules/agent-access/internal/principal-convex-schema.ts:8-30`).
- **Audit boundary:** observability owns append-only audit rows and idempotency keys (`src/modules/observability/internal/schema.ts:15-65`).

`convex/lib/adminConsole/` is the single ACL owner: it reads raw Convex rows and immediately translates them to stable operator contracts. Nothing under the adapter imports `@/modules/*/internal/*`; missing capabilities are exported through the owning module's declared public seam. An import-boundary test rejects internal imports and exported raw documents. Contracts and total parser composition live under `src/lib/operator/admin-console/`, not a thirtieth module. `tests/imports/module-boundaries-ratchet.test.ts:25-30,35-80` remains pinned at 29 modules and 229 entry surfaces. No `adminCases` or generic `adminObjects` table is added.

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

Reuse the PRESENT `operationKeys.by_actor_operation_key` index (`src/modules/observability/internal/schema.ts:49-65`). Add optional `resultJson` to that shared table; every `admin_operator` row requires canonical serialized first-outcome bytes and its existing `resultHash`. Other scopes remain unaffected. Audit adds a top-level permission and a versioned redacted before/after summary. It uses the existing `outcome` field rather than duplicating outcome inside payload (`src/modules/observability/internal/schema.ts:16-38`). If Joel enables two-person control, the justified `adminApprovalProposals` table stores proposal ref, action, command digest, proposer ref, expiry and a closed approval state, indexed only by proposal ref and status plus expiry. No raw command input is stored. Never store raw `fva`, evidence bodies, secrets or PII search text.

## 8. Type design

These are signatures, not implementation.

```ts
type AdminObjectRef =
  | { readonly kind: 'call'; readonly ref: CallRef }
  | { readonly kind: 'quote'; readonly ref: QuoteRef }
  | { readonly kind: 'tool_version'; readonly ref: PublicToolRef }
  | { readonly kind: 'provider'; readonly ref: BusinessSlug }
  | { readonly kind: 'workspace'; readonly ref: AccountRef }
  | { readonly kind: 'agent'; readonly ref: PrincipalRef }

type AdminObjectView =
  | { readonly kind: 'call'; readonly ref: CallRef; readonly value: AdminCallView }
  | { readonly kind: 'quote'; readonly ref: QuoteRef; readonly value: AdminQuoteView }
  | { readonly kind: 'tool_version'; readonly ref: PublicToolRef; readonly value: AdminToolVersionView }
  | { readonly kind: 'provider'; readonly ref: BusinessSlug; readonly value: AdminProviderView }
  | { readonly kind: 'workspace'; readonly ref: AccountRef; readonly value: AdminWorkspaceView }
  | { readonly kind: 'agent'; readonly ref: PrincipalRef; readonly value: AdminAgentView }

type AdminException =
  | { readonly kind: 'purchase_resolution'; readonly objectRef: CallRef; readonly openedAt: number }
  | { readonly kind: 'removal_dispute'; readonly objectRef: BusinessSlug; readonly openedAt: number }
  | { readonly kind: 'source_authority_review'; readonly objectRef: PublicToolRef; readonly openedAt: number }
  | { readonly kind: 'admission_case'; readonly objectRef: PublicToolRef; readonly openedAt: number }
  | { readonly kind: 'uncertain_call'; readonly objectRef: CallRef; readonly openedAt: number }

type AdminParseErrorCode =
  | 'empty_ref'
  | 'unknown_ref_kind'
  | 'malformed_call_ref'
  | 'malformed_quote_ref'
  | 'malformed_tool_ref'
  | 'malformed_provider_slug'
  | 'malformed_account_ref'
  | 'malformed_principal_ref'

type AdminParseResult =
  | { readonly kind: 'valid'; readonly value: AdminObjectRef }
  | { readonly kind: 'malformed'; readonly code: AdminParseErrorCode }

declare function parseAdminObjectRef(kind: AdminObjectRef['kind'], input: string): AdminParseResult

type AdminActionInput = {
  readonly set_business_suppression: SetBusinessSuppressionInput
  readonly close_removal_dispute: CloseRemovalDisputeInput
  readonly verify_capability_source_authority: VerifyCapabilitySourceAuthorityInput
  readonly grant_admin_membership: GrantAdminMembershipInput
  readonly revoke_admin_membership: RevokeAdminMembershipInput
  readonly change_commercial_policy: ChangeCommercialPolicyInput
}
type AdminCommandAction = keyof AdminActionInput

type AdminSuccessCodeByAction = {
  readonly set_business_suppression: 'business_suppressed' | 'business_unsuppressed' | 'business_suppression_unchanged'
  readonly close_removal_dispute: 'dispute_closed'
  readonly verify_capability_source_authority: 'source_authority_verified'
  readonly grant_admin_membership: 'admin_membership_granted'
  readonly revoke_admin_membership: 'admin_membership_revoked'
  readonly change_commercial_policy: 'commercial_policy_activated' | 'commercial_policy_replaced' | 'commercial_policy_suspended'
}
type AdminProposableAction = 'set_business_suppression' | 'change_commercial_policy'

type SharedAdminRefusalCode =
  | SourceWriteAdmissionFailureReason
  | 'source_write_nonce_replayed'
  | 'authentication_required'
  | 'missing_membership'
  | 'inactive_membership'
  | 'action_not_allowed'
  | 'mfa_reverification_required'
  | 'admin_invalid_reason'
  | 'admin_missing_evidence'
  | 'idempotency_conflict'

type AdminActionRefusalCodes = {
  readonly set_business_suppression: 'business_not_found' | 'target_changed' | AdminApprovalRefusalCode
  readonly close_removal_dispute: 'dispute_not_found' | 'target_changed'
  readonly verify_capability_source_authority: 'publication_not_found' | 'revision_changed' | 'source_changed' | 'evidence_invalid'
  readonly grant_admin_membership: 'malformed_token_identifier' | 'membership_conflict'
  readonly revoke_admin_membership: 'admin_membership_not_found' | 'last_owner_admin' | 'target_changed'
  readonly change_commercial_policy:
    | 'commercial_policy_invalid'
    | 'authority_mismatch'
    | 'proof_stale'
    | 'proof_replayed'
    | 'command_changed'
    | 'commercial_policy_ref_conflict'
    | 'commercial_policy_conflict'
    | 'commercial_policy_already_active'
    | 'commercial_policy_revision_invalid'
    | 'commercial_policy_current_changed'
    | AdminApprovalRefusalCode
}

type AdminRefusalCode<A extends AdminCommandAction> = SharedAdminRefusalCode | AdminActionRefusalCodes[A]

type AdminApprovalRefusalCode =
  | 'approval_same_actor'
  | 'approval_digest_mismatch'
  | 'approval_expired'
  | 'approval_already_resolved'
  | 'approval_actor_inactive'

type AdminApproval =
  | { readonly kind: 'not_required' }
  | { readonly kind: 'awaiting_second_approval'; readonly proposalRef: AdminApprovalProposalRef; readonly commandDigest: SourceHash; readonly proposerRef: string; readonly expiresAt: number }
  | { readonly kind: 'approved'; readonly proposalRef: AdminApprovalProposalRef; readonly commandDigest: SourceHash; readonly proposerRef: string; readonly approverRef: string; readonly expiresAt: number; readonly approvedAt: number }
  | { readonly kind: 'expired'; readonly proposalRef: AdminApprovalProposalRef; readonly commandDigest: SourceHash; readonly proposerRef: string; readonly expiresAt: number; readonly expiredAt: number }
  | { readonly kind: 'refused'; readonly proposalRef: AdminApprovalProposalRef; readonly commandDigest: SourceHash; readonly proposerRef: string; readonly attemptedApproverRef: string; readonly expiresAt: number; readonly code: AdminApprovalRefusalCode }

type AdminApprovalIntent =
  | { readonly kind: 'execute' }
  | { readonly kind: 'propose'; readonly expiresAt: number }
  | { readonly kind: 'approve'; readonly proposalRef: AdminApprovalProposalRef; readonly commandDigest: SourceHash }

type AdminCommand<A extends AdminCommandAction> = Readonly<{
  action: A
  input: AdminActionInput[A]
  reasonCode: string
  evidenceRefs: readonly string[]
  operationKey: OperationKey
  correlationId: CorrelationId
  approval: AdminApprovalIntent
}>

type AdminProposedReceipt<A extends AdminCommandAction> =
  A extends AdminProposableAction
    ? { readonly kind: 'proposed'; readonly action: A; readonly commandRef: AdminApprovalProposalRef; readonly awaiting: 'second_approval'; readonly effectRefs: readonly []; readonly auditEventId: AuditEventId; readonly operationKey: OperationKey; readonly correlationId: CorrelationId }
    : never

type AdminCommandReceipt<A extends AdminCommandAction> =
  | { readonly kind: 'completed'; readonly action: A; readonly code: AdminSuccessCodeByAction[A]; readonly effectRefs: readonly string[]; readonly approval: Extract<AdminApproval, { readonly kind: 'not_required' | 'approved' }>; readonly auditEventId: AuditEventId; readonly operationKey: OperationKey; readonly correlationId: CorrelationId }
  | AdminProposedReceipt<A>
  | { readonly kind: 'refused'; readonly action: A; readonly code: AdminRefusalCode<A>; readonly effectRefs: readonly []; readonly approval: Extract<AdminApproval, { readonly kind: 'not_required' | 'expired' | 'refused' }>; readonly auditEventId: AuditEventId; readonly operationKey: OperationKey; readonly correlationId: CorrelationId }

type AdminPermission = AdminAction
declare function requireAdminPermission(membership: AdminMembership | undefined, permission: AdminPermission): AdminAuthorityResult
```

The adapter consumes canonical public types only. `PublicToolRef`, `AccountRef` and `PrincipalRef` already have public guards or constructors (`src/modules/capability-supply/public.ts:19-20,59-65`; `src/modules/principal-account/account/public.ts:1-20`; `src/modules/principal-account/principal/public.ts:1-15`). Add branded `CallRef` to the existing total `parseCallRef` entry, and add branded `QuoteRef` plus a total parser on that same declared entry (`src/modules/capability-execution/call-contracts.ts:56-84`; `src/modules/module-boundaries.ts:94`). Add exact `BusinessSlug` parsing to the existing Business public seam; `normalizeSlug` transforms and may return empty, so it is not that parser (`src/modules/common/normalize-slug.ts:1-10`; `src/modules/business/public.ts:87-96`). Total admin adapters catch the current throwing Account/Principal constructors, and the Agent read verifies that the resolved Principal is an Agent. `AdminApprovalProposalRef` is adapter-owned with one total parser. `AdminPermission` remains the existing matrix-key union (`src/modules/security/internal/admin-authority.ts:13-53`).

## 9. Convex read API contracts

Proposed queries are `searchAdminObjects`, `readAdminObject`, `listAdminExceptions`, `listAdminAuditEvents` and `readAdminOverview`. Each starts with `read_admin_readbacks`; object and exception projections may demand a stronger permission later, but never a weaker one. `readAdminObject` dispatches by parsed ref and uses no more than three parallel query groups. Search accepts exact refs only. Lists take `{ cursor, limit, filters }` and return `{ page, continueCursor, isDone }`. These Convex queries never write audit, analytics, nonces or "viewed" state. Privacy-safe `admin_lookup` analytics emit only after the query returns, at the TanStack server telemetry boundary.

The current `readAdminAuditEvents` and `readAdminIndexHealth` query façades remain useful names only if their contracts are replaced cleanly. Today they have no args and return the bounded readback union (`convex/security.ts:268-277`); Audit reads `order('desc').take(100)` (`convex/securityAdminReadbacks.ts:65-73`). No compatibility aliases are added.

## 10. Existing action adaptation

Each action extends its existing mutation in place and reuses `operationKeys.by_actor_operation_key`. Today suppression has only audit-ID replay, source verification has state-based replay, commercial policy has partial state-based replay, and dispute closure plus membership changes have no action replay guard (`convex/businesses.ts:133-285`; `convex/securityRemovalDisputes.ts:119-209,270-280`; `convex/securityAdminMembership.ts:108-187`; `convex/lib/capabilitySupply/sourceAuthority.ts:7-99`; `convex/moneyCommercialPolicy.ts:324-457`). The adapted effect, audit row and complete action receipt commit atomically. Mutations return only that receipt and effect refs; the UI re-reads object state through a query.

| Existing mutation | Permission | Completed codes and audit | Action-specific refusal codes in addition to `SharedAdminRefusalCode` |
|---|---|---|---|
| `businesses.setBusinessSuppression` (`convex/businesses.ts:288-300`) | `suppress_business` | `business_suppressed`, `business_unsuppressed`, `business_suppression_unchanged`; existing suppression events | `business_not_found`, `target_changed`, `AdminApprovalRefusalCode` |
| `security.closeRemovalDispute` (`convex/security.ts:314-324`) | `close_dispute` | `dispute_closed`; existing `dispute.closed` | `dispute_not_found`, `target_changed` |
| `capabilitySupply.verifyCapabilitySourceAuthority` (`convex/capabilitySupply.ts:99-102`) | `register_capability_supply` | `source_authority_verified`; add existing-taxonomy `capability_supply.eligibility_changed` | `publication_not_found`, `revision_changed`, `source_changed`, `evidence_invalid` (`convex/lib/capabilitySupply/publicationValues.ts:32-49`) |
| `security.grantAdminMembership` (`convex/security.ts:239-252`) | `manage_admin_membership` | `admin_membership_granted`; existing grant event | `malformed_token_identifier`, `membership_conflict` (`src/modules/security/internal/admin-authority.ts:260-317`) |
| `security.revokeAdminMembership` (`convex/security.ts:254-266`) | `manage_admin_membership` | `admin_membership_revoked`; existing revoke event | `admin_membership_not_found`, `last_owner_admin`, `target_changed` |
| `moneyCommercialPolicy.change` (`convex/moneyCommercialPolicy.ts:460-464`) | `manage_commercial_policy` | activated/replaced/suspended; add `admin.commercial_policy_changed` | `commercial_policy_invalid`, `authority_mismatch`, `proof_stale`, `proof_replayed`, `command_changed`, `commercial_policy_ref_conflict`, `commercial_policy_conflict`, `commercial_policy_already_active`, `commercial_policy_revision_invalid`, `commercial_policy_current_changed`, `AdminApprovalRefusalCode` (`convex/moneyCommercialPolicy.ts:324-411`) |

The clean cutover expands current collapsed `admin_action_denied`, `authorization_denied`, `source_write_denied`, `admin_authority_required` and `reauthentication_required` into the closed shared union. `SourceWriteAdmissionFailureReason` enumerates `missing_source_write_admission`, `missing_source_write_secret`, `source_write_crypto_unavailable`, `source_write_scope_mismatch`, `source_write_key_family_mismatch`, `unknown_source_write_key_id`, `invalid_source_write_key_id`, `source_write_operation_mismatch`, `source_write_correlation_mismatch`, `source_write_command_mismatch`, `missing_source_write_request`, `invalid_source_write_request`, `source_write_method_mismatch`, `source_write_origin_mismatch`, `source_write_target_origin_mismatch`, `source_write_path_mismatch`, `source_write_query_mismatch`, `source_write_body_mismatch`, `invalid_source_write_body_digest`, `stale_source_write_admission` and `invalid_source_write_signature`; the Convex layer adds `source_write_nonce_replayed` (`src/modules/security/source-write-admission.ts:63-84`; `convex/sourceWriteAdmission.ts:57-69`).

**Idempotency state machine.** (1) Authenticate, derive actor, and enforce current permission plus fresh FVA; these access gates never disclose a stored receipt. (2) Hash canonical effect material: scope, actor, action, target, input, reason, evidence and expected state; exclude source-write proof, nonce and retry correlation. (3) Read `operationKeys` by actor/action/key. Same hash plus terminal `resultJson` returns those exact bytes; a changed hash returns `idempotency_conflict`; no `replayed` receipt exists. (4) For a new key, verify and consume source-write admission, validate, apply the effect, append one audit row and persist the complete receipt in one transaction. Every admitted input or domain refusal is persisted; correcting it requires a new operation key. Convex OCC makes concurrent claims converge on one terminal row.

**Second approval.** Only suppression and commercial-policy replace/suspend may use it. The first call to the same mutation stores an immutable proposal, one `admin.action_proposed` audit and a `kind: 'proposed'` receipt whose `commandRef` identifies the proposal, `awaiting` is `second_approval` and `effectRefs` is empty. Approval calls the same mutation with a separate operation key, the proposal ref and digest. It requires a fresh FVA, a distinct active owner_admin and digest equality. One concurrent approver wins through OCC; the effect audit records both actors, and later attempts return `approval_already_resolved` without repeating the effect. Same approval key/hash returns identical terminal bytes. Expired proposals project as `expired` without a query write; an approval attempt returns `approval_expired` and one denial audit. The purpose-built table in section 7 is added only if Joel enables two-person control; no alpha table is added while those actions are disabled.

| Refusal code group | Retryable | Effect certainty | Operator copy | Next step |
|---|---|---|---|---|
| `source_write_crypto_unavailable`, `stale_source_write_admission`, `source_write_nonce_replayed` | yes, new key | not applied | "Command authorization expired or is unavailable." | Refresh authorization and submit a new operation key. |
| All other `SourceWriteAdmissionFailureReason` literals | no | not applied | "This command could not be verified." | Inspect source-write configuration; do not repeat unchanged input. |
| `authentication_required`, `missing_membership`, `inactive_membership`, `action_not_allowed` | no | not applied | "Your account does not have the Admin role for this action." | Ask an owner_admin for access. |
| `mfa_reverification_required` | yes, new key | not applied | "Reverify before making this change." | Complete Clerk reverification, then resubmit. |
| `admin_invalid_reason`, `admin_missing_evidence`, `evidence_invalid` | yes, new key | not applied | "A valid reason and evidence are required." | Correct the named field, then resubmit. |
| `idempotency_conflict` | no | not applied | "This operation key belongs to another command." | Open the stored receipt; use a new key only for a new intent. |
| `target_changed`, `revision_changed`, `source_changed`, `command_changed`, `commercial_policy_current_changed`, `approval_digest_mismatch`, `approval_expired` | yes, new key | not applied | "The reviewed record changed or expired." | Reload evidence and create a new command or proposal. |
| All `*_not_found`, `membership_conflict`, `last_owner_admin`, `commercial_policy_ref_conflict`, `commercial_policy_conflict`, `commercial_policy_already_active`, `commercial_policy_revision_invalid`, `malformed_token_identifier`, `approval_same_actor`, `approval_actor_inactive`, `approval_already_resolved` | no | not applied | "This target is no longer actionable." | Open the current object or proposal and follow its stated status. |
| `commercial_policy_invalid`, `authority_mismatch`, `proof_stale`, `proof_replayed` | `proof_stale` only | not applied | "The commercial-policy proof was refused." | Reverify for stale proof; otherwise inspect policy and authority evidence. |

## 11. Component architecture

```text
src/lib/operator/admin-console/
  contracts.ts                         # closed refs, receipts and cursors, <=300
  ref-parsers.ts                       # total composition of public parsers, <=300
convex/adminConsole.ts                 # public query façade only, <=200
convex/lib/adminConsole/               # sole raw-row ACL and joined-read owner, <=400 each
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
| Replay or changed retry duplicates an effect | Bind scope, actor, action, key and canonical request hash in `operationKeys`; same material returns stored outcome bytes, changed material refuses, and OCC admits one concurrent claimant (`src/modules/observability/internal/schema.ts:49-65`). |
| Cross-account search leaks PII | Alpha accepts canonical refs only and returns the minimum projection. Convex queries never audit reads; the TanStack server boundary emits allowlisted `admin_lookup` telemetry without refs, reasons, evidence or search text. |
| TOCTOU changes the reviewed object | Commands carry expected revision/digest where the domain has one; mismatch returns `target_changed` before effect. |
| UI invents money truth | Call pages consume `projectFoundCallPurchaseStatus`; uncertain stays uncertain (`src/modules/capability-execution/call-receipt-view.ts:164-180`). |
| Evidence or reason leaks secrets | Store refs and redacted summaries only; `AuditEventContract` already separates evidence refs and redacted payload from payload hash (`src/modules/common/audit-events.ts:168-190`). |
| Break-glass bypass | No break-glass or kernel controls until ROOT-AUTH routes those commands through the permission matrix (`convex/recoveryBreakGlass.ts:416-440`). |

Support is read-only in alpha despite the matrix containing `annotate_triage`; that permission remains unexposed because annotation is not one of the six actions. Reviewer is read-only; owner_admin holds the current mutation permissions (`src/modules/security/internal/admin-authority.ts:13-53`). Two-person policy requires a distinct active owner_admin. Previewing another role changes rendering only.

## 13. Error handling

- Total parsers return a named `AdminParseErrorCode`; a valid but absent object returns `object_not_found`.
- Every expected refusal is an action-indexed `AdminCommandReceipt.kind = 'refused'`, maps through the exhaustive table above and never reaches Sentry.
- A thrown pre-commit infrastructure or invariant fault aborts the Convex transaction, so certainty is `not_applied`; retry the same operation key.
- If the response is lost after commit, certainty is `unknown`. Reinvoke with the same actor/action/key: a committed transaction returns its byte-identical stored receipt; an aborted one executes once. The correlation ref links Audit and Sentry during recovery.
- `not_configured`, `source_unavailable` and zero remain distinct read states. UI copy uses `getStatusPresentation`, states effect certainty and offers one next step.

## 14. Observability and audit

The canonical audit taxonomy already covers disputes, suppression, admin membership, capability supply, billing and consequence events (`src/modules/common/audit-events.ts:72-151`). Every admin command records actor, target, permission, reason, evidence refs, operation key, correlation ID, before/after state, outcome code and payload digest. Denials remain auditable through `admin.action_denied` (`src/modules/security/internal/admin-authority.ts:442-460`). Audit pagination is stable on `(createdAt, _id)` descending. A cursor encodes both values and all active filters; changing a filter invalidates the cursor.

Sentry is for unexpected faults, not domain outcomes. Every admin route and command carries the correlation ID as the `ae.request_id` tag, and each object page links to Sentry filtered by that tag. The existing server capture path already reads the request correlation ID, sanitizes context and sets it as a Sentry tag (`src/lib/observability/sentry.server.ts:42-64`). Client observability is booted once at the root and wraps the app in `AeObservabilityErrorBoundary` (`src/routes/__root.tsx:14-25,98-99`; `src/lib/observability/boot-client-observability.ts:10-28`; `src/components/ae/feedback/AeObservabilityErrorBoundary.tsx:34-44`). Refusals remain values and never reach Sentry. Only unexpected storage, invariant or render throws do.

PostHog product analytics use the existing `posthog-node` and `captureServerEvent` path (`src/lib/observability/posthog.server.ts:1,10-23,38-59`). Add an event-specific property builder, following the repository's fixed-property builder pattern (`src/lib/observability/funnel-event-props.ts:19-31`), that allows only: `admin_command` with `{ action, permission, outcome }`; `admin_lookup` with `{ refKind, found }`; and `admin_queue_view` with `{ kind }`. Never send refs, emails, reasons, evidence, object payloads or search text. Call and Workspace object pages may link to PostHog session replay by operator distinct ID only if Joel enables the PII-search/session decision. Demand and supply trend charts remain a linked PostHog dashboard, not in-app charts. Convex tables remain authoritative for money and counts.

## 15. Testing strategy

| Behaviour | Proposed test file | Harness and assertion |
|---|---|---|
| Permission matrix per role | `tests/unit/admin-console/admin-permissions.test.ts` | Pure table test generated from `AdminPermission`; owner_admin allowed as declared, support and reviewer read-only in the alpha UI. |
| Fresh, stale, absent and malformed `fva` | `tests/unit/convex/admin-command-fva.test.ts` | `convex-test` identities; 0/10 minutes accepted, 11, `-1`, absent and malformed refused before effect. |
| Idempotent replay and changed-material conflict | `tests/unit/convex/admin-command-idempotency.test.ts` | `convex-test`; same logical command with a fresh source-write admission returns byte-identical stored outcome, changed digest refuses, concurrent claims produce one effect and one audit row. |
| Second approval state machine | `tests/unit/convex/admin-command-approval.test.ts` | Proposed receipt has command ref, `awaiting: second_approval` and zero effect refs; then assert distinct active owner, digest equality, expiry, same-actor refusal, concurrent winner, terminal replay and no Purchase-resolution action. |
| ACL and CQS | `tests/imports/admin-console-boundary.test.ts` | Module count remains 29; no internal imports or raw docs cross the ACL; queries cause no writes and mutations return receipts, not read models. |
| Refusal presentation totality | `tests/unit/admin-console/admin-refusal-presentation.test.ts` | Every code in every action-indexed set has retryability, effect certainty, exact copy and one next step; no extra keys compile. |
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
4. **Two-person actions.** Default: require a distinct second owner_admin only for Business suppression and commercial-policy replacement/suspension. No Purchase-resolution action exists in this RFC. Keep these actions disabled while Joel is the only owner.
5. **Purchase-resolution outcomes.** Default: `uphold`, `refuse` and `request_evidence`. Show age without "late" until an SLA exists. Refund remains unavailable until a real refund command and live money rail exist.
