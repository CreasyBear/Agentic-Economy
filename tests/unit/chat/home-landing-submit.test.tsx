/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AGENT_INSTRUCTION, AGENT_SETUP_INSTRUCTION, HOME } from '@/content/brand-copy'

const routeState = vi.hoisted(() => {
  const state = {
    HomeComponent: null as (() => ReactNode) | null,
    search: { q: undefined as string | undefined },
    loaderData: { read: { kind: 'ok' as const, operations: [], matchedCount: 0 }, canonicalBaseUrl: 'https://ae.example' },
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
  afterEach(() => {
    cleanup()
    routeState.search = { q: undefined }
    routeState.navigate.mockClear()
    routeState.loaderData = { read: { kind: 'ok', operations: [], matchedCount: 0 }, canonicalBaseUrl: 'https://ae.example' }
  })

  it('leads with the tool market and an agent instruction, with no network work', () => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)

    renderHomeRoute()

    expect(screen.getByRole('heading', { name: HOME.heroHeading })).toBeTruthy()
    expect(screen.getByText(HOME.heroSubhead)).toBeTruthy()
    expect(screen.getAllByRole('heading', { name: AGENT_INSTRUCTION.heading }).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: `Copy ${AGENT_INSTRUCTION.label}` })).toBeTruthy()
    expect(screen.getByText(AGENT_INSTRUCTION.code)).toBeTruthy()
    expect(screen.queryByText(AGENT_SETUP_INSTRUCTION.code)).toBeNull()
    expect(screen.queryByText(/Claude Code/)).toBeNull()
    expect(document.querySelector('[data-slot="ae-site-browser"]')?.textContent).toContain('/llms.txt')
    expect(screen.getAllByRole('link', { name: 'Browse Operations' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('link', { name: 'List a tool' }).length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { name: HOME.catalogHeading })).toBeTruthy()
    expect(screen.getByText(HOME.catalogEmpty)).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'One connection.' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Before you connect' })).toBeNull()
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(screen.queryByRole('navigation', { name: 'Popular searches' })).toBeNull()
    expect(screen.queryByText('Expand the network for this ask')).toBeNull()
    expect(document.body.textContent?.match(/\b(?:MCP|operator|keyless|device flow|readback|published services)\b/i)).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('keeps browse on the catalog section when nothing is listed', () => {
    renderHomeRoute()

    const catalog = document.querySelector('#home-catalog')
    expect(catalog).not.toBeNull()
    const browse = screen.getAllByRole('link', { name: 'Browse Operations' })
    expect(browse.some((link) => catalog?.contains(link) && link.getAttribute('href')?.startsWith('/market'))).toBe(true)
    const hero = document.querySelector('#home-hero')?.closest('section')
    expect(browse.some((link) => hero?.contains(link))).toBe(true)
  })

  it('orders landing sections as hero, paste, catalog, close', () => {
    renderHomeRoute()

    const headings = screen.getAllByRole('heading').map((heading) => heading.textContent)
    expect(headings[0]).toBe(HOME.heroHeading)
    expect(headings).toContain(AGENT_INSTRUCTION.heading)
    expect(headings).toContain(HOME.catalogHeading)
    expect(headings.indexOf(AGENT_INSTRUCTION.heading)).toBeLessThan(headings.indexOf(HOME.catalogHeading))
    expect(headings.indexOf(HOME.catalogHeading)).toBeLessThan(headings.lastIndexOf(AGENT_INSTRUCTION.heading))
    expect(headings.at(-1)).toBe(AGENT_INSTRUCTION.heading)
    expect(screen.queryByLabelText(/timing|budget|maximum spend/i)).toBeNull()
  })

  it('keeps a query out of the first screen when the component is rendered directly', () => {
    renderHomeRoute('Moon dentist in Adelaide')

    expect(screen.queryByDisplayValue('Moon dentist in Adelaide')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Expand the network for this ask' })).toBeNull()
    expect(document.body.textContent?.match(/available now|guaranteed availability/gi)).toBeNull()
  })
})

function renderHomeRoute(q = '') {
  routeState.search = q.length === 0 ? { q: undefined } : { q }
  const HomeComponent = routeState.HomeComponent
  if (HomeComponent === null) throw new Error('Home route component was not captured by the router mock.')
  render(<HomeComponent />)
}
