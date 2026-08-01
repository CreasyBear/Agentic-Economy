/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { HOME } from '@/content/brand-copy'

const routeState = vi.hoisted(() => {
  const state = {
    HomeComponent: null as (() => ReactNode) | null,
    search: { q: undefined as string | undefined },
    // Supply facets are derived from published listings by the route loader.
    loaderData: { coldStart: { facets: [], businessCount: 0, stateCount: 0 } },
    navigate: vi.fn(async () => undefined),
  }
  return state
})

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: { component: () => ReactNode }) => {
    routeState.HomeComponent = options.component
    return {
      ...options,
      useSearch: () => routeState.search,
      useLoaderData: () => routeState.loaderData,
      useNavigate: () => routeState.navigate,
    }
  },
  useNavigate: () => routeState.navigate,
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>{children}</a>
  ),
}))

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({ handler: (fn: unknown) => fn, validator: () => ({ handler: (fn: unknown) => fn }) }),
}))

vi.mock('@/components/ae/layout/AePublicShell', () => ({
  AePublicShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

import '@/routes/index'


describe('plan-first home', () => {
  beforeEach(() => {
    let sequence = 0
    vi.stubGlobal('crypto', { randomUUID: () => `home-${++sequence}` })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    routeState.search = { q: undefined }
    routeState.navigate.mockClear()
  })

  it('renders only the ask box before a query and performs no network work', () => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)

    renderHomeRoute()

    expect(screen.getByRole('searchbox', { name: 'What do you need done?' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Find my options' })).toBeTruthy()
    expect(screen.queryByText('Expand the network for this ask')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('leads with relief, invites the problem, and keeps human copy free of implementation terms', () => {
    renderHomeRoute()

    expect(screen.getByRole('heading', { name: HOME.heroHeading })).toBeTruthy()
    expect(screen.getByText(HOME.heroSubhead)).toBeTruthy()
    const examples = screen.getByRole('navigation', { name: 'Example asks' })
    const exampleLinks = Array.from(examples.querySelectorAll('a'))
    expect(exampleLinks.length).toBe(HOME.exampleAsks.length)
    expect(exampleLinks.map((link) => link.getAttribute('href'))).toContain(`/?q=${encodeURIComponent(HOME.exampleAsks[0]!)}`)
    expect(screen.getByRole('link', { name: 'For agents' }).getAttribute('href')).toBe('/for-agents')
    expect(screen.getAllByRole('link', { name: 'List your business' }).some((link) => link.getAttribute('href') === '/claim')).toBe(true)
    expect(document.body.textContent?.match(/\b(?:MCP|operator|keyless|device flow|readback|published services)\b/i)).toBeNull()
  })

  it('hides example asks once a query is active', () => {
    renderHomeRoute('Moon dentist in Adelaide')

    expect(screen.queryByRole('navigation', { name: 'Example asks' })).toBeNull()
  })

  it('keeps the ask label stable while editing a submitted query', () => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)

    renderHomeRoute('Find a printer for 200 cards by Friday')

    const composer = screen.getByRole('searchbox', { name: 'What do you need done?' }) as HTMLInputElement
    expect(composer.value).toBe('Find a printer for 200 cards by Friday')
    fireEvent.change(composer, { target: { value: 'Find a local printer for Monday' } })
    expect(composer.value).toBe('Find a local printer for Monday')
    expect(fetchMock).not.toHaveBeenCalled()
  })


  it('keeps the first step focused on the ask without extra setup fields', () => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)
    renderHomeRoute('Replace a leaking kitchen tap')

    const form = screen.getByRole('search').closest('form')
    if (form === null) throw new Error('The ask box must be a form.')
    expect(form.getAttribute('action')).toBe('/')
    expect(form.getAttribute('method')).toBe('get')
    expect(screen.queryByLabelText(/timing|budget|maximum spend/i)).toBeNull()
    expect(screen.getByRole('button', { name: 'Find my options' })).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('keeps result fallback truthful when the plan preview is unavailable', () => {
    renderHomeRoute('Moon dentist in Adelaide')

    expect(screen.getByRole('heading', { name: 'Expand the network for this ask' })).toBeTruthy()
    expect(screen.getByText(/Businesses publish what they do here so agents can bring them work/)).toBeTruthy()
    expect(document.body.textContent?.match(/available now|guaranteed availability/gi)).toBeNull()
  })
})

function renderHomeRoute(q = '') {
  routeState.search = q.length === 0 ? { q: undefined } : { q }
  const HomeComponent = routeState.HomeComponent
  if (HomeComponent === null) throw new Error('Home route component was not captured by the router mock.')
  render(<HomeComponent />)
}

function enterQuery(query: string) {
  fireEvent.change(screen.getByLabelText('What are you looking for?'), {
    target: { value: query },
  })
}
