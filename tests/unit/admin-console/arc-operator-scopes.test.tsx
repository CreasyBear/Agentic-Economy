/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { ExceptionFilterChips } from '@/components/ae/admin/exceptions/components/ExceptionFilterChips'
import { ProviderFilterChips } from '@/components/ae/admin/providers-list/components/ProviderFilterChips'
import type { AdminExceptionsReadyState } from '@/components/ae/admin/exceptions/exceptions.contracts'

afterEach(cleanup)

describe('Arc operator scope controls', () => {
  it('distinguishes incomplete, unknown and zero queue counts while preserving keyboard selection', () => {
    const onSelect = vi.fn()
    const overview: AdminExceptionsReadyState['overview'] = [
      { kind: 'uncertain_call', partition: 'reconciliation_required', observed: 2, complete: false, unavailable: false },
      { kind: 'removal_dispute', partition: 'opened', observed: 1, complete: true, unavailable: false },
      { kind: 'removal_dispute', partition: 'updated', observed: 2, complete: true, unavailable: false },
      { kind: 'removal_dispute', partition: 'contested', observed: 3, complete: true, unavailable: false },
    ]
    const { rerender } = render(<ExceptionFilterChips selected="uncertain_call" selectedPartition="reconciliation_required" overview={overview} onSelect={onSelect} />)
    const scope = screen.getByRole('group', { name: 'Exception queues' })
    const uncertain = within(scope).getByRole('button', { name: 'Uncertain Calls (≥2)' })
    expect(uncertain.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('All states (≥2)')).toBeTruthy()
    expect(within(scope).getByRole('button', { name: 'Source authority reviews (Unavailable)' })).toBeTruthy()
    uncertain.focus()

    fireEvent.keyDown(uncertain, { key: 'ArrowRight' })
    expect(onSelect).toHaveBeenCalledOnce()
    expect(onSelect).toHaveBeenCalledWith('removal_dispute')
    rerender(<ExceptionFilterChips selected="removal_dispute" selectedPartition="opened" overview={overview} onSelect={onSelect} />)
    const removal = within(scope).getByRole('button', { name: 'Removal disputes (1)' })
    expect(removal.getAttribute('aria-pressed')).toBe('true')
    expect(document.activeElement).toBe(removal)
    expect(within(scope).getAllByRole('button').filter((button) => button.tabIndex === 0)).toEqual([removal])
    expect(screen.getByText('All states (6)')).toBeTruthy()

    rerender(<ExceptionFilterChips selected="uncertain_call" selectedPartition="reconciliation_required" overview={[
      { kind: 'uncertain_call', partition: 'reconciliation_required', observed: 0, complete: true, unavailable: false },
    ]} onSelect={onSelect} />)
    expect(within(scope).getByRole('button', { name: 'Uncertain Calls (0)' })).toBeTruthy()
    expect(within(scope).getByRole('button', { name: 'Source authority reviews (Unavailable)' })).toBeTruthy()
  })

  it('keeps the provider suppression and clear callbacks and announces the current scope', () => {
    const onChange = vi.fn()
    const { rerender } = render(<ProviderFilterChips filter="suppressed" onChange={onChange} />)
    expect(screen.getByRole('button', { name: 'Suppressed' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(onChange).toHaveBeenLastCalledWith('all')

    rerender(<ProviderFilterChips filter="all" onChange={onChange} />)
    expect(screen.queryByRole('button', { name: 'Clear all' })).toBeNull()
    const suppressed = screen.getByRole('button', { name: 'Suppressed' })
    expect(suppressed.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(suppressed)
    expect(onChange).toHaveBeenLastCalledWith('suppressed')
  })
})
