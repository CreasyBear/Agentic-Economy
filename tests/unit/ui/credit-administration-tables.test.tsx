// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { CreditAccountingPanel } from '@/components/ae/console/owner-credit/components/CreditAccountingPanel'
import {
  CreditProviderObligationRecords,
  CreditReconciliationRecords,
} from '@/components/ae/console/owner-credit/components/CreditAdministrationTables'
import type { MoneyProviderObligationView, MoneyReconciliationCaseView } from '@/lib/server/money-documents.functions'

afterEach(cleanup)

const recordedAt = Date.UTC(2026, 9, 1, 10)
const reconciliation: MoneyReconciliationCaseView = {
  caseRef: 'case:document:full-reference', accountRef: 'account:customer',
  kind: 'document_difference', status: 'open', scopeType: 'document', scopeRef: 'document:close',
  ownerPrincipalRef: 'principal:assigned-owner', transactionRef: 'transaction:reconciliation',
  reasonCode: 'render_digest_difference', evidenceRefs: ['evidence:document-digest'],
  resolutionEvidenceRefs: ['evidence:owner-review'], createdAt: recordedAt, updatedAt: recordedAt + 1_000,
}
const obligation: MoneyProviderObligationView = {
  obligationRef: 'obligation:full-reference', callRef: 'call:purchase', toolRef: 'tool:operation',
  providerRef: 'provider:original', buyerAmountUnits: '1234567', providerAmountUnits: '7654321',
  state: 'held', payoutEligibility: 'ineligible_x402', evidenceRefs: ['evidence:provider-obligation'],
  settlementTransactionRef: 'transaction:settlement', reversalState: 'outcome_unknown',
  reversalTransactionRef: 'transaction:reversal', reversalStatusRef: 'status:reversal',
  createdAt: recordedAt, updatedAt: recordedAt + 1_000,
}

function rowButtons(table: HTMLElement): string[] {
  return within(table).getAllByRole('row').slice(1)
    .map(row => within(row).getByRole('button', { name: /^Inspect /u }).getAttribute('aria-label') ?? '')
}

