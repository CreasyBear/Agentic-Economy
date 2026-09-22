import type { CallRef, QuoteRef } from '@/modules/capability-execution/call-contracts'
import type {
  BuyerCallPurchaseStatus,
  CallReceiptView,
} from '@/modules/capability-execution/call-receipt-view'
import type { PurchaseResolutionRecord } from '@/modules/capability-execution/purchase-resolution'
import type { PublicToolRef } from '@/modules/capability-supply/public'
import type { AccountRef } from '@/modules/principal-account/account/public'
import type { PrincipalRef } from '@/modules/principal-account/principal/public'

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
