import type { AccountFundingPort } from '@/modules/money/account-funding.contracts'
import type { AccountHistoryPort } from '@/modules/money/account-history.contracts'
import type { AeInvoiceHistoryRow } from '@/modules/money/invoice-history.view-model'
import type { SavedPaymentMethodsSummary } from '@/modules/money/saved-payment-methods.view-model'
import type { AccountHistoryResult } from '@/modules/money/public'
import type { AccountFundingBalance, AccountFundingConstraints } from '@/modules/money/server'
import type { MoneyDocumentView, MoneyProviderObligationView, MoneyReconciliationCaseView } from '@/lib/server/money-documents.functions'

export type AeOwnerCreditProps = Readonly<{
  accountBalance?: AccountFundingBalance
  accountHistory?: AccountHistoryResult
  accountHistoryPort?: AccountHistoryPort
  balanceLoading?: boolean
  historyLoading?: boolean
  constraintsLoading?: boolean
  accountFundingPort?: AccountFundingPort
  fundingConstraints?: AccountFundingConstraints
  onCreditRefresh?: () => void | Promise<void>
  documents?: readonly MoneyDocumentView[]
  reconciliationCases?: readonly MoneyReconciliationCaseView[]
  providerObligations?: readonly MoneyProviderObligationView[]
  onCreateStatement?: () => Promise<void>
  onCreateDailyClose?: () => Promise<void>
  onSignDailyClose?: (documentRef: string, expectedRenderInputDigest: string) => Promise<void>
  onOpenDocument?: (documentRef: string) => Promise<void>
  unavailable?: Readonly<{
    balance?: boolean
    history?: boolean
    documents?: boolean
    reconciliation?: boolean
    obligations?: boolean
  }>
  autoRechargeSettings?: Readonly<{
    enabled: boolean
    thresholdUnits: string
    rechargeAmountUnits: string
    revision: number
  }>
  autoRechargeMandateState?: 'missing' | 'ready' | 'authentication_required' | 'failed'
  autoRechargePendingTopup?: Readonly<{ commandRef: string }> | null
  onSaveAutoRecharge?: (settings: Readonly<{
    enabled: boolean
    thresholdUnits: string
    rechargeAmountUnits: string
    expectedRevision: number
  }>) => Promise<void> | void
  monthlySpendCeilingSettings?: Readonly<{
    enabled: boolean
    ceilingUnits: string
    revision: number
  }>
  monthlySpendMonthSpend?: Readonly<{
    kind: 'available' | 'empty' | 'unavailable'
    spendUnits?: string
  }>
  onSaveMonthlySpendCeiling?: (settings: Readonly<{
    enabled: boolean
    ceilingUnits: string
    expectedRevision: number
  }>) => Promise<void> | void
  savedPaymentMethodsSummary?: SavedPaymentMethodsSummary
  savedPaymentMethodsLoading?: boolean
  onManageSavedPaymentMethods?: () => Promise<{ portalUrl?: string } | void> | void
  invoiceHistoryRows?: readonly AeInvoiceHistoryRow[]
  invoiceHistoryLoading?: boolean
  onDownloadTaxInvoice?: (row: AeInvoiceHistoryRow) => Promise<void> | void
  onViewStripeReceipt?: (row: AeInvoiceHistoryRow) => Promise<void> | void
}>

export const ownerCreditSectionNavigation = [
  { id: 'fund', label: 'Fund' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'ledger', label: 'Ledger' },
] as const

export type OwnerCreditSectionId = (typeof ownerCreditSectionNavigation)[number]['id']
