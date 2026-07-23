/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const routeState = vi.hoisted(() => ({
  HomeComponent: null as (() => ReactNode) | null,
  search: { q: undefined as string | undefined },
  chatProps: [] as Array<{ initialQuery?: string | null }>,
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: { component: () => ReactNode }) => {
    routeState.HomeComponent = options.component
    return {
      ...options,
      useSearch: () => routeState.search,
    }
  },
}))

vi.mock('@/components/ae/chat/AeChat', () => ({
  AeChat: (props: { initialQuery?: string | null }) => {
    routeState.chatProps.push(props)
    return (
      <main>
        <h1>What do you need done?</h1>
        <p>{props.initialQuery ?? 'Start with what you know.'}</p>
      </main>
    )
  },
}))

import '@/routes/index'

describe('Answer-first home', () => {
  afterEach(() => {
    cleanup()
    routeState.search = { q: undefined }
    routeState.chatProps.length = 0
  })

  it('opens a fresh answer-first session without causing a request or external effect', () => {
    renderHomeRoute()

    expect(screen.getByRole('heading', { level: 1, name: 'What do you need done?' })).toBeTruthy()
    expect(screen.getByText('Start with what you know.')).toBeTruthy()
    expect(routeState.chatProps).toEqual([{ initialQuery: null }])
  })

  it('adopts a bounded q parameter as the initial answer-first query', () => {
    renderHomeRoute('  Website developers in Perth  ')

    expect(screen.getByText('Website developers in Perth')).toBeTruthy()
    expect(routeState.chatProps).toEqual([{ initialQuery: 'Website developers in Perth' }])
  })

  it('refuses control characters rather than auto-running malformed input', () => {
    renderHomeRoute('Website developers\u0000 in Perth')

    expect(screen.getByText('Start with what you know.')).toBeTruthy()
    expect(routeState.chatProps).toEqual([{ initialQuery: null }])
  })
})

function renderHomeRoute(q?: string) {
  routeState.search = { q }
  const HomeComponent = routeState.HomeComponent
  if (HomeComponent === null) throw new Error('Home route component was not captured by the router mock.')
  render(<HomeComponent />)
}
