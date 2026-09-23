/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { RouterContextProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import '../../setup/jsdom-platform'

import type { CallStatusPageActions, CallStatusPageResult } from '@/routes/_operator/calls.$callRef'

const readStatusMock = vi.hoisted(() => vi.fn())
const cancelMock = vi.hoisted(() => vi.fn())
const reconcileMock = vi.hoisted(() => vi.fn())

vi.mock('@/modules/capability-execution/call-recovery.functions', () => ({
  readOwnerCallStatusServer: readStatusMock,
  cancelOwnerCallServer: cancelMock,
  reconcileOwnerCallServer: reconcileMock,
}))

import { CallStatusPage, Route } from '@/routes/_operator/calls.$callRef'

const callRef = 'invocation:exact-owner-status'
const toolRef = `operation:v1:${'a'.repeat(64)}`
const ownerContext = {
  purpose: null,
  agent: {
    principalRef: 'principal:agent:weather',
    applicationRef: 'application:weather',
    currentDisplayName: 'Weather assistant',
  },
  recordedTool: {
    kind: 'available',
    basis: 'call_snapshot',
    name: 'Observe Perth weather',
    providerRef: 'provider:weather:one',
    providerName: null,
  },
  reconciliation: {
    canSubmitEvidence: true,
    permissionBasis: 'account_owner',
    requiresVerifiedEvidence: true,
  },
} as const

function renderWithRouter(result: CallStatusPageResult, actions?: CallStatusPageActions) {
  const rootRoute = createRootRoute()
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: '/' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/tools/$toolRef' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/calls/$callRef' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/sign-in/$' }),
  ])
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
  return render(
    <RouterContextProvider router={router}>
      <CallStatusPage result={result} {...(actions === undefined ? {} : { actions })} />
    </RouterContextProvider>,
  )
}

