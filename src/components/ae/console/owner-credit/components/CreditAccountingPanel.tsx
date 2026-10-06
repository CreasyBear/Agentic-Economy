'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ColumnDef, ColumnMeta } from '@tanstack/react-table'

import { AeFactList } from '@/components/ae/data/AeFactList'
import { AeSection } from '@/components/ae/layout/AeSection'
import { CreditSectionEmptyState } from '@/components/ae/console/AeAccountHistoryTable'
import { AeOperatorSortableHeader, AeRecordTable } from '@/components/ae/operator/AeOperatorDataTable'
import {
  documentFacts,
  documentKindLabel,
  documentStatusLabel,
  documentTimeFact,
  formatCreditAmount,
} from '@/components/ae/console/owner-credit-format'
import { SearchField } from '@/components/arc/search-field/search-field'
import { Button as ArcButton } from '@/components/arc/button/button'
import { Drawer, DrawerContent, DrawerTrigger } from '@/components/ae/shared/arc/drawer/AeDrawerContent'
import { timestampIso } from '@/lib/ui/format-time'
import type { MoneyDocumentView } from '@/lib/server/money-documents.functions'
import type {
  DocumentAction,
  DocumentActionKey,
  DocumentActionStatus,
} from '@/modules/money/account-documents.view-model'

import type { AeOwnerCreditProps } from '../owner-credit.contracts'
import { CreditProviderObligationRecords, CreditReconciliationRecords } from './CreditAdministrationTables'
import './CreditRecordsComposition.css'

export type CreditAccountingPanelProps = Pick<
  AeOwnerCreditProps,
  | 'documents'
  | 'reconciliationCases'
  | 'providerObligations'
  | 'administrationLoading'
  | 'onCreateStatement'
  | 'onCreateDailyClose'
  | 'onSignDailyClose'
  | 'onOpenDocument'
  | 'unavailable'
>

const EMPTY_DOCUMENTS: NonNullable<AeOwnerCreditProps['documents']> = []
const EMPTY_RECONCILIATION_CASES: NonNullable<AeOwnerCreditProps['reconciliationCases']> = []
const EMPTY_PROVIDER_OBLIGATIONS: NonNullable<AeOwnerCreditProps['providerObligations']> = []
type DocumentActionStates = Readonly<Partial<Record<DocumentActionKey, DocumentActionStatus>>>
type RunDocumentAction = (action: DocumentAction, operation: () => Promise<void>) => void

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

function CreditDocumentRowActions({ document, documentActions, onOpenDocument, runDocumentAction, onSelectDocument }: Readonly<{
  document: MoneyDocumentView
  documentActions: DocumentActionStates
  onOpenDocument: CreditAccountingPanelProps['onOpenDocument']
  runDocumentAction: RunDocumentAction
  onSelectDocument: (documentRef: string) => void
}>) {
  const label = documentKindLabel(document.kind)
  const openStatus = documentActions[documentActionKey({ kind: 'open', documentRef: document.documentRef })]
  const openNotice = openStatus === 'pending'
    ? `Opening ${label}…`
    : openStatus === 'succeeded'
      ? 'Link prepared'
      : openStatus === 'failed'
        ? 'Could not open'
        : undefined
  const openNoticeTitle = openStatus === 'pending'
    ? `Opening ${label}…`
    : openStatus === 'succeeded'
      ? `${label} link prepared. If no tab opened, try opening it again.`
      : openStatus === 'failed'
        ? `${label} could not be opened. This record remains available.`
        : undefined
  return (
    <div className="arc-credit-document-row-actions">
      <DrawerTrigger asChild>
        <ArcButton
          type="button"
          variant="secondary"
          size="sm"
          className="arc-credit-document-action-button"
          aria-label={`View details for ${label}, ${document.documentRef}`}
          data-document-ref={document.documentRef}
          onClick={() => {
            onSelectDocument(document.documentRef)
          }}
        >
          View details
        </ArcButton>
      </DrawerTrigger>
      {document.state === 'issued' && onOpenDocument !== undefined ? (
        <ArcButton
          type="button"
          variant="secondary"
          size="sm"
          className="arc-credit-document-action-button"
          disabled={openStatus === 'pending'}
          onClick={() => runDocumentAction(
            { kind: 'open', documentRef: document.documentRef },
            () => onOpenDocument(document.documentRef),
          )}
        >
          {openStatus === 'pending' ? 'Opening…' : 'Open document'}
        </ArcButton>
      ) : null}
      {openNotice === undefined ? null : (
        <p className="arc-credit-document-row-notice" role="status" aria-live="polite" title={openNoticeTitle}>
          {openNotice}
        </p>
      )}
    </div>
  )
}

