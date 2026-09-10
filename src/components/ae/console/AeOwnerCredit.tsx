'use client'

import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'

import { AeFactList } from '@/components/ae/data/AeFactList'
import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { AeRecordSheet } from '@/components/ae/layout/AeRecordSheet'
import { AeSection } from '@/components/ae/layout/AeSection'
import {
  AeOperatorSortableHeader,
  AeRecordTable,
} from '@/components/ae/operator/AeOperatorDataTable'
import { Button } from '@/components/ui/button'
import { stagedListPhase, useFirstLoadPending } from '@/components/ui/data-state'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrencyAmount, type ExactAmount } from '@/modules/money/public'
import type { AccountFundingBalance } from '@/modules/money/server'
import type { AgentActivityView, AgentDetail, AgentDirectoryProjection } from '@/modules/agent-access/agent-operator-view-model'
import { formatTimestamp } from '@/lib/ui/format-time'
import type { MoneyDocumentView, MoneyProviderObligationView, MoneyReconciliationCaseView } from '@/lib/server/money-documents.functions'
import { AeAccountFundingPanel, type AccountFundingPort } from './AeCreditTopUpPanel'

export type AeOwnerCreditProps = Readonly<{
  directory: AgentDirectoryProjection
  accountBalance?: AccountFundingBalance
  loading: boolean
  accountFundingPort?: AccountFundingPort
  onCreditRefresh?: () => void | Promise<void>
  documents?: readonly MoneyDocumentView[]
  reconciliationCases?: readonly MoneyReconciliationCaseView[]
  providerObligations?: readonly MoneyProviderObligationView[]
  onCreateStatement?: () => Promise<void>
  onCreateDailyClose?: () => Promise<void>
  onSignDailyClose?: (documentRef: string, expectedRenderInputDigest: string) => Promise<void>
  onOpenDocument?: (documentRef: string) => Promise<void>
}>

type CreditChargeRow = Readonly<{
  item: AgentDetail
  entry: AgentActivityView
}>