describe('compact reconciliation records', () => {
  it('keeps the full case evidence out of the five-column row and exposes it through the Arc drawer', async () => {
    render(<CreditReconciliationRecords rows={[reconciliation]} />)
    const table = screen.getByRole('table', { name: 'Reconciliation cases' })
    expect(within(table).getAllByRole('columnheader')).toHaveLength(5)
    expect(within(within(table).getAllByRole('row')[1]!).getAllByRole('cell').map(cell => cell.getAttribute('data-label')))
      .toEqual(['Difference', 'Affected scope', 'Status', 'Updated', 'Inspect'])
    expect(within(table).getAllByRole('row')).toHaveLength(2)
    expect(within(table).queryByText(reconciliation.caseRef)).toBeNull()
    expect(within(table).queryByText(reconciliation.ownerPrincipalRef!)).toBeNull()
    fireEvent.click(within(table).getByRole('button', { name: `Inspect reconciliation case ${reconciliation.caseRef}` }))
    const details = await screen.findByRole('dialog', { name: 'Reconciliation case' })
    for (const value of [reconciliation.caseRef, reconciliation.accountRef,
      reconciliation.ownerPrincipalRef!, reconciliation.transactionRef!, ...reconciliation.evidenceRefs,
      ...reconciliation.resolutionEvidenceRefs!]) {
      expect(within(details).getByText(value)).toBeTruthy()
    }
    expect(within(details).getByText('render digest difference')).toBeTruthy()
    expect(within(details).queryByRole('button', { name: /resolve|pay|retry/iu })).toBeNull()
  })

  it('filters using full detail evidence and restores all records with the Arc clear control', () => {
    const other = { ...reconciliation, caseRef: 'case:other', evidenceRefs: ['evidence:other'] }
    render(<CreditReconciliationRecords rows={[reconciliation, other]} />)
    const table = screen.getByRole('table', { name: 'Reconciliation cases' })
    const filter = screen.getByRole('searchbox', { name: 'Filter reconciliation cases…' })
    fireEvent.change(filter, { target: { value: 'DOCUMENT-DIGEST' } })
    expect(rowButtons(table)).toEqual([`Inspect reconciliation case ${reconciliation.caseRef}`])
    fireEvent.change(filter, { target: { value: 'not-on-any-case' } })
    expect(within(table).getAllByRole('row')).toHaveLength(2)
    expect(within(table).queryByRole('button', { name: /^Inspect /u })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filter' }))
    expect(rowButtons(table)).toHaveLength(2)
  })

  it('preserves server order initially and sorts numeric update timestamps in both directions', () => {
    const older = { ...reconciliation, caseRef: 'case:older', updatedAt: recordedAt }
    render(<CreditReconciliationRecords rows={[reconciliation, older]} />)
    const table = screen.getByRole('table', { name: 'Reconciliation cases' })
    expect(rowButtons(table)).toEqual([`Inspect reconciliation case ${reconciliation.caseRef}`, 'Inspect reconciliation case case:older'])
    fireEvent.click(within(within(table).getByRole('columnheader', { name: 'Updated' })).getByRole('button'))
    expect(rowButtons(table)[0]).toBe('Inspect reconciliation case case:older')
    expect(within(table).getByRole('columnheader', { name: /Updated/u }).getAttribute('aria-sort')).toBe('ascending')
    fireEvent.click(within(within(table).getByRole('columnheader', { name: 'Updated' })).getByRole('button'))
    expect(rowButtons(table)[0]).toBe(`Inspect reconciliation case ${reconciliation.caseRef}`)
  })

  it('retains explicit legacy scope and absent-owner facts', async () => {
    const { scopeType: _scope, scopeRef: _ref, ownerPrincipalRef: _owner, transactionRef: _transaction, ...legacy } = reconciliation
    render(<CreditReconciliationRecords rows={[legacy]} />)
    expect(screen.getByText('Legacy Account case')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: `Inspect reconciliation case ${legacy.caseRef}` }))
    const details = await screen.findByRole('dialog')
    expect(within(details).getByText('Unassigned')).toBeTruthy()
    expect(within(details).getAllByText('Not recorded').length).toBeGreaterThan(0)
  })

  it('shows refreshed case facts, restores focus on Escape, and never reopens removed or unavailable cases', async () => {
    const { rerender } = render(<CreditReconciliationRecords rows={[reconciliation]} />)
    const name = `Inspect reconciliation case ${reconciliation.caseRef}`
    screen.getByRole('button', { name }).focus()
    fireEvent.click(screen.getByRole('button', { name }))
    await screen.findByRole('dialog')
    const refreshed = { ...reconciliation, status: 'resolved' as const, resolvedAt: recordedAt + 2_000,
      ownerPrincipalRef: 'principal:current-owner', evidenceRefs: ['evidence:current'] }
    rerender(<CreditReconciliationRecords rows={[refreshed]} />)
    let details = screen.getByRole('dialog')
    expect(within(details).getByText('principal:current-owner')).toBeTruthy()
    expect(within(details).queryByText(reconciliation.ownerPrincipalRef!)).toBeNull()
    fireEvent.keyDown(details, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name })))
    fireEvent.click(screen.getByRole('button', { name }))
    await screen.findByRole('dialog')
    rerender(<CreditReconciliationRecords rows={[]} />)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(document.activeElement?.classList.contains('arc-credit-administration-table')).toBe(true))
    rerender(<CreditReconciliationRecords rows={[refreshed]} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name }))
    details = await screen.findByRole('dialog')
    expect(within(details).getByText('evidence:current')).toBeTruthy()
    rerender(<CreditReconciliationRecords rows={[refreshed]} unavailable />)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByText('Reconciliation unavailable')).toBeTruthy()
    rerender(<CreditReconciliationRecords rows={[refreshed]} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('compact Provider obligations', () => {
  it('shows actual USDC and preserves exact buyer/token precision, distinct evidence and payout ineligibility', async () => {
    const onCreateStatement = vi.fn(), onCreateDailyClose = vi.fn(), onSignDailyClose = vi.fn(), onOpenDocument = vi.fn()
    render(<CreditAccountingPanel providerObligations={[obligation]} onCreateStatement={onCreateStatement}
      onCreateDailyClose={onCreateDailyClose} onSignDailyClose={onSignDailyClose} onOpenDocument={onOpenDocument} />)
    const table = screen.getByRole('table', { name: 'Provider obligations' })
    expect(within(table).getAllByRole('columnheader')).toHaveLength(5)
    expect(within(within(table).getAllByRole('row')[1]!).getAllByRole('cell').map(cell => cell.getAttribute('data-label')))
      .toEqual(['Provider', 'Buyer amount', 'Provider amount', 'State', 'Inspect'])
    expect(within(table).getByText('7.654321 USDC')).toBeTruthy()
    expect(within(table).queryByText('Amount unknown')).toBeNull()
    expect(within(table).queryByText(obligation.callRef)).toBeNull()
    fireEvent.click(within(table).getByRole('button', { name: `Inspect Provider obligation ${obligation.obligationRef}` }))
    const details = await screen.findByRole('dialog', { name: 'Provider obligation' })
    for (const value of [obligation.obligationRef, obligation.callRef, obligation.toolRef,
      obligation.providerRef, ...obligation.evidenceRefs, obligation.settlementTransactionRef!,
      obligation.reversalTransactionRef!, obligation.reversalStatusRef!]) {
      expect(within(details).getByText(value)).toBeTruthy()
    }
    expect(within(details).getByText('A$1.234567')).toBeTruthy()
    expect(within(details).getAllByText('7.654321 USDC').length).toBeGreaterThan(0)
    expect(within(details).getByText('Ineligible for AE payout (managed x402)')).toBeTruthy()
    expect(within(details).queryByText(/settled by x402/iu)).toBeNull()
    expect(within(details).queryByRole('button', { name: /pay|resolve|retry/iu })).toBeNull()
    for (const callback of [onCreateStatement, onCreateDailyClose, onSignDailyClose, onOpenDocument]) expect(callback).not.toHaveBeenCalled()
  })

  it.each(['Buyer amount', 'Provider amount'] as const)('sorts adjacent values beyond Number precision exactly by %s and preserves ties', (label) => {
    const high = { ...obligation, obligationRef: 'obligation:high', buyerAmountUnits: '9007199254740992000001', providerAmountUnits: '9007199254740992000001' }
    const low = { ...high, obligationRef: 'obligation:low', buyerAmountUnits: '9007199254740992000000', providerAmountUnits: '9007199254740992000000' }
    const tie = { ...low, obligationRef: 'obligation:tie' }
    expect(Number(BigInt(high.buyerAmountUnits))).toBe(Number(BigInt(low.buyerAmountUnits)))
    render(<CreditProviderObligationRecords rows={[high, low, tie]} />)
    const table = screen.getByRole('table', { name: 'Provider obligations' })
    fireEvent.click(within(within(table).getByRole('columnheader', { name: label })).getByRole('button'))
    expect(rowButtons(table)).toEqual(['Inspect Provider obligation obligation:low', 'Inspect Provider obligation obligation:tie', 'Inspect Provider obligation obligation:high'])
    fireEvent.click(within(within(table).getByRole('columnheader', { name: label })).getByRole('button'))
    expect(rowButtons(table)[0]).toBe('Inspect Provider obligation obligation:high')
  })

  it('searches the full Call/evidence and exact unit values while keeping clear recovery available', () => {
    const other = { ...obligation, obligationRef: 'obligation:other', callRef: 'call:other', evidenceRefs: ['evidence:other'], buyerAmountUnits: '2000000' }
    render(<CreditProviderObligationRecords rows={[obligation, other]} />)
    const table = screen.getByRole('table', { name: 'Provider obligations' })
    const filter = screen.getByRole('searchbox', { name: 'Filter Provider obligations…' })
    for (const needle of ['call:purchase', 'provider-obligation', '1234567']) {
      fireEvent.change(filter, { target: { value: needle } })
      expect(rowButtons(table)).toEqual([`Inspect Provider obligation ${obligation.obligationRef}`])
      fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    }
    expect(rowButtons(table)).toHaveLength(2)
  })

  it('resolves details from the newest obligation and clears selection after removal or unavailability', async () => {
    const { rerender } = render(<CreditProviderObligationRecords rows={[obligation]} />)
    const name = `Inspect Provider obligation ${obligation.obligationRef}`
    screen.getByRole('button', { name }).focus()
    fireEvent.click(screen.getByRole('button', { name }))
    await screen.findByRole('dialog')
    const refreshed = { ...obligation, state: 'settled' as const, buyerAmountUnits: '3000001',
      providerAmountUnits: '2000001', providerRef: 'provider:current', evidenceRefs: ['evidence:current'], settledAt: recordedAt + 3_000 }
    rerender(<CreditProviderObligationRecords rows={[refreshed]} />)
    const details = screen.getByRole('dialog')
    expect(within(details).getByText('provider:current')).toBeTruthy()
    expect(within(details).getByText('A$3.000001')).toBeTruthy()
    expect(within(details).queryByText('provider:original')).toBeNull()
    fireEvent.keyDown(details, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name })))
    fireEvent.click(screen.getByRole('button', { name }))
    await screen.findByRole('dialog')
    rerender(<CreditProviderObligationRecords rows={[]} />)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(document.activeElement?.classList.contains('arc-credit-administration-table')).toBe(true))
    rerender(<CreditProviderObligationRecords rows={[refreshed]} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name }))
    await screen.findByRole('dialog')
    rerender(<CreditProviderObligationRecords rows={[refreshed]} unavailable />)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByText('Provider obligations unavailable')).toBeTruthy()
    rerender(<CreditProviderObligationRecords rows={[refreshed]} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('administration source states', () => {
  it.each([
    { view: (populated: boolean, loading = false) => <CreditReconciliationRecords rows={populated ? [reconciliation] : []} loading={loading} />,
      title: 'No reconciliation differences', caption: 'Reconciliation cases' },
    { view: (populated: boolean, loading = false) => <CreditProviderObligationRecords rows={populated ? [obligation] : []} loading={loading} />,
      title: 'No Provider obligations', caption: 'Provider obligations' },
  ])('does not report empty success before $caption settles and retains rows during refresh', ({ view, title, caption }) => {
    const { rerender } = render(view(false, true))
    expect(screen.queryByText(title)).toBeNull()
    expect(screen.getByRole('table', { name: caption }).closest('[aria-busy]')?.getAttribute('aria-busy')).toBe('true')
    rerender(view(true))
    expect(screen.getByRole('table', { name: caption })).toBeTruthy()
    rerender(view(true, true))
    expect(screen.getByRole('table', { name: caption })).toBeTruthy()
    expect(screen.queryByText(title)).toBeNull()
    rerender(view(false))
    expect(screen.getByText(title)).toBeTruthy()
  })
})
