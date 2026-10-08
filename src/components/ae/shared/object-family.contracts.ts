import type { ListingProjection } from '@/modules/registry/public'
import type { ExactAmount } from '@/modules/money/public'
import type { CallApprovalDecisionContext } from '@/modules/capability-execution/call-approval-contracts'

/** Values must come from the owner-authenticated pending Call/Quote read, never model prose. */
export type QuoteConfirmationView = Readonly<{
  toolName: string
  provider: Readonly<{ kind: 'verified'; name: string; href: string }> | Readonly<{ kind: 'host'; name: string; href?: string }>
  callRef: string
  quoteRef: string
  quoteAmount: ExactAmount
  expiresAt: number
  inputSummary: string
  remainingCap: Readonly<{ amount: ExactAmount; window: string }>
  /** Older sources may omit these facts; missing material disables approval. */
  decisionContext?: CallApprovalDecisionContext
  acceptedIdentity?: Readonly<{
    accountRef: string; toolRef: string; toolVersion: number
    grantRef: string; grantGeneration: number; policyDigest: string
  }>
  expired: boolean
  pending: boolean
}>

export type CallOutcomeView = Readonly<{
  callRef: string
  label: string
  detail: string
  purchaseKind: 'pending' | 'uncertain' | 'delivered' | 'refunded' | 'failed'
  payment: string
  delivery: string
  amount?: ExactAmount
  amountLabel?: string
  receiptHref?: string
}>

/** A ledger Call row may link only when its authoritative CallRef exists. */
export type CallReceiptLinkView = Readonly<{
  callRef: string
  toolRef: string
  provider: Readonly<{ kind: 'verified_business'; slug: string; name: string }>
    | Readonly<{ kind: 'directory_host'; host: string; name: string }>
    | Readonly<{ kind: 'absent' }>
}>

/** A display projection retains its sourced registry object; no UI invents joins. */
export type ToolObjectView = Readonly<{
  listing: ListingProjection
  href?: string
  title: string
  outcome?: string
  price?: Readonly<{ label: string; source: string }>
  readiness: Readonly<{ label: string; source?: string }>
  identity?: Readonly<{ kind: 'verified_provider' | 'directory_host'; name: string; href: string }>
    | Readonly<{ kind: 'publisher'; name: string }>
}>

export type ProviderHumanOfferingView = Readonly<{
  name: string
  summary?: string
  href?: string
}>
