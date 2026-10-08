// @vitest-environment jsdom

import { renderWithRouter } from './supply-funnel-harness'
import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AeSupplyLanding } from '@/components/ae/supply/AeSupplyLanding'

describe('supply landing', () => {
  it('explains supported Provider setup without requiring catalogue data', () => {
    renderWithRouter(<AeSupplyLanding />)
    expect(screen.getByRole('heading', { level: 1, name: /Put your API\s+on the market/ })).toBeDefined()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Add Tool' }).getAttribute('href')).toBe('/owner/operations/new')
    expect(screen.getByRole('link', { name: 'See how it works' }).getAttribute('href')).toBe('#provider-setup')
    expect(screen.getByText('For public x402 v2 endpoints on Base USDC.')).toBeDefined()
    expect(screen.getByRole('complementary', { name: 'What your endpoint needs' })).toBeDefined()
    expect(screen.getByText(/Never paste a private key/)).toBeDefined()
    expect(screen.getByText(/consume quota or incur cost/)).toBeDefined()
    expect(screen.getByText(/does not publish the Tool, create earnings, or guarantee delivery/)).toBeDefined()
    const steps = screen.getByRole('list', { name: 'Steps to add a Tool' })
    expect(within(steps).getAllByRole('listitem')).toHaveLength(3)
    expect(within(steps).queryByRole('tablist')).toBeNull()
    expect(steps.querySelector('[data-state="completed"], [aria-current]')).toBeNull()
    expect(screen.getByRole('link', { name: 'Browse the directory' }).getAttribute('href')).toBe('/market?view=tools')
    expect(screen.queryByText(/No Tools are published yet|Be the first provider|Ready now/)).toBeNull()
  })

  it('explains costs and the limit of publication through the installed FAQ', () => {
    renderWithRouter(<AeSupplyLanding />)
    const question = screen.getByRole('button', { name: 'Does publication guarantee purchases or payouts?' })
    fireEvent.click(question)
    expect(question.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText(/does not guarantee demand, payment, delivery or payout/)).toBeDefined()
    expect(screen.getByRole('link', { name: 'Add Tool' })).toBeDefined()
  })
})
