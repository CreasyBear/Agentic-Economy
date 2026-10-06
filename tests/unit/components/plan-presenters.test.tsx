/** @vitest-environment jsdom */
import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlanConfirmation } from '@/components/ae/plans/plan-confirmation/PlanConfirmation'
import { PlanReceipt } from '@/components/ae/plans/plan-receipt/PlanReceipt'
import { mapPlanQuoteResult, mapPlanProgress } from '@/modules/capability-execution/plan.view-model'
import { planQuoteResultSchema, parsePlan } from '@/modules/capability-execution/plan/parse'
import { planGetResultSchema } from '@/modules/capability-execution/plan/runtime.schemas'

vi.mock('@tanstack/react-router', () => ({ Link: ({ children, params }: { children: ReactNode; params: { callRef: string } }) => <a href={`/calls/${params.callRef}`}>{children}</a> }))
afterEach(cleanup)
const toolRef = `operation:v1:${'a'.repeat(64)}`
const quote = planQuoteResultSchema.parse({ kind: 'quoted', planRef: 'plan:ui', planDigest: 'sha256:ui',
  nodes: [{ nodeId: 'lookup', toolRef, inputMode: 'literal', priceClass: 'unknown', pricingDigest: 'sha256:price', ceilingAudUnits: '1234567', rateToleranceBps: 50, validation: 'typed', dependsOn: [] }],
  stages: [['lookup']], approvedTotalAudUnits: '1234567', currency: 'AUD', exponent: 6, expiresAt: 2000, dataFlows: [] })
const parsed = parsePlan({ nodes: [{ id: 'lookup', toolRef, input: { request: '<script>private input</script>' }, dependsOn: [] }] })
if ('kind' in parsed) throw new Error('invalid fixture')

describe('Plan approval and receipt presentation', () => {
  it('shows exact exposure, Provider and frozen input, then submits the displayed amount', () => {
    const onApprove = vi.fn()
    const onDeny = vi.fn()
    render(<PlanConfirmation view={mapPlanQuoteResult(quote, 1000, { lookup: 'provider.example' }, parsed)} onApprove={onApprove} onDeny={onDeny} />)
    expect(screen.getAllByText(/1\.234567/).length).toBeGreaterThan(0)
    expect(screen.getByText(/provider\.example/)).toBeTruthy()
    expect(screen.getByText('0.5% FX allowance included in this maximum')).toBeTruthy()
    expect(screen.getByText(/private input/).tagName).toBe('PRE')
    expect(document.querySelector('script')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Approve Plan' }))
    expect(onApprove).toHaveBeenCalledWith('plan:ui', '1234567')
    fireEvent.click(screen.getByRole('button', { name: 'Decline Plan' }))
    expect(onDeny).toHaveBeenCalledWith('plan:ui')
  })

  it('disables expired approval while retaining the decline action', () => {
    const onApprove = vi.fn()
    render(<PlanConfirmation view={mapPlanQuoteResult(quote, 2000)} onApprove={onApprove} onDeny={() => {}} />)
    const button = screen.getByRole('button', { name: 'Quote expired' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    fireEvent.click(button)
    expect(onApprove).not.toHaveBeenCalled()
    expect((screen.getByRole('button', { name: 'Decline Plan' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('preserves uncertain money and an escaped usable result with its ordinary Call receipt', () => {
    const progress = planGetResultSchema.parse({ kind: 'available', planRef: 'plan:ui', planDigest: 'sha256:ui', state: 'reconciliation_required',
      approvedTotalAudUnits: '1234567', currency: 'AUD', exponent: 6, expiresAt: 2000, runDeadlineAt: 3000,
      stages: [['lookup']], maximumConcurrentNodes: 1, dataFlows: [],
      nodes: [{ nodeId: 'lookup', toolRef, providerHost: 'provider.example', state: 'succeeded', dependsOn: [], ceilingAudUnits: '1234567', callRef: 'call:ui',
        result: { kind: 'completed', callRef: 'call:ui', toolRef, evidenceHash: 'evidence:ui', output: { value: '<img src=x onerror=alert(1)>' },
          usage: { usageRef: 'usage:ui', observedAt: 2, chargeState: 'paid', amount: { currency: 'AUD', exponent: 6, units: '1000000' }, priceDigest: 'price:ui' } } }],
      hold: { status: 'uncertain', settledAudUnits: '1000000', releasedAudUnits: '0' } })
    if (progress.kind !== 'available') throw new Error('invalid progress')
    const view = mapPlanProgress(progress, [])
    render(<PlanReceipt view={view} />)
    expect(screen.getByText('Unconfirmed')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('do not establish that the remaining Hold was released')
    expect(screen.getByRole('link', { name: 'Open this Call’s receipt' }).getAttribute('href')).toBe('/calls/call:ui')
    expect(document.querySelector('img')).toBeNull()
    expect(screen.getByText(/onerror=alert/).tagName).toBe('PRE')
  })
})