function renderRouteComponent(result: CallStatusPageResult) {
  vi.spyOn(Route, 'useLoaderData').mockReturnValue(result as never)
  const Component = Route.options.component
  if (Component === undefined) throw new Error('call_status_route_component_missing')
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

describe('/calls/$callRef', () => {
  it('passes the exact route reference to the owner-scoped server read', async () => {
    readStatusMock.mockResolvedValue({
      kind: 'refused',
      callRef,
      code: 'invocation_not_found',
      retryable: false,
    })
    const loader = Route.options.loader as (input: { params: { callRef: string } }) => Promise<unknown>

    await expect(loader({ params: { callRef } })).resolves.toMatchObject({ kind: 'refused', callRef })
    expect(readStatusMock).toHaveBeenCalledWith({ data: { callRef } })
  })

  it('renders exact terminal facts and preserves the exact current Tool link', () => {
    renderWithRouter({
      kind: 'found',
      version: 1,
      callRef,
      toolRef,
      state: 'terminal',
      ownerContext,
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
        callRef,
        toolRef,
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

    expect(screen.getByRole('heading', { level: 1, name: 'Call receipt' })).toBeTruthy()
    expect(screen.getAllByText(callRef).length).toBeGreaterThan(0)
    const toolLink = screen.getByRole('link', { name: 'Observe Perth weather' })
    expect(toolLink.getAttribute('href')).toBe(`/tools/${encodeURIComponent(toolRef)}`)
    expect(screen.getByText('provider:weather:one (name not recorded)')).toBeTruthy()
    expect(screen.getByText('Weather assistant')).toBeTruthy()
    expect(screen.getByText('Not recorded for this Call')).toBeTruthy()
    expect(screen.getAllByText('Terminal').length).toBeGreaterThan(0)
    expect(screen.getAllByText('AUD 1.25').length).toBeGreaterThan(0)
    expect(screen.getByText('attempt:exact')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
    expect(screen.getByText('sha256:top-level-evidence')).toBeTruthy()
    expect(screen.getByText(/"temperature": 24/)).toBeTruthy()
  })

  it('keeps the owner Calls context and progressively discloses technical evidence', () => {
    renderWithRouter({
      kind: 'found',
      version: 1,
      callRef,
      toolRef,
      state: 'terminal',
      attemptRef: 'attempt:exact',
      effectGeneration: 3,
      result: {
        kind: 'completed',
        callRef,
        toolRef,
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

    expect(screen.getByRole('main')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to Calls' }).getAttribute('href')).toBe('/activity')
    expect(screen.getByRole('heading', { name: 'Call summary' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Output' })).toBeTruthy()

    const technical = screen.getByText('Technical record').closest('details')
    expect(technical).not.toBeNull()
    expect((technical as HTMLDetailsElement).open).toBe(false)
    expect(within(technical as HTMLElement).getAllByText(callRef).length).toBeGreaterThan(0)
    expect(within(technical as HTMLElement).getByText('attempt:exact')).toBeTruthy()
    expect(within(technical as HTMLElement).getByText('3')).toBeTruthy()
    expect(within(technical as HTMLElement).getByRole('heading', { name: 'What happened', hidden: true })).toBeTruthy()
  })

  it('presents a completed receipt as six recorded stages with money facts and reuse actions', () => {
    renderWithRouter({
      kind: 'found',
      version: 1,
      callRef,
      toolRef,
      state: 'terminal',
      previousInput: { city: 'Perth', units: 'metric' },
      result: {
        kind: 'completed',
        callRef,
        toolRef,
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
          commercialModel: 'account_aud',
          receiptRef: 'receipt:public',
          state: 'settled',
          buyerCharge: { currency: 'AUD', units: '1250000', exponent: 6 },
          serviceFee: { currency: 'AUD', units: '250000', exponent: 6 },
          totalBuyerCharge: { currency: 'AUD', units: '1500000', exponent: 6 },
          providerObligation: {
            amount: { currency: 'USDC', units: '1000000', exponent: 6 },
            settlementMethod: 'managed_x402',
            payoutEligible: false,
          },
          providerSettlement: {
            network: 'eip155:8453',
            asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
            amount: { currency: 'USDC', units: '1000000', exponent: 6 },
          },
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
    expect(screen.getByText('Buyer charge')).toBeTruthy()
    expect(screen.queryByText('Provider obligation')).toBeNull()
    expect(screen.getAllByText('AUD 1.250000').length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: 'Review Tool' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Save capability|Capability saved/ })).toBeNull()
    fireEvent.click(screen.getByText('Technical ways to reuse'))
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
      version: 1,
      callRef,
      toolRef,
      state: 'in_progress',
      result: { kind: 'pending', callRef, toolRef, retryAfterMs: 2_000 },
    })

    expect(screen.getAllByText('In progress').length).toBeGreaterThan(0)
    expect(screen.getByText('Pending')).toBeTruthy()
    expect(screen.getByText('2000 ms')).toBeTruthy()
    expect(screen.queryByText('Completed')).toBeNull()
    expect(screen.getByRole('heading', { name: 'What can I do next?' })).toBeTruthy()
    expect(screen.getByText(`ae status ${callRef}`)).toBeTruthy()
  })

  it('keeps reconciliation required distinct without inventing a result', () => {
    renderWithRouter({ kind: 'found', version: 1, callRef, toolRef, state: 'reconciliation_required' })

    expect(screen.getAllByText('Reconciliation required').length).toBeGreaterThan(0)
    expect(screen.getByText('No canonical result is recorded yet. The state above remains authoritative.')).toBeTruthy()
    expect(screen.queryByText('Completed')).toBeNull()
    expect(screen.getAllByText('What happened').length).toBeGreaterThan(0)
    expect(screen.getByText('Financial impact')).toBeTruthy()
    expect(screen.getByText('What happens automatically')).toBeTruthy()
    expect(screen.getByText('What you can do')).toBeTruthy()
    expect(screen.queryByText('Reference kept')).toBeNull()
    expect(screen.getByText('The external effect may have started. Reconcile before retrying.')).toBeTruthy()
  })

  it('submits explicit owner reconciliation evidence only when canonical binding facts exist', () => {
    const onReconcile = vi.fn()
    renderWithRouter({
      kind: 'found',
      version: 1,
      callRef,
      toolRef,
      state: 'reconciliation_required',
      attemptRef: 'attempt:uncertain',
      effectGeneration: 2,
      ownerContext,
    }, { onReconcile })

    fireEvent.click(screen.getByRole('combobox', { name: 'Observed provider outcome' }))
    fireEvent.click(screen.getByRole('option', { name: 'Effect released' }))
    fireEvent.change(screen.getByLabelText('Evidence source'), { target: { value: 'Provider control plane' } })
    fireEvent.change(screen.getByLabelText('Evidence reference'), { target: { value: 'evt_123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit reconciliation evidence' }))

    expect(onReconcile).toHaveBeenCalledWith({
      resolution: 'released',
      source: 'Provider control plane',
      evidenceRef: 'evt_123',
    })
  })

  it('does not expose evidence submission when the owner receipt context is absent', () => {
    renderWithRouter({
      kind: 'found',
      version: 1,
      callRef,
      toolRef,
      state: 'reconciliation_required',
      attemptRef: 'attempt:uncertain',
      effectGeneration: 2,
      ownerContext: null,
    }, { onReconcile: vi.fn(), onRefresh: vi.fn(async () => undefined) })

    expect(screen.getByText('Evidence submission is unavailable')).toBeTruthy()
    expect(screen.getByText(/Permission to submit Provider evidence could not be confirmed/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Refresh current status' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Submit reconciliation evidence' })).toBeNull()
    expect(screen.queryByLabelText('Evidence source')).toBeNull()
  })

  it('requires explicit confirmation before requesting cancellation', async () => {
    const onCancel = vi.fn(async () => undefined)
    const view = renderWithRouter({
      kind: 'found',
      version: 1,
      callRef,
      toolRef,
      state: 'retryable',
    }, { onCancel })

    fireEvent.click(screen.getByRole('button', { name: 'Cancel Call' }))
    expect(onCancel).not.toHaveBeenCalled()
    const dialog = screen.getByRole('alertdialog', { name: 'Cancel this Call?' })
    const keepButton = within(dialog).getByRole('button', { name: 'Keep Call' })
    await waitFor(() => expect(document.activeElement).toBe(keepButton))
    fireEvent.click(keepButton)
    expect(onCancel).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel Call' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm cancellation' }))
    await waitFor(() => expect(onCancel).toHaveBeenCalledOnce())

    view.unmount()
    renderWithRouter({
      kind: 'found',
      version: 1,
      callRef,
      toolRef,
      state: 'in_progress',
    }, { onCancel })
    expect(screen.queryByRole('button', { name: 'Cancel Call' })).toBeNull()
  })

  it('offers one manual refresh for a nonterminal state and disables it while pending', () => {
    const onRefresh = vi.fn()
    const { unmount } = renderWithRouter({
      kind: 'found',
      version: 1,
      callRef,
      toolRef,
      state: 'in_progress',
    }, { onRefresh })

    fireEvent.click(screen.getByRole('button', { name: 'Refresh current status' }))
    expect(onRefresh).toHaveBeenCalledOnce()

    unmount()
    renderWithRouter({
      kind: 'found',
      version: 1,
      callRef,
      toolRef,
      state: 'in_progress',
    }, { onRefresh, refreshPending: true })
    expect(screen.getByRole('button', { name: 'Refreshing current status…' }).hasAttribute('disabled')).toBe(true)

    cleanup()
    renderWithRouter({
      kind: 'found',
      version: 2,
      callRef,
      toolRef,
      state: 'terminal',
    }, { onRefresh })
    expect(screen.queryByRole('button', { name: 'Refresh current status' })).toBeNull()
  })

  it('replaces a nonterminal displayed state with the current source status after refresh', async () => {
    readStatusMock.mockResolvedValue({
      kind: 'found',
      version: 2,
      callRef,
      toolRef,
      state: 'terminal',
      evidenceHash: 'sha256:refreshed',
    })
    renderRouteComponent({ kind: 'found', version: 1, callRef, toolRef, state: 'in_progress' })

    fireEvent.click(screen.getByRole('button', { name: 'Refresh current status' }))

    await waitFor(() => expect(screen.getAllByText('Resolved — failed').length).toBeGreaterThan(0))
    expect(readStatusMock).toHaveBeenCalledWith({ data: { callRef } })
    expect(screen.queryByText('In progress')).toBeNull()
    expect(screen.getByText('Current status refreshed. Purchase status: Resolved — failed.')).toBeTruthy()
  })

  it('renders a new route-keyed Call immediately without mirroring the previous record', () => {
    const first = { kind: 'found', version: 1, callRef, toolRef, state: 'in_progress' } as const
    const nextCallRef = 'invocation:next-owner-status'
    const nextToolRef = `operation:v1:${'b'.repeat(64)}`
    const next = { kind: 'found', version: 1, callRef: nextCallRef, toolRef: nextToolRef, state: 'authorized' } as const
    const loader = vi.spyOn(Route, 'useLoaderData').mockReturnValue(first)
    const Component = Route.options.component
    if (Component === undefined) throw new Error('call_status_route_component_missing')
    const rootRoute = createRootRoute()
    const routeTree = rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: '/' }),
      createRoute({ getParentRoute: () => rootRoute, path: '/tools/$toolRef' }),
      createRoute({ getParentRoute: () => rootRoute, path: '/activity' }),
    ])
    const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
    const view = render(
      <RouterContextProvider router={router}>{createElement(Component)}</RouterContextProvider>,
    )

    expect(screen.getByRole('link', { name: 'Recorded Tool name unavailable' }).getAttribute('href')).toContain(encodeURIComponent(toolRef))
    loader.mockReturnValue(next)
    view.rerender(<RouterContextProvider router={router}>{createElement(Component)}</RouterContextProvider>)

    expect(screen.getByRole('link', { name: 'Recorded Tool name unavailable' }).getAttribute('href')).toContain(encodeURIComponent(nextToolRef))
    expect(screen.queryByText(callRef)).toBeNull()
  })

  it('keeps the displayed state and makes no newer-state claim when refresh cannot read the source', async () => {
    readStatusMock.mockRejectedValue(new Error('offline'))
    renderRouteComponent({ kind: 'found', version: 1, callRef, toolRef, state: 'in_progress' })

    fireEvent.click(screen.getByRole('button', { name: 'Refresh current status' }))

    expect(await screen.findByText('The current status source is unavailable. The displayed state has not changed.')).toBeTruthy()
    expect(screen.getAllByText('In progress').length).toBeGreaterThan(0)
    expect(screen.queryByText('Terminal')).toBeNull()
  })

  it('reuses the cancellation key after an unconfirmed transport outcome', async () => {
    cancelMock
      .mockRejectedValueOnce(new Error('transport unavailable'))
      .mockResolvedValueOnce({ kind: 'found', version: 2, callRef, toolRef, state: 'cancelled' })
    renderRouteComponent({ kind: 'found', version: 1, callRef, toolRef, state: 'retryable' })

    fireEvent.click(screen.getByRole('button', { name: 'Cancel Call' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm cancellation' }))
    expect(await screen.findByText('The cancellation source is unavailable. No new Call state is claimed.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel Call' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm cancellation' }))
    await waitFor(() => expect(cancelMock).toHaveBeenCalledTimes(2))

    const keys = cancelMock.mock.calls.map((call) => call[0]?.data?.idempotencyKey)
    expect(keys[1]).toBe(keys[0])
  })

  it('reuses the cancellation key after reload until a response is confirmed', async () => {
    cancelMock
      .mockRejectedValueOnce(new Error('transport unavailable'))
      .mockResolvedValueOnce({ kind: 'found', version: 2, callRef, toolRef, state: 'cancelled' })
    const firstView = renderRouteComponent({ kind: 'found', version: 1, callRef, toolRef, state: 'retryable' })

    fireEvent.click(screen.getByRole('button', { name: 'Cancel Call' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm cancellation' }))
    expect(await screen.findByText('The cancellation source is unavailable. No new Call state is claimed.')).toBeTruthy()
    firstView.unmount()

    renderRouteComponent({ kind: 'found', version: 1, callRef, toolRef, state: 'retryable' })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel Call' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm cancellation' }))
    await waitFor(() => expect(cancelMock).toHaveBeenCalledTimes(2))

    const keys = cancelMock.mock.calls.map((call) => call[0]?.data?.idempotencyKey)
    expect(keys[1]).toBe(keys[0])
    expect(window.sessionStorage.length).toBe(0)
  })

  it('reuses the exact reconciliation attempt after an unconfirmed transport outcome', async () => {
    reconcileMock
      .mockRejectedValueOnce(new Error('transport unavailable'))
      .mockResolvedValueOnce({ kind: 'found', version: 2, callRef, toolRef, state: 'terminal' })
    renderRouteComponent({
      kind: 'found',
      version: 1,
      callRef,
      toolRef,
      state: 'reconciliation_required',
      attemptRef: 'attempt:uncertain',
      effectGeneration: 2,
      ownerContext,
    })

    fireEvent.change(screen.getByLabelText('Evidence source'), { target: { value: 'Provider control plane' } })
    fireEvent.change(screen.getByLabelText('Evidence reference'), { target: { value: 'evt_123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit reconciliation evidence' }))
    expect(await screen.findByText('The reconciliation source is unavailable. No new Call state is claimed.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Submit reconciliation evidence' }))
    await waitFor(() => expect(reconcileMock).toHaveBeenCalledTimes(2))

    const first = reconcileMock.mock.calls[0]?.[0]?.data
    const second = reconcileMock.mock.calls[1]?.[0]?.data
    expect(second.idempotencyKey).toBe(first.idempotencyKey)
    expect(second.evidence.observedAt).toBe(first.evidence.observedAt)
    expect(second.evidence.digest).toBe(first.evidence.digest)
    expect(second.evidence).toEqual(first.evidence)
  })

  it('restores and reuses the exact reconciliation attempt after reload', async () => {
    reconcileMock
      .mockRejectedValueOnce(new Error('transport unavailable'))
      .mockResolvedValueOnce({ kind: 'found', version: 2, callRef, toolRef, state: 'terminal' })
    const result = {
      kind: 'found',
      version: 1,
      callRef,
      toolRef,
      state: 'reconciliation_required',
      attemptRef: 'attempt:uncertain',
      effectGeneration: 2,
      ownerContext,
    } as const
    const firstView = renderRouteComponent(result)

    fireEvent.click(screen.getByRole('combobox', { name: 'Observed provider outcome' }))
    fireEvent.click(screen.getByRole('option', { name: 'Effect released' }))
    fireEvent.change(screen.getByLabelText('Evidence source'), { target: { value: 'Provider control plane' } })
    fireEvent.change(screen.getByLabelText('Evidence reference'), { target: { value: 'evt_123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit reconciliation evidence' }))
    expect(await screen.findByText('The reconciliation source is unavailable. No new Call state is claimed.')).toBeTruthy()
    firstView.unmount()

    renderRouteComponent(result)
    expect((screen.getByLabelText('Evidence source') as HTMLInputElement).value).toBe('Provider control plane')
    expect((screen.getByLabelText('Evidence reference') as HTMLInputElement).value).toBe('evt_123')
    expect(screen.getByRole('combobox', { name: 'Observed provider outcome' }).textContent).toContain('Effect released')
    fireEvent.click(screen.getByRole('button', { name: 'Submit reconciliation evidence' }))
    await waitFor(() => expect(reconcileMock).toHaveBeenCalledTimes(2))

    const first = reconcileMock.mock.calls[0]?.[0]?.data
    const second = reconcileMock.mock.calls[1]?.[0]?.data
    expect(second.idempotencyKey).toBe(first.idempotencyKey)
    expect(second.evidence).toEqual(first.evidence)
    expect(window.sessionStorage.length).toBe(0)
  })

  it('rejects a stored reconciliation draft whose content no longer matches its identity digest', async () => {
    reconcileMock.mockRejectedValueOnce(new Error('transport unavailable'))
    const result = {
      kind: 'found', version: 1, callRef, toolRef, state: 'reconciliation_required',
      attemptRef: 'attempt:uncertain', effectGeneration: 2, ownerContext,
    } as const
    const firstView = renderRouteComponent(result)
    fireEvent.change(screen.getByLabelText('Evidence source'), { target: { value: 'Provider control plane' } })
    fireEvent.change(screen.getByLabelText('Evidence reference'), { target: { value: 'evt_123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit reconciliation evidence' }))
    expect(await screen.findByText('The reconciliation source is unavailable. No new Call state is claimed.')).toBeTruthy()
    const storageKey = Object.keys(window.sessionStorage)[0]
    if (storageKey === undefined) throw new Error('reconciliation_storage_key_missing')
    const stored = JSON.parse(window.sessionStorage.getItem(storageKey) ?? '{}') as { draft?: { source?: string } }
    if (stored.draft === undefined) throw new Error('reconciliation_storage_draft_missing')
    stored.draft.source = 'Tampered source'
    window.sessionStorage.setItem(storageKey, JSON.stringify(stored))
    firstView.unmount()

    renderRouteComponent(result)
    expect((screen.getByLabelText('Evidence source') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('Evidence reference') as HTMLInputElement).value).toBe('')
  })

  it('does not reuse a stored reconciliation attempt after the Call generation changes', async () => {
    reconcileMock
      .mockRejectedValueOnce(new Error('transport unavailable'))
      .mockResolvedValueOnce({ kind: 'found', version: 3, callRef, toolRef, state: 'terminal' })
    const firstView = renderRouteComponent({
      kind: 'found', version: 1, callRef, toolRef, state: 'reconciliation_required',
      attemptRef: 'attempt:uncertain', effectGeneration: 2, ownerContext,
    })
    fireEvent.change(screen.getByLabelText('Evidence source'), { target: { value: 'Provider control plane' } })
    fireEvent.change(screen.getByLabelText('Evidence reference'), { target: { value: 'evt_123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit reconciliation evidence' }))
    expect(await screen.findByText('The reconciliation source is unavailable. No new Call state is claimed.')).toBeTruthy()
    firstView.unmount()

    renderRouteComponent({
      kind: 'found', version: 2, callRef, toolRef, state: 'reconciliation_required',
      attemptRef: 'attempt:uncertain', effectGeneration: 3, ownerContext,
    })
    expect((screen.getByLabelText('Evidence source') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('Evidence reference') as HTMLInputElement).value).toBe('')
    fireEvent.change(screen.getByLabelText('Evidence source'), { target: { value: 'Provider control plane' } })
    fireEvent.change(screen.getByLabelText('Evidence reference'), { target: { value: 'evt_123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit reconciliation evidence' }))
    await waitFor(() => expect(reconcileMock).toHaveBeenCalledTimes(2))

    const first = reconcileMock.mock.calls[0]?.[0]?.data
    const second = reconcileMock.mock.calls[1]?.[0]?.data
    expect(second.idempotencyKey).not.toBe(first.idempotencyKey)
    expect(second.evidence.effectGeneration).toBe(3)
    expect(window.sessionStorage.length).toBe(0)
  })

  it('clears old reconciliation evidence when an in-place refresh advances the Call generation', async () => {
    reconcileMock
      .mockRejectedValueOnce(new Error('transport unavailable'))
      .mockResolvedValueOnce({ kind: 'found', version: 3, callRef, toolRef, state: 'terminal' })
    readStatusMock.mockResolvedValueOnce({
      kind: 'found', version: 2, callRef, toolRef, state: 'reconciliation_required',
      attemptRef: 'attempt:uncertain', effectGeneration: 3, ownerContext,
    })
    renderRouteComponent({
      kind: 'found', version: 1, callRef, toolRef, state: 'reconciliation_required',
      attemptRef: 'attempt:uncertain', effectGeneration: 2, ownerContext,
    })
    fireEvent.change(screen.getByLabelText('Evidence source'), { target: { value: 'Old provider source' } })
    fireEvent.change(screen.getByLabelText('Evidence reference'), { target: { value: 'evt_old' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit reconciliation evidence' }))
    expect(await screen.findByText('The reconciliation source is unavailable. No new Call state is claimed.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Refresh current status' }))
    await screen.findByText('Current status refreshed. Purchase status: Open — outcome uncertain.')
    expect((screen.getByLabelText('Evidence source') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('Evidence reference') as HTMLInputElement).value).toBe('')
    fireEvent.click(screen.getByRole('button', { name: 'Submit reconciliation evidence' }))
    expect(reconcileMock).toHaveBeenCalledTimes(1)

    fireEvent.change(screen.getByLabelText('Evidence source'), { target: { value: 'Current provider source' } })
    fireEvent.change(screen.getByLabelText('Evidence reference'), { target: { value: 'evt_current' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit reconciliation evidence' }))
    await waitFor(() => expect(reconcileMock).toHaveBeenCalledTimes(2))
    const first = reconcileMock.mock.calls[0]?.[0]?.data
    const second = reconcileMock.mock.calls[1]?.[0]?.data
    expect(second.idempotencyKey).not.toBe(first.idempotencyKey)
    expect(second.evidence).toMatchObject({
      effectGeneration: 3,
      source: 'Current provider source',
      evidenceRef: 'evt_current',
    })
  })

  it('clears old reconciliation evidence when loader data replaces the same Call generation', async () => {
    reconcileMock.mockRejectedValueOnce(new Error('transport unavailable'))
    const first = {
      kind: 'found', version: 1, callRef, toolRef, state: 'reconciliation_required',
      attemptRef: 'attempt:uncertain', effectGeneration: 2, ownerContext,
    } as const
    const next = { ...first, version: 2, effectGeneration: 3 } as const
    const loader = vi.spyOn(Route, 'useLoaderData').mockReturnValue(first)
    const Component = Route.options.component
    if (Component === undefined) throw new Error('call_status_route_component_missing')
    const rootRoute = createRootRoute()
    const routeTree = rootRoute.addChildren([createRoute({ getParentRoute: () => rootRoute, path: '/' })])
    const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
    const view = render(
      <RouterContextProvider router={router}>{createElement(Component)}</RouterContextProvider>,
    )
    fireEvent.change(screen.getByLabelText('Evidence source'), { target: { value: 'Old provider source' } })
    fireEvent.change(screen.getByLabelText('Evidence reference'), { target: { value: 'evt_old' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit reconciliation evidence' }))
    expect(await screen.findByText('The reconciliation source is unavailable. No new Call state is claimed.')).toBeTruthy()

    loader.mockReturnValue(next)
    view.rerender(<RouterContextProvider router={router}>{createElement(Component)}</RouterContextProvider>)

    expect((screen.getByLabelText('Evidence source') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('Evidence reference') as HTMLInputElement).value).toBe('')
    fireEvent.click(screen.getByRole('button', { name: 'Submit reconciliation evidence' }))
    expect(reconcileMock).toHaveBeenCalledTimes(1)
  })

  it('uses a new reconciliation attempt when the evidence changes', async () => {
    reconcileMock
      .mockRejectedValueOnce(new Error('transport unavailable'))
      .mockResolvedValueOnce({ kind: 'found', version: 2, callRef, toolRef, state: 'terminal' })
    renderRouteComponent({
      kind: 'found',
      version: 1,
      callRef,
      toolRef,
      state: 'reconciliation_required',
      attemptRef: 'attempt:uncertain',
      effectGeneration: 2,
      ownerContext,
    })

    fireEvent.change(screen.getByLabelText('Evidence source'), { target: { value: 'Provider control plane' } })
    fireEvent.change(screen.getByLabelText('Evidence reference'), { target: { value: 'evt_123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit reconciliation evidence' }))
    expect(await screen.findByText('The reconciliation source is unavailable. No new Call state is claimed.')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Evidence reference'), { target: { value: 'evt_456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit reconciliation evidence' }))
    await waitFor(() => expect(reconcileMock).toHaveBeenCalledTimes(2))

    const first = reconcileMock.mock.calls[0]?.[0]?.data
    const second = reconcileMock.mock.calls[1]?.[0]?.data
    expect(second.idempotencyKey).not.toBe(first.idempotencyKey)
    expect(second.evidence.evidenceRef).toBe('evt_456')
    expect(second.evidence.digest).not.toBe(first.evidence.digest)
  })

  it('keeps an opaque not-found refusal inside the authenticated Calls workspace', () => {
    renderWithRouter({
      kind: 'refused',
      callRef,
      code: 'invocation_not_found',
      retryable: false,
      nextAction: 'Check the exact reference while signed in.',
    })

    expect(screen.getByRole('heading', { level: 1, name: 'Call receipt' })).toBeTruthy()
    expect(screen.getAllByText(/No current execution state is claimed/i).length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: 'Back to Calls' }).getAttribute('href')).toBe('/activity')
    expect(screen.queryByRole('link', { name: 'Sign in to view current status' })).toBeNull()
  })

  it.each([
    {
      result: { kind: 'source_unavailable' as const, callRef },
      heading: 'Call receipt',
    },
    {
      result: {
        kind: 'refused' as const,
        callRef,
        code: 'invocation_runtime_unavailable' as const,
        retryable: true,
        nextAction: 'Retry the owner-scoped status read.',
      },
      heading: 'Call receipt',
    },
  ])('offers refresh rather than sign-in for retryable $result.kind status unavailability', ({ result, heading }) => {
    const onRefresh = vi.fn()
    renderWithRouter(result, { onRefresh })

    expect(screen.getByRole('heading', { level: 1, name: heading })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRefresh).toHaveBeenCalledOnce()
    expect(screen.queryByRole('link', { name: 'Sign in to view current status' })).toBeNull()
  })

  it('shows a non-auth non-retryable refusal next action without a misleading recovery control', () => {
    renderWithRouter({
      kind: 'refused',
      callRef,
      code: 'environment_mismatch',
      retryable: false,
      nextAction: 'Use the Tool environment recorded at creation.',
    }, { onRefresh: vi.fn() })

    fireEvent.click(screen.getByText('Technical record'))
    const refusal = screen.getByRole('heading', { level: 2, name: 'Refusal evidence' }).closest('section')
    expect(refusal).not.toBeNull()
    expect(within(refusal as HTMLElement).getByText('Use the Tool environment recorded at creation.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Refresh current status' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Sign in to view current status' })).toBeNull()
  })

  it('maps a thrown source read to source unavailable without inventing status', async () => {
    readStatusMock.mockRejectedValue(new Error('offline'))
    const loader = Route.options.loader as (input: { params: { callRef: string } }) => Promise<unknown>

    await expect(loader({ params: { callRef } })).resolves.toEqual({ kind: 'source_unavailable', callRef })
    expect(readStatusMock).toHaveBeenCalledWith({ data: { callRef } })
  })

  it('renders a cancelled Call honestly without false success indicators or reuse actions', () => {
    renderWithRouter({
      kind: 'found',
      callRef,
      toolRef,
      state: 'cancelled',
      version: 1,
      ownerContext,
    })

    expect(screen.getByRole('heading', { level: 1, name: 'Call receipt' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Call summary' })).toBeTruthy()
    expect(screen.queryByText('Complete')).toBeNull()
    expect(screen.getAllByText(/Cancelled/i).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /Reuse/i })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Review Tool' })).toBeNull()
    expect(screen.queryByRole('heading', { level: 2, name: 'Output' })).toBeNull()
  })

  it('renders a refused-before-claim Call honestly with explicit refusal reasons and no fabricated settlement', () => {
    renderWithRouter({
      kind: 'found',
      callRef,
      toolRef,
      state: 'terminal',
      version: 1,
      result: {
        kind: 'refused',
        code: 'authority_denied',
        retryable: false,
        nextAction: 'Authorize the Call and retry.',
      },
      ownerContext,
    })

    expect(screen.getByRole('heading', { level: 1, name: 'Call receipt' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Call summary' })).toBeTruthy()
    expect(screen.queryByText('Complete')).toBeNull()
    expect(screen.getAllByText(/Resolved — failed/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Authorize the Call and retry.').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /Reuse/i })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Review Tool' })).toBeNull()
    expect(screen.queryByRole('heading', { level: 2, name: 'Output' })).toBeNull()
  })
})
