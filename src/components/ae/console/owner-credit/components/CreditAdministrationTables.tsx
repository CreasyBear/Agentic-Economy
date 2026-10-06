'use client'

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ColumnDef, ColumnMeta, FilterFn } from '@tanstack/react-table'

import { AeFactList } from '@/components/ae/data/AeFactList'
import { AeSection } from '@/components/ae/layout/AeSection'
import { CreditSectionEmptyState } from '@/components/ae/console/AeAccountHistoryTable'
import {
  AeOperatorSortableHeader,
  AeRecordTable,
  type AeRecordTableRowAction,
} from '@/components/ae/operator/AeOperatorDataTable'
import { formatCreditAmount } from '@/components/ae/console/owner-credit-format'
import { Drawer, DrawerContent } from '@/components/ae/shared/base-ui/drawer/drawer'
import { formatTimestamp, timestampIso } from '@/lib/ui/format-time'
import { formatCurrencyAmount } from '@/modules/money/public'
import type {
  MoneyProviderObligationView,
  MoneyReconciliationCaseView,
} from '@/lib/server/money-documents.functions'

import './CreditRecordsComposition.css'

export type CreditReconciliationRecordsProps = Readonly<{
  rows: readonly MoneyReconciliationCaseView[]
  loading?: boolean
  unavailable?: boolean
}>

export type CreditProviderObligationRecordsProps = Readonly<{
  rows: readonly MoneyProviderObligationView[]
  loading?: boolean
  unavailable?: boolean
}>

function humanizeCode(value: string): string {
  return value.replaceAll('_', ' ')
}

function reconciliationScope(record: MoneyReconciliationCaseView): string {
  return record.scopeType === undefined
    ? 'Legacy Account case'
    : `${humanizeCode(record.scopeType)} · ${record.scopeRef ?? 'Unknown'}`
}

function referenceList(values: readonly string[] | undefined): string {
  if (values === undefined) return 'Not recorded'
  return values.length === 0 ? 'None recorded' : values.join(', ')
}

function timeFact(label: string, value: number) {
  return {
    label,
    value: (
      <time className="arc-credit-administration-time" dateTime={timestampIso(value)}>
        {formatTimestamp(value)}
      </time>
    ),
    mono: true as const,
  }
}

function amountSort(left: bigint, right: bigint): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function searchIncludes(values: readonly string[], filterValue: unknown): boolean {
  const query = String(filterValue ?? '').trim().toLowerCase()
  return query === '' || values.some((value) => value.toLowerCase().includes(query))
}

const reconciliationGlobalFilter: FilterFn<MoneyReconciliationCaseView> = (
  row,
  _columnId,
  filterValue,
) => {
  const record = row.original
  return searchIncludes([
    record.caseRef,
    record.accountRef,
    record.kind,
    humanizeCode(record.kind),
    record.status,
    record.scopeType ?? '',
    record.scopeType === undefined ? '' : humanizeCode(record.scopeType),
    record.scopeRef ?? '',
    reconciliationScope(record),
    record.ownerPrincipalRef ?? '',
    record.transactionRef ?? '',
    record.reasonCode,
    humanizeCode(record.reasonCode),
    ...record.evidenceRefs,
    ...(record.resolutionEvidenceRefs ?? []),
    String(record.createdAt),
    String(record.updatedAt),
    ...(record.resolvedAt === undefined ? [] : [String(record.resolvedAt)]),
    formatTimestamp(record.createdAt),
    formatTimestamp(record.updatedAt),
    ...(record.resolvedAt === undefined ? [] : [formatTimestamp(record.resolvedAt)]),
  ], filterValue)
}

const providerObligationGlobalFilter: FilterFn<MoneyProviderObligationView> = (
  row,
  _columnId,
  filterValue,
) => {
  const record = row.original
  return searchIncludes([
    record.obligationRef,
    record.callRef,
    record.toolRef,
    record.providerRef,
    record.buyerAmountUnits,
    record.providerAmountUnits,
    formatCreditAmount({ currency: 'AUD', exponent: 6, units: record.buyerAmountUnits }),
    formatCurrencyAmount({ currency: 'AUD', exponent: 6, units: record.buyerAmountUnits }),
    formatCurrencyAmount({ currency: 'USDC', exponent: 6, units: record.providerAmountUnits }),
    record.state,
    record.payoutEligibility,
    ...record.evidenceRefs,
    record.settlementTransactionRef ?? '',
    record.reversalState ?? '',
    record.reversalTransactionRef ?? '',
    record.reversalStatusRef ?? '',
    String(record.createdAt),
    String(record.updatedAt),
    ...(record.settledAt === undefined ? [] : [String(record.settledAt)]),
    ...(record.reversedAt === undefined ? [] : [String(record.reversedAt)]),
    formatTimestamp(record.createdAt),
    formatTimestamp(record.updatedAt),
    ...(record.settledAt === undefined ? [] : [formatTimestamp(record.settledAt)]),
    ...(record.reversedAt === undefined ? [] : [formatTimestamp(record.reversedAt)]),
  ], filterValue)
}

