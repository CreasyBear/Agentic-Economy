/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const routeState = vi.hoisted(() => ({ HomeComponent: null as (() => React.ReactNode) | null }))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: { component: () => React.ReactNode }) => {
    routeState.HomeComponent = options.component
    return options
  },
}))

vi.mock('@/components/ae/layout/AePublicShell', () => ({
  AePublicShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

import '@/routes/index'

describe('customer-first home', () => {
  afterEach(cleanup)

  it('leads with the customer promise and opens the ask workspace', () => {
    renderHomeRoute()
    expect(screen.getByRole('heading', { level: 1, name: 'Your agent knows who to call.' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Tell us what you need' }).getAttribute('href')).toBe('/engine')
    expect(screen.queryByRole('searchbox')).toBeNull()
  })

  it('explains the customer journey without exposing protocol objects', () => {
    renderHomeRoute()
    expect(screen.getByRole('heading', { name: 'Less searching. Less chasing.' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'See the best way forward' })).toBeTruthy()
    expect(screen.queryByText('Route quote')).toBeNull()
  })
})

function renderHomeRoute() {
  const HomeComponent = routeState.HomeComponent
  if (HomeComponent === null) throw new Error('Home route component was not captured by the router mock.')
  render(<HomeComponent />)
}
