/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AGENT_DOOR, BUSINESS_DOOR, HOME } from '@/content/brand-copy'
import { QUERY_MAX_LENGTH } from '@/lib/query-length'

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
  linkOptions: <T,>(options: T): T => options,
  Link: ({ children, to, search, ...props }: { children: ReactNode; to: string; search?: Record<string, string> }) => {
    const query = new URLSearchParams(search ?? {}).toString()
    return <a href={query.length === 0 ? to : `${to}?${query}`} {...props}>{children}</a>
  },
}))

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({ handler: (fn: unknown) => fn, validator: () => ({ handler: (fn: unknown) => fn }) }),
}))

vi.mock('@/components/ae/layout/AePublicShell', () => ({
  AePublicShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

import '@/routes/index'


describe('catalogue-first home', () => {
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

  it('renders a direct market search before a query and performs no network work', () => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)

    renderHomeRoute()

    expect(screen.getByRole('searchbox', { name: 'Search tools' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Search market' })).toBeTruthy()
    expect(screen.queryByText('Expand the network for this ask')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('leads with the tool market and offers literal popular searches', () => {
    renderHomeRoute()

    expect(screen.getByRole('heading', { name: HOME.heroHeading })).toBeTruthy()
    expect(screen.getByText(HOME.heroSubhead)).toBeTruthy()
    const examples = screen.getByRole('navigation', { name: 'Example asks' })
    const exampleLinks = Array.from(examples.querySelectorAll('a'))
    expect(exampleLinks.length).toBe(HOME.exampleAsks.length)
    expect(screen.getByRole('link', { name: HOME.exampleAsks[0] })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Show me a random cat photo' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Finance & crypto' })).toBeNull()
    const firstAsk = HOME.exampleAsks[0]
    expect(exampleLinks.map((link) => link.getAttribute('href')))
      .toContain(`/market?${new URLSearchParams({ window: '30d', query: firstAsk }).toString()}`)
    expect(screen.getByRole('link', { name: AGENT_DOOR.cta }).getAttribute('href')).toBe('/for-agents')
    expect(screen.getByRole('link', { name: BUSINESS_DOOR.cta }).getAttribute('href')).toBe('/for-providers')
    expect(document.body.textContent?.match(/\b(?:MCP|operator|keyless|device flow|readback|published services)\b/i)).toBeNull()
  })

  it('uses semantic door headings and touch-sized category links', () => {
    renderHomeRoute()

    expect(screen.getByRole('heading', { level: 2, name: AGENT_DOOR.heading })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: BUSINESS_DOOR.heading })).toBeTruthy()
    const categories = screen.getByRole('navigation', { name: 'Example asks' })
    for (const link of categories.querySelectorAll('a')) {
      expect(link.classList.contains('min-h-11')).toBe(true)
    }
  })

  it.each(['', '   '])('keeps an empty search on home and announces the required message', (query) => {
    renderHomeRoute()

    const searchbox = screen.getByRole('searchbox', { name: 'Search tools' })
    fireEvent.change(searchbox, { target: { value: query } })
    fireEvent.submit(screen.getByRole('search'))

    expect(routeState.navigate).not.toHaveBeenCalled()
    const message = screen.getByText('Enter a tool or capability to search the market.')
    expect(message.getAttribute('aria-live')).toBe('polite')
    expect(searchbox.getAttribute('aria-invalid')).toBe('true')

    fireEvent.change(searchbox, { target: { value: 'Find a local electrician' } })
    expect(screen.queryByText('Enter a tool or capability to search the market.')).toBeNull()
    expect(searchbox.getAttribute('aria-invalid')).toBeNull()
  })

  it('keeps example asks available while a query is present', () => {
    renderHomeRoute('Moon dentist in Adelaide')

    expect(screen.getByRole('navigation', { name: 'Example asks' })).toBeTruthy()
  })

  it('keeps the ask label stable while editing a submitted query', () => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)

    renderHomeRoute('Find a printer for 200 cards by Friday')

    const composer = screen.getByRole('searchbox', { name: 'Search tools' }) as HTMLInputElement
    expect(composer.value).toBe('Find a printer for 200 cards by Friday')
    fireEvent.change(composer, { target: { value: 'Find a local printer for Monday' } })
    expect(composer.value).toBe('Find a local printer for Monday')
    expect(fetchMock).not.toHaveBeenCalled()
  })


  it('keeps the first step focused on market search without extra setup fields', () => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)
    renderHomeRoute('Replace a leaking kitchen tap')

    const form = screen.getByRole('search').closest('form')
    if (form === null) throw new Error('The market search must be a form.')
    expect(form).toBeTruthy()
    expect(screen.queryByLabelText(/timing|budget|maximum spend/i)).toBeNull()
    expect(screen.getByRole('button', { name: 'Search market' })).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('keeps a submitted query in the ask box without speculative result copy', () => {
    renderHomeRoute('Moon dentist in Adelaide')

    const searchbox = screen.getByRole('searchbox', { name: 'Search tools' }) as HTMLInputElement
    expect(searchbox.value).toBe('Moon dentist in Adelaide')
    expect(screen.queryByRole('heading', { name: 'Expand the network for this ask' })).toBeNull()
    expect(document.body.textContent?.match(/available now|guaranteed availability/gi)).toBeNull()
  })

  it.each([199, 200, 201])('enforces the shared %i-character query limit', (length) => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)
    renderHomeRoute()

    const query = 'q'.repeat(length)
    const searchbox = screen.getByRole('searchbox', { name: 'Search tools' }) as HTMLInputElement
    expect(searchbox.maxLength).toBe(-1)
    fireEvent.change(searchbox, { target: { value: query } })
    expect(searchbox.value).toBe(query)
    expect(screen.getByText(`${length}/${QUERY_MAX_LENGTH}`)).toBeTruthy()

    const form = screen.getByRole('search')
    fireEvent.submit(form)

    if (length > QUERY_MAX_LENGTH) {
      expect(routeState.navigate).not.toHaveBeenCalled()
    } else {
      expect(routeState.navigate).toHaveBeenCalledWith({ to: '/market', search: { window: '30d', query } })
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

function renderHomeRoute(q = '') {
  routeState.search = q.length === 0 ? { q: undefined } : { q }
  const HomeComponent = routeState.HomeComponent
  if (HomeComponent === null) throw new Error('Home route component was not captured by the router mock.')
  render(<HomeComponent />)
}