function CreditDocumentDetails({ document, documentActions, onOpenDocument, onSignDailyClose, runDocumentAction, finalFocus }: Readonly<{
  document: MoneyDocumentView
  documentActions: DocumentActionStates
  onOpenDocument: CreditAccountingPanelProps['onOpenDocument']
  onSignDailyClose: CreditAccountingPanelProps['onSignDailyClose']
  runDocumentAction: RunDocumentAction
  finalFocus: () => HTMLButtonElement | null
}>) {
  const label = documentKindLabel(document.kind)
  const signStatus = documentActions[documentActionKey({ kind: 'sign', documentRef: document.documentRef })]
  const openStatus = documentActions[documentActionKey({ kind: 'open', documentRef: document.documentRef })]
  const csvStatus = documentActions[documentActionKey({ kind: 'open_csv', documentRef: document.documentRef })]
  const reviewReady = document.kind === 'daily_close' && document.state === 'awaiting_signature' && document.rendered
  return (
    <DrawerContent
      title={`${label} details`}
      description={document.documentRef}
      className="arc-credit-document-drawer"
      onCloseAutoFocus={event => {
        const target = finalFocus()
        if (target === null) return
        event.preventDefault()
        target.focus({ preventScroll: true })
      }}
    >
      <div className="arc-credit-document-detail-stack">
        <AeFactList facts={documentFacts(document)} className="arc-credit-document-detail-facts" />
        <div className="arc-credit-document-action-stack">
          {reviewReady ? <p className="text-sm text-muted-foreground">Review the Account settlement report before signing. It does not reconcile platform treasury.</p> : null}
          {document.failureCode === 'statement_adjustment_requires_approved_policy' ? (
            <p className="text-sm text-muted-foreground" role="status">The captured totals need a rounding adjustment, but commercial approval was not valid at capture. No ledger adjustment was made.</p>
          ) : null}
          <div className="arc-credit-document-actions">
            {reviewReady && onOpenDocument !== undefined ? (
              <ArcButton type="button" variant="secondary" size="sm" className="arc-credit-document-action-button"
                disabled={openStatus === 'pending'}
                onClick={() => runDocumentAction(
                  { kind: 'open', documentRef: document.documentRef },
                  () => onOpenDocument(document.documentRef),
                )}>
                {openStatus === 'pending' ? 'Opening…' : 'Review close'}
              </ArcButton>
            ) : null}
            {reviewReady && onOpenDocument !== undefined ? (
              <ArcButton type="button" variant="secondary" size="sm" className="arc-credit-document-action-button"
                disabled={csvStatus === 'pending'}
                onClick={() => runDocumentAction(
                  { kind: 'open_csv', documentRef: document.documentRef },
                  () => onOpenDocument(document.documentRef, 'csv'),
                )}>
                {csvStatus === 'pending' ? 'Opening CSV…' : 'Review CSV'}
              </ArcButton>
            ) : null}
            {reviewReady && onSignDailyClose !== undefined ? (
              <ArcButton type="button" variant="primary" size="sm" className="arc-credit-document-action-button"
                disabled={signStatus === 'pending'}
                onClick={() => runDocumentAction(
                  { kind: 'sign', documentRef: document.documentRef },
                  () => onSignDailyClose(document.documentRef, document.renderInputDigest),
                )}>
                {signStatus === 'pending' ? 'Signing close…' : 'Sign close'}
              </ArcButton>
            ) : null}
          </div>
          <div className="arc-credit-document-notices">
            <DocumentActionNotice
              status={signStatus}
              pending={`Signing ${label}…`}
              succeeded="Signature request completed. Refresh this record to confirm its status."
              failed={`Signing ${label} could not be confirmed. Refresh this record before trying again.`}
            />
            <DocumentActionNotice
              status={openStatus}
              pending={`Opening ${label}…`}
              succeeded={`${label} link prepared. If no tab opened, try opening it again.`}
              failed={`${label} could not be opened. This record remains available.`}
            />
            <DocumentActionNotice
              status={csvStatus}
              pending="Opening close CSV…"
              succeeded="Close CSV link prepared. Review it before signing."
              failed="Close CSV could not be opened. This record remains available."
            />
          </div>
        </div>
      </div>
    </DrawerContent>
  )
}

