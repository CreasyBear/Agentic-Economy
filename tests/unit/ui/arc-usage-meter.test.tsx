/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import '../../setup/jsdom-platform'
import { AeApproximateQuotaMeter } from '@/components/ae/shared/usage-meter/AeApproximateQuotaMeter'
import { UsageMeter } from '@/components/arc/usage-meter/usage-meter'
import { SpendingMonthlyQuotaGauge } from '@/components/ae/console/spending-limits-form/components/SpendingMonthlyQuotaGauge'
import { monthlyQuotaGaugeFromFacts } from '@/modules/agent-access/spending-policy.view-model'

afterEach(cleanup)

describe('Arc UsageMeter dense allowance presentation', () => {
  it.each([
    ['under', 'ok', 'Under the limit.'],
    ['at', 'near', 'At the limit.'],
    ['over', 'over', 'Over the limit.'],
  ] as const)('keeps exact %s state when geometry rounds to 100', (limitState, status, stateText) => {
    const summary = `A$100.00 / A$100.00. ${stateText}`
    render(<AeApproximateQuotaMeter label="Monthly allowance" summary={summary} percentage={100} limitState={limitState} />)
    const meter = screen.getByRole('img', { name: summary })
    expect(meter).toHaveAttribute('data-status', status)
    expect(meter).toHaveAttribute('data-density', 'compact')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
    expect(screen.queryByText('Monthly allowance')).not.toBeInTheDocument()
  })

  it('retains the full stock headline, category controls and allowance summary', () => {
    render(<UsageMeter label="Workspace storage" unit="GB" limit={50}
      segments={[{ id: 'files', label: 'Files', value: 20 }, { id: 'media', label: 'Media', value: 10 }]} />)
    const meter = screen.getByRole('group', { name: 'Workspace storage' })
    expect(meter).not.toHaveAttribute('data-density')
    expect(within(meter).getByRole('img')).toHaveAccessibleName(/Workspace storage: 30.0 GB of 50 GB used/)
    expect(within(meter).getByRole('button', { name: 'Files, 20.0 GB' })).toBeInTheDocument()
    expect(within(meter).getByRole('button', { name: 'Media, 10.0 GB' })).toBeInTheDocument()
    expect(within(meter).getByRole('button', { name: 'Free, 20.0 GB' })).toBeInTheDocument()
  })

  it('renders the spending gauge with exact money facts and allowance semantics', () => {
    const quota = monthlyQuotaGaugeFromFacts({ isPaused: false, monthlySpendCoverage: 'complete',
      agentMonthlyLimit: { currency: 'AUD', units: '100000000', exponent: 6 },
      monthlySettledSpend: { currency: 'AUD', units: '1250', exponent: 2 } })
    render(<SpendingMonthlyQuotaGauge {...quota} />)
    expect(screen.getByText('Monthly settled: A$12.50 / A$100.00 (12.5%)')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Monthly settled A$12.50 of A$100.00, 12.5 percent. Under the limit.' })).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it.each([
    { isPaused: true },
    { isPaused: false },
    { isPaused: false, monthlySpendCoverage: 'incomplete' as const,
      agentMonthlyLimit: { currency: 'AUD', units: '100000000', exponent: 6 } },
    { isPaused: false, monthlySpendCoverage: 'complete' as const,
      agentMonthlyLimit: { currency: 'AUD', units: '0', exponent: 6 },
      monthlySettledSpend: { currency: 'AUD', units: '1', exponent: 6 } },
  ])('keeps unmeasurable quota facts visible without a zero-usage picture (%j)', facts => {
    const quota = monthlyQuotaGaugeFromFacts(facts)
    render(<SpendingMonthlyQuotaGauge {...quota} />)
    expect(screen.getByText(quota.label)).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })
})
