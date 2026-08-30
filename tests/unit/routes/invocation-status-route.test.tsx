/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { RouterContextProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import '../../setup/jsdom-platform'

import type { InvocationStatusPageActions, InvocationStatusPageResult } from '@/routes/operations.invocations.$invocationRef'

const readStatusMock = vi.hoisted(() => vi.fn())
const cancelMock = vi.hoisted(() => vi.fn())
const reconcileMock = vi.hoisted(() => vi.fn())

vi.mock('@/modules/capability-execution/operation-recovery.functions', () => ({
  readOwnerInvocationStatusServer: readStatusMock,
  cancelOwnerInvocationServer: cancelMock,
  reconcileOwnerInvocationServer: reconcileMock,
}))

import { InvocationStatusPage, Route } from '@/routes/operations.invocations.$invocationRef'

const invocationRef = 'invocation:exact-owner-status'
const operationRef = `operation:v1:${'a'.repeat(64)}`

function renderWithRouter(result: InvocationStatusPageResult, actions?: InvocationStatusPageActions) {
  const rootRoute = createRootRoute()
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: '/' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/operations/$operationRef' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/operations/invocations/$invocationRef' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/sign-in/$' }),
  ])
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
  return render(
    <RouterContextProvider router={router}>
      <InvocationStatusPage result={result} {...(actions === undefined ? {} : { actions })} />
    </RouterContextProvider>,
  )
}

function renderRouteComponent(result: InvocationStatusPageResult) {
  vi.spyOn(Route, 'useLoaderData').mockReturnValue(result as never)
  const Component = Route.options.component
  if (Component === undefined) throw new Error('invocation_status_route_component_missing')
  const rootRoute = createRootRoute()
  const routeTree = rootRoute.addChildren([createRoute({ getParentRoute: () => rootRoute, path: '/' })])
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
  return render(
    <RouterContextProvider router={router}>
      {createElement(Component)}
    </RouterContextProvider>,
  )
}

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  readStatusMock.mockReset()
  cancelMock.mockReset()
  reconcileMock.mockReset()
  vi.restoreAllMocks()
})

