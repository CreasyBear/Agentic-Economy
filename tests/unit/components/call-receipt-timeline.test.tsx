/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { CallReceiptTimeline } from '@/components/ae/call-receipt/CallReceiptTimeline'
import { AeStatusStepper } from '@/components/ae/shared/status-stepper/AeStatusStepper'
import type { CallReceiptStageView } from '@/modules/capability-execution/call-receipt-view'

afterEach(cleanup)

const stages: readonly CallReceiptStageView[] = [
  { id: 'authorized', label: 'Authorized', state: 'complete', detail: 'Authority was recorded.' },
  { id: 'reserved', label: 'Reserved', state: 'current', detail: 'Reservation is still unresolved.' },
  { id: 'submitted', label: 'Submitted', state: 'complete', detail: 'A provider attempt is recorded.' },
  { id: 'settled', label: 'Settled', state: 'attention', detail: 'Payment outcome is uncertain.' },
  { id: 'validated', label: 'Validated', state: 'pending', detail: 'No delivery validation is recorded.' },
  { id: 'complete', label: 'Complete', state: 'pending', detail: 'Purchase resolution is pending.' },
]

describe('Recorded Call stages in Arc Stepper', () => {
  it('never declares unresolved explicit stages complete from the fallback index', () => {
    render(<AeStatusStepper
      steps={[{ id: 'unobserved', label: 'Unobserved stage', status: 'upcoming', statusLabel: 'Pending observation' }]}
      current={1}
      label="Recorded progress"
      completeLabel="Every stage is complete"
    />)
    const group = screen.getByRole('group', { name: 'Recorded progress' })
    expect(group.textContent).not.toContain('Every stage is complete')
    expect(group.textContent).toContain('0 of 1 steps complete')
    expect(group.querySelector('[aria-current="step"]')).toBeNull()
  })

  it('preserves independent stage states, details and order without inferring sequential completion', () => {
    render(<CallReceiptTimeline stages={stages} />)
    expect(screen.getByRole('region', { name: 'What happened' })).toBeTruthy()
    const group = screen.getByRole('group', { name: 'Recorded call stages' })
    const items = within(group).getAllByRole('listitem')
    expect(items).toHaveLength(stages.length)
    expect(items.map(item => item.getAttribute('data-status')))
      .toEqual(['complete', 'current', 'complete', 'error', 'upcoming', 'upcoming'])
    stages.forEach((stage, index) => {
      const item = items[index]!
      expect(within(item).getByText(stage.label)).toBeTruthy()
      expect(within(item).getByText(stage.detail)).toBeTruthy()
      expect(item.textContent).toContain(`Stage state: ${stage.state.charAt(0).toUpperCase()}${stage.state.slice(1)}`)
    })
    expect(group.querySelectorAll('[aria-current="step"]')).toHaveLength(1)
    expect(group.querySelector('[aria-current="step"]')?.textContent).toContain('Reserved')
    expect(within(group).queryByText('All steps complete')).toBeNull()
    expect(within(group).queryByRole('button')).toBeNull()
    expect(within(group).getByText('Recorded progress for this exact call')).toBeTruthy()
  })

  it('retains source-unavailable pending states and updates only the supplied observations', () => {
    const pending = stages.map(stage => ({ ...stage, state: 'pending' as const, detail: 'Receipt source unavailable.' }))
    const view = render(<CallReceiptTimeline stages={pending} />)
    const group = screen.getByRole('group', { name: 'Recorded call stages' })
    expect(within(group).getAllByRole('listitem').every(item => item.getAttribute('data-status') === 'upcoming')).toBe(true)
    expect(group.querySelector('[aria-current="step"]')).toBeNull()
    expect(within(group).getAllByText('Receipt source unavailable.')).toHaveLength(6)
    view.rerender(<CallReceiptTimeline stages={stages} />)
    expect(within(group).getAllByRole('listitem').map(item => item.getAttribute('data-status')))
      .toEqual(['complete', 'current', 'complete', 'error', 'upcoming', 'upcoming'])
    expect(group.textContent).not.toContain('Stage state: Error')
  })
})
