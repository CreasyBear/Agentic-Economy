/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ComponentType, ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SupportSearch } from '@/components/ae/support/help/help.contracts'
import '../../setup/jsdom-platform'

const validCallRef = `operation-invocation:v1:${'b'.repeat(64)}`

const routeState = vi.hoisted(() => ({
  component: undefined as ComponentType | undefined,
  search: { callRef: { kind: 'absent' } } as SupportSearch,
  validateSearch: undefined as ((search: Record<string, unknown>) => SupportSearch) | undefined,
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: {
    component: ComponentType
    validateSearch: (search: Record<string, unknown>) => SupportSearch
  }) => {
    routeState.component = options.component
    routeState.validateSearch = options.validateSearch
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
    params,
  }: {
    children: ReactNode
    to: string
    className?: string
    search?: Readonly<Record<string, string>>
    hash?: string
    params?: Readonly<Record<string, string>>
  }) => {
    const resolvedTo = to === '/calls/$callRef' && params?.callRef !== undefined
      ? `/calls/${encodeURIComponent(params.callRef)}`
      : to
    const query = search === undefined ? '' : `?${new URLSearchParams(search).toString()}`
    const fragment = hash === undefined ? '' : `#${hash}`
    return <a href={`${resolvedTo}${query}${fragment}`} className={className}>{children}</a>
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
    expect(screen.getByText('Open the current status and follow the next action shown there.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull()
  })

  it('answers common support questions from the existing support guidance', () => {
    renderRoute()
    const faq = screen.getByRole('region', { name: 'Questions' })
    expect(within(faq).getByRole('heading', { level: 2, name: 'Questions' })).toBeTruthy()
    const firstQuestion = within(faq).getByRole('button', {
      name: 'What should I do if a Call result is uncertain?',
    })
    fireEvent.click(firstQuestion)
    expect(firstQuestion.getAttribute('aria-expanded')).toBe('true')
    expect(within(faq).getByText(/check that Call before trying again/)).toBeTruthy()
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
    expect(screen.getByRole('link', { name: 'Review Agent connection' }).getAttribute('href')).toBe('/for-agents')
  })

  it('renders an absent Call reference with the general Calls handoff', () => {
    renderRoute()
    expect(screen.getByRole('link', { name: 'Open Calls' }).getAttribute('href')).toBe('/activity')
    expect(screen.getByRole('link', { name: 'Email support' }).getAttribute('href')).toBe('mailto:support@aecon.ai')
    expect(screen.queryByText(/Referenced Call:/)).toBeNull()
    expect(screen.queryByText(/Call reference in this link is not valid/)).toBeNull()
  })

  it('renders a valid Call reference in the exact Call handoff and support email', () => {
    renderRoute({ callRef: { kind: 'valid', value: validCallRef } })
    expect(screen.getByText(`Referenced Call: ${validCallRef}`)).toBeTruthy()
    expect(screen.queryByText(/Call reference in this link is not valid/)).toBeNull()
    expect(screen.getByRole('link', { name: 'Open this Call' }).getAttribute('href')).toBe(
      `/calls/${encodeURIComponent(validCallRef)}`,
    )
    const href = screen.getByRole('link', { name: 'Email support' }).getAttribute('href')
    expect(href).toContain('mailto:support@aecon.ai?')
    expect(href).toContain(`subject=Help%20with%20Call%20${encodeURIComponent(validCallRef)}`)
    expect(href).toContain(
      `body=I%20need%20help%20with%20Call%20reference%3A%20${encodeURIComponent(validCallRef)}%0A%0AWhat%20happened%3A%0A`,
    )
  })

  it('names a malformed Call reference without rendering or mailing it', () => {
    renderRoute({ callRef: { kind: 'malformed' } })
    expect(screen.getByText('The Call reference in this link is not valid. Open Calls to find the right Call.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open Calls' }).getAttribute('href')).toBe('/activity')
    expect(screen.getByRole('link', { name: 'Email support' }).getAttribute('href')).toBe('mailto:support@aecon.ai')
    expect(screen.queryByText(/Referenced Call:/)).toBeNull()
  })

  it('round-trips the Call reference through URL search validation', () => {
    const validateSearch = routeState.validateSearch
    if (validateSearch === undefined) throw new Error('Support route search validator was not captured.')
    const query = new URLSearchParams({ callRef: validCallRef })

    expect(validateSearch(Object.fromEntries(query))).toEqual({
      callRef: { kind: 'valid', value: validCallRef },
    })
    expect(validateSearch({ callRef: '   ' })).toEqual({ callRef: { kind: 'absent' } })
    expect(validateSearch({ callRef: 'not-a-call' })).toEqual({ callRef: { kind: 'malformed' } })
  })
})

function renderRoute(search: SupportSearch = { callRef: { kind: 'absent' } }) {
  routeState.search = search
  const Component = routeState.component
  if (Component === undefined) throw new Error('Support route component was not captured.')
  render(<Component />)
}