function useRecordInspection<TRecord>(
  rows: readonly TRecord[],
  recordId: (record: TRecord) => string,
  unavailable: boolean,
) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const tableRootRef = useRef<HTMLDivElement | null>(null)
  const lastCommittedSelectionRef = useRef<string | null>(null)
  const selectedRecord = selectedId === null || unavailable
    ? undefined
    : rows.find((record) => recordId(record) === selectedId)

  useLayoutEffect(() => {
    if (selectedId === null || (!unavailable && rows.some((record) => recordId(record) === selectedId))) return
    setSelectedId(null)
  }, [recordId, rows, selectedId, unavailable])

  const inspect = useCallback((record: TRecord) => {
    const id = recordId(record)
    lastCommittedSelectionRef.current = id
    setSelectedId(id)
  }, [recordId])
  const onOpenChange = useCallback((open: boolean) => {
    if (!open) setSelectedId(null)
  }, [])
  const finalFocus = useCallback((): HTMLElement | null => {
    const root = tableRootRef.current
    if (root === null) return null
    const selectedIdAtClose = lastCommittedSelectionRef.current
    if (selectedIdAtClose === null) return root
    return Array.from(root.querySelectorAll<HTMLElement>('[data-ae-row-action-id]'))
      .find((element) => element.dataset.aeRowActionId === selectedIdAtClose) ?? root
  }, [])

  return { finalFocus, inspect, onOpenChange, selectedRecord, tableRootRef }
}

function reconciliationCaseId(record: MoneyReconciliationCaseView): string {
  return record.caseRef
}

function providerObligationId(record: MoneyProviderObligationView): string {
  return record.obligationRef
}

function reconciliationFacts(record: MoneyReconciliationCaseView) {
  return [
    { label: 'Case reference', value: record.caseRef, mono: true as const },
    { label: 'Account reference', value: record.accountRef, mono: true as const },
    { label: 'Difference', value: humanizeCode(record.kind) },
    { label: 'Status', value: record.status },
    { label: 'Affected scope', value: reconciliationScope(record) },
    { label: 'Owner', value: record.ownerPrincipalRef ?? 'Unassigned', mono: true as const },
    { label: 'Transaction reference', value: record.transactionRef ?? 'Not recorded', mono: true as const },
    { label: 'Reason', value: humanizeCode(record.reasonCode) },
    { label: 'Evidence references', value: referenceList(record.evidenceRefs), mono: true as const },
    { label: 'Resolution evidence references', value: referenceList(record.resolutionEvidenceRefs), mono: true as const },
    timeFact('Created', record.createdAt),
    timeFact('Updated', record.updatedAt),
    ...(record.resolvedAt === undefined ? [] : [timeFact('Resolved', record.resolvedAt)]),
  ]
}

function providerObligationFacts(record: MoneyProviderObligationView) {
  return [
    { label: 'Obligation reference', value: record.obligationRef, mono: true as const },
    { label: 'Call reference', value: record.callRef, mono: true as const },
    { label: 'Tool reference', value: record.toolRef, mono: true as const },
    { label: 'Provider reference', value: record.providerRef, mono: true as const },
    {
      label: 'Buyer amount',
      value: formatCreditAmount({ currency: 'AUD', exponent: 6, units: record.buyerAmountUnits }),
      mono: true as const,
    },
    {
      label: 'Exact buyer amount',
      value: formatCurrencyAmount({ currency: 'AUD', exponent: 6, units: record.buyerAmountUnits }),
      mono: true as const,
    },
    {
      label: 'Exact Provider amount',
      value: formatCurrencyAmount({ currency: 'USDC', exponent: 6, units: record.providerAmountUnits }),
      mono: true as const,
    },
    { label: 'State', value: record.state },
    { label: 'Payout', value: 'Ineligible for AE payout (managed x402)' },
    { label: 'Evidence references', value: referenceList(record.evidenceRefs), mono: true as const },
    { label: 'Settlement transaction reference', value: record.settlementTransactionRef ?? 'Not recorded', mono: true as const },
    { label: 'Reversal state', value: record.reversalState ?? 'Not recorded' },
    { label: 'Reversal transaction reference', value: record.reversalTransactionRef ?? 'Not recorded', mono: true as const },
    { label: 'Reversal status reference', value: record.reversalStatusRef ?? 'Not recorded', mono: true as const },
    timeFact('Created', record.createdAt),
    timeFact('Updated', record.updatedAt),
    ...(record.settledAt === undefined ? [] : [timeFact('Settled', record.settledAt)]),
    ...(record.reversedAt === undefined ? [] : [timeFact('Reversed', record.reversedAt)]),
  ]
}

