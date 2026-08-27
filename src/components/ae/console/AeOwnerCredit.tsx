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
import { addExactAmounts, formatCurrencyAmount, type ExactAmount } from '@/modules/money/public'
import type { AgentActivityView, AgentOperatorKeyReadback } from '@/modules/agent-access/agent-operator-view-model'
import { formatTimestamp } from '@/lib/ui/format-time'
import { AeCreditTopUpPanel, type CreditTopupPort, type CreditTopupTarget } from './AeCreditTopUpPanel'

export type AeOwnerCreditProps = Readonly<{
  items: readonly AgentOperatorKeyReadback[]
  loading: boolean
  creditTopupPort?: CreditTopupPort
  onCreditRefresh?: () => void | Promise<void>
}>

type CreditChargeRow = Readonly<{
  item: AgentOperatorKeyReadback
  entry: AgentActivityView
}>

export function creditTopupTargetFromItems(
  items: readonly AgentOperatorKeyReadback[],
): CreditTopupTarget | undefined {
  const item = items.find(({ account }) => account?.evidence === 'source')
  if (item?.account === undefined) return undefined
  return {
    principalId: item.principalId,
    currency: item.account.balance.currency,
    exponent: item.account.balance.exponent,
  }
}

export function creditBalanceFromItems(
  items: readonly AgentOperatorKeyReadback[],
): ExactAmount | undefined {
  const amounts = items.flatMap(({ account }) => (account === undefined ? [] : [account.balance]))
  return amounts.reduce<ExactAmount | undefined>((total, amount, index) => (
    index === 0 ? amount : total === undefined ? undefined : addExactAmounts(total, amount)
  ), undefined)
}

export function AeOwnerCredit({
  items,
  loading,
  creditTopupPort,
  onCreditRefresh,
}: AeOwnerCreditProps) {
  const balance = creditBalanceFromItems(items)
  const hasUnavailableData = items.some((item) => item.dataState === 'unavailable')
  const creditTopupTarget = creditTopupTargetFromItems(items)
  const activity = items
    .flatMap((item) => item.activity.map((entry) => ({ item, entry })))
    .sort((left, right) => right.entry.observedAt - left.entry.observedAt)
  const firstLoadPending = useFirstLoadPending(loading)
  const chargesPhase = stagedListPhase({ firstLoadPending, rows: activity })
  const [selected, setSelected] = useState<CreditChargeRow>()
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
        accessorFn: (row) => row.item.key.name,
        header: ({ column }) => <AeOperatorSortableHeader label="Agent" column={column} />,
        cell: ({ row }) => row.original.item.key.name,
      },
      {
        id: 'amount',
        accessorFn: (row) => formatCreditAmount(row.entry.grossAmount),
        header: ({ column }) => <AeOperatorSortableHeader label="Amount" column={column} />,
        cell: ({ row }) => (
          <span className="font-medium tabular-nums">{formatCreditAmount(row.original.entry.grossAmount)}</span>
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
        title="Balance"
        description="Browsing is free. Paid calls use the credit assigned to each agent."
      >
        <AeFactList
          facts={[
            {
              label: 'Available credit',
              value: firstLoadPending
                ? 'Checking…'
                : hasUnavailableData
                  ? 'Balance unavailable'
                  : formatCreditAmount(balance),
            },
            {
              label: 'Assignment',
              value: hasUnavailableData
                ? 'Some balance details are temporarily unavailable.'
                : 'Keep credit separate for each agent.',
              muted: true,
            },
          ]}
        />
        <AeCreditTopUpPanel
          {...(creditTopupTarget === undefined ? {} : { target: creditTopupTarget })}
          {...(creditTopupPort === undefined ? {} : { port: creditTopupPort })}
          {...(onCreditRefresh === undefined ? {} : { onRefresh: onCreditRefresh })}
        />
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
            onRowClick={setSelected}
          />
        ) : activity.length === 0 ? (
          <AeEmptyState
            title="No charges yet"
            description="Browsing does not create paid-call charges."
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
                  <a href={`/operations/invocations/${selected.entry.invocationRef}`}>View receipt</a>
                </Button>
              ),
            })}
      />
    </div>
  )
}

function chargeFacts(row: CreditChargeRow): readonly { label: string; value: string; muted?: boolean }[] {
  return [
    { label: 'Outcome', value: activityLabel(row.entry) },
    { label: 'Agent', value: row.item.key.name },
    { label: 'Amount', value: formatCreditAmount(row.entry.grossAmount) },
    ...(row.entry.operation === undefined
      ? []
      : [{ label: 'Supplier', value: row.entry.operation.supplier }]),
    { label: 'When', value: formatTimestamp(row.entry.observedAt) },
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
