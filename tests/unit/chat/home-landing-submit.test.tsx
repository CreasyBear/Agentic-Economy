/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

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

describe('composer-first home', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    routeState.search = { q: '' }
    routeState.navigate.mockClear()
  })

  it('shows the thread access disclosure before the home composer submits', () => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)

    renderHomeRoute()

    expect(screen.getByRole('note').textContent).toBe(
      'Your question becomes a thread with no automatic expiry. Anyone with its link can open it; this browser can delete it from Recent questions.',
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('adopts a valid q as an editable draft without starting an answer turn', () => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)

    renderHomeRoute('Find a printer for 200 cards by Friday')

    const composer = screen.getByRole('searchbox') as HTMLTextAreaElement
    expect(composer.value).toBe('Find a printer for 200 cards by Friday')

    fireEvent.change(composer, { target: { value: 'Find a local printer for Monday' } })

    expect(composer.value).toBe('Find a local printer for Monday')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByLabelText(/email|phone|contact/i)).toBeNull()
    expect(screen.queryByRole('checkbox', { name: /consent|agree|permission/i })).toBeNull()
  })

  it('starts exactly one answer turn when the submit action is rapidly activated twice', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockReturnValue(new Promise<Response>(() => undefined))
    vi.stubGlobal('fetch', fetchMock)
    renderHomeRoute()
    enterQuery('Emergency plumber in Brunswick')

    const submit = screen.getByRole('button', { name: 'Find businesses' })
    const form = submit.closest('form')
    if (form === null) throw new Error('The home composer submit action must belong to a form.')

    act(() => {
      fireEvent.submit(form)
      fireEvent.submit(form)
    })

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/answer/turn')
  })

  it('sends the selected timing as structured answer-turn input', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(answerStreamResponse())
    vi.stubGlobal('fetch', fetchMock)
    renderHomeRoute()
    enterQuery('Replace a leaking kitchen tap')

    selectTiming('This week', 'this_week')
    fireEvent.click(screen.getByRole('button', { name: 'Find businesses' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const request = fetchMock.mock.calls[0]
    expect(request?.[0]).toBe('/api/answer/turn')
    expect(request?.[1]?.method).toBe('POST')
    expect(JSON.parse(String(request?.[1]?.body))).toMatchObject({
      query: 'Replace a leaking kitchen tap',
      searchContext: { timing: 'this_week' },
    })
  })
})

function renderHomeRoute(q = '') {
  routeState.search = { q }
  const HomeComponent = routeState.HomeComponent
  if (HomeComponent === null) throw new Error('Home route component was not captured by the router mock.')
  render(<HomeComponent />)
}

function enterQuery(query: string) {
  fireEvent.change(screen.getByRole('searchbox'), {
    target: { value: query },
  })
}

function selectTiming(label: string, value: string) {
  const select = screen.queryByRole('combobox', { name: 'When do you need this?' })
  if (select !== null) {
    fireEvent.change(select, { target: { value } })
    return
  }
  fireEvent.click(screen.getByRole('radio', { name: label }))
}

function answerStreamResponse() {
  return new Response('', {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}
