/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlanActivity } from '@/components/ae/plans/PlanActivity'

afterEach(cleanup)
describe('Account Plan history in Call activity', () => {
  it('states its independent scope and preserves the Call filters on an exact Plan link', () => {
    render(<PlanActivity plans={[{ planRef: 'plan:review', state: 'awaiting_approval', nodeCount: 2, approvedTotalAudUnits: '12000000', createdAt: 1 }]}
      returnScope={{ returnRange: '7d', returnStatus: 'refused' }} />)
    expect(screen.getByText('Call date and status filters do not filter this Account Plan history.')).toBeInTheDocument()
    expect(screen.getByText('Maximum AUD 12.000000')).toBeInTheDocument()
    const link = new URL(screen.getByRole('link', { name: '2 Tool nodes · awaiting approval' }).getAttribute('href')!, 'https://aecon.test')
    expect(link.pathname).toBe('/plans/plan%3Areview')
    expect(link.searchParams.get('returnRange')).toBe('7d')
    expect(link.searchParams.get('returnStatus')).toBe('refused')
  })
  it('distinguishes Agent scope from unavailable Account history and offers the existing filter navigation', () => {
    const onShowAccountPlans = vi.fn()
    render(<PlanActivity plans={undefined} agentFiltered onShowAccountPlans={onShowAccountPlans} />)
    expect(screen.getByText(/Plan history is not included in an individual Agent view/u)).toBeInTheDocument()
    expect(screen.queryByText(/Plan history could not be read/u)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show Account Plans' }))
    expect(onShowAccountPlans).toHaveBeenCalledOnce()
  })
})
