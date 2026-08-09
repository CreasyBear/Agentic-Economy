/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { RouterContextProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { afterEach, describe, expect, it } from 'vitest'

import { AeProviderCard } from '@/components/ae/primitives/AeProviderCard'
import type { AnswerSource } from '@/modules/answer/public'

describe('AeProviderCard answer variant', () => {
  afterEach(() => {
    cleanup()
  })

  it('keeps the answer action on the listing when an inquiry URL is published', () => {
    renderWithRouter(<AeProviderCard variant="answer" source={provider({ citationIndex: 2 })} threadId="thread-abc" />)

    expect(screen.getByText('Choice 2 in this answer')).toBeTruthy()
    expect(screen.queryByText('No reply history yet')).toBeNull()
    expect(screen.getByRole('link', { name: 'Ask this business' }).getAttribute('href')).toBe(
      '/demo-plumbing?from=thread&id=thread-abc',
    )
    expect(screen.getByRole('link', { name: 'Demo Plumbing' }).getAttribute('href')).toBe(
      '/demo-plumbing?from=thread&id=thread-abc',
    )
    expect(
      screen.getAllByRole('link').some((link) => link.getAttribute('href')?.includes('/inquiry')),
    ).toBe(false)
  })
})

function provider(overrides: Partial<AnswerSource> = {}): AnswerSource {
  return {
    citationIndex: 1,
    slug: 'demo-plumbing',
    name: 'Demo Plumbing',
    category: 'Plumber',
    suburb: 'Parramatta',
    stateTerritory: 'NSW',
    serviceArea: 'Parramatta',
    hoursLabel: 'Hours supplied',
    availabilityLabel: 'Published',
    trustLabel: 'Checked',
    responseTimeLabel: 'Responds ~22m',
    trustCue: 'Responds ~22m - Checked',
    freshnessLabel: 'Updated recently',
    nextStepLabel: 'Send inquiry',
    detailUrl: '/demo-plumbing',
    services: [{ name: 'Emergency plumbing', category: 'Plumber', summary: 'Urgent plumbing support.' }],
    inquiryUrl: '/demo-plumbing/inquiry',
    ...overrides,
  }
}

function renderWithRouter(ui: ReactElement) {
  const rootRoute = createRootRoute()
  const slugRoute = createRoute({ getParentRoute: () => rootRoute, path: '/$slug' })
  const routeTree = rootRoute.addChildren([slugRoute])
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
  return render(<RouterContextProvider router={router}>{ui}</RouterContextProvider>)
}
