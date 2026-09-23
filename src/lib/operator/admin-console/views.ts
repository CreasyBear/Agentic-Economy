import type { CallRef, QuoteRef } from '@/modules/capability-execution/call-contracts'
import type {
  BuyerCallPurchaseStatus,
  CallReceiptView,
} from '@/modules/capability-execution/call-receipt-view'
import type { PurchaseResolutionRecord } from '@/modules/capability-execution/purchase-resolution'
import type { PublicToolRef } from '@/modules/capability-supply/public'
import type { AccountRef } from '@/modules/principal-account/account/public'
import type { PrincipalRef } from '@/modules/principal-account/principal/public'
import type { Slug } from '@/modules/common/ids'
import type { AccountLifecycle } from '@/modules/principal-account/account/public'

export type AdminTimelineEntry = {
  at: number
  eventType: string
  actorRef: string | null
  outcome: string | null
}

export type AdminCallView = {
  kind: 'call'
  ref: CallRef
  state: 'pending' | 'completed' | 'refused' | 'reconciliation_required' | 'cancelled'
  purchase: BuyerCallPurchaseStatus
  receipt: CallReceiptView
  quoteRef: QuoteRef | null
  toolRef: PublicToolRef | null
  workspaceRef: AccountRef | null
  agentRef: PrincipalRef | null
  correlationId: string | null
  resolution: PurchaseResolutionRecord | null
  timeline: readonly AdminTimelineEntry[]
}

export type AdminQuoteView = {
  kind: 'quote'
  ref: QuoteRef
  state: 'issued' | 'consumed' | 'expired'
  toolRef: PublicToolRef | null
  workspaceRef: AccountRef | null
  agentRef: PrincipalRef | null
  createdAt: number
  expiresAt: number | null
  consumedCallRef: CallRef | null
}

export type AdminWorkspaceView = {
  kind: 'workspace'
  ref: AccountRef
  lifecycle: AccountLifecycle
  ownerCount: number
  memberCount: number
  createdAt: number
  externalOrganizationBound: boolean
  hasActiveSpendingPolicy: boolean
}

export type AdminAgentView = {
  kind: 'agent'
  ref: PrincipalRef
  workspaceRef: AccountRef | null
  credentialLifecycle: 'active' | 'revoked' | 'expired'
  spendingPolicyRef: string | null
  recentCallRefs: readonly CallRef[]
}

export type AdminToolVersionView = {
  kind: 'tool_version'
  ref: PublicToolRef
  publicationRef: string
  revision: number | null
  disposition: 'current' | 'withdrawn' | 'incompatible' | 'superseded'
  businessSlug: Slug
  sourceAuthorityState: 'verified' | 'review_required'
  admissionCaseRef: string | null
  readinessValidUntil: number | null
}

export type AdminProviderView = {
  kind: 'provider'
  businessId: string
  slug: Slug
  publicStatus: 'unpublished' | 'published' | 'suppressed'
  trustTier: 'claimed' | 'contact_confirmed' | 'listed' | 'registry_verified'
  suppressedAt: number | null
  publications: readonly {
    ref: PublicToolRef
    revision: number | null
    disposition: 'current' | 'withdrawn' | 'incompatible' | 'superseded'
    sourceAuthorityState: 'verified' | 'review_required'
    sourceAuthorityReview: {
      publicationRef: string
      expectedRevision: number
      expectedSourceDigest: string
      operationRef: string
      sourceKind: 'x402'
      sourceUrl: string
    } | null
  }[]
  connections: readonly {
    connectionRef: string
    lifecycle: 'active' | 'reauthorization_required' | 'revocation_pending' | 'revoked' | 'cleanup_required'
    sourceEnvironment: string | null
  }[]
  admissionCases: readonly {
    caseRef: string
    state: 'submitted' | 'under_review' | 'completed'
    updatedAt: number
  }[]
  removalDisputes: readonly {
    disputeRef: string
    status: 'opened' | 'updated' | 'closed' | 'contested'
    updatedAt: number
  }[]
  payout: 'connected' | 'not_connected' | 'unavailable'
}
