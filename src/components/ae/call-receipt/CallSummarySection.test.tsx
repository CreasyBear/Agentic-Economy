/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { projectCallReceipt, type CallReceiptView } from '@/modules/capability-execution/call-receipt-view'
import type { FoundCallStatus } from '@/lib/call-recovery/call-status-page-types'
import type { CallReceipt, CallUsageSummary } from '@/modules/capability-execution/call-contracts'
import type { PurchaseResolutionRecord } from '@/modules/capability-execution/purchase-resolution'
import { CallMoneyFacts } from './CallMoneyFacts'
import { CallSummarySection } from './CallSummarySection'

afterEach(cleanup)

const aud = (units: string) => ({ currency: 'AUD', units, exponent: 6 })

function paidReceipt(): CallReceipt {
  return {
    commercialModel: 'account_aud', receiptRef: 'receipt:paid', state: 'settled',
    buyerCharge: aud('1444'), serviceFee: aud('0'), totalBuyerCharge: aud('1444'),
    providerObligation: {
      amount: { currency: 'USDC', units: '1000', exponent: 6 },
      settlementMethod: 'managed_x402', payoutEligible: false,
    },
    providerSettlement: {
      network: 'eip155:8453', asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      amount: { currency: 'USDC', units: '1000', exponent: 6 },
    },
    priceDigest: 'sha256:paid-price', evidenceHash: 'sha256:paid-evidence',
    issuedAt: '2026-10-04T00:00:00.000Z', refundState: 'not_applicable', lossState: 'none',
  }
}

function purchaseResolution(overrides: Partial<PurchaseResolutionRecord> = {}): PurchaseResolutionRecord {
  return {
    resolutionRef: 'resolution:paid', recordDigest: `sha256:${'a'.repeat(64)}`,
    callRef: 'call:v1:trace', quoteRef: 'quote:paid', accountRef: 'account:buyer',
    customerRef: 'customer:buyer', agentPrincipalRef: 'agent:buyer',
    sellerRef: 'seller:ae', providerRef: 'provider:weather', paymentRecipientRef: 'recipient:weather',
    terminalState: 'completed', deliveryState: 'delivered', paymentState: 'settled',
    considerationAmount: aud('0'), considerationNetUnits: '0', considerationGstUnits: '0',
    providerObligationAmount: { currency: 'USDC', units: '1000', exponent: 6 },
    resolvedAt: 1_800_000_000_000,
    ...overrides,
  }
}

function paidView(overrides: Partial<CallReceiptView> = {}): CallReceiptView {
  return {
    version: 'ae.public-invocation-receipt:v1', callRef: 'call:v1:trace',
    statusLabel: 'Settled', statusDetail: '', stages: [], complete: true,
    receipt: paidReceipt(), purchaseResolution: purchaseResolution(),
    usage: { usageRef: 'usage:v1:trace', observedAt: 1000, chargeState: 'paid',
      amount: aud('0'), priceDigest: 'sha256:paid-price' },
    ...overrides,
  }
}

function foundStatus(view: CallReceiptView): FoundCallStatus {
  return {
    kind: 'found', callRef: view.callRef, toolRef: 'tool:v1:weather', version: 1, state: 'terminal',
    ...(view.purchaseResolution === undefined ? {} : { purchaseResolution: view.purchaseResolution }),
  }
}

