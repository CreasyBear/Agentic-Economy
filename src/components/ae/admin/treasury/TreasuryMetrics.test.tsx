/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TreasuryMetrics } from './TreasuryMetrics'
import { treasuryTestView, TEST_NOW } from './treasury-test-fixture'

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
    expect(screen.getAllByText('USDC 18.000000')).toHaveLength(2)
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
    expect(screen.getByText('USDC 18.000000')).toBeTruthy()
    expect(screen.getByText('Ledger balances unavailable')).toBeTruthy()
    expect(screen.getByText('Reconciliation queue unavailable')).toBeTruthy()
    expect(screen.getByText('Rolling spend exposure unavailable')).toBeTruthy()
    expect(screen.queryByText('USDC 0.000000')).toBeNull()
  })
  it('distinguishes opening balances and links only valid transfer hashes on the exact network', () => {
    const view = treasuryTestView()
    const hash = `0x${'a'.repeat(64)}`
    view.snapshot!.deposits = [
      { transactionRef: 'opening:test', amountUnits: '2000000', bookedAt: TEST_NOW, chainTransactionHash: null },
      { transactionRef: 'deposit:test', amountUnits: '3000000', bookedAt: TEST_NOW, chainTransactionHash: hash },
      { transactionRef: 'malformed:test', amountUnits: '4000000', bookedAt: TEST_NOW, chainTransactionHash: 'https://untrusted.example' },
    ]
    view.snapshot!.depositsComplete = false
    render(<TreasuryMetrics view={view} />)
    expect(screen.getByText('Opening balance · USDC 2.000000')).toBeTruthy()
    const links = screen.getAllByRole('link', { name: /View transfer/ })
    expect(links).toHaveLength(1)
    expect(links[0]!.getAttribute('href')).toBe(`https://sepolia.basescan.org/tx/${hash}`)
    expect(screen.getByText('Additional booked entries are not shown here.')).toBeTruthy()
  })
})
