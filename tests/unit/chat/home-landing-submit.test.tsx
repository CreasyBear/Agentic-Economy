/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { HOME } from '@/content/brand-copy'
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
    expect(screen.getByRole('button', { name: 'Ask' })).toBeTruthy()
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
    expect(screen.getByRole('link', { name: 'Show me a random cat photo' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Search the web for the latest on electric cars' })).toBeNull()
    // The router serialises `search` with URLSearchParams (spaces as `+`), not encodeURIComponent.
    // The value is pinned to the real copy; only the encoding is derived, since encoding is the
    // router's job and this test is about the home page passing the ask through to the link.
    const firstAsk = HOME.exampleAsks[0]!
    expect(exampleLinks.map((link) => link.getAttribute('href')))
      .toContain(`/t/new?${new URLSearchParams({ q: firstAsk }).toString()}`)
    expect(screen.getByRole('link', { name: 'For agents' }).getAttribute('href')).toBe('/for-agents')
    expect(screen.getAllByRole('link', { name: 'For suppliers' }).some((link) => link.getAttribute('href') === '/claim')).toBe(true)
    expect(document.body.textContent?.match(/\b(?:MCP|operator|keyless|device flow|readback|published services)\b/i)).toBeNull()
  })

  it('keeps example asks available while a query is present', () => {
    renderHomeRoute('Moon dentist in Adelaide')

    expect(screen.getByRole('navigation', { name: 'Example asks' })).toBeTruthy()
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
    expect(form).toBeTruthy()
    expect(screen.queryByLabelText(/timing|budget|maximum spend/i)).toBeNull()
    expect(screen.getByRole('button', { name: 'Ask' })).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('keeps a submitted query in the ask box without speculative result copy', () => {
    renderHomeRoute('Moon dentist in Adelaide')

    const searchbox = screen.getByRole('searchbox', { name: 'What do you need done?' }) as HTMLInputElement
    expect(searchbox.value).toBe('Moon dentist in Adelaide')
    expect(screen.queryByRole('heading', { name: 'Expand the network for this ask' })).toBeNull()
    expect(document.body.textContent?.match(/available now|guaranteed availability/gi)).toBeNull()
  })

  it.each([199, 200, 201])('enforces the shared %i-character query limit', (length) => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)
    renderHomeRoute()

    const query = 'q'.repeat(length)
    const searchbox = screen.getByRole('searchbox', { name: 'What do you need done?' }) as HTMLInputElement
    expect(searchbox.maxLength).toBe(QUERY_MAX_LENGTH)
    fireEvent.change(searchbox, { target: { value: query } })
    expect(searchbox.value).toBe(query)
    expect(screen.getByText(`${length} / ${QUERY_MAX_LENGTH} characters`)).toBeTruthy()

    const form = screen.getByRole('search')
    fireEvent.submit(form)

    if (length > QUERY_MAX_LENGTH) {
      expect(routeState.navigate).not.toHaveBeenCalled()
    } else {
      expect(routeState.navigate).toHaveBeenCalledWith({ to: '/t/new', search: { q: query } })
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