describe('Call receipt object continuity', () => {
  it.each(['authorized', 'reconciliation_required', 'terminal'] as const)('keeps the canonical Tool link for %s Calls without guessing a Provider', (state) => {
    const result: FoundCallStatus = { kind: 'found', callRef: 'call:v1:trace', toolRef: 'tool:v1:weather', version: 1, state }
    render(<CallSummarySection result={result} receiptView={projectCallReceipt(result)} />)
    expect(screen.getByRole('region', { name: 'Call outcome' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View Tool' })).toHaveAttribute('href', '/tools/tool%3Av1%3Aweather')
    expect(screen.queryByRole('link', { name: /Provider|Host/ })).not.toBeInTheDocument()
    expect(screen.getByText('No verified Provider or directory Host link is recorded for this Call.')).toBeInTheDocument()
  })
})

describe('Posted Call money', () => {
  it('shows the settled buyer receipt as Charged despite zero consideration and legacy usage', () => {
    const view = paidView()
    render(<CallSummarySection result={foundStatus(view)} receiptView={view} />)
    expect(screen.getByText('Charged')).toBeInTheDocument()
    expect(screen.getByText('A$0.01')).toBeInTheDocument()
    expect(screen.getByText('AUD 0.001444')).toBeInTheDocument()
    expect(screen.queryByText('AUD 0.000000')).not.toBeInTheDocument()
  })

  it('uses the same settled buyer receipt for the post-call charge and exact amount', () => {
    render(<CallMoneyFacts view={paidView()} />)
    const group = screen.getByRole('heading', { name: 'After' }).parentElement
    if (group === null) throw new Error('post_call_money_group_missing')
    expect(within(group).getByText('A$0.01')).toBeInTheDocument()
    expect(within(group).getByText('AUD 0.001444')).toBeInTheDocument()
    expect(within(group).queryByText('AUD 0.000000')).not.toBeInTheDocument()
  })

  it('includes the recorded service fee rather than displaying only the base buyer charge', () => {
    const receipt = { ...paidReceipt(), serviceFee: aud('20000'), totalBuyerCharge: aud('21444') }
    const view = paidView({ receipt })
    render(<><CallSummarySection result={foundStatus(view)} receiptView={view} /><CallMoneyFacts view={view} /></>)
    const summary = screen.getByRole('region', { name: 'Call summary' })
    expect(within(summary).getByText('A$0.03')).toBeInTheDocument()
    expect(within(summary).getByText('AUD 0.021444')).toBeInTheDocument()
    const group = screen.getByRole('heading', { name: 'After' }).parentElement
    if (group === null) throw new Error('post_call_money_group_missing')
    expect(within(group).getByText('AUD 0.021444')).toBeInTheDocument()
  })

  it('preserves a genuine zero settled total even when legacy usage records a nonzero amount', () => {
    const receipt = { ...paidReceipt(), buyerCharge: aud('0'), totalBuyerCharge: aud('0') }
    const view = paidView({ receipt, usage: { ...paidView().usage!, amount: aud('1444') } })
    render(<><CallSummarySection result={foundStatus(view)} receiptView={view} /><CallMoneyFacts view={view} /></>)
    const summary = screen.getByRole('region', { name: 'Call summary' })
    expect(within(summary).getByText('A$0.00')).toBeInTheDocument()
    expect(within(summary).getByText('AUD 0.000000')).toBeInTheDocument()
    const group = screen.getByRole('heading', { name: 'After' }).parentElement
    if (group === null) throw new Error('post_call_money_group_missing')
    expect(within(group).getByText('AUD 0.000000')).toBeInTheDocument()
  })

  it('retains the recorded resolution amount when paid usage is absent', () => {
    const { usage, ...view } = paidView({ purchaseResolution: purchaseResolution({ considerationAmount: aud('1403') }) })
    expect(usage).toBeDefined()
    render(<><CallSummarySection result={foundStatus(view)} receiptView={view} /><CallMoneyFacts view={view} /></>)
    expect(within(screen.getByRole('region', { name: 'Call summary' })).getByText('AUD 0.001403')).toBeInTheDocument()
    const group = screen.getByRole('heading', { name: 'After' }).parentElement
    if (group === null) throw new Error('post_call_money_group_missing')
    expect(within(group).queryByText('AUD 0.001444')).not.toBeInTheDocument()
    expect(within(group).getByText('Settled')).toBeInTheDocument()
  })

  it('does not replace a disputed purchase resolution with a Charged total', () => {
    const view = paidView({ purchaseResolution: purchaseResolution({ terminalState: 'disputed', considerationAmount: aud('1403') }) })
    render(<CallSummarySection result={foundStatus(view)} receiptView={view} />)
    expect(screen.getByText('AUD 0.001403')).toBeInTheDocument()
    expect(screen.queryByText('AUD 0.001444')).not.toBeInTheDocument()
    expect(screen.queryByText('Charged')).not.toBeInTheDocument()
  })

  it.each(['refunded', 'released'] as const)('preserves the %s resolution amount instead of calling the receipt a new charge', (terminalState) => {
    const view = paidView({ purchaseResolution: purchaseResolution({ terminalState, considerationAmount: aud('1403') }) })
    render(<CallSummarySection result={foundStatus(view)} receiptView={view} />)
    expect(screen.getByText('AUD 0.001403')).toBeInTheDocument()
    expect(screen.queryByText('AUD 0.001444')).not.toBeInTheDocument()
  })

  it.each(['free_tier', 'outcome_unknown'] as const)('does not substitute a paid charge for %s usage', (chargeState) => {
    const usage: CallUsageSummary = { usageRef: 'usage:v1:trace', observedAt: 1000, chargeState,
      amount: aud('0'), priceDigest: 'sha256:paid-price' }
    render(<CallMoneyFacts view={paidView({ usage })} />)
    const group = screen.getByRole('heading', { name: 'After' }).parentElement
    if (group === null) throw new Error('post_call_money_group_missing')
    expect(within(group).getByText('AUD 0.000000')).toBeInTheDocument()
    expect(within(group).queryByText('AUD 0.001444')).not.toBeInTheDocument()
  })

  it.each(['refunded', 'reconciliation_required'] as const)('does not replace a %s receipt with a confirmed buyer charge', (state) => {
    const receipt = { ...paidReceipt(), state }
    render(<CallMoneyFacts view={paidView({ receipt })} />)
    const group = screen.getByRole('heading', { name: 'After' }).parentElement
    if (group === null) throw new Error('post_call_money_group_missing')
    expect(within(group).getByText('AUD 0.000000')).toBeInTheDocument()
  })

  it('shows the rounded buyer charge alongside the exact recorded amount', () => {
    const view: CallReceiptView = {
      version: 'ae.public-invocation-receipt:v1', callRef: 'call:v1:trace',
      statusLabel: 'Settled', statusDetail: '', stages: [], complete: true,
      usage: {
        usageRef: 'usage:v1:trace', observedAt: 1000, chargeState: 'paid',
        amount: { currency: 'AUD', exponent: 6, units: '1' }, priceDigest: 'price:v1:trace',
      },
    }
    render(<CallMoneyFacts view={view} />)
    expect(screen.getByText('A$0.01')).toBeInTheDocument()
    expect(screen.getByText('AUD 0.000001')).toBeInTheDocument()
  })
})
