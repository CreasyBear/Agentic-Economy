'use client'

import { useRef, useState } from 'react'

import { AeFactList } from '@/components/ae/data/AeFactList'
import { AeSection } from '@/components/ae/layout/AeSection'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  formatDisplayAmount,
  type AccountHistoryResult,
} from '@/modules/money/public'
import type { AccountFundingBalance, AccountFundingConstraints } from '@/modules/money/server'
import type { MoneyDocumentView, MoneyProviderObligationView, MoneyReconciliationCaseView } from '@/lib/server/money-documents.functions'
import { AeAutoRechargeCard } from './AeAutoRechargeCard'
import { AeMonthlySpendCeilingCard } from './AeMonthlySpendCeilingCard'
import {
  AeSavedPaymentMethodsCard,
  type SavedPaymentMethodsSummary,
} from './AeSavedPaymentMethodsCard'
import { AeAccountFundingPanel, type AccountFundingPort } from './AeCreditTopUpPanel'
import {
  AccountHistory,
  CreditSectionEmptyState,
  type AccountHistoryPort,
} from './AeAccountHistoryTable'
import {
  AeInvoiceHistoryTable,
  type AeInvoiceHistoryRow,
} from './AeInvoiceHistoryTable'
import {
  documentFacts,
  documentKindLabel,
  formatCreditAmount,
} from './owner-credit-format'

export type { AccountHistoryPort }

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

type DocumentAction =
  | Readonly<{ kind: 'create_statement' }>
  | Readonly<{ kind: 'create_daily_close' }>
  | Readonly<{ kind: 'open'; documentRef: string }>
  | Readonly<{ kind: 'sign'; documentRef: string }>

type DocumentActionStatus = 'pending' | 'succeeded' | 'failed'
type DocumentActionKey = 'create_statement' | 'create_daily_close' | `open:${string}` | `sign:${string}`

function documentActionKey(action: DocumentAction): DocumentActionKey {
  return action.kind === 'create_statement' || action.kind === 'create_daily_close'
    ? action.kind
    : `${action.kind}:${action.documentRef}`
}

function DocumentActionNotice({ status, pending, succeeded, failed }: Readonly<{
  status: DocumentActionStatus | undefined
  pending: string
  succeeded: string
  failed: string
}>) {
  if (status === undefined) return null
  return (
    <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
      {status === 'pending' ? pending : status === 'succeeded' ? succeeded : failed}
    </p>
  )
}

