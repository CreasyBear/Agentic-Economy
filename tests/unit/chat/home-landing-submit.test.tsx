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

describe('engine-first home', () => {
  afterEach(cleanup)

  it('leads into the routing workbench instead of the retired chat search', () => {
    renderHomeRoute()
    expect(screen.getByRole('heading', { level: 1, name: 'Give the job to the right endpoint.' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Route a request' }).getAttribute('href')).toBe('/engine')
    expect(screen.queryByRole('searchbox')).toBeNull()
  })

  it('makes the route quote lifecycle explicit', () => {
    renderHomeRoute()
    expect(screen.getByRole('heading', { name: 'The plan is the product.' })).toBeTruthy()
    expect(screen.getByText('Awaiting approval')).toBeTruthy()
    expect(screen.getByText('Runs and incidents over time')).toBeTruthy()
  })
})

function renderHomeRoute() {
  const HomeComponent = routeState.HomeComponent
  if (HomeComponent === null) throw new Error('Home route component was not captured by the router mock.')
  render(<HomeComponent />)
}