export function CreditAccountingPanel({
  documents = EMPTY_DOCUMENTS,
  reconciliationCases = EMPTY_RECONCILIATION_CASES,
  providerObligations = EMPTY_PROVIDER_OBLIGATIONS,
  administrationLoading = false,
  onCreateStatement,
  onCreateDailyClose,
  onSignDailyClose,
  onOpenDocument,
  unavailable = {},
}: CreditAccountingPanelProps) {
  const [documentActions, setDocumentActions] = useState<DocumentActionStates>({})
  const documentActionsInFlight = useRef(new Set<DocumentActionKey>())
  const documentTableRootRef = useRef<HTMLDivElement | null>(null)
  const lastSelectedDocumentRef = useRef<string | null>(null)
  const [selectedDocumentRef, setSelectedDocumentRef] = useState<string | null>(null)
  const [documentFilter, setDocumentFilter] = useState('')

  const runDocumentAction = useCallback((action: DocumentAction, operation: () => Promise<void>) => {
    const key = documentActionKey(action)
    if (documentActionsInFlight.current.has(key)) return
    documentActionsInFlight.current.add(key)
    setDocumentActions((current) => ({ ...current, [key]: 'pending' }))
    void Promise.resolve()
      .then(operation)
      .then(() => setDocumentActions((current) => ({ ...current, [key]: 'succeeded' })))
      .catch(() => setDocumentActions((current) => ({ ...current, [key]: 'failed' })))
      .finally(() => documentActionsInFlight.current.delete(key))
  }, [])

  const createStatementStatus = documentActions[documentActionKey({ kind: 'create_statement' })]
  const createDailyCloseStatus = documentActions[documentActionKey({ kind: 'create_daily_close' })]
  const selectedDocument = selectedDocumentRef === null || unavailable.documents
    ? undefined
    : documents.find((document) => document.documentRef === selectedDocumentRef)
  // Clear a lost inspection before committing children. Keeping its old ID
  // would reopen the drawer if a later source refresh restores that record.
  if (selectedDocumentRef !== null && selectedDocument === undefined) {
    setSelectedDocumentRef(null)
  }
  const normalizedFilter = documentFilter.trim().toLowerCase()
  const filteredDocuments = useMemo(() => normalizedFilter === ''
    ? documents
    : documents.filter((document) => [
        documentKindLabel(document.kind),
        document.documentRef,
        documentStatusLabel(document.state),
      ].some((value) => value.toLowerCase().includes(normalizedFilter))), [documents, normalizedFilter])



  // The modal engine restores focus after selection state has closed. Keep the
  // last committed inspection for that external focus operation, not rendering.
  useEffect(() => {
    if (selectedDocumentRef !== null) lastSelectedDocumentRef.current = selectedDocumentRef
  }, [selectedDocumentRef])
  const documentColumns = useMemo<ColumnDef<MoneyDocumentView, unknown>[]>(() => [
    {
      id: 'document',
      accessorFn: (document) => documentKindLabel(document.kind),
      header: ({ column }) => <AeOperatorSortableHeader label="Document" column={column} />,
      cell: ({ row }) => {
        const document = row.original
        const label = documentKindLabel(document.kind)
        return (
          <div className="arc-credit-document-identity">
            <span className="arc-credit-document-title" title={label}>{label}</span>
            <span className="arc-credit-document-ref" title={document.documentRef}>{document.documentRef}</span>
          </div>
        )
      },
    },
    {
      id: 'amount',
      accessorFn: (document) => BigInt(document.amountUnits),
      sortingFn: (left, right, columnId) => {
        const leftUnits = left.getValue<bigint>(columnId)
        const rightUnits = right.getValue<bigint>(columnId)
        return leftUnits < rightUnits ? -1 : leftUnits > rightUnits ? 1 : 0
      },
      header: ({ column }) => <AeOperatorSortableHeader label="Amount" column={column} />,
      meta: { numeric: true } as ColumnMeta<MoneyDocumentView, unknown>,
      cell: ({ row }) => (
        <span className="arc-credit-document-amount">
          {formatCreditAmount({ currency: 'AUD', exponent: 6, units: row.original.amountUnits })}
        </span>
      ),
    },
    {
      id: 'recorded',
      accessorFn: (document) => document.createdAt,
      header: ({ column }) => <AeOperatorSortableHeader label="Recorded" column={column} />,
      cell: ({ row }) => {
        const time = documentTimeFact(row.original)
        return <time className="arc-credit-document-time" dateTime={timestampIso(row.original.createdAt)}>{time.value}</time>
      },
    },
    {
      id: 'status',
      accessorFn: (document) => documentStatusLabel(document.state),
      header: ({ column }) => <AeOperatorSortableHeader label="Status" column={column} />,
      cell: ({ row }) => documentStatusLabel(row.original.state),
    },
    {
      id: 'actions',
      accessorFn: () => '',
      enableSorting: false,
      header: 'Actions',
      cell: ({ row }) => (
        <CreditDocumentRowActions
          document={row.original}
          documentActions={documentActions}
          onOpenDocument={onOpenDocument}
          runDocumentAction={runDocumentAction}
          onSelectDocument={setSelectedDocumentRef}
        />
      ),
    },
  ], [documentActions, onOpenDocument, runDocumentAction])

  return (
    <div className="arc-market arc-credit-accounting" role="group" aria-label="Accounting records" aria-busy={administrationLoading}>
      {administrationLoading ? <p className="text-sm text-muted-foreground" role="status">Loading accounting records…</p> : null}
      <Drawer
        open={selectedDocument !== undefined}
        onOpenChange={(open) => { if (!open) setSelectedDocumentRef(null) }}
      >
        <AeSection
          title="Documents"
          description="Immutable funding receipts, fee documents, statements, and adjustments retain their source transactions and policy version."
        >
          {onCreateStatement === undefined ? null : (
            <div className="arc-credit-document-create">
              <div className="arc-credit-document-actions">
                <ArcButton
                  type="button"
                  variant="secondary"
                  disabled={createStatementStatus === 'pending'}
                  onClick={() => runDocumentAction({ kind: 'create_statement' }, onCreateStatement)}
                >
                  {createStatementStatus === 'pending' ? 'Creating statement…' : 'Create previous month’s statement'}
                </ArcButton>
                {onCreateDailyClose === undefined ? null : (
                  <ArcButton
                    type="button"
                    variant="secondary"
                    disabled={createDailyCloseStatus === 'pending'}
                    onClick={() => runDocumentAction({ kind: 'create_daily_close' }, onCreateDailyClose)}
                  >
                    {createDailyCloseStatus === 'pending' ? 'Creating daily close…' : 'Create yesterday’s close'}
                  </ArcButton>
                )}
              </div>
              <div className="arc-credit-document-notices">
                <DocumentActionNotice
                  status={createStatementStatus}
                  pending="Creating the previous completed month’s statement…"
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
            </div>
          )}
          {unavailable.documents ? (
            <CreditSectionEmptyState title="Documents unavailable" description="No document state is being inferred." />
          ) : documents.length === 0 ? administrationLoading ? null : (
            <CreditSectionEmptyState
              title="No accounting documents yet"
              description="Receipts, fee documents, adjustments, and statements will be preserved here."
            />
          ) : (
            <div ref={documentTableRootRef} className="arc-credit-document-table-stack">
              <div className="arc-credit-document-search">
                <SearchField
                  label="Search documents"
                  placeholder="Kind, reference, or status"
                  value={documentFilter}
                  onValueChange={setDocumentFilter}
                />
              </div>
              <AeRecordTable
                columns={documentColumns}
                data={filteredDocuments}
                getRowId={(document) => document.documentRef}
                caption="Accounting documents"
                countLabel="documents"
                hideFilter
                emptyMessage={normalizedFilter === '' ? 'No accounting documents yet.' : 'No accounting documents match this search.'}
              />
            </div>
          )}
        </AeSection>
        {selectedDocument === undefined ? null : (
          <CreditDocumentDetails
            document={selectedDocument}
            documentActions={documentActions}
            onOpenDocument={onOpenDocument}
            onSignDailyClose={onSignDailyClose}
            runDocumentAction={runDocumentAction}
            finalFocus={() => {
              const ref = lastSelectedDocumentRef.current
              return ref === null
                ? null
                : Array.from(documentTableRootRef.current?.querySelectorAll<HTMLButtonElement>('[data-document-ref]') ?? [])
                  .find((button) => button.dataset.documentRef === ref) ?? null
            }}
          />
        )}
      </Drawer>
      <CreditReconciliationRecords
        rows={reconciliationCases}
        loading={administrationLoading}
        unavailable={unavailable.reconciliation === true}
      />
      <CreditProviderObligationRecords
        rows={providerObligations}
        loading={administrationLoading}
        unavailable={unavailable.obligations === true}
      />
    </div>
  )
}
