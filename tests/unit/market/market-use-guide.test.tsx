/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MarketUseGuide } from '@/components/ae/market/MarketUseGuide'
vi.mock('@/lib/observability/product-journey', () => ({ recordProductJourney: vi.fn() }))
afterEach(cleanup)
describe('optional human and agent guidance', () => {
  it('lets the user open installed disclosure controls and keeps both guides available', () => {
    render(<MarketUseGuide />)
    const trigger = screen.getByRole('button', { name: 'How Aecon works' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText(/price and expected result/)).toBeTruthy()
    expect(screen.getByText(/check that original Call before retrying/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Agent playbook' }).getAttribute('href')).toBe('/SKILL.md')
    expect(screen.getByRole('link', { name: 'Connect your Agent' }).getAttribute('href')).toBe('/for-agents')
  })
})
