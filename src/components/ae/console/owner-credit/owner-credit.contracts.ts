import type { AccountFundingPort } from '@/modules/money/account-funding.contracts'
import type { AccountHistoryPort } from '@/modules/money/account-history.contracts'
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
  administrationLoading?: boolean
  accountFundingPort?: AccountFundingPort
  fundingConstraints?: AccountFundingConstraints
  onCreditRefresh?: () => void | Promise<void>
  documents?: readonly MoneyDocumentView[]
  reconciliationCases?: readonly MoneyReconciliationCaseView[]
  providerObligations?: readonly MoneyProviderObligationView[]
  onCreateStatement?: () => Promise<void>
  onCreateDailyClose?: () => Promise<void>
  onSignDailyClose?: (documentRef: string, expectedRenderInputDigest: string) => Promise<void>
  onOpenDocument?: (documentRef: string, format?: 'html' | 'csv') => Promise<void>
  unavailable?: Readonly<{
    balance?: boolean
    history?: boolean
    documents?: boolean
    reconciliation?: boolean
    obligations?: boolean
  }>
}>

export const ownerCreditSectionNavigation = [
  { id: 'fund', label: 'Fund' },
  { id: 'ledger', label: 'Ledger' },
] as const

export type OwnerCreditSectionId = (typeof ownerCreditSectionNavigation)[number]['id']
