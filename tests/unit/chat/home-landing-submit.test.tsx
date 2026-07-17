/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CUSTOMER_REQUEST_PUBLIC_COMPREHENSION } from '@/modules/customer-request/public-comprehension'

const routeState = vi.hoisted(() => {
  const state = {
    HomeComponent: null as (() => ReactNode) | null,
    search: { q: '' },
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
      useNavigate: () => routeState.navigate,
    }
  },
  useNavigate: () => routeState.navigate,
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>{children}</a>
  ),
}))

vi.mock('@/components/ae/layout/AePublicShell', () => ({
  AePublicShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

import '@/routes/index'

describe('Request-first home', () => {
  beforeEach(() => {
    let sequence = 0
    vi.stubGlobal('crypto', { randomUUID: () => `home-${++sequence}` })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    routeState.search = { q: '' }
    routeState.navigate.mockClear()
  })

  it('sets the anonymous exploration boundary before submission', () => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)

    renderHomeRoute()

    expect(screen.getByText(/Keep contact, payment, and account details until AE asks/)).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('explains the Request journey and customer control before asking', () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>())

    renderHomeRoute()

    expect(screen.getByRole('heading', { level: 1, name: 'What do you need to make happen?' })).toBeTruthy()
    expect(screen.getByText(CUSTOMER_REQUEST_PUBLIC_COMPREHENSION.situation)).toBeTruthy()
    expect(screen.getByText(CUSTOMER_REQUEST_PUBLIC_COMPREHENSION.authority)).toBeTruthy()
    expect(screen.queryByText('Your agent knows who to call.')).toBeNull()
    expect(screen.getByRole('link', { name: 'Use AE with your AI' }).getAttribute('href')).toBe('/for-agents')
  })

  it('lets a cold customer recognize workflow-shaped requests and both authority stops', () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>())

    renderHomeRoute()

    for (const statement of Object.values(CUSTOMER_REQUEST_PUBLIC_COMPREHENSION)) {
      expect(screen.getByText(statement)).toBeTruthy()
    }
  })

  it('adopts a valid q as an editable Request draft without submitting it', () => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)

    renderHomeRoute('Find a printer for 200 cards by Friday')

    const composer = screen.getByLabelText('What are you looking for?') as HTMLTextAreaElement
    expect(composer.value).toBe('Find a printer for 200 cards by Friday')

    fireEvent.change(composer, { target: { value: 'Find a local printer for Monday' } })

    expect(composer.value).toBe('Find a local printer for Monday')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByLabelText(/email|phone|contact/i)).toBeNull()
    expect(screen.queryByRole('checkbox', { name: /consent|agree|permission/i })).toBeNull()
  })

  it('starts exactly one canonical Request when submit is rapidly activated twice', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockReturnValue(new Promise<Response>(() => undefined))
    vi.stubGlobal('fetch', fetchMock)
    renderHomeRoute()
    enterQuery('Emergency plumber in Brunswick')

    const submit = screen.getByRole('button', { name: 'Start my Request' })
    const form = submit.closest('form')
    if (form === null) throw new Error('The home composer submit action must belong to a form.')

    act(() => {
      fireEvent.submit(form)
      fireEvent.submit(form)
    })

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/requests')
  })

  it('submits the customer ask without forcing timing or budget fields upfront', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      kind: 'request', requestRef: 'request:home-1', revision: 1, state: 'needs_information',
      summary: 'Replace a leaking kitchen tap', nextAction: 'provide_information', missingFields: [], options: [],
      clarification: { kind: 'intent_direction', prompt: 'Where should AE look?', answerKind: 'natural_language' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    renderHomeRoute()
    enterQuery('Replace a leaking kitchen tap')

    fireEvent.click(screen.getByRole('button', { name: 'Start my Request' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const request = fetchMock.mock.calls[0]
    expect(request?.[0]).toBe('/api/requests')
    expect(request?.[1]?.method).toBe('POST')
    expect(JSON.parse(String(request?.[1]?.body))).toMatchObject({
      request: 'Replace a leaking kitchen tap',
      routing: { network: 'ae:public' },
    })
    expect(JSON.parse(String(request?.[1]?.body))).not.toHaveProperty('maximumSpendMinor')
  })
})

function renderHomeRoute(q = '') {
  routeState.search = { q }
  const HomeComponent = routeState.HomeComponent
  if (HomeComponent === null) throw new Error('Home route component was not captured by the router mock.')
  render(<HomeComponent />)
}

function enterQuery(query: string) {
  fireEvent.change(screen.getByLabelText('What are you looking for?'), {
    target: { value: query },
  })
}
