/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const routeState = vi.hoisted(() => ({
  search: {} as { q?: string },
  navigate: vi.fn(),
  HomeComponent: null as (() => React.ReactNode) | null,
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: { component: () => React.ReactNode }) => {
    routeState.HomeComponent = options.component
    return {
      ...options,
      useSearch: () => routeState.search,
    }
  },
  useNavigate: () => routeState.navigate,
}))

vi.mock('@/components/ae/layout/AePublicShell', () => ({
  AePublicShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}))

vi.mock('@/components/ae/chat/AeChat', () => ({
  AeChat: ({ initialQuery }: { initialQuery?: string | null }) => (
    <section data-testid="ae-chat" data-initial-query={initialQuery ?? ''} />
  ),
}))

vi.mock('@/lib/observability/funnel-client', () => ({
  emitFunnelEvent: async () => undefined,
}))

import '@/routes/index'

describe('home landing chat submit', () => {
  afterEach(() => {
    cleanup()
    routeState.search = {}
    routeState.navigate.mockReset()
  })

  it('clicking Send promotes the landing query into the chat route state', async () => {
    routeState.search = {}
    renderHomeRoute()

    const input = screen.getByRole('searchbox')
    await waitFor(() => expectEditableTextArea(input))

    fireEvent.change(input, { target: { value: 'emergency plumber parramatta' } })
    await waitFor(() => expect(getSendButton().disabled).toBe(false))
    fireEvent.click(getSendButton())

    expect(routeState.navigate).toHaveBeenCalledWith({
      to: '/',
      search: { q: 'emergency plumber parramatta' },
    })
  })

  it('renders AeChat when the home route has a q search param', () => {
    routeState.search = { q: 'emergency plumber parramatta' }
    renderHomeRoute()

    expect(screen.getByTestId('ae-chat').getAttribute('data-initial-query')).toBe('emergency plumber parramatta')
  })
})

function renderHomeRoute() {
  const HomeComponent = routeState.HomeComponent
  if (HomeComponent === null) {
    throw new Error('Home route component was not captured by the router mock.')
  }
  render(<HomeComponent />)
}

function expectEditableTextArea(element: HTMLElement) {
  if (!(element instanceof HTMLTextAreaElement)) {
    throw new Error('Expected the home query input to render as a textarea.')
  }
  expect(element.disabled).toBe(false)
}

function getSendButton(): HTMLButtonElement {
  const button = screen.getByRole('button', { name: /^send$/i })
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error('Expected the send control to render as a button.')
  }
  return button
}
