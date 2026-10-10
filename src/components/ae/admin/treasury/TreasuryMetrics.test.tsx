/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import '../../../../../tests/setup/jsdom-platform'
import { TreasuryMetrics } from './TreasuryMetrics'
import { treasuryTestView, TEST_NOW } from './treasury-test-fixture'

const originalObserver = Object.getOwnPropertyDescriptor(globalThis, 'IntersectionObserver')
beforeAll(() => {
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} })
})
afterAll(() => {
  if (originalObserver === undefined) Reflect.deleteProperty(globalThis, 'IntersectionObserver')
  else Object.defineProperty(globalThis, 'IntersectionObserver', originalObserver)
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })
describe('treasury source and reconciliation rendering', () => {
  it('does not declare zero raw difference reconciled without complete cash proof', () => {
    vi.spyOn(Date, 'now').mockReturnValue(TEST_NOW)
    const view = treasuryTestView()
    view.snapshot!.checks.cash = { kind: 'unavailable', code: 'incomplete_evidence' }
    render(<TreasuryMetrics view={view} />)
    expect(screen.queryByText('Cash reconciled')).toBeNull()
    expect(screen.getByText('Cash unavailable')).toBeTruthy()
    expect(screen.getByText('Raw difference before timing adjustment')).toBeTruthy()
    expect(screen.getByText('Latest CDP wallet observation:', { exact: false })).toBeTruthy()
    expect(screen.getByText('Native ledger snapshot:', { exact: false })).toBeTruthy()
    expect(screen.getByText('Finalized block:', { exact: false })).toBeTruthy()
  })
  it('keeps chain and CDP balances when ledger is unavailable', () => {
    const view = treasuryTestView()
    view.snapshot!.ledger = { kind: 'unavailable', code: 'fixture' }
    render(<TreasuryMetrics view={view} />)
    expect(screen.getByText('Ledger balances unavailable')).toBeTruthy()
    expect(screen.getByText('Runway unavailable')).toBeTruthy()
    expect(screen.getByText('Customer credit unavailable')).toBeTruthy()
    expect(screen.getByText('Finalized chain balance · block 123')).toBeTruthy()
    expect(screen.getAllByText('18.00 USDC')).toHaveLength(2)
  })
  it('declares cash reconciled only for a matched check and exposes both credit families', () => {
    const view = treasuryTestView()
    render(<TreasuryMetrics view={view} />)
    expect(screen.getByText('Cash reconciled')).toBeTruthy()
    expect(screen.getByText('Purchased credit · available + reserved')).toBeTruthy()
    expect(screen.getByText('Promotional credit · available + reserved')).toBeTruthy()
    expect(screen.getByText('Available USDC / credit equivalent')).toBeTruthy()
    expect(screen.getByText('1.75×')).toBeTruthy()
    expect(screen.getByText('Unresolved signing liability')).toBeTruthy()
    expect(screen.getByText('Exposure / rolling limit')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'call:test' }).getAttribute('href')).toBe('/admin/calls/call%3Atest')
  })
  it('renders an independent empty report as unavailable rather than zero', () => {
    const view = treasuryTestView()
    view.snapshot = null
    render(<TreasuryMetrics view={view} />)
    expect(screen.getByText('18.00 USDC')).toBeTruthy()
    expect(screen.getByText('Ledger balances unavailable')).toBeTruthy()
    expect(screen.getByText('Reconciliation queue unavailable')).toBeTruthy()
    expect(screen.getByText('Rolling spend exposure unavailable')).toBeTruthy()
    expect(screen.queryByText('0.00 USDC')).toBeNull()
  })
  it.each(['sandbox', 'production'] as const)('discloses exact transfer evidence and only valid %s network links', environment => {
    const view = treasuryTestView()
    view.environment = environment
    const hash = `0x${'a'.repeat(64)}`
    view.snapshot!.deposits = [
      { transactionRef: 'opening:test', amountUnits: '2000000', bookedAt: TEST_NOW, chainTransactionHash: null },
      { transactionRef: 'deposit:test', amountUnits: '3000000', bookedAt: TEST_NOW, chainTransactionHash: hash },
      { transactionRef: 'malformed:test', amountUnits: '4000000', bookedAt: TEST_NOW, chainTransactionHash: 'https://untrusted.example' },
    ]
    view.snapshot!.depositsComplete = false
    render(<TreasuryMetrics view={view} />)
    const refills = screen.getByRole('table', { name: 'Recent booked refills' })
    expect(within(refills).getByText('Opening balance')).toBeTruthy()
    expect(within(refills).getByText('2.000000')).toBeTruthy()
    const disclosure = within(refills).getAllByText('Transfer details')[1]!
    expect(disclosure.closest('details')!.hasAttribute('open')).toBe(false)
    fireEvent.click(disclosure)
    expect(disclosure.closest('details')!.hasAttribute('open')).toBe(true)
    const links = screen.getAllByRole('link', { name: /View transfer/ })
    expect(links).toHaveLength(1)
    expect(links[0]!.getAttribute('href')).toBe(`https://${environment === 'production' ? 'basescan.org' : 'sepolia.basescan.org'}/tx/${hash}`)
    expect(links[0]!.getAttribute('rel')).toBe('noopener noreferrer')
    expect(within(refills).getAllByText('deposit:test').length).toBeGreaterThan(0)
    expect(within(refills).getByText(hash)).toBeTruthy()
    fireEvent.click(within(refills).getAllByText('Transfer details')[2]!)
    expect(within(refills).getByText('https://untrusted.example')).toBeTruthy()
    expect(within(refills).getAllByRole('link')).toHaveLength(1)
    expect(screen.getByText('Additional booked entries are not shown here.')).toBeTruthy()
  })
  it('sorts refills by exact atomic amounts and filters by their full transfer reference', () => {
    const view = treasuryTestView()
    view.snapshot!.deposits = [
      { transactionRef: 'deposit:larger', amountUnits: '9007199254740993', bookedAt: TEST_NOW, chainTransactionHash: null },
      { transactionRef: 'deposit:smaller', amountUnits: '9007199254740992', bookedAt: TEST_NOW, chainTransactionHash: null },
    ]
    render(<TreasuryMetrics view={view} />)
    const table = screen.getByRole('table', { name: 'Recent booked refills' })
    const amounts = () => Array.from(table.querySelectorAll('tbody tr')).map(row => within(row as HTMLElement).getAllByRole('cell')[1]!.textContent)
    fireEvent.click(within(table).getByRole('button', { name: 'Sort by Amount (USDC)' }))
    expect(amounts()).toEqual(['9007199254.740992', '9007199254.740993'])
    expect(within(table).getByRole('columnheader', { name: 'Amount (USDC)' }).getAttribute('aria-sort')).toBe('ascending')
    fireEvent.click(within(table).getByRole('button', { name: 'Sort by Amount (USDC)' }))
    expect(within(table).getByRole('columnheader', { name: 'Amount (USDC)' }).getAttribute('aria-sort')).toBe('descending')
    expect(amounts()).toEqual(['9007199254.740993', '9007199254.740992'])
    fireEvent.change(screen.getByPlaceholderText('Filter booked refills'), { target: { value: 'deposit:smaller' } })
    expect(amounts()).toEqual(['9007199254.740992'])
    expect(view.snapshot!.deposits.map(row => row.transactionRef)).toEqual(['deposit:larger', 'deposit:smaller'])
  })
  it('sorts and filters unresolved Calls while retaining the full reference, detail exit and queue continuation', () => {
    const view = treasuryTestView()
    const queue = view.snapshot!.inFlight
    if (queue.kind !== 'available') throw new Error('Available test queue required')
    const longRef = `call:${'long-reference-'.repeat(8)}`
    queue.calls = [
      { callRef: longRef, amountUnits: '9007199254740993', createdAt: TEST_NOW, state: 'reconciliation_required' },
      { callRef: 'call:smaller', amountUnits: '9007199254740992', createdAt: TEST_NOW - 1000, state: 'reconciliation_required' },
    ]
    queue.listedCallsComplete = false
    render(<TreasuryMetrics view={view} />)
    const table = screen.getByRole('table', { name: 'Unresolved Calls' })
    const refs = () => within(table).getAllByRole('link').map(link => link.textContent)
    fireEvent.click(within(table).getByRole('button', { name: 'Sort by Amount (USDC)' }))
    expect(refs()).toEqual(['call:smaller', longRef])
    expect(within(table).getByRole('columnheader', { name: 'Amount (USDC)' }).getAttribute('aria-sort')).toBe('ascending')
    fireEvent.click(within(table).getByRole('button', { name: 'Sort by Amount (USDC)' }))
    expect(within(table).getByRole('columnheader', { name: 'Amount (USDC)' }).getAttribute('aria-sort')).toBe('descending')
    expect(refs()).toEqual([longRef, 'call:smaller'])
    const detail = within(table).getByRole('link', { name: longRef })
    expect(detail.getAttribute('title')).toBe(longRef)
    expect(detail.getAttribute('href')).toBe(`/admin/calls/${encodeURIComponent(longRef)}`)
    fireEvent.change(screen.getByPlaceholderText('Filter unresolved Calls'), { target: { value: 'call:smaller' } })
    expect(refs()).toEqual(['call:smaller'])
    expect(screen.getByRole('link', { name: 'More Calls remain. Open the reconciliation queue.' }).getAttribute('href')).toBe('/admin/exceptions?kind=uncertain_call&partition=reconciliation_required')
    expect(queue.calls.map(row => row.callRef)).toEqual([longRef, 'call:smaller'])
  })
  it.each([
    ['9007199254740992', 'under', 'ok'],
    ['9007199254740993', 'at', 'near'],
    ['9007199254740994', 'over', 'over'],
  ] as const)('keeps exact %s exposure in the %s limit state despite percentage rounding', (settledUnits, limitState, status) => {
    const view = treasuryTestView()
    view.snapshot!.spending = { kind: 'available', observedAt: TEST_NOW, windowStartsAt: TEST_NOW - 86400000,
      settledUnits, liabilityUnits: '0', maximumUnits: '9007199254740993' }
    render(<TreasuryMetrics view={view} />)
    const meter = screen.getByRole('group', { name: 'Rolling spend exposure against limit' })
    expect(meter.getAttribute('data-status')).toBe(status)
    expect(within(meter).queryByText('Over limit') !== null).toBe(limitState === 'over')
    expect(within(meter).queryByText('Limit reached') !== null).toBe(limitState === 'at')
    if (limitState === 'over') expect(within(meter).getByRole('img').getAttribute('aria-label')).toContain('Over the limit.')
    expect(screen.getByText(`${settledUnits.slice(0, -6)}.${settledUnits.slice(-6)} USDC / 9007199254.740993 USDC`)).toBeTruthy()
    expect(screen.getByText('The percentage is approximate. Exposure and limit amounts above remain exact.')).toBeTruthy()
  })
  it.each(['0', '-1'])('makes the ratio unavailable for a nonpositive limit (%s) without losing source money facts', maximumUnits => {
    const view = treasuryTestView()
    view.snapshot!.spending = { kind: 'available', observedAt: TEST_NOW, windowStartsAt: TEST_NOW - 86400000,
      settledUnits: '2000000', liabilityUnits: '3000000', maximumUnits }
    render(<TreasuryMetrics view={view} />)
    expect(screen.queryByRole('group', { name: 'Rolling spend exposure against limit' })).toBeNull()
    expect(screen.getByText('Exposure percentage unavailable')).toBeTruthy()
    expect(screen.getByText('Unresolved signing liability')).toBeTruthy()
    expect(screen.getByText('Exposure / rolling limit')).toBeTruthy()
  })
})
