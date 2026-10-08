/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ComponentType, ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PublicDocumentationLinks } from '@/lib/documentation/public-documentation'
import type { SupportSearch } from '@/components/ae/support/help/help.contracts'
import '../../setup/jsdom-platform'

const validCallRef = `operation-invocation:v1:${'b'.repeat(64)}`

const routeState = vi.hoisted(() => ({
  component: undefined as ComponentType | undefined,
  search: {} as SupportSearch,
  hash: '',
  documentation: undefined as PublicDocumentationLinks | undefined,
  navigate: vi.fn(),
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
      useLoaderData: () => ({ canonicalBaseUrl: 'https://ae.example', ...(routeState.documentation === undefined ? {} : { documentation: routeState.documentation }) }),
      useNavigate: () => routeState.navigate,
      useSearch: () => routeState.search,
    }
  },
  useHydrated: () => true,
  useLocation: () => routeState.hash,
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

afterEach(() => { cleanup(); routeState.hash = ''; routeState.documentation = undefined; routeState.navigate.mockClear() })

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
    expect(screen.getByRole('link', { name: /Email support \(opens email app\)/ }).getAttribute('href')).toBe('mailto:support@aecon.ai')
    expect(screen.getByText('Do not include credentials, raw inputs or private results.')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: /^Private support/ }))
    expect(screen.getByRole('link', { name: 'Request a listing correction' }).getAttribute('href')).toBe('/privacy/remove-business')
    expect(screen.getByRole('link', { name: 'Review Provider requirements' }).getAttribute('href')).toBe('/for-providers')
    fireEvent.click(screen.getByRole('tab', { name: /^Developer issue/ }))
    expect(screen.getByRole('link', { name: /Open a public developer issue/ }).getAttribute('href')).toBe(
      'https://github.com/CreasyBear/Agentic-Economy/issues/new/choose',
    )
    expect(screen.getByText(/Do not include credentials, raw inputs or private results/)).toBeTruthy()
    expect(screen.getByRole('link', { name: /Email support \(opens email app\)/ }).getAttribute('href')).toBe('mailto:support@aecon.ai')
    expect(screen.queryByRole('link', { name: 'Request a listing correction' })).toBeNull()
  })

  it('discloses advanced diagnostics with the configured canonical origin', () => {
    renderRoute()
    fireEvent.click(screen.getByRole('tab', { name: /^Agent connection/ }))
    expect(screen.queryByRole('button', { name: 'Copy diagnostic command' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Advanced connection diagnostics' }))
    expect(screen.getByText('ae doctor --base-url "https://ae.example"')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Review Agent connection' }).getAttribute('href')).toBe('/for-agents')
  })

  it('chooses one support topic with keyboard arrows and Home/End without retaining outgoing actions', () => {
    renderRoute()
    const current = screen.getByRole('tab', { name: /^Current status/ })
    const connection = screen.getByRole('tab', { name: /^Agent connection/ })
    const developer = screen.getByRole('tab', { name: /^Developer issue/ })
    current.focus()
    fireEvent.keyDown(current, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(connection)
    expect(connection.getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tabpanel', { name: /^Agent connection/ })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Open Calls' })).toBeNull()
    fireEvent.keyDown(connection, { key: 'End' })
    expect(document.activeElement).toBe(developer)
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1)
    const issue = screen.getByRole('link', { name: /Open a public developer issue/ })
    expect(issue.getAttribute('target')).toBe('_blank')
    expect(issue.getAttribute('rel')).toBe('noreferrer')
    fireEvent.keyDown(developer, { key: 'Home' })
    expect(document.activeElement).toBe(current)
    expect(screen.getByRole('link', { name: 'Open Calls' }).getAttribute('href')).toBe('/activity')
    expect(screen.queryByRole('link', { name: /Open a public developer issue/ })).toBeNull()
  })

  it('keeps the exact Call reference and private email draft visible across topics', () => {
    renderRoute({ callRef: validCallRef })
    const initialHref = screen.getByRole('link', { name: /Email support \(opens email app\)/ }).getAttribute('href')
    for (const name of [/^Agent connection/, /^Private support/, /^Developer issue/, /^Current status/]) {
      fireEvent.click(screen.getByRole('tab', { name }))
      expect(screen.getByText(`Referenced Call: ${validCallRef}`)).toBeTruthy()
      expect(screen.getByRole('link', { name: /Email support \(opens email app\)/ }).getAttribute('href')).toBe(initialHref)
      expect(screen.getAllByRole('tabpanel')).toHaveLength(1)
    }
  })

  it('opens a stable help anchor and keeps the exact Call reference when topics change', () => {
    routeState.hash = 'agent-connection'
    renderRoute({ callRef: validCallRef })
    expect(screen.getByRole('tab', { name: /^Agent connection/ }).getAttribute('aria-selected')).toBe('true')
    expect(document.getElementById('agent-connection')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Link to Agent connection' }).getAttribute('href')).toBe('#agent-connection')
    fireEvent.click(screen.getByRole('tab', { name: /^Current status/ }))
    const navigation = routeState.navigate.mock.calls.at(-1)?.[0]
    expect(navigation.hash).toBe('current-status')
    expect(navigation.search({ callRef: validCallRef })).toEqual({ callRef: validCallRef })
    expect(screen.getByRole('link', { name: 'Open this Call' }).getAttribute('href')).toContain(encodeURIComponent(validCallRef))
  })

  it('uses configured guide paths without sending the Call reference to docs', () => {
    routeState.documentation = { home: 'https://guides.example/docs', customer: 'https://guides.example/docs/guides/customer', authority: 'https://guides.example/docs/concepts/authority', recovery: 'https://guides.example/docs/guides/recovery', api: 'https://guides.example/docs/reference' }
    renderRoute({ callRef: validCallRef })
    const guide = screen.getByRole('link', { name: /Recover the same Call/ })
    expect(guide.getAttribute('href')).toBe(routeState.documentation.recovery)
    expect(guide.getAttribute('target')).toBe('_blank')
    expect(guide.getAttribute('href')).not.toContain(validCallRef)
    expect(screen.getByText(`Referenced Call: ${validCallRef}`)).toBeTruthy()
  })

  it('renders an absent Call reference with the general Calls handoff', () => {
    renderRoute()
    expect(screen.getByRole('link', { name: 'Open Calls' }).getAttribute('href')).toBe('/activity')
    expect(screen.getByRole('link', { name: /Email support \(opens email app\)/ }).getAttribute('href')).toBe('mailto:support@aecon.ai')
    expect(screen.queryByText(/Referenced Call:/)).toBeNull()
    expect(screen.queryByText(/Call reference in this link is not valid/)).toBeNull()
  })

  it('renders a valid Call reference in the exact Call handoff and support email', () => {
    renderRoute({ callRef: validCallRef })
    expect(screen.getByText(`Referenced Call: ${validCallRef}`)).toBeTruthy()
    expect(screen.queryByText(/Call reference in this link is not valid/)).toBeNull()
    expect(screen.getByRole('link', { name: 'Open this Call' }).getAttribute('href')).toBe(
      `/calls/${encodeURIComponent(validCallRef)}`,
    )
    const href = screen.getByRole('link', { name: /Email support \(opens email app\)/ }).getAttribute('href')
    expect(href).toContain('mailto:support@aecon.ai?')
    expect(href).toContain(`subject=Help%20with%20Call%20${encodeURIComponent(validCallRef)}`)
    expect(href).toContain(
      `body=I%20need%20help%20with%20Call%20reference%3A%20${encodeURIComponent(validCallRef)}%0A%0AWhat%20happened%3A%0A`,
    )
  })

  it('names a malformed Call reference without rendering or mailing it', () => {
    renderRoute({ callRef: 'not-a-call' })
    expect(screen.getByText('The Call reference in this link is not valid. Open Calls to find the right Call.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open Calls' }).getAttribute('href')).toBe('/activity')
    expect(screen.getByRole('link', { name: /Email support \(opens email app\)/ }).getAttribute('href')).toBe('mailto:support@aecon.ai')
    expect(screen.queryByText(/Referenced Call:/)).toBeNull()
  })

  it('keeps the search wire serializable and the email draft tied to the same Call', () => {
    const validateSearch = routeState.validateSearch
    if (validateSearch === undefined) throw new Error('Support route search validator was not captured.')
    const receiptSearch = validateSearch({ callRef: validCallRef })
    expect(receiptSearch).toEqual({ callRef: validCallRef })
    const query = new URLSearchParams(receiptSearch)
    expect(query.get('callRef')).toBe(validCallRef)
    renderRoute(validateSearch(Object.fromEntries(query)))
    expect(screen.getByRole('link', { name: /Email support \(opens email app\)/ }).getAttribute('href')).toContain(encodeURIComponent(validCallRef))
    expect(validateSearch({})).toEqual({})
    expect(validateSearch({ callRef: 'not-a-call' })).toEqual({ callRef: 'not-a-call' })
  })

  it('does not treat a supplied non-string Call reference as generic Help or a valid Call', () => {
    const validateSearch = routeState.validateSearch
    if (validateSearch === undefined) throw new Error('Support route search validator was not captured.')
    const search = validateSearch({ callRef: [validCallRef, validCallRef] })
    renderRoute(search)
    expect(screen.getByText(/Call reference in this link is not valid/)).toBeTruthy()
    expect(screen.queryByText(/Referenced Call:/)).toBeNull()
    expect(screen.getByRole('link', { name: /Email support \(opens email app\)/ }).getAttribute('href')).toBe('mailto:support@aecon.ai')
  })
})

function renderRoute(search: SupportSearch = {}) {
  routeState.search = search
  const Component = routeState.component
  if (Component === undefined) throw new Error('Support route component was not captured.')
  render(<Component />)
}