export function AeOwnerCredit({
  directory,
  accountBalance: suppliedAccountBalance,
  loading,
  accountFundingPort,
  onCreditRefresh,
  documents = [],
  reconciliationCases = [],
  providerObligations = [],
  onCreateStatement,
  onCreateDailyClose,
  onSignDailyClose,
  onOpenDocument,
}: AeOwnerCreditProps) {
  const accountBalance = suppliedAccountBalance ?? directory.accountBalance ?? unavailableAccountBalance
  const items = directory.details
  const balance = accountBalance.kind === 'available' ? accountBalance.balance : undefined
  const balanceUnavailable = accountBalance.kind === 'refused'
  const balanceLocked = accountBalance.kind === 'available' && accountBalance.locked
  const activity = items
    .flatMap((item) => item.activity.map((entry) => ({ item, entry })))
    .sort((left, right) => right.entry.createdAt - left.entry.createdAt)
  const activityCoverageIncomplete = items.some(({ dataState }) => dataState === 'unavailable' || dataState === 'partial')
  const firstLoadPending = useFirstLoadPending(loading)
  const activityPhase = stagedListPhase({ firstLoadPending, rows: activity })
  const [selected, setSelected] = useState<CreditChargeRow>()
  const [documentAction, setDocumentAction] = useState<'idle' | 'creating' | 'opening' | 'signing' | 'saved' | 'failed'>('idle')
  const columns = useMemo<ColumnDef<CreditChargeRow, unknown>[]>(
    () => [
      {
        id: 'tool',
        accessorFn: (row) => row.entry.tool?.label ?? row.entry.toolLabel,
        header: ({ column }) => <AeOperatorSortableHeader label="Tool" column={column} />,
        cell: ({ row }) => (
          <span className="font-medium text-foreground">
            {row.original.entry.tool?.label ?? row.original.entry.toolLabel}
          </span>
        ),
      },
      {
        id: 'agent',
        accessorFn: (row) => row.item.agent.displayName,
        header: ({ column }) => <AeOperatorSortableHeader label="Agent" column={column} />,
        cell: ({ row }) => row.original.item.agent.displayName,
      },
      {
        id: 'amount',
        accessorFn: (row) => formatActivityAmount(row.entry),
        header: ({ column }) => <AeOperatorSortableHeader label="Amount" column={column} />,
        cell: ({ row }) => (
          <span className="font-medium font-mono tabular-nums">{formatActivityAmount(row.original.entry)}</span>
        ),
      },
      {
        id: 'when',
        accessorFn: (row) => row.entry.createdAt,
        header: ({ column }) => <AeOperatorSortableHeader label="Created" column={column} />,
        cell: ({ row }) => (
          <time className="font-mono text-xs tabular-nums text-muted-foreground">
            {formatTimestamp(row.original.entry.createdAt)}
          </time>
        ),
      },
    ],
    [],
  )

  return (
    <div className="grid gap-8">
      <AeSection
        id="fund"
        title="Account balance"
        description="Browsing is free. Paid Calls reserve AUD from this Account and remain subject to each Agent’s spending policy."
      >
        <AeFactList
          facts={[
            {
              label: 'Available credit',
              value: firstLoadPending
                ? 'Checking…'
                : balanceUnavailable
                  ? 'Balance unavailable'
                  : formatCreditAmount(balance),
              mono: true,
            },
            {
              label: 'State',
              value: balanceUnavailable
                ? 'Account balance is temporarily unavailable.'
                : balanceLocked
                  ? 'Locked for reconciliation; new paid Calls are refused.'
                  : 'Available for admitted paid Calls.',
              muted: true,
            },
          ]}
        />
        <AeAccountFundingPanel
          {...(accountFundingPort === undefined ? {} : { port: accountFundingPort })}
          {...(onCreditRefresh === undefined ? {} : { onRefresh: onCreditRefresh })}
        />
      </AeSection>

      <AeSection
        title="Documents"
        description="Immutable funding receipts, fee documents, statements, and adjustments retain their source transactions and policy version."
      >
        {onCreateStatement === undefined ? null : (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={documentAction === 'creating' || documentAction === 'opening' || documentAction === 'signing'}
              onClick={() => {
                setDocumentAction('creating')
                void onCreateStatement()
                  .then(() => setDocumentAction('saved'))
                  .catch(() => setDocumentAction('failed'))
              }}
            >
              {documentAction === 'creating' ? 'Creating…' : 'Create current statement'}
            </Button>
            {onCreateDailyClose === undefined ? null : (
              <Button
                type="button"
                variant="secondary"
                disabled={documentAction === 'creating' || documentAction === 'opening' || documentAction === 'signing'}
                onClick={() => {
                  setDocumentAction('creating')
                  void onCreateDailyClose()
                    .then(() => setDocumentAction('saved'))
                    .catch(() => setDocumentAction('failed'))
                }}
              >
                Create yesterday’s close
              </Button>
            )}
          </div>
        )}
        <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
          {documentAction === 'creating'
            ? 'Creating statement…'
            : documentAction === 'opening'
              ? 'Preparing document…'
              : documentAction === 'signing'
                ? 'Signing daily close…'
              : documentAction === 'saved'
                ? 'Document generation started. Its status remains visible below.'
                : documentAction === 'failed'
                  ? 'The document could not be prepared. Existing records were not changed.'
                  : 'Documents are generated from immutable Account postings.'}
        </p>
        {documents.length === 0 ? (
          <AeEmptyState
            title="No documents yet"
            description="Funding receipts appear after confirmed settlement. Statements include settled Calls in the selected period."
          />
        ) : (
          <div className="grid gap-intra">
            {documents.map((document) => (
              <div key={document.documentRef} className="flex flex-col gap-3 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
                <AeFactList facts={[
                  { label: 'Document', value: documentKindLabel(document.kind) },
                  { label: 'Amount', value: formatCreditAmount({ currency: 'AUD', exponent: 6, units: document.amountUnits }), mono: true },
                  { label: 'Issued', value: formatTimestamp(document.createdAt), mono: true },
                  { label: 'Status', value: document.state === 'issued' ? 'Ready' : document.state === 'awaiting_signature' ? 'Awaiting owner signature' : document.state === 'failed' ? 'Needs attention' : 'Preparing' },
                  { label: 'Source records', value: String(document.sourceCount), mono: true },
                  { label: 'Reference', value: document.documentRef, mono: true },
                ]} />
                <div className="flex flex-wrap gap-2">
                {document.kind === 'daily_close' && document.state === 'awaiting_signature' && onSignDailyClose !== undefined ? (
                  <Button
                    type="button"
                    disabled={documentAction !== 'idle' && documentAction !== 'saved'}
                    onClick={() => {
                      setDocumentAction('signing')
                      void onSignDailyClose(document.documentRef, document.renderInputDigest)
                        .then(() => setDocumentAction('saved'))
                        .catch(() => setDocumentAction('failed'))
                    }}
                  >
                    Sign close
                  </Button>
                ) : null}
                {onOpenDocument === undefined ? null : (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={document.state !== 'issued' || documentAction === 'creating' || documentAction === 'opening'}
                    onClick={() => {
                      setDocumentAction('opening')
                      void onOpenDocument(document.documentRef)
                        .then(() => setDocumentAction('saved'))
                        .catch(() => setDocumentAction('failed'))
                    }}
                  >
                    {document.state === 'issued' ? 'Open document' : 'Preparing…'}
                  </Button>
                )}
                </div>
              </div>
            ))}
          </div>
        )}
      </AeSection>

      <AeSection
        title="Reconciliation"
        description="Processor, treasury, settlement, or document differences remain scope-limited cases until an owner closes them with evidence."
      >
        {reconciliationCases.length === 0 ? (
          <AeEmptyState
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
        {providerObligations.length === 0 ? (
          <AeEmptyState title="No Provider obligations" description="A managed x402 Call creates one attributable upstream obligation." />
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

      <AeSection
        title="Recent activity"
        description={directory.activityCoverage === 'recent'
          ? 'Showing the latest 50 Calls for one or more Agents in the current UTC month. Older activity is not shown here.'
          : 'Showing Calls created in the current UTC month. Amounts marked unknown are not included in settled-charge summaries.'}
      >
        {directory.nextCursor === undefined ? null : <p className="text-sm text-muted-foreground">Activity covers the first directory page only; more Agents are available in Agents.</p>}
        {activityCoverageIncomplete ? <p className="text-sm text-muted-foreground">Some Agent activity or usage is unavailable. Coverage is incomplete.</p> : null}
        {activityPhase === 'unloaded' ? (
          <div className="grid gap-intra" aria-busy="true" aria-label="Loading recent activity">
            <Skeleton className="h-touch w-full" />
            <Skeleton className="h-touch w-full" />
            <Skeleton className="h-touch w-full" />
          </div>
        ) : activityPhase === 'cached-rows' ? (
          <AeRecordTable
            columns={columns}
            data={activity}
            caption="Recent activity"
            countLabel="activities"
            filterPlaceholder="Filter activity…"
            hideFilter={activity.length <= 1}
            getRowId={(item) => item.entry.callRef}
            rowAction={{
              kind: 'button',
              label: 'View',
              onOpen: setSelected,
              getAccessibleLabel: (item) =>
                `View ${item.entry.tool?.label ?? item.entry.toolLabel}`,
            }}
          />
        ) : activity.length === 0 && activityCoverageIncomplete ? (
          <AeEmptyState
            title="Activity unavailable"
            description="Activity could not be read right now. Refresh to try again."
            action={onCreditRefresh === undefined ? undefined : (
              <Button
                type="button"
                variant="secondary"
                className="min-h-touch"
                disabled={loading}
                onClick={() => { void onCreditRefresh() }}
              >
                {loading ? 'Refreshing activity…' : 'Refresh activity'}
              </Button>
            )}
          />
        ) : activity.length === 0 ? (
          <AeEmptyState
            title="No activity yet"
            description="Browsing does not create a Call."
            action={
              <Button asChild className="min-h-touch">
                <a href="/market?window=30d">Search Tools</a>
              </Button>
            }
          />
        ) : (
          <p className="text-sm text-muted-foreground">Some activity details are temporarily unavailable.</p>
        )}
      </AeSection>

      <AeRecordSheet
        open={selected !== undefined}
        onOpenChange={(open) => {
          if (!open) setSelected(undefined)
        }}
        title={selected === undefined ? 'Activity' : (selected.entry.tool?.label ?? selected.entry.toolLabel)}
        {...(selected === undefined ? {} : { facts: chargeFacts(selected) })}
        {...(selected === undefined
          ? {}
          : {
              action: (
                <Button asChild className="min-h-touch">
                  <a href={`/calls/${selected.entry.callRef}`}>View Call</a>
                </Button>
              ),
            })}
      />
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

function chargeFacts(row: CreditChargeRow): readonly { label: string; value: string; muted?: boolean; mono?: boolean }[] {
  return [
    { label: 'Outcome', value: activityLabel(row.entry) },
    { label: 'Agent', value: row.item.agent.displayName },
    { label: 'Amount', value: formatActivityAmount(row.entry), mono: true },
    { label: 'Payment', value: paymentStateLabel(row.entry.paymentState) },
    { label: 'Delivery', value: deliveryStateLabel(row.entry.deliveryState) },
    ...(row.entry.tool === undefined
      ? []
      : [{ label: 'Provider', value: row.entry.tool.provider }]),
    { label: 'When', value: formatTimestamp(row.entry.createdAt), mono: true },
  ]
}

function activityLabel(entry: AgentActivityView): string {
  if (entry.state === 'outcome_unknown') return 'Call outcome needs checking'
  if (entry.state === 'refused') return 'Call refused'
  if (entry.deliveryState === 'not_delivered') return 'Call not delivered'
  if (entry.deliveryState === 'unknown') return 'Call delivery needs checking'
  if (entry.paymentState === 'released') return 'Refunded Call'
  if (entry.paymentState === 'unknown') return 'Call payment needs checking'
  return 'Completed Call'
}

function paymentStateLabel(state: AgentActivityView['paymentState']): string {
  switch (state) {
    case 'settled': return 'Settled'
    case 'released': return 'Released / refunded'
    case 'unknown': return 'Unknown'
    case 'not_applicable': return 'Not applicable'
    default: {
      const exhaustive: never = state
      return exhaustive
    }
  }
}

function deliveryStateLabel(state: AgentActivityView['deliveryState']): string {
  switch (state) {
    case 'delivered': return 'Delivered'
    case 'not_delivered': return 'Not delivered'
    case 'unknown': return 'Unknown'
    default: {
      const exhaustive: never = state
      return exhaustive
    }
  }
}

function formatCreditAmount(amount: ExactAmount | undefined): string {
  return amount === undefined ? 'Amount unknown' : formatCurrencyAmount(amount)
}

function formatActivityAmount(entry: AgentActivityView): string {
  if (entry.audAmountUnits === undefined || !/^(?:0|[1-9]\d*)$/u.test(entry.audAmountUnits)) {
    return 'Amount unknown'
  }
  return formatCreditAmount({ currency: 'AUD', exponent: 6, units: entry.audAmountUnits })
}

const unavailableAccountBalance: AccountFundingBalance = Object.freeze({
  kind: 'refused',
  code: 'billing_identity_missing',
  retryable: true,
})
