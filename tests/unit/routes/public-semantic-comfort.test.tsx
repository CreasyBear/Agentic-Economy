/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, within } from '@testing-library/react'
import type { ComponentType, ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { AGENT_DOOR, BUSINESS_DOOR } from '@/content/brand-copy'
import { AE_CATALOG_EXAMPLE_ASKS } from '@/modules/answer/catalog-example-asks'

const routeState = vi.hoisted(() => ({
  components: new Map<string, ComponentType>(),
  location: { pathname: '/privacy' },
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: (path: string) => (options: { component: ComponentType }) => {
    routeState.components.set(path, options.component)
    return {
      ...options,
      options,
      useSearch: () => ({}),
      useLoaderData: () => undefined,
      useNavigate: () => vi.fn(),
    }
  },
  Link: ({ children, to, className }: { children: ReactNode; to: string; className?: string }) => (
    <a href={to} className={className}>{children}</a>
  ),
  linkOptions: <T,>(options: T): T => options,
  redirect: vi.fn(),
  useLocation: () => routeState.location,
  useNavigate: () => vi.fn(),
}))

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({ handler: (fn: unknown) => fn, validator: () => ({ handler: (fn: unknown) => fn }) }),
}))

vi.mock('@/components/ae/layout/AePublicShell', () => ({
  AePublicShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}))

import '@/routes/index'
import '@/routes/privacy'
import '@/routes/terms'
import { AeWorkDisclosure } from '@/components/ae/chat/AeWorkDisclosure'

afterEach(cleanup)

describe('public semantic comfort', () => {
  it('keeps the Terms outline sequential and its standalone actions comfortable', () => {
    renderRoute('/terms')

    const headings = screen.getAllByRole('heading')
    expect(headings.map((heading) => heading.tagName)).toEqual(['H1', 'H2', 'H3', 'H3', 'H3'])
    expect(screen.getByRole('heading', { level: 2, name: 'What these terms mean in practice' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Browse catalog' }).classList.contains('min-h-11')).toBe(true)
    expect(screen.getByRole('link', { name: /Publish an Operation/ }).classList.contains('min-h-11')).toBe(true)
  })

  it('gives every privacy tab a comfortable standalone target', () => {
    routeState.location = { pathname: '/privacy' }
    renderRoute('/privacy')

    const tablist = screen.getByRole('tablist', { name: 'Privacy moments' })
    expect(tablist.classList.contains('min-h-11')).toBe(true)
    for (const tab of within(tablist).getAllByRole('tab')) {
      expect(tab.classList.contains('min-h-11')).toBe(true)
    }
  })

  it('gives homepage example asks a comfortable standalone target', () => {
    renderRoute('/')

    const examples = screen.getByRole('navigation', { name: 'Example asks' })
    const links = within(examples).getAllByRole('link')
    expect(links).toHaveLength(AE_CATALOG_EXAMPLE_ASKS.length)
    for (const link of links) expect(link.classList.contains('min-h-11')).toBe(true)
  })

  it('gives the home agent and supplier links comfortable standalone targets', () => {
    renderRoute('/')

    for (const door of [AGENT_DOOR, BUSINESS_DOOR]) {
      const link = screen.getByRole('link', { name: door.cta })
      expect(link.classList.contains('min-h-11')).toBe(true)
      expect(link.classList.contains('inline-flex')).toBe(true)
    }
  })

  it('renders the thinking thread as a list and keeps the provenance trigger a comfortable native button', () => {
    render(
      <AeWorkDisclosure
        isStreaming
        workSteps={[]}
        thinkingSteps={['Searching for matches']}
        thinkingLabel="Searching for matches"
      />,
    )

    expect(screen.getByRole('list', { name: 'Search progress' })).toBeTruthy()
    expect(screen.getByText('Searching for matches')).toBeTruthy()
  })
})

function renderRoute(path: '/' | '/privacy' | '/terms') {
  const Component = routeState.components.get(path)
  if (Component === undefined) throw new Error(`Route component ${path} was not captured.`)
  render(<Component />)
}