export function AeOwnerCredit({
  accountBalance,
  accountHistory,
  accountHistoryPort,
  balanceLoading = false,
  historyLoading = false,
  constraintsLoading = false,
  accountFundingPort,
  fundingConstraints,
  onCreditRefresh,
  documents = [],
  reconciliationCases = [],
  providerObligations = [],
  onCreateStatement,
  onCreateDailyClose,
  onSignDailyClose,
  onOpenDocument,
  unavailable = {},
  autoRechargeSettings,
  autoRechargeMandateState = 'missing',
  autoRechargePendingTopup,
  onSaveAutoRecharge,
  monthlySpendCeilingSettings,
  monthlySpendMonthSpend,
  onSaveMonthlySpendCeiling,
  savedPaymentMethodsSummary,
  savedPaymentMethodsLoading = false,
  onManageSavedPaymentMethods,
  invoiceHistoryRows,
  invoiceHistoryLoading = false,
  onDownloadTaxInvoice,
  onViewStripeReceipt,
}: AeOwnerCreditProps) {
  const balance = accountBalance?.kind === 'available' ? accountBalance.balance : undefined
  const balanceUnavailable = accountBalance === undefined || accountBalance.kind === 'refused'
  const balanceRefreshUnavailable = unavailable.balance === true && accountBalance?.kind === 'available'
  const balanceLocked = accountBalance?.kind === 'available' && accountBalance.locked
  const [documentActions, setDocumentActions] = useState<Readonly<Partial<Record<DocumentActionKey, DocumentActionStatus>>>>({})
  const documentActionsInFlight = useRef(new Set<DocumentActionKey>())

  function runDocumentAction(action: DocumentAction, operation: () => Promise<void>) {
    const key = documentActionKey(action)
    if (documentActionsInFlight.current.has(key)) return
    documentActionsInFlight.current.add(key)
    setDocumentActions((current) => ({ ...current, [key]: 'pending' }))
    void Promise.resolve()
      .then(operation)
      .then(() => setDocumentActions((current) => ({ ...current, [key]: 'succeeded' })))
      .catch(() => setDocumentActions((current) => ({ ...current, [key]: 'failed' })))
      .finally(() => documentActionsInFlight.current.delete(key))
  }

  const createStatementStatus = documentActions[documentActionKey({ kind: 'create_statement' })]
  const createDailyCloseStatus = documentActions[documentActionKey({ kind: 'create_daily_close' })]

  return (
    <div className="grid gap-8">
      <AeSection
        id="fund"
        title="Account balance"
        description="Browsing is free. Paid Calls reserve AUD from this Account and remain subject to each Agent’s spending policy."
      >
        {balanceLoading && accountBalance === undefined ? (
          <div className="grid gap-2 rounded-xl border border-border bg-card p-5" aria-busy="true" aria-label="Loading Account balance">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-11 w-48" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </div>
        ) : balanceUnavailable ? (
          <Alert>
            <AlertTitle>Balance unavailable</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center gap-3">
              <span>No balance is being inferred. Refresh to read the authoritative Account balance.</span>
              {onCreditRefresh === undefined ? null : (
                <Button type="button" variant="secondary" disabled={balanceLoading} onClick={() => { void onCreditRefresh() }}>
                  {balanceLoading ? 'Refreshing…' : 'Refresh balance'}
                </Button>
              )}
            </AlertDescription>
          </Alert>
        ) : (
          <div className="grid gap-2 rounded-xl border border-border bg-card p-5 shadow-soft">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Available credit</p>
            <p className="font-mono text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">
              {balance === undefined ? 'Checking…' : formatDisplayAmount(balance)}
            </p>
            <p className="text-sm text-muted-foreground">
              {balanceLocked
                ? 'Locked for reconciliation; new paid Calls are refused.'
                : 'Available for admitted paid Calls. Agent spending policies still apply.'}
            </p>
          </div>
        )}
        {balanceRefreshUnavailable ? (
          <Alert>
            <AlertTitle>Balance could not be refreshed</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center gap-3">
              <span>The last authoritative balance remains visible; it has not been replaced with an inferred amount.</span>
              {onCreditRefresh === undefined ? null : (
                <Button type="button" variant="secondary" disabled={balanceLoading} onClick={() => { void onCreditRefresh() }}>
                  {balanceLoading ? 'Refreshing…' : 'Try balance again'}
                </Button>
              )}
            </AlertDescription>
          </Alert>
        ) : null}
        {onSaveMonthlySpendCeiling !== undefined ? (
          monthlySpendCeilingSettings !== undefined ? (
            <AeMonthlySpendCeilingCard
              settings={monthlySpendCeilingSettings}
              {...(monthlySpendMonthSpend === undefined ? {} : { monthSpend: monthlySpendMonthSpend })}
              onSave={onSaveMonthlySpendCeiling}
            />
          ) : (
            <div
              className="grid gap-3 rounded-xl border border-border/70 p-4"
              aria-busy="true"
              aria-label="Loading monthly spending cap"
            >
              <Skeleton className="h-5 w-56" />
              <Skeleton className="min-h-[2.75rem] w-full" />
              <Skeleton className="h-2 w-full" />
              <Skeleton className="min-h-[5.5rem] w-full" />
              <Skeleton className="h-9 w-24" />
            </div>
          )
        ) : null}
        {onManageSavedPaymentMethods !== undefined ? (
          <AeSavedPaymentMethodsCard
            {...(savedPaymentMethodsSummary === undefined ? {} : { summary: savedPaymentMethodsSummary })}
            isLoading={savedPaymentMethodsLoading}
            onManage={onManageSavedPaymentMethods}
          />
        ) : null}
        {onSaveAutoRecharge !== undefined ? (
          autoRechargeSettings !== undefined ? (
            <AeAutoRechargeCard
              settings={autoRechargeSettings}
              mandateState={autoRechargeMandateState}
              {...(autoRechargePendingTopup === undefined ? {} : { pendingTopup: autoRechargePendingTopup })}
              onSave={onSaveAutoRecharge}
            />
          ) : (
            <div
              className="grid gap-3 rounded-xl border border-border/70 p-4"
              aria-busy="true"
              aria-label="Loading auto-recharge settings"
            >
              <Skeleton className="h-5 w-32" />
              <Skeleton className="min-h-[2.75rem] w-full" />
              <div className="flex flex-wrap gap-2">
                <Skeleton className="h-8 w-40 rounded-full" />
                <Skeleton className="h-8 w-36 rounded-full" />
                <Skeleton className="h-8 w-40 rounded-full" />
              </div>
              <Skeleton className="h-6 w-full max-w-xs" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="min-h-[5.5rem] w-full" />
              <Skeleton className="h-9 w-20" />
            </div>
          )
        ) : null}
        <div className="grid gap-3 rounded-xl border border-border/70 p-4">
          <div>
            <h3 className="font-medium">Add credit</h3>
            <p className="text-sm text-muted-foreground">Review the exact credit, fee, and total before continuing to secure payment.</p>
          </div>
          <AeAccountFundingPanel
            {...(accountFundingPort === undefined ? {} : { port: accountFundingPort })}
            {...(fundingConstraints === undefined ? {} : { constraints: fundingConstraints })}
            constraintsLoading={constraintsLoading}
            {...(accountBalance === undefined ? {} : { accountBalance })}
            {...(onCreditRefresh === undefined ? {} : { onRefresh: onCreditRefresh })}
          />
        </div>
      </AeSection>

      <AeSection
        title="Invoice & top-up history"
        description="Paid top-ups retain Stripe card receipts and Australian tax invoices when your workspace tax profile and environment policy allow issuance."
      >
        <AeInvoiceHistoryTable
          {...(invoiceHistoryRows === undefined ? {} : { rows: invoiceHistoryRows })}
          isLoading={invoiceHistoryLoading}
          {...(onDownloadTaxInvoice === undefined ? {} : { onDownloadTaxInvoice })}
          {...(onViewStripeReceipt === undefined ? {} : { onViewStripeReceipt })}
        />
      </AeSection>

      <AeSection
        title="Balance history"
        description="Booked Account transactions are shown once by transaction identity, newest recorded transaction first."
      >
        <AccountHistory
          key={canonicalDigest(accountHistory ?? { kind: 'missing' })}
          {...(accountHistory === undefined ? {} : { result: accountHistory })}
          {...(accountHistoryPort === undefined ? {} : { port: accountHistoryPort })}
          loading={historyLoading}
          unavailable={unavailable.history === true}
          {...(onCreditRefresh === undefined ? {} : { onRefresh: onCreditRefresh })}
        />
      </AeSection>

      {reconciliationCases.some((item) => item.status === 'open') ? (
        <Alert>
          <AlertTitle>Reconciliation needs attention</AlertTitle>
          <AlertDescription>{reconciliationCases.filter((item) => item.status === 'open').length} open difference(s) may limit paid Calls. Details are available below.</AlertDescription>
        </Alert>
      ) : null}

      <details className="rounded-lg border border-border p-4">
        <summary className="cursor-pointer font-medium">Accounting records and administration</summary>
        <div className="mt-6 grid gap-8">
          <AeSection
            title="Documents"
            description="Immutable funding receipts, fee documents, statements, and adjustments retain their source transactions and policy version."
          >
            {onCreateStatement === undefined ? null : (
              <div className="grid gap-intra">
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={createStatementStatus === 'pending'}
                    onClick={() => runDocumentAction({ kind: 'create_statement' }, onCreateStatement)}
                  >
                    {createStatementStatus === 'pending' ? 'Creating statement…' : 'Create current statement'}
                  </Button>
                  {onCreateDailyClose === undefined ? null : (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={createDailyCloseStatus === 'pending'}
                      onClick={() => runDocumentAction({ kind: 'create_daily_close' }, onCreateDailyClose)}
                    >
                      {createDailyCloseStatus === 'pending' ? 'Creating daily close…' : 'Create yesterday’s close'}
                    </Button>
                  )}
                </div>
                <DocumentActionNotice
                  status={createStatementStatus}
                  pending="Creating the current statement…"
                  succeeded="Statement generation started. Its status remains visible below."
                  failed="Statement creation could not be confirmed. Refresh documents before trying again."
                />
                <DocumentActionNotice
                  status={createDailyCloseStatus}
                  pending="Creating yesterday’s daily close…"
                  succeeded="Daily close generation started. Its status remains visible below."
                  failed="Daily close creation could not be confirmed. Refresh documents before trying again."
                />
              </div>
            )}
            {unavailable.documents ? (
              <CreditSectionEmptyState title="Documents unavailable" description="No document state is being inferred." />
            ) : documents.length === 0 ? (
              <CreditSectionEmptyState
                title="No accounting documents yet"
                description="Receipts, fee documents, adjustments, and statements will be preserved here."
              />
            ) : (
              <div className="grid gap-intra">
                {documents.map((document) => {
                  const signStatus = documentActions[documentActionKey({ kind: 'sign', documentRef: document.documentRef })]
                  const openStatus = documentActions[documentActionKey({ kind: 'open', documentRef: document.documentRef })]
                  const label = documentKindLabel(document.kind)
                  return (
                    <div key={document.documentRef} className="grid gap-2 rounded-lg border border-border/70 p-3">
                      <AeFactList facts={documentFacts(document)} />
                      <div className="grid gap-intra">
                        <div className="flex flex-wrap gap-2">
                          {document.kind === 'daily_close' && document.state === 'awaiting_signature' && onSignDailyClose !== undefined ? (
                            <Button
                              type="button"
                              disabled={signStatus === 'pending'}
                              onClick={() => runDocumentAction(
                                { kind: 'sign', documentRef: document.documentRef },
                                () => onSignDailyClose(document.documentRef, document.renderInputDigest),
                              )}
                            >
                              {signStatus === 'pending' ? 'Signing close…' : 'Sign close'}
                            </Button>
                          ) : null}
                          {onOpenDocument === undefined ? null : (
                            <Button
                              type="button"
                              variant="secondary"
                              disabled={document.state !== 'issued' || openStatus === 'pending'}
                              onClick={() => runDocumentAction(
                                { kind: 'open', documentRef: document.documentRef },
                                () => onOpenDocument(document.documentRef),
                              )}
                            >
                              {openStatus === 'pending' ? 'Opening…' : document.state === 'issued' ? 'Open document' : 'Preparing…'}
                            </Button>
                          )}
                        </div>
                        <DocumentActionNotice
                          status={signStatus}
                          pending={`Signing ${label}…`}
                          succeeded={`${label} signed. Its updated status remains visible in this row.`}
                          failed={`Signing ${label} could not be confirmed. Refresh this record before trying again.`}
                        />
                        <DocumentActionNotice
                          status={openStatus}
                          pending={`Opening ${label}…`}
                          succeeded={`${label} link prepared. If no tab opened, try opening it again.`}
                          failed={`${label} could not be opened. This record remains available.`}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </AeSection>

          <AeSection
            title="Reconciliation"
            description="Processor, treasury, settlement, or document differences remain scope-limited cases until an owner closes them with evidence."
          >
            {unavailable.reconciliation ? (
              <CreditSectionEmptyState title="Reconciliation unavailable" description="No reconciliation state is being inferred." />
            ) : reconciliationCases.length === 0 ? (
              <CreditSectionEmptyState
                title="No reconciliation differences"
                description="New paid Calls remain blocked only when their affected Account is locked for a proven mismatch."
              />
            ) : (
              <div className="grid gap-intra">
                {reconciliationCases.map((item) => (
                  <AeFactList key={item.caseRef} facts={[
                    { label: 'Difference', value: item.kind.replaceAll('_', ' ') },
                    { label: 'Status', value: item.status },
                    { label: 'Owner', value: item.ownerPrincipalRef ?? 'Unassigned' },
                    { label: 'Affected scope', value: item.scopeType === undefined ? 'Legacy Account case' : `${item.scopeType.replaceAll('_', ' ')} · ${item.scopeRef ?? 'Unknown'}` },
                    { label: 'Reason', value: item.reasonCode.replaceAll('_', ' ') },
                    { label: 'Reference', value: item.caseRef, mono: true },
                  ]} />
                ))}
              </div>
            )}
          </AeSection>

          <AeSection
            title="Provider obligations"
            description="Managed x402 obligations retain distinct buyer AUD and Provider USDC evidence. They are never eligible for a second payout."
          >
            {unavailable.obligations ? (
              <CreditSectionEmptyState title="Provider obligations unavailable" description="No obligation state is being inferred." />
            ) : providerObligations.length === 0 ? (
              <CreditSectionEmptyState title="No Provider obligations" description="A managed x402 Call creates one attributable upstream obligation." />
            ) : (
              <div className="grid gap-intra">
                {providerObligations.map((obligation) => (
                  <AeFactList key={obligation.obligationRef} facts={[
                    { label: 'Provider', value: obligation.providerRef },
                    { label: 'Buyer amount', value: formatCreditAmount({ currency: 'AUD', exponent: 6, units: obligation.buyerAmountUnits }), mono: true },
                    { label: 'Provider amount', value: formatCreditAmount({ currency: 'USDC', exponent: 6, units: obligation.providerAmountUnits }), mono: true },
                    { label: 'State', value: obligation.state },
                    { label: 'Payout', value: 'Ineligible — settled by x402' },
                    { label: 'Reference', value: obligation.obligationRef, mono: true },
                  ]} />
                ))}
              </div>
            )}
          </AeSection>
        </div>
      </details>
    </div>
  )
}
