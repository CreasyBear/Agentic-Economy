/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentType, ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

const routeState = vi.hoisted(() => ({
  component: undefined as ComponentType | undefined,
  search: {} as { callRef?: string },
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: { component: ComponentType }) => {
    routeState.component = options.component
    return {
      ...options,
      options,
      useLoaderData: () => 'https://ae.example',
      useSearch: () => routeState.search,
    }
  },
  Link: ({
    children,
    to,
    className,
    search,
    hash,
  }: {
    children: ReactNode
    to: string
    className?: string
    search?: Readonly<Record<string, string>>
    hash?: string
  }) => {
    const query = search === undefined ? '' : `?${new URLSearchParams(search).toString()}`
    const fragment = hash === undefined ? '' : `#${hash}`
    return <a href={`${to}${query}${fragment}`} className={className}>{children}</a>
  },
}))

vi.mock('@/components/ae/layout/AePublicPage', () => ({
  AePublicPage: ({ actions, children, title }: { actions: ReactNode; children: ReactNode; title: string }) => (
    <main>
      <h1>{title}</h1>
      <div>{actions}</div>
      {children}
    </main>
  ),
}))

import '@/routes/support'

afterEach(cleanup)

describe('/support', () => {
  it('returns people to authoritative records without inventing a retry', () => {
    renderRoute()
    expect(screen.getByRole('link', { name: 'Open Calls' }).getAttribute('href')).toBe('/activity')
    expect(screen.getByRole('link', { name: 'Continue Provider setup' }).getAttribute('href')).toBe('/owner/operations')
    expect(screen.getByRole('link', { name: 'Review account credit' }).getAttribute('href')).toBe('/owner/credit')
    expect(screen.getByText(/check that Call before trying again/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull()
  })

  it('keeps private support primary and labels public escalation', () => {
    renderRoute()
    expect(screen.getByRole('link', { name: 'Email support' }).getAttribute('href')).toBe('mailto:support@aecon.ai')
    expect(screen.getByRole('link', { name: /Open a public developer issue/ }).getAttribute('href')).toBe(
      'https://github.com/CreasyBear/Agentic-Economy/issues/new/choose',
    )
    expect(screen.getByText(/Do not include credentials, raw inputs or private results/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Request a listing correction' }).getAttribute('href')).toBe('/privacy/remove-business')
  })

  it('discloses advanced diagnostics with the configured canonical origin', () => {
    renderRoute()
    expect(screen.queryByRole('button', { name: 'Copy diagnostic command' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Advanced connection diagnostics' }))
    expect(screen.getByText('ae doctor --base-url "https://ae.example"')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Review agent setup' }).getAttribute('href')).toBe('/for-agents')
  })

  it('renders without callRef: plain support email and no reference banner', () => {
    renderRoute()
    expect(screen.getByRole('link', { name: 'Email support' }).getAttribute('href')).toBe('mailto:support@aecon.ai')
    expect(screen.queryByText(/Referenced Call:/)).toBeNull()
  })

  it('renders with callRef: shows reference banner and prefilled support email', () => {
    const callRef = 'call_abc123'
    renderRoute({ callRef })
    expect(screen.getByText(`Referenced Call: ${callRef}`)).toBeTruthy()
    const href = screen.getByRole('link', { name: 'Email support' }).getAttribute('href')
    expect(href).toContain('mailto:support@aecon.ai?')
    expect(href).toContain(`subject=Help%20with%20Call%20${encodeURIComponent(callRef)}`)
    expect(href).toContain(
      `body=I%20need%20help%20with%20Call%20reference%3A%20${encodeURIComponent(callRef)}%0A%0AWhat%20happened%3A%0A`,
    )
  })
})

function renderRoute(search: { callRef?: string } = {}) {
  routeState.search = search
  const Component = routeState.component
  if (Component === undefined) throw new Error('Support route component was not captured.')
  render(<Component />)
}