describe('/operations/invocations/$invocationRef', () => {
  it('passes the exact route reference to the owner-scoped server read', async () => {
    readStatusMock.mockResolvedValue({
      kind: 'refused',
      invocationRef,
      code: 'invocation_not_found',
      retryable: false,
    })
    const loader = Route.options.loader as (input: { params: { invocationRef: string } }) => Promise<unknown>

    await expect(loader({ params: { invocationRef } })).resolves.toMatchObject({ kind: 'refused', invocationRef })
    expect(readStatusMock).toHaveBeenCalledWith({ data: { invocationRef } })
  })

  it('renders exact terminal facts and preserves the exact current Operation link', () => {
    renderWithRouter({
      kind: 'found',
      invocationRef,
      operationRef,
      state: 'terminal',
      evidenceHash: 'sha256:top-level-evidence',
      attemptRef: 'attempt:exact',
      effectGeneration: 3,
      usage: {
        usageRef: 'usage:exact',
        observedAt: Date.UTC(2026, 7, 12),
        chargeState: 'paid',
        amount: { currency: 'AUD', units: '125', exponent: 2 },
        priceDigest: 'sha256:price',
        transactionRef: 'transaction:exact',
        durationMs: 84,
      },
      result: {
        kind: 'completed',
        invocationRef,
        operationRef,
        output: { temperature: 24 },
        evidenceHash: 'sha256:result-evidence',
        usage: {
          usageRef: 'usage:exact',
          observedAt: Date.UTC(2026, 7, 12),
          chargeState: 'paid',
          amount: { currency: 'AUD', units: '125', exponent: 2 },
          priceDigest: 'sha256:price',
        },
      },
    })

    expect(screen.getByRole('heading', { level: 1, name: 'Invocation receipt' })).toBeTruthy()
    expect(screen.getAllByText(invocationRef).length).toBeGreaterThan(0)
    const operationLink = screen.getByRole('link', { name: operationRef })
    expect(operationLink.getAttribute('href')).toBe(`/operations/${encodeURIComponent(operationRef)}`)
    expect(screen.getAllByText('Terminal').length).toBeGreaterThan(0)
    expect(screen.getAllByText('AUD 1.25').length).toBeGreaterThan(0)
    expect(screen.getByText('attempt:exact')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
    expect(screen.getByText('sha256:top-level-evidence')).toBeTruthy()
    expect(screen.getByText(/"temperature": 24/)).toBeTruthy()
  })

  it('presents a completed receipt as six recorded stages with money facts and reuse actions', () => {
    renderWithRouter({
      kind: 'found',
      invocationRef,
      operationRef,
      state: 'terminal',
      previousInput: { city: 'Perth', units: 'metric' },
      result: {
        kind: 'completed',
        invocationRef,
        operationRef,
        output: { rows: 3 },
        evidenceHash: 'sha256:completed',
        usage: {
          usageRef: 'usage:receipt',
          observedAt: Date.UTC(2026, 7, 23),
          chargeState: 'paid',
          amount: { currency: 'USD', units: '125', exponent: 2 },
          priceDigest: 'sha256:price',
          transactionRef: 'transaction:settled',
        },
        receipt: {
          receiptRef: 'receipt:public',
          state: 'settled',
          network: 'eip155:8453',
          asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
          providerQuotedAmount: { currency: 'USD', units: '100', exponent: 2 },
          agenticEconomyFee: { currency: 'USD', units: '25', exponent: 2 },
          totalBuyerAuthorization: { currency: 'USD', units: '125', exponent: 2 },
          priceDigest: 'sha256:price',
          transactionRef: 'transaction:settled',
          evidenceHash: 'sha256:completed',
          issuedAt: '2026-08-23T12:00:00.000Z',
        },
      },
    })

    for (const stage of ['Authorized', 'Reserved', 'Submitted', 'Settled', 'Validated', 'Complete']) {
      expect(screen.getByText(new RegExp(`\\d\\. ${stage}`))).toBeTruthy()
    }
    expect(screen.getByRole('heading', { name: 'Money before and after the call' })).toBeTruthy()
    expect(screen.getByText('Provider quote')).toBeTruthy()
    expect(screen.getAllByText('USD 1.25').length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: 'Run again' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Save capability|Capability saved/ })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Copy as CLI' })).toBeTruthy()
    expect(screen.getAllByText(/\{"city":"Perth","units":"metric"\}/).length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { name: 'Copy as API request' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Add to MCP' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Copy agent prompt' })).toBeTruthy()
    expect(screen.getByText(/ae.public-invocation-receipt:v1/)).toBeTruthy()
  })

  it('keeps a found pending result distinct from completion', () => {
    renderWithRouter({
      kind: 'found',
      invocationRef,
      operationRef,
      state: 'in_progress',
      result: { kind: 'pending', invocationRef, operationRef, retryAfterMs: 2_000 },
    })

    expect(screen.getAllByText('In progress').length).toBeGreaterThan(0)
    expect(screen.getByText('Pending')).toBeTruthy()
    expect(screen.getByText('2000 ms')).toBeTruthy()
    expect(screen.queryByText('Completed')).toBeNull()
    expect(screen.getByRole('heading', { name: 'What can I do next?' })).toBeTruthy()
    expect(screen.getByText(`ae status ${invocationRef}`)).toBeTruthy()
  })

  it('keeps reconciliation required distinct without inventing a result', () => {
    renderWithRouter({ kind: 'found', invocationRef, operationRef, state: 'reconciliation_required' })

    expect(screen.getAllByText('Reconciliation required').length).toBeGreaterThan(0)
    expect(screen.getByText('No canonical result is recorded yet. The state above remains authoritative.')).toBeTruthy()
    expect(screen.queryByText('Completed')).toBeNull()
    expect(screen.getAllByText('What happened').length).toBeGreaterThan(0)
    expect(screen.getByText('Did money move?')).toBeTruthy()
    expect(screen.getByText('What happens automatically')).toBeTruthy()
    expect(screen.getByText('What you can do')).toBeTruthy()
    expect(screen.getByText('Reference kept')).toBeTruthy()
    expect(screen.getByText('The external effect may have started. Reconcile before retrying.')).toBeTruthy()
  })

  it('submits explicit owner reconciliation evidence only when canonical binding facts exist', () => {
    const onReconcile = vi.fn()
    renderWithRouter({
      kind: 'found',
      invocationRef,
      operationRef,
      state: 'reconciliation_required',
      attemptRef: 'attempt:uncertain',
      effectGeneration: 2,
    }, { onReconcile })

    fireEvent.click(screen.getByRole('combobox', { name: 'Observed provider outcome' }))
    fireEvent.click(screen.getByRole('option', { name: 'Effect released' }))
    fireEvent.change(screen.getByLabelText('Evidence source'), { target: { value: 'Provider control plane' } })
    fireEvent.change(screen.getByLabelText('Evidence reference'), { target: { value: 'evt_123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit reconciliation' }))

    expect(onReconcile).toHaveBeenCalledWith({
      resolution: 'released',
      source: 'Provider control plane',
      evidenceRef: 'evt_123',
    })
  })

  it('requires explicit confirmation before requesting cancellation', async () => {
    const onCancel = vi.fn(async () => undefined)
    const view = renderWithRouter({
      kind: 'found',
      invocationRef,
      operationRef,
      state: 'retryable',
    }, { onCancel })

    fireEvent.click(screen.getByRole('button', { name: 'Cancel invocation' }))
    expect(onCancel).not.toHaveBeenCalled()
    const dialog = screen.getByRole('alertdialog', { name: 'Cancel this invocation?' })
    const keepButton = within(dialog).getByRole('button', { name: 'Keep invocation' })
    await waitFor(() => expect(document.activeElement).toBe(keepButton))
    fireEvent.click(keepButton)
    expect(onCancel).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel invocation' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm cancellation' }))
    await waitFor(() => expect(onCancel).toHaveBeenCalledOnce())

    view.unmount()
    renderWithRouter({
      kind: 'found',
      invocationRef,
      operationRef,
      state: 'in_progress',
    }, { onCancel })
    expect(screen.queryByRole('button', { name: 'Cancel invocation' })).toBeNull()
  })

  it('offers one manual refresh for a nonterminal state and disables it while pending', () => {
    const onRefresh = vi.fn()
    const { unmount } = renderWithRouter({
      kind: 'found',
      invocationRef,
      operationRef,
      state: 'in_progress',
    }, { onRefresh })

    fireEvent.click(screen.getByRole('button', { name: 'Refresh current status' }))
    expect(onRefresh).toHaveBeenCalledOnce()

    unmount()
    renderWithRouter({
      kind: 'found',
      invocationRef,
      operationRef,
      state: 'in_progress',
    }, { onRefresh, refreshPending: true })
    expect(screen.getByRole('button', { name: 'Refreshing current status…' }).hasAttribute('disabled')).toBe(true)

    cleanup()
    renderWithRouter({
      kind: 'found',
      invocationRef,
      operationRef,
      state: 'terminal',
    }, { onRefresh })
    expect(screen.queryByRole('button', { name: 'Refresh current status' })).toBeNull()
  })

  it('replaces a nonterminal displayed state with the current source status after refresh', async () => {
    readStatusMock.mockResolvedValue({
      kind: 'found',
      invocationRef,
      operationRef,
      state: 'terminal',
      evidenceHash: 'sha256:refreshed',
    })
    renderRouteComponent({ kind: 'found', invocationRef, operationRef, state: 'in_progress' })

    fireEvent.click(screen.getByRole('button', { name: 'Refresh current status' }))

    await waitFor(() => expect(screen.getAllByText('Terminal').length).toBeGreaterThan(0))
    expect(readStatusMock).toHaveBeenCalledWith({ data: { invocationRef } })
    expect(screen.queryByText('In progress')).toBeNull()
    expect(screen.getByText('Current status refreshed. The current state is Terminal.')).toBeTruthy()
  })

  it('keeps the displayed state and makes no newer-state claim when refresh cannot read the source', async () => {
    readStatusMock.mockRejectedValue(new Error('offline'))
    renderRouteComponent({ kind: 'found', invocationRef, operationRef, state: 'in_progress' })

    fireEvent.click(screen.getByRole('button', { name: 'Refresh current status' }))

    expect(await screen.findByText('The current status source is unavailable. The displayed state has not changed.')).toBeTruthy()
    expect(screen.getAllByText('In progress').length).toBeGreaterThan(0)
    expect(screen.queryByText('Terminal')).toBeNull()
  })

  it('shows sign-in only for the auth-shaped opaque refusal', () => {
    renderWithRouter({
      kind: 'refused',
      invocationRef,
      code: 'invocation_not_found',
      retryable: false,
      nextAction: 'Check the exact reference while signed in.',
    })

    expect(screen.getByRole('heading', { level: 1, name: 'Invocation receipt' })).toBeTruthy()
    expect(screen.getAllByText(/No current execution state is claimed/i).length).toBeGreaterThan(0)
    const signInLink = screen.getByRole('link', { name: 'Sign in to view current status' })
    const signInUrl = new URL(signInLink.getAttribute('href') ?? '', 'https://agentic-economy.test')
    expect(signInUrl.pathname).toMatch(/^\/sign-in\/?$/)
    expect(signInUrl.searchParams.get('redirect')).toBe(`/operations/invocations/${encodeURIComponent(invocationRef)}`)
  })

  it.each([
    {
      result: { kind: 'source_unavailable' as const, invocationRef },
      heading: 'Invocation receipt',
    },
    {
      result: {
        kind: 'refused' as const,
        invocationRef,
        code: 'invocation_runtime_unavailable' as const,
        retryable: true,
        nextAction: 'Retry the owner-scoped status read.',
      },
      heading: 'Invocation receipt',
    },
  ])('offers refresh rather than sign-in for retryable $result.kind status unavailability', ({ result, heading }) => {
    const onRefresh = vi.fn()
    renderWithRouter(result, { onRefresh })

    expect(screen.getByRole('heading', { level: 1, name: heading })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh current status' }))
    expect(onRefresh).toHaveBeenCalledOnce()
    expect(screen.queryByRole('link', { name: 'Sign in to view current status' })).toBeNull()
  })

  it('shows a non-auth non-retryable refusal next action without a misleading recovery control', () => {
    renderWithRouter({
      kind: 'refused',
      invocationRef,
      code: 'environment_mismatch',
      retryable: false,
      nextAction: 'Use the invocation environment recorded at creation.',
    }, { onRefresh: vi.fn() })

    const refusal = screen.getByRole('heading', { level: 2, name: 'Refusal' }).closest('section')
    expect(refusal).not.toBeNull()
    expect(within(refusal as HTMLElement).getByText('Use the invocation environment recorded at creation.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Refresh current status' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Sign in to view current status' })).toBeNull()
  })

  it('maps a thrown source read to source unavailable without inventing status', async () => {
    readStatusMock.mockRejectedValue(new Error('offline'))
    const loader = Route.options.loader as (input: { params: { invocationRef: string } }) => Promise<unknown>

    await expect(loader({ params: { invocationRef } })).resolves.toEqual({ kind: 'source_unavailable', invocationRef })
    expect(readStatusMock).toHaveBeenCalledWith({ data: { invocationRef } })
  })
})