export function CreditReconciliationRecords({
  rows,
  loading = false,
  unavailable = false,
}: CreditReconciliationRecordsProps) {
  const {
    finalFocus,
    inspect,
    onOpenChange,
    selectedRecord,
    tableRootRef,
  } = useRecordInspection(rows, reconciliationCaseId, unavailable)
  const columns = useMemo<ColumnDef<MoneyReconciliationCaseView, unknown>[]>(() => [
    {
      id: 'difference',
      meta: { label: 'Difference' } as ColumnMeta<MoneyReconciliationCaseView, unknown>,
      accessorFn: (record) => humanizeCode(record.kind),
      header: ({ column }) => <AeOperatorSortableHeader label="Difference" column={column} />,
      cell: ({ row }) => humanizeCode(row.original.kind),
    },
    {
      id: 'scope',
      accessorFn: reconciliationScope,
      header: ({ column }) => <AeOperatorSortableHeader label="Affected scope" column={column} />,
      meta: { label: 'Affected scope', truncate: true } as ColumnMeta<MoneyReconciliationCaseView, unknown>,
      cell: ({ row }) => {
        const scope = reconciliationScope(row.original)
        return <span className="arc-credit-administration-scope" title={scope}>{scope}</span>
      },
    },
    {
      id: 'status',
      meta: { label: 'Status' } as ColumnMeta<MoneyReconciliationCaseView, unknown>,
      accessorKey: 'status',
      header: ({ column }) => <AeOperatorSortableHeader label="Status" column={column} />,
      cell: ({ row }) => row.original.status,
    },
    {
      id: 'updated',
      meta: { label: 'Updated', numeric: true } as ColumnMeta<MoneyReconciliationCaseView, unknown>,
      accessorFn: (record) => record.updatedAt,
      sortingFn: (left, right, columnId) => {
        const leftUpdatedAt = left.getValue<number>(columnId)
        const rightUpdatedAt = right.getValue<number>(columnId)
        return leftUpdatedAt < rightUpdatedAt ? -1 : leftUpdatedAt > rightUpdatedAt ? 1 : 0
      },
      header: ({ column }) => <AeOperatorSortableHeader label="Updated" column={column} />,
      cell: ({ row }) => (
        <time className="arc-credit-administration-time" dateTime={timestampIso(row.original.updatedAt)}>
          {formatTimestamp(row.original.updatedAt)}
        </time>
      ),
    },
  ], [])
  const rowAction = useMemo<AeRecordTableRowAction<MoneyReconciliationCaseView>>(() => ({
    kind: 'button',
    label: 'Inspect',
    onOpen: inspect,
    getAccessibleLabel: (record) => `Inspect reconciliation case ${record.caseRef}`,
  }), [inspect])

  return (
    <Drawer open={selectedRecord !== undefined} onOpenChange={onOpenChange}>
      <AeSection
        title="Reconciliation"
        description="Processor, treasury, settlement, or document differences remain scope-limited cases until an owner closes them with evidence."
      >
        <div
          ref={tableRootRef}
          className="arc-credit-administration-table"
          tabIndex={-1}
          aria-busy={loading}
        >
          {unavailable ? (
            <CreditSectionEmptyState title="Reconciliation unavailable" description="No reconciliation state is being inferred." />
          ) : rows.length === 0 && !loading ? (
            <CreditSectionEmptyState
              title="No reconciliation differences"
              description="New paid Calls remain blocked only when their affected Account is locked for a proven mismatch."
            />
          ) : (
            <AeRecordTable
              columns={columns}
              data={rows}
              getRowId={reconciliationCaseId}
              caption="Reconciliation cases"
              countLabel="reconciliation cases"
              filterPlaceholder="Filter reconciliation cases…"
              emptyMessage="No reconciliation cases match this search."
              globalFilterFn={reconciliationGlobalFilter}
              rowAction={rowAction}
              loading={loading && rows.length === 0}
            />
          )}
        </div>
      </AeSection>
      <DrawerContent
        title="Reconciliation case"
        description="Recorded difference, affected scope and evidence."
        finalFocus={finalFocus}
      >
        {selectedRecord === undefined ? null : (
          <div className="arc-credit-administration-detail-stack">
            <AeFactList facts={reconciliationFacts(selectedRecord)} className="arc-credit-administration-detail-facts" />
          </div>
        )}
      </DrawerContent>
    </Drawer>
  )
}

