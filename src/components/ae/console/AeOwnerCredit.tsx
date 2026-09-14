'use client'

import { useMemo, useRef, useState, type ReactNode } from 'react'
import type { ColumnDef } from '@tanstack/react-table'

import { AeFactList } from '@/components/ae/data/AeFactList'
import { AeSection } from '@/components/ae/layout/AeSection'
import {
  AeOperatorSortableHeader,
  AeRecordTable,
} from '@/components/ae/operator/AeOperatorDataTable'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  formatDisplayAmount,
  type AccountHistoryEntry,
  type AccountHistoryResult,
  type ExactAmount,
} from '@/modules/money/public'
import type { AccountFundingBalance, AccountFundingConstraints } from '@/modules/money/server'
import { formatTimestamp } from '@/lib/ui/format-time'
import type { MoneyDocumentView, MoneyProviderObligationView, MoneyReconciliationCaseView } from '@/lib/server/money-documents.functions'
import { AeAccountFundingPanel, type AccountFundingPort } from './AeCreditTopUpPanel'

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
}>

export type AccountHistoryPort = Readonly<{
  read: (input: Readonly<{ cursor?: string }>) => Promise<AccountHistoryResult>
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

/**
 * A section with nothing to show reads as one line, not a full card body.
 * `AeEmptyState`'s reserved min-height and page-scale padding are meant for
 * a page's single primary empty state; this Credit page can show several
 * of these at once for a brand-new account, so each stays compact here.
 */
function CreditSectionEmptyState({
  title,
  description,
  action,
}: Readonly<{ title: string; description: string; action?: ReactNode }>) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <span className="font-medium text-foreground">{title}</span>
      <span className="text-muted-foreground">{description}</span>
      {action === undefined ? null : action}
    </div>
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
        <div className="grid gap-3 rounded-xl border border-border/70 p-4">
          <div>
            <h3 className="font-medium">Add credit</h3>
            <p className="text-sm text-muted-foreground">Review the exact credit, fee, and total before continuing to secure payment.</p>
          </div>
          <AeAccountFundingPanel
            {...(accountFundingPort === undefined ? {} : { port: accountFundingPort })}
            {...(fundingConstraints === undefined ? {} : { constraints: fundingConstraints })}
            constraintsLoading={constraintsLoading}
            {...(onCreditRefresh === undefined ? {} : { onRefresh: onCreditRefresh })}
          />
        </div>
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
        <p className="text-sm text-muted-foreground">Documents are generated from immutable Account postings.</p>
        {unavailable.documents ? (
          <CreditSectionEmptyState title="Documents unavailable" description="Balance and funding remain independent. Refresh to try these records again." />
        ) : documents.length === 0 ? (
          <CreditSectionEmptyState
            title="No documents yet"
            description="Funding receipts appear after confirmed settlement. Statements include settled Calls in the selected period."
          />
        ) : (
          <div className="grid gap-intra">
            {documents.map((document) => {
              const openStatus = documentActions[documentActionKey({ kind: 'open', documentRef: document.documentRef })]
              const signStatus = documentActions[documentActionKey({ kind: 'sign', documentRef: document.documentRef })]
              const label = documentKindLabel(document.kind)
              return <div key={document.documentRef} className="flex flex-col gap-3 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
                <AeFactList facts={[
                  { label: 'Document', value: label },
                  { label: 'Amount', value: formatCreditAmount({ currency: 'AUD', exponent: 6, units: document.amountUnits }), mono: true },
                  { label: 'Issued', value: formatTimestamp(document.createdAt), mono: true },
                  { label: 'Status', value: document.state === 'issued' ? 'Ready' : document.state === 'awaiting_signature' ? 'Awaiting owner signature' : document.state === 'failed' ? 'Needs attention' : 'Preparing' },
                  { label: 'Source records', value: String(document.sourceCount), mono: true },
                  { label: 'Reference', value: document.documentRef, mono: true },
                ]} />
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

function documentKindLabel(kind: MoneyDocumentView['kind']): string {
  switch (kind) {
    case 'funding_receipt': return 'Funding receipt'
    case 'service_fee_document': return 'Service fee document'
    case 'statement': return 'Statement'
    case 'daily_close': return 'Daily close'
    case 'adjustment': return 'Adjustment document'
    case 'tax_invoice': return 'Tax invoice'
  }
}

type AvailableAccountHistory = Extract<AccountHistoryResult, { kind: 'available' }>
type AccountHistoryState = Readonly<{
  source: AvailableAccountHistory
  entries: readonly AccountHistoryEntry[]
  cursor: string | undefined
  coverage: AvailableAccountHistory['coverage']
  status: 'idle' | 'loading' | 'failed'
}>

function AccountHistory({
  result,
  port,
  loading,
  unavailable,
  onRefresh,
}: Readonly<{
  result?: AccountHistoryResult
  port?: AccountHistoryPort
  loading: boolean
  unavailable: boolean
  onRefresh?: () => void | Promise<void>
}>) {
  if (result?.kind !== 'available') {
    return <UnavailableAccountHistory loading={loading} {...(onRefresh === undefined ? {} : { onRefresh })} />
  }
  return <AvailableAccountHistoryFrame
    result={result}
    {...(port === undefined ? {} : { port })}
    refreshUnavailable={unavailable}
    loading={loading}
    {...(onRefresh === undefined ? {} : { onRefresh })}
  />
}

function UnavailableAccountHistory({
  loading,
  onRefresh,
}: Readonly<{ loading: boolean; onRefresh?: () => void | Promise<void> }>) {
  if (loading) {
    return (
      <div className="grid gap-intra" aria-busy="true" aria-label="Loading balance history">
        <Skeleton className="h-touch w-full" />
        <Skeleton className="h-touch w-full" />
      </div>
    )
  }
  return (
    <Alert>
      <AlertTitle>Balance history unavailable</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center gap-3">
        <span>Known Account balance remains visible. No missing transaction or amount is being inferred.</span>
        {onRefresh === undefined ? null : (
          <Button type="button" variant="secondary" onClick={() => { void onRefresh() }}>Refresh history</Button>
        )}
      </AlertDescription>
    </Alert>
  )
}

function AvailableAccountHistoryFrame({
  result,
  port,
  refreshUnavailable,
  loading,
  onRefresh,
}: Readonly<{
  result: AvailableAccountHistory
  port?: AccountHistoryPort
  refreshUnavailable: boolean
  loading: boolean
  onRefresh?: () => void | Promise<void>
}>) {
  return (
    <div className="grid gap-4">
      <HistoryRefreshWarning
        visible={refreshUnavailable}
        loading={loading}
        {...(onRefresh === undefined ? {} : { onRefresh })}
      />
      <AvailableAccountHistoryView initial={result} {...(port === undefined ? {} : { port })} />
    </div>
  )
}

function HistoryRefreshWarning({
  visible,
  loading,
  onRefresh,
}: Readonly<{ visible: boolean; loading: boolean; onRefresh?: () => void | Promise<void> }>) {
  if (!visible) return null
  return (
    <Alert>
      <AlertTitle>Balance history could not be refreshed</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center gap-3">
        <span>The last booked transactions remain visible. No later transaction or amount is being inferred.</span>
        {onRefresh === undefined ? null : (
          <Button type="button" variant="secondary" disabled={loading} onClick={() => { void onRefresh() }}>
            {loading ? 'Refreshing…' : 'Try history again'}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  )
}

function AvailableAccountHistoryView({
  initial,
  port,
}: Readonly<{ initial: AvailableAccountHistory; port?: AccountHistoryPort }>) {
  const [state, setState] = useState<AccountHistoryState>(() => ({
    source: initial,
    entries: deduplicateHistory([], initial.entries),
    cursor: initial.isDone ? undefined : initial.continueCursor,
    coverage: initial.coverage,
    status: 'idle',
  }))
  const columns = useMemo<ColumnDef<AccountHistoryEntry, unknown>[]>(() => [
    {
      id: 'activity',
      accessorFn: (entry) => accountHistoryLabel(entry.kind),
      header: ({ column }) => <AeOperatorSortableHeader label="Activity" column={column} />,
      cell: ({ row }) => (
        <div className="grid gap-1">
          <span className="font-medium text-foreground">{accountHistoryLabel(row.original.kind)}</span>
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">Transaction details</summary>
            <dl className="mt-2 grid gap-1">
              <div><dt className="inline">Transaction ID: </dt><dd className="inline font-mono">{row.original.transactionId}</dd></div>
              <div><dt className="inline">Reference: </dt><dd className="inline font-mono">{row.original.transactionRef ?? 'Not recorded'}</dd></div>
              <div><dt className="inline">Occurred: </dt><dd className="inline font-mono">{formatTimestamp(row.original.occurredAt)}</dd></div>
              <div><dt className="inline">Source link: </dt><dd className="inline">Unavailable from Account history</dd></div>
              {row.original.sourceDigest === null ? null : (
                <div><dt className="inline">Evidence digest: </dt><dd className="inline break-all font-mono">{row.original.sourceDigest}</dd></div>
              )}
              {row.original.revertedAt === null ? null : (
                <div><dt className="inline">Reverted: </dt><dd className="inline font-mono">{formatTimestamp(row.original.revertedAt)}</dd></div>
              )}
            </dl>
          </details>
        </div>
      ),
    },
    {
      id: 'accountEffect',
      accessorFn: (entry) => BigInt(entry.accountEffect.units),
      header: ({ column }) => <AeOperatorSortableHeader label="Balance effect" column={column} />,
      cell: ({ row }) => row.original.accountEffect.units === '0'
        ? <span className="text-muted-foreground">No Balance change</span>
        : <span className="font-mono font-medium tabular-nums">{formatSignedAmount(row.original.accountEffect)}</span>,
    },
    {
      id: 'documentEffect',
      accessorFn: (entry) => BigInt(entry.documentEffectUnits),
      header: ({ column }) => <AeOperatorSortableHeader label="Document effect" column={column} />,
      cell: ({ row }) => row.original.documentEffectUnits === '0'
        ? <span className="text-muted-foreground">None</span>
        : <span className="font-mono tabular-nums">{formatSignedAmount({ currency: 'AUD', exponent: 6, units: row.original.documentEffectUnits })}</span>,
    },
    {
      id: 'recorded',
      accessorFn: (entry) => entry.recordedAt ?? entry.occurredAt,
      header: ({ column }) => <AeOperatorSortableHeader label="Recorded" column={column} />,
      cell: ({ row }) => (
        <div className="grid gap-0.5">
          <time className="font-mono text-xs tabular-nums text-muted-foreground">
            {formatTimestamp(row.original.recordedAt ?? row.original.occurredAt)}
          </time>
          {row.original.recordedAt === null ? <span className="text-xs text-muted-foreground">Occurred time</span> : null}
        </div>
      ),
    },
    {
      id: 'status',
      accessorFn: (entry) => entry.reverted ? 'Reverted' : 'Booked',
      header: ({ column }) => <AeOperatorSortableHeader label="Status" column={column} />,
      cell: ({ row }) => row.original.reverted ? 'Reverted' : 'Booked',
    },
  ], [])

  async function loadNextPage() {
    if (state.cursor === undefined || state.status === 'loading' || port === undefined) return
    const source = state.source
    const cursor = state.cursor
    setState((current) => current.source === source && current.cursor === cursor
      ? { ...current, status: 'loading' }
      : current)
    try {
      const next = await port.read({ cursor })
      if (next.kind !== 'available'
        || next.snapshotAt !== source.snapshotAt
        || next.source !== source.source
        || next.ordering !== source.ordering) {
        throw new Error('account_history_continuation_mismatch')
      }
      setState((current) => current.source === source && current.cursor === cursor
        ? {
            source,
            entries: deduplicateHistory(current.entries, next.entries),
            cursor: next.isDone ? undefined : next.continueCursor,
            coverage: current.coverage === 'partial' || next.coverage === 'partial' ? 'partial' : 'complete',
            status: 'idle',
          }
        : current)
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      setState((current) => current.source === source && current.cursor === cursor
        ? { ...current, status: 'failed' }
        : current)
    }
  }

  return (
    <div className="grid gap-4">
      {state.coverage === 'partial' ? (
        <Alert>
          <AlertTitle>Some transaction attribution is incomplete</AlertTitle>
          <AlertDescription>Known booked transactions remain visible. Reversal netting or attribution may be incomplete, so these effects are not presented as a reconciliation to the balance above.</AlertDescription>
        </Alert>
      ) : null}
      <p className="text-sm text-muted-foreground">
        Ordered by recorded transaction sequence, not effective date. Receipts and Call links are not available from this history yet.
      </p>
      {state.entries.length === 0 ? (
        <CreditSectionEmptyState title="No booked Account transactions yet" description="Confirmed funding, Call spend, reversals, and document adjustments will appear here." />
      ) : (
        <AeRecordTable
          columns={columns}
          data={state.entries}
          caption="Booked Account transactions"
          countLabel="transactions"
          filterPlaceholder="Filter Account history…"
          hideFilter={state.entries.length <= 1}
          getRowId={(entry) => entry.transactionId}
        />
      )}
      {state.status === 'failed' ? (
        <Alert>
          <AlertTitle>More history could not be loaded</AlertTitle>
          <AlertDescription>Existing transactions remain visible. Retry continues from the same Account cursor.</AlertDescription>
        </Alert>
      ) : null}
      {state.cursor === undefined ? null : port === undefined ? (
        <p className="text-sm text-muted-foreground">More booked transactions exist, but continuation is unavailable on this surface.</p>
      ) : (
        <div>
          <Button type="button" variant="secondary" disabled={state.status === 'loading'} onClick={() => { void loadNextPage() }}>
            {state.status === 'loading' ? 'Loading more…' : state.status === 'failed' ? 'Retry more history' : 'Load more history'}
          </Button>
        </div>
      )}
    </div>
  )
}

function deduplicateHistory(
  current: readonly AccountHistoryEntry[],
  incoming: readonly AccountHistoryEntry[],
): readonly AccountHistoryEntry[] {
  const seen = new Set(current.map((entry) => entry.transactionId))
  return [...current, ...incoming.filter((entry) => {
    if (seen.has(entry.transactionId)) return false
    seen.add(entry.transactionId)
    return true
  })]
}

function accountHistoryLabel(kind: AccountHistoryEntry['kind']): string {
  switch (kind) {
    case 'funding': return 'Credit added'
    case 'funding_reversal': return 'Credit reversed'
    case 'call_spend': return 'Call purchase'
    case 'document_adjustment': return 'Document adjustment'
    case 'unmapped': return 'Account movement'
  }
}

function formatSignedAmount(amount: ExactAmount): string {
  const units = BigInt(amount.units)
  const formatted = formatDisplayAmount({ ...amount, units: (units < 0n ? -units : units).toString() })
  return units > 0n ? `+${formatted}` : units < 0n ? `−${formatted}` : formatted
}

function formatCreditAmount(amount: ExactAmount | undefined): string {
  return amount === undefined ? 'Amount unknown' : formatDisplayAmount(amount)
}
