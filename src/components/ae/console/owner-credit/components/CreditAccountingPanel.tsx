'use client'

import { useRef, useState } from 'react'

import { AeFactList } from '@/components/ae/data/AeFactList'
import { AeSection } from '@/components/ae/layout/AeSection'
import { CreditSectionEmptyState } from '@/components/ae/console/AeAccountHistoryTable'
import {
  documentFacts,
  documentKindLabel,
  formatCreditAmount,
} from '@/components/ae/console/owner-credit-format'
import { Button as ArcButton } from '@/components/arc/button/button'
import type {
  DocumentAction,
  DocumentActionKey,
  DocumentActionStatus,
} from '@/modules/money/account-documents.view-model'

import type { AeOwnerCreditProps } from '../owner-credit.contracts'
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

export function CreditAccountingPanel({
  documents = [],
  reconciliationCases = [],
  providerObligations = [],
  administrationLoading = false,
  onCreateStatement,
  onCreateDailyClose,
  onSignDailyClose,
  onOpenDocument,
  unavailable = {},
}: CreditAccountingPanelProps) {
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
    <div className="arc-market arc-credit-accounting" role="group" aria-label="Accounting records" aria-busy={administrationLoading}>
      {administrationLoading ? <p className="text-sm text-muted-foreground" role="status">Loading accounting records…</p> : null}
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
                {createStatementStatus === 'pending' ? 'Creating statement…' : 'Create current statement'}
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
          <ul className="arc-credit-document-list" aria-label="Accounting documents">
            {documents.map((document) => {
              const signStatus = documentActions[documentActionKey({ kind: 'sign', documentRef: document.documentRef })]
              const openStatus = documentActions[documentActionKey({ kind: 'open', documentRef: document.documentRef })]
              const label = documentKindLabel(document.kind)
              return (
                <li key={document.documentRef} className="arc-credit-document-row">
                  <AeFactList facts={documentFacts(document)} className="arc-credit-document-facts" />
                  <div className="arc-credit-document-action-stack">
                    <div className="arc-credit-document-actions">
                      {document.kind === 'daily_close' && document.state === 'awaiting_signature' && onSignDailyClose !== undefined ? (
                        <ArcButton
                          type="button"
                          variant="primary"
                          disabled={signStatus === 'pending'}
                          onClick={() => runDocumentAction(
                            { kind: 'sign', documentRef: document.documentRef },
                            () => onSignDailyClose(document.documentRef, document.renderInputDigest),
                          )}
                        >
                          {signStatus === 'pending' ? 'Signing close…' : 'Sign close'}
                        </ArcButton>
                      ) : null}
                      {onOpenDocument === undefined ? null : (
                        <ArcButton
                          type="button"
                          variant="secondary"
                          disabled={document.state !== 'issued' || openStatus === 'pending'}
                          onClick={() => runDocumentAction(
                            { kind: 'open', documentRef: document.documentRef },
                            () => onOpenDocument(document.documentRef),
                          )}
                        >
                          {openStatus === 'pending' ? 'Opening…' : document.state === 'issued' ? 'Open document' : 'Preparing…'}
                        </ArcButton>
                      )}
                    </div>
                    <div className="arc-credit-document-notices">
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
                </li>
              )
            })}
          </ul>
        )}
      </AeSection>
      <AeSection
        title="Reconciliation"
        description="Processor, treasury, settlement, or document differences remain scope-limited cases until an owner closes them with evidence."
      >
        {unavailable.reconciliation ? (
          <CreditSectionEmptyState title="Reconciliation unavailable" description="No reconciliation state is being inferred." />
        ) : reconciliationCases.length === 0 ? administrationLoading ? null : (
          <CreditSectionEmptyState
            title="No reconciliation differences"
            description="New paid Calls remain blocked only when their affected Account is locked for a proven mismatch."
          />
        ) : (
          <ul className="arc-credit-record-list" aria-label="Reconciliation cases">
            {reconciliationCases.map((item) => (
              <li key={item.caseRef} className="arc-credit-record-row">
                <AeFactList
                  className="arc-credit-record-facts"
                  facts={[
                    { label: 'Difference', value: item.kind.replaceAll('_', ' ') },
                    { label: 'Status', value: item.status },
                    { label: 'Owner', value: item.ownerPrincipalRef ?? 'Unassigned' },
                    { label: 'Affected scope', value: item.scopeType === undefined ? 'Legacy Account case' : `${item.scopeType.replaceAll('_', ' ')} · ${item.scopeRef ?? 'Unknown'}` },
                    { label: 'Reason', value: item.reasonCode.replaceAll('_', ' ') },
                    { label: 'Reference', value: item.caseRef, mono: true },
                  ]}
                />
              </li>
            ))}
          </ul>
        )}
      </AeSection>
      <AeSection
        title="Provider obligations"
        description="Managed x402 obligations retain distinct buyer AUD and Provider USDC evidence. They are never eligible for a second payout."
      >
        {unavailable.obligations ? (
          <CreditSectionEmptyState title="Provider obligations unavailable" description="No obligation state is being inferred." />
        ) : providerObligations.length === 0 ? administrationLoading ? null : (
          <CreditSectionEmptyState title="No Provider obligations" description="A managed x402 Call creates one attributable upstream obligation." />
        ) : (
          <ul className="arc-credit-record-list" aria-label="Provider obligations">
            {providerObligations.map((obligation) => (
              <li key={obligation.obligationRef} className="arc-credit-record-row">
                <AeFactList
                  className="arc-credit-record-facts"
                  facts={[
                    { label: 'Provider', value: obligation.providerRef },
                    { label: 'Buyer amount', value: formatCreditAmount({ currency: 'AUD', exponent: 6, units: obligation.buyerAmountUnits }), mono: true },
                    { label: 'Provider amount', value: formatCreditAmount({ currency: 'USDC', exponent: 6, units: obligation.providerAmountUnits }), mono: true },
                    { label: 'State', value: obligation.state },
                    { label: 'Payout', value: 'Ineligible — settled by x402' },
                    { label: 'Reference', value: obligation.obligationRef, mono: true },
                  ]}
                />
              </li>
            ))}
          </ul>
        )}
      </AeSection>
    </div>
  )
}