export function CreditProviderObligationRecords({
  rows,
  loading = false,
  unavailable = false,
}: CreditProviderObligationRecordsProps) {
  const {
    finalFocus,
    inspect,
    onOpenChange,
    selectedRecord,
    tableRootRef,
  } = useRecordInspection(rows, providerObligationId, unavailable)
  const columns = useMemo<ColumnDef<MoneyProviderObligationView, unknown>[]>(() => [
    {
      id: 'provider',
      accessorKey: 'providerRef',
      header: ({ column }) => <AeOperatorSortableHeader label="Provider" column={column} />,
      meta: { label: 'Provider', truncate: true } as ColumnMeta<MoneyProviderObligationView, unknown>,
      cell: ({ row }) => (
        <span className="arc-credit-administration-identity" title={row.original.providerRef}>
          {row.original.providerRef}
        </span>
      ),
    },
    {
      id: 'buyerAmount',
      accessorFn: (record) => BigInt(record.buyerAmountUnits),
      sortingFn: (left, right, columnId) => amountSort(
        left.getValue<bigint>(columnId),
        right.getValue<bigint>(columnId),
      ),
      header: ({ column }) => <AeOperatorSortableHeader label="Buyer amount" column={column} />,
      meta: { label: 'Buyer amount', numeric: true } as ColumnMeta<MoneyProviderObligationView, unknown>,
      cell: ({ row }) => (
        <span className="arc-credit-administration-amount">
          {formatCreditAmount({ currency: 'AUD', exponent: 6, units: row.original.buyerAmountUnits })}
        </span>
      ),
    },
    {
      id: 'providerAmount',
      accessorFn: (record) => BigInt(record.providerAmountUnits),
      sortingFn: (left, right, columnId) => amountSort(
        left.getValue<bigint>(columnId),
        right.getValue<bigint>(columnId),
      ),
      header: ({ column }) => <AeOperatorSortableHeader label="Provider amount" column={column} />,
      meta: { label: 'Provider amount', numeric: true } as ColumnMeta<MoneyProviderObligationView, unknown>,
      cell: ({ row }) => (
        <span className="arc-credit-administration-amount">
          {formatCurrencyAmount({ currency: 'USDC', exponent: 6, units: row.original.providerAmountUnits })}
        </span>
      ),
    },
    {
      id: 'state',
      meta: { label: 'State' } as ColumnMeta<MoneyProviderObligationView, unknown>,
      accessorKey: 'state',
      header: ({ column }) => <AeOperatorSortableHeader label="State" column={column} />,
      cell: ({ row }) => row.original.state,
    },
  ], [])
  const rowAction = useMemo<AeRecordTableRowAction<MoneyProviderObligationView>>(() => ({
    kind: 'button',
    label: 'Inspect',
    onOpen: inspect,
    getAccessibleLabel: (record) => `Inspect Provider obligation ${record.obligationRef}`,
  }), [inspect])

  return (
    <Drawer open={selectedRecord !== undefined} onOpenChange={onOpenChange}>
      <AeSection
        title="Provider obligations"
        description="Managed x402 obligations retain distinct buyer AUD and Provider USDC evidence. They are never eligible for a second payout."
      >
        <div
          ref={tableRootRef}
          className="arc-credit-administration-table"
          tabIndex={-1}
          aria-busy={loading}
        >
          {unavailable ? (
            <CreditSectionEmptyState title="Provider obligations unavailable" description="No obligation state is being inferred." />
          ) : rows.length === 0 && !loading ? (
            <CreditSectionEmptyState title="No Provider obligations" description="A managed x402 Call creates one attributable upstream obligation." />
          ) : (
            <AeRecordTable
              columns={columns}
              data={rows}
              getRowId={providerObligationId}
              caption="Provider obligations"
              countLabel="Provider obligations"
              filterPlaceholder="Filter Provider obligations…"
              emptyMessage="No Provider obligations match this search."
              globalFilterFn={providerObligationGlobalFilter}
              rowAction={rowAction}
              loading={loading && rows.length === 0}
            />
          )}
        </div>
      </AeSection>
      <DrawerContent
        title="Provider obligation"
        description="Amounts, recorded state and evidence."
        finalFocus={finalFocus}
      >
        {selectedRecord === undefined ? null : (
          <div className="arc-credit-administration-detail-stack">
            <AeFactList facts={providerObligationFacts(selectedRecord)} className="arc-credit-administration-detail-facts" />
          </div>
        )}
      </DrawerContent>
    </Drawer>
  )
}
