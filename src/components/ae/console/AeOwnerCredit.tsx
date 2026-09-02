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
import type { MoneyDocumentView, MoneyReconciliationCaseView } from '@/lib/server/money-documents.functions'
import { suggestContinuation } from '@/modules/market/suggested-continuation'
import { AeAccountFundingPanel, type AccountFundingPort } from './AeCreditTopUpPanel'

export type AeOwnerCreditProps = Readonly<{
  directory: AgentDirectoryProjection
  accountBalance: AccountFundingBalance
  loading: boolean
  accountFundingPort?: AccountFundingPort
  onCreditRefresh?: () => void | Promise<void>
  documents?: readonly MoneyDocumentView[]
  reconciliationCases?: readonly MoneyReconciliationCaseView[]
  onCreateStatement?: () => Promise<void>
  onOpenDocument?: (documentRef: string) => Promise<void>
}>

type CreditChargeRow = Readonly<{
  item: AgentDetail
  entry: AgentActivityView
}>

export function AeOwnerCredit({
  directory,
  accountBalance,
  loading,
  accountFundingPort,
  onCreditRefresh,
  documents = [],
  reconciliationCases = [],
  onCreateStatement,
  onOpenDocument,
}: AeOwnerCreditProps) {
  const items = directory.details
  const balance = accountBalance.kind === 'available' ? accountBalance.balance : undefined
  const balanceUnavailable = accountBalance.kind === 'refused'
  const balanceLocked = accountBalance.kind === 'available' && accountBalance.locked
  const activity = items
    .flatMap((item) => item.activity.map((entry) => ({ item, entry })))
    .sort((left, right) => right.entry.observedAt - left.entry.observedAt)
  const firstLoadPending = useFirstLoadPending(loading)
  const chargesPhase = stagedListPhase({ firstLoadPending, rows: activity })
  const [selected, setSelected] = useState<CreditChargeRow>()
  const [documentAction, setDocumentAction] = useState<'idle' | 'creating' | 'opening' | 'saved' | 'failed'>('idle')
  const insufficientCreditContinuation = suggestContinuation({ subject: 'credit', state: 'insufficient' })
  const columns = useMemo<ColumnDef<CreditChargeRow, unknown>[]>(
    () => [
      {
        id: 'task',
        accessorFn: (row) => row.entry.operation?.label ?? activityLabel(row.entry),
        header: ({ column }) => <AeOperatorSortableHeader label="Task" column={column} />,
        cell: ({ row }) => (
          <span className="font-medium text-foreground">
            {row.original.entry.operation?.label ?? activityLabel(row.original.entry)}
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
        accessorFn: (row) => formatCreditAmount(row.entry.grossAmount),
        header: ({ column }) => <AeOperatorSortableHeader label="Amount" column={column} />,
        cell: ({ row }) => (
          <span className="font-medium font-mono tabular-nums">{formatCreditAmount(row.original.entry.grossAmount)}</span>
        ),
      },
      {
        id: 'when',
        accessorFn: (row) => row.entry.observedAt,
        header: ({ column }) => <AeOperatorSortableHeader label="When" column={column} />,
        cell: ({ row }) => (
          <time className="font-mono text-xs tabular-nums text-muted-foreground">
            {formatTimestamp(row.original.entry.observedAt)}
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
        description="Browsing is free. Paid Calls reserve AUD from this Account and the durable Agent budget."
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
          <Button
            type="button"
            variant="secondary"
            disabled={documentAction === 'creating' || documentAction === 'opening'}
            onClick={() => {
              setDocumentAction('creating')
              void onCreateStatement()
                .then(() => setDocumentAction('saved'))
                .catch(() => setDocumentAction('failed'))
            }}
          >
            {documentAction === 'creating' ? 'Creating…' : 'Create current statement'}
          </Button>
        )}
        <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
          {documentAction === 'creating'
            ? 'Creating statement…'
            : documentAction === 'opening'
              ? 'Preparing document…'
              : documentAction === 'saved'
                ? 'Document ready.'
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
                  { label: 'Reference', value: document.documentRef, mono: true },
                ]} />
                {onOpenDocument === undefined ? null : (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={documentAction === 'creating' || documentAction === 'opening'}
                    onClick={() => {
                      setDocumentAction('opening')
                      void onOpenDocument(document.documentRef)
                        .then(() => setDocumentAction('saved'))
                        .catch(() => setDocumentAction('failed'))
                    }}
                  >
                    Open document
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </AeSection>

      <AeSection
        title="Reconciliation"
        description="Every detected processor, treasury, settlement, projection, or document difference remains an owned case until evidence closes it."
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
                { label: 'Reason', value: item.reasonCode.replaceAll('_', ' ') },
                { label: 'Reference', value: item.caseRef, mono: true },
              ]} />
            ))}
          </div>
        )}
      </AeSection>

      <AeSection
        title="Recent charges"
        description="Calls and credit changes for each agent. Open Calls for the full table."
      >
        {chargesPhase === 'unloaded' ? (
          <div className="grid gap-intra" aria-busy="true" aria-label="Loading recent charges">
            <Skeleton className="h-touch w-full" />
            <Skeleton className="h-touch w-full" />
            <Skeleton className="h-touch w-full" />
          </div>
        ) : chargesPhase === 'cached-rows' ? (
          <AeRecordTable
            columns={columns}
            data={activity}
            caption="Recent charges"
            countLabel="charges"
            filterPlaceholder="Filter charges…"
            hideFilter={activity.length <= 1}
            getRowId={(item) => item.entry.activityRef}
            rowAction={{
              kind: 'button',
              label: 'View',
              onOpen: setSelected,
              getAccessibleLabel: (item) =>
                `View ${item.entry.operation?.label ?? activityLabel(item.entry)}`,
            }}
          />
        ) : activity.length === 0 ? (
          <AeEmptyState
            title="No charges yet"
            description="Browsing does not create paid-call charges."
            action={
              <Button asChild className="min-h-touch">
                <a href="/market?window=30d">Search Operations</a>
              </Button>
            }
          />
        ) : (
          <p className="text-sm text-muted-foreground">Some charge details are temporarily unavailable.</p>
        )}
      </AeSection>

      <AeRecordSheet
        open={selected !== undefined}
        onOpenChange={(open) => {
          if (!open) setSelected(undefined)
        }}
        title={selected === undefined ? 'Charge' : (selected.entry.operation?.label ?? activityLabel(selected.entry))}
        {...(selected === undefined ? {} : { facts: chargeFacts(selected) })}
        {...(selected === undefined
          ? {}
          : {
              action: (
                <Button asChild className="min-h-touch">
                  {selected.entry.chargeState === 'insufficient_credit' ? (
                    <a href={insufficientCreditContinuation.href}>{insufficientCreditContinuation.label}</a>
                  ) : (
                    <a href={`/operations/invocations/${selected.entry.invocationRef}`}>View receipt</a>
                  )}
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
    case 'adjustment': return 'Adjustment document'
    case 'tax_invoice': return 'Tax invoice'
  }
}

function chargeFacts(row: CreditChargeRow): readonly { label: string; value: string; muted?: boolean; mono?: boolean }[] {
  return [
    { label: 'Outcome', value: activityLabel(row.entry) },
    { label: 'Agent', value: row.item.agent.displayName },
    { label: 'Amount', value: formatCreditAmount(row.entry.grossAmount), mono: true },
    ...(row.entry.operation === undefined
      ? []
      : [{ label: 'Supplier', value: row.entry.operation.supplier }]),
    { label: 'When', value: formatTimestamp(row.entry.observedAt), mono: true },
  ]
}

function activityLabel(entry: AgentActivityView): string {
  switch (entry.chargeState) {
    case 'free_tier':
      return 'Free call'
    case 'paid':
      return 'Paid call'
    case 'refunded':
      return 'Refunded call'
    case 'outcome_unknown':
      return 'Paid call needs checking'
    case 'insufficient_credit':
      return 'Call declined for insufficient credit'
    default: {
      const exhaustive: never = entry.chargeState
      return exhaustive
    }
  }
}

function formatCreditAmount(amount: ExactAmount | undefined): string {
  return amount === undefined ? '—' : formatCurrencyAmount(amount)
}
