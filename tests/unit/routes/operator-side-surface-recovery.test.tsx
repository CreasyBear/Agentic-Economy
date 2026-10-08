/** @vitest-environment jsdom */
import { type ReactNode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { RouterContextProvider, createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

const serverMocks = vi.hoisted(() => ({
  readCalls: vi.fn(),
  readPrimary: vi.fn(),
  readReports: vi.fn(),
  reportingPolicy: vi.fn(),
  savedReports: vi.fn(),
}))
const routeDiagnostics = vi.hoisted(() => ({ capture: vi.fn() }))

vi.mock('@/lib/observability/capture-route-exception', () => ({ captureRouteException: routeDiagnostics.capture }))
vi.mock('@/lib/server/call-history.functions', () => ({
  readOwnerCallsServer: serverMocks.readCalls,
}))
vi.mock('@/lib/server/activity.functions', () => ({
  readOwnerActivityPrimaryServer: serverMocks.readPrimary,
  readOwnerActivityReportsServer: serverMocks.readReports,
}))
vi.mock('@/lib/server/complete-monthly-usage.functions', () => ({
  readUsageReportingPolicyServer: serverMocks.reportingPolicy,
  requestCompleteMonthlyUsageServer: vi.fn(), readCompleteMonthlyUsageServer: vi.fn(),
  readMonthlyRelatedDocumentsServer: vi.fn(), readMonthlyFinancialPartsServer: vi.fn(), configureUsageReportingServer: vi.fn(),
}))
vi.mock('@/lib/server/durable-usage-report.functions', () => ({
  listOwnerUsageReportsServer: serverMocks.savedReports,
  requestOwnerUsageReportServer: vi.fn(), readOwnerUsageReportServer: vi.fn(), readOwnerUsageReportPartsServer: vi.fn(),
}))
vi.mock('@/components/ae/layout/AeOperatorPage', () => ({
  AeOperatorPage: ({ children, title }: { children: ReactNode; title: string }) => <main><h1>{title}</h1>{children}</main>,
}))

import { BROWSER_READ_TIMEOUT_MS } from '@/lib/bounded-read'
import { AeActivity } from '@/components/ae/activity/AeActivity'
import type { ActivityLoaderResult } from '@/components/ae/activity/activity.contracts'
import { Route as ActivityRoute } from '@/routes/_operator/activity'

const productionLoader = ActivityRoute.options.loader
if (productionLoader === undefined) throw new Error('Activity primary loader is required')
// Existing direct loader tests intentionally exercise missing/partial contexts.
const loadActivity = (typeof productionLoader === 'function' ? productionLoader : productionLoader.handler) as
  (context?: unknown) => Promise<ActivityLoaderResult>

beforeEach(() => {
  serverMocks.reportingPolicy.mockReset().mockResolvedValue({ automaticMonthly: false, revision: 0,
    ownerConsentCurrent: false, schedulerActive: false })
  serverMocks.savedReports.mockReset().mockResolvedValue({ page: [], isDone: true, continueCursor: '' })
})

afterEach(() => {
  cleanup()
  serverMocks.readCalls.mockReset()
  serverMocks.readPrimary.mockReset()
  serverMocks.readReports.mockReset()
  routeDiagnostics.capture.mockReset()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function renderActivity(result: ActivityLoaderResult) {
  const rootRoute = createRootRoute()
  const routeTree = rootRoute.addChildren([createRoute({ getParentRoute: () => rootRoute, path: '/' })])
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
  const invalidate = vi.spyOn(router, 'invalidate').mockResolvedValue(undefined)
  const rendered = render(<RouterContextProvider router={router}><AeActivity result={result} /></RouterContextProvider>)
  return {
    invalidate,
    updateResult(next: ActivityLoaderResult) {
      rendered.rerender(<RouterContextProvider router={router}><AeActivity result={next} /></RouterContextProvider>)
    },
  }
}

function callRow(callRef: string, state: 'completed' | 'refused' | 'outcome_unknown', createdAt: number) {
  return {
    callRef,
    accountRef: 'account:owner',
    principalRef: 'principal:agent',
    credentialRef: 'credential:agent',
    applicationRef: 'application:agent',
    toolRef: `operation:v1:${'a'.repeat(64)}`,
    providerRef: 'provider:one',
    toolLabel: `Tool ${callRef}`,
    state,
    deliveryState: state === 'completed' ? 'delivered' as const : state === 'refused' ? 'not_delivered' as const : 'unknown' as const,
    paymentState: state === 'completed' ? 'settled' as const : state === 'refused' ? 'not_applicable' as const : 'unknown' as const,
    latencyMs: 100,
    createdAt,
    updatedAt: createdAt,
  }
}

const usage = {
  kind: 'available' as const,
  dimensionKind: 'account' as const,
  dimensionRef: 'account:owner',
  periodStartAt: Date.UTC(2026, 8, 1),
  periodEndAt: Date.UTC(2026, 9, 1),
  callCountUnits: '2', completedCountUnits: '1', outcomeUnknownCountUnits: '1',
  updatedAt: Date.UTC(2026, 8, 14),
  source: 'convex_call_evidence' as const,
}
const spend = {
  kind: 'available' as const,
  currency: 'AUD' as const,
  exponent: 6 as const,
  spendUnits: '1000000',
  transactionCountUnits: '1',
  periodStartAt: Date.UTC(2026, 8, 1),
  periodEndAt: Date.UTC(2026, 9, 1),
  observedAt: Date.UTC(2026, 8, 14),
  source: 'formance_transaction_cursor' as const,
  authoritativeForConsequences: false as const,
}
const periodStart = '2026-09'

function available(calls: Extract<ActivityLoaderResult, { kind: 'available' }>['calls']): ActivityLoaderResult {
  return { kind: 'available', calls, usage, spend, periodStart, periodStartAt: usage.periodStartAt, periodEndAt: usage.periodEndAt, dateRangeFilter: '30d' }
}

describe('Calls side-surface recovery', () => {
  it.each(['warm return', 'on-page refresh'] as const)('uses the production primary-loader policy without duplicate optional reads on %s', async (journey) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-08T04:00:00Z'))
    const primary = { kind: 'available', calls: { page: [callRow('confirmed', 'completed', 1)],
      isDone: true, continueCursor: '' }, plans: [] }
    let completeRefresh!: (value: typeof primary) => void
    serverMocks.readPrimary.mockResolvedValueOnce(primary)
      .mockReturnValueOnce(new Promise(resolve => { completeRefresh = resolve }))
    serverMocks.readReports.mockResolvedValue({ usage, spend })
    const root = createRootRoute({ component: Outlet })
    // Copy the actual installed loader metadata; the actual handler still owns range/deadline logic.
    const loader = typeof productionLoader === 'function'
      ? (context: unknown) => loadActivity(context)
      : { ...productionLoader, handler: (context: unknown) => loadActivity(context) }
    const activity = createRoute({ getParentRoute: () => root, path: '/activity', staleTime: 0,
      loader, component: () => <AeActivity result={activity.useLoaderData()} /> })
    const other = createRoute({ getParentRoute: () => root, path: '/market', component: () => <p>Other route</p> })
    const router = createRouter({ routeTree: root.addChildren([activity, other]),
      history: createMemoryHistory({ initialEntries: ['/activity'] }), defaultPendingMs: 500 })
    await router.load()
    const view = render(<RouterProvider router={router} />)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Period totals' })).toBeTruthy())
    const initialRange = serverMocks.readPrimary.mock.calls[0]?.[0].data
    if (journey === 'warm return') await act(async () => { await router.navigate({ to: '/market' }) })
    serverMocks.readReports.mockClear(); serverMocks.savedReports.mockClear(); serverMocks.reportingPolicy.mockClear()
    serverMocks.readReports.mockReturnValueOnce(new Promise(() => {}))
    vi.setSystemTime(new Date('2026-10-08T04:00:01Z'))
    let navigation!: Promise<void>
    await act(async () => {
      navigation = journey === 'warm return' ? router.navigate({ to: '/activity' }) : router.invalidate()
      await Promise.resolve()
    })
    await waitFor(() => expect(serverMocks.readPrimary).toHaveBeenCalledTimes(2))
    const refreshedRange = serverMocks.readPrimary.mock.calls[1]?.[0].data
    expect(refreshedRange.periodEndAt).toBeGreaterThan(initialRange.periodEndAt)
    if (journey === 'on-page refresh') {
      expect(screen.getByRole('row', { name: /Tool confirmed/u })).toBeTruthy()
      expect(screen.getByRole('heading', { name: 'Period totals' })).toBeTruthy()
      expect(screen.getByText('No saved reports for this Account.')).toBeTruthy()
    }
    expect(serverMocks.readReports).not.toHaveBeenCalled()
    expect(serverMocks.savedReports).not.toHaveBeenCalled()
    expect(serverMocks.reportingPolicy).not.toHaveBeenCalled()
    await act(async () => { completeRefresh(primary); await navigation })
    await waitFor(() => expect(serverMocks.readReports).toHaveBeenCalledOnce())
    expect(serverMocks.readReports.mock.calls[0]?.[0].data).toEqual(refreshedRange)
    expect(serverMocks.savedReports).toHaveBeenCalledOnce()
    expect(serverMocks.reportingPolicy).toHaveBeenCalledOnce()
    expect(screen.getByRole('row', { name: /Tool confirmed/u })).toBeTruthy()
    // An unresolved optional financial read does not block navigation or fresh Calls.
    expect(screen.getByText('Loading totals and reconciliation for this period…')).toBeTruthy()
    view.unmount()
  })

  it('projects a source rejection into an in-shell unavailable state', async () => {
    serverMocks.readPrimary.mockRejectedValue(new Error('source offline'))
    const loader = loadActivity
    await expect(loader()).resolves.toEqual({ kind: 'unavailable' })
    expect(routeDiagnostics.capture).toHaveBeenCalledWith(expect.any(Error), { 'ae.surface': 'operator_activity_loader' })
    const { invalidate } = renderActivity({ kind: 'unavailable' })
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1))
  })

  it('keeps a successful empty directory explicitly available', async () => {
    const calls = { page: [], isDone: true, continueCursor: null }
    serverMocks.readPrimary.mockResolvedValue({ kind: 'available', calls, plans: [] })
    const loader = loadActivity
    await expect(loader()).resolves.toMatchObject({
      kind: 'available',
      calls,
      usage: { kind: 'pending' },
      spend: { kind: 'pending' },
      dateRangeFilter: '30d',
    })
  })

  it('keeps Calls available with one actionable partial-state message when a summary fails', async () => {
    const calls = { page: [callRow('kept', 'completed', 1)], isDone: true, continueCursor: '' }
    const spend = { kind: 'available', spendUnits: '0' }
    serverMocks.readPrimary.mockResolvedValue({ kind: 'available', calls, plans: [] })
    serverMocks.readReports.mockResolvedValue({ usage: { kind: 'unavailable', code: 'source_unavailable' }, spend })
    const loader = loadActivity
    const result = await loader()

    expect(result).toMatchObject({
      kind: 'available',
      calls,
      usage: { kind: 'pending' },
      spend: { kind: 'pending' },
    })
    const { invalidate } = renderActivity(result as ActivityLoaderResult)
    await waitFor(() => expect(screen.getAllByText('Some summaries are unavailable')).toHaveLength(1))
    expect(screen.getAllByText('Tool kept')).toHaveLength(1)
    expect(screen.queryByText('No Calls yet')).toBeNull()
    expect(screen.queryByText('Usage unavailable')).toBeNull()
    const monthlySummary = screen.getByRole('region', { name: 'Period totals' })
    expect(within(monthlySummary).getByText('Some summaries are unavailable')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh summaries' }))
    await waitFor(() => expect(serverMocks.readReports).toHaveBeenCalledTimes(2))
    expect(invalidate).not.toHaveBeenCalled()
  })

  it('uses one fixed 30-day window for all owner reads and defaults to 50-row history', async () => {
    serverMocks.readPrimary.mockResolvedValue({ kind: 'available', calls: { page: [], isDone: true, continueCursor: '' }, plans: [] })
    const loader = loadActivity
    const result = await loader()
    if (result.kind !== 'available') throw new Error('Expected owner data')
    expect(result.periodEndAt - result.periodStartAt).toBe(30 * 86_400_000)
    const range = { periodStartAt: result.periodStartAt, periodEndAt: result.periodEndAt }
    expect(serverMocks.readPrimary).toHaveBeenCalledWith({ data: range, signal: expect.any(AbortSignal) })
    expect(serverMocks.readReports).not.toHaveBeenCalled()
    serverMocks.readReports.mockResolvedValue({ usage: { kind: 'empty' }, spend: { kind: 'empty' } })
    renderActivity(result)
    await waitFor(() => expect(serverMocks.readReports).toHaveBeenCalledExactlyOnceWith({ data: range, signal: expect.any(AbortSignal) }))
    await waitFor(() => expect(screen.getByText('Gross settled charges').parentElement?.textContent).toContain('A$0.00'))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('uses midnight UTC for Today and forwards the exact Agent to the report request', async () => {
    serverMocks.readPrimary.mockResolvedValue({ kind: 'available', calls: { page: [], isDone: true, continueCursor: '' }, plans: [] })
    const loader = loadActivity
    const result = await loader({ deps: { agent: 'principal:exact', range: 'today' } })
    if (result.kind !== 'available') throw new Error('Expected Agent data')
    const start = new Date(result.periodStartAt)
    expect(start.getUTCHours()).toBe(0)
    expect(start.getUTCMinutes()).toBe(0)
    expect(start.getUTCSeconds()).toBe(0)
    expect(start.getUTCMilliseconds()).toBe(0)
    expect(result.periodEndAt - result.periodStartAt).toBeLessThanOrEqual(86_400_000)
    expect(serverMocks.readPrimary).toHaveBeenCalledWith({ data: {
      principalRef: 'principal:exact', periodStartAt: result.periodStartAt, periodEndAt: result.periodEndAt,
    }, signal: expect.any(AbortSignal) })
    serverMocks.readReports.mockResolvedValue({ usage: { kind: 'empty' }, spend: { kind: 'not_requested' } })
    renderActivity(result)
    await waitFor(() => expect(serverMocks.readReports).toHaveBeenCalledExactlyOnceWith({ data: {
      principalRef: 'principal:exact', periodStartAt: result.periodStartAt, periodEndAt: result.periodEndAt,
    }, signal: expect.any(AbortSignal) }))
  })

  it('propagates loader navigation cancellation through the whole primary read without retrying', async () => {
    serverMocks.readPrimary.mockReturnValueOnce(new Promise(() => {}))
    const abortController = new AbortController()
    const loader = loadActivity
    const pending = loader({ abortController })
    const signal = serverMocks.readPrimary.mock.calls[0]?.[0].signal as AbortSignal
    expect(signal.aborted).toBe(false)
    abortController.abort(new DOMException('Navigation cancelled.', 'AbortError'))
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(signal.aborted).toBe(true)
    expect(serverMocks.readPrimary).toHaveBeenCalledOnce()
    expect(serverMocks.readReports).not.toHaveBeenCalled()
    expect(routeDiagnostics.capture).not.toHaveBeenCalled()
  })

  it('settles an unresponsive primary read at the browser deadline', async () => {
    vi.useFakeTimers()
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => {
      const controller = new AbortController()
      setTimeout(() => controller.abort(new DOMException('Primary deadline.', 'TimeoutError')), ms)
      return controller.signal
    })
    serverMocks.readPrimary.mockReturnValueOnce(new Promise(() => {}))
    const loader = loadActivity
    const pending = loader()
    await vi.advanceTimersByTimeAsync(BROWSER_READ_TIMEOUT_MS)
    await expect(pending).resolves.toEqual({ kind: 'unavailable' })
    expect(serverMocks.readPrimary).toHaveBeenCalledOnce()
    expect(routeDiagnostics.capture).toHaveBeenCalledWith(expect.objectContaining({ name: 'TimeoutError' }), { 'ae.surface': 'operator_activity_loader' })
  })

  it('keeps continuation reachable after a status filter matches no loaded rows', async () => {
    serverMocks.readCalls.mockResolvedValue({ page: [callRow('attention-later', 'outcome_unknown', 1)], isDone: true, continueCursor: '' })
    renderActivity(available({ page: [callRow('first', 'completed', 2)], isDone: false, continueCursor: 'cursor:next' }))
    fireEvent.click(screen.getByRole('button', { name: /Outcome unknown\s+0/u }))
    expect(screen.getByText('No Calls match these filters')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await waitFor(() => expect(screen.getAllByText('Tool attention-later')).toHaveLength(1))
    expect(screen.queryByText('No Calls match these filters')).toBeNull()
  })

  it('retains All time history with a fixed cutoff and an explicit shorter-period totals state', async () => {
    serverMocks.readPrimary.mockResolvedValue({ kind: 'available', calls: { page: [callRow('historic', 'completed', 1)], isDone: false, continueCursor: 'cursor:historic' }, plans: [] })
    serverMocks.readReports.mockResolvedValue({ usage: { kind: 'unavailable', code: 'usage_window_too_large' }, spend: { kind: 'unavailable', code: 'formance_spend_window_too_large' } })
    const loader = loadActivity
    const result = await loader({ deps: { range: 'all' } })
    if (result.kind !== 'available') throw new Error('Expected history')
    expect(serverMocks.readPrimary).toHaveBeenCalledWith({ data: { periodStartAt: 0, periodEndAt: result.periodEndAt }, signal: expect.any(AbortSignal) })
    renderActivity(result)
    expect(screen.getAllByText('Tool historic')).toHaveLength(1)
    await waitFor(() => expect(screen.getByText('Choose a shorter period for totals')).toBeTruthy())
    expect(screen.getByRole('button', { name: 'Load more' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Refresh summaries' })).toBeNull()
    expect(screen.queryByText('A$0.00')).toBeNull()
  })

  it('preserves unknown Agent charges instead of displaying a zero or account amount', () => {
    const result = available({ page: [], isDone: true, continueCursor: '' })
    if (result.kind !== 'available') throw new Error('Expected data')
    renderActivity({ ...result, filteredAgent: 'principal:exact', spend: { kind: 'not_requested' }, usage: {
      ...usage, dimensionKind: 'agent', dimensionRef: 'principal:exact', amountCoverage: 'incomplete',
    } })
    expect(screen.getByText('Agent settled charges').parentElement?.textContent).toContain('Amount coverage incomplete')
    expect(screen.queryByText('A$0.00')).toBeNull()
    expect(screen.queryByText('Gross settled charges')).toBeNull()
  })

  it('foregrounds Calls needing attention and keeps routine history separate', () => {
    renderActivity(available({
      page: [callRow('routine', 'completed', 2), callRow('attention', 'outcome_unknown', 1)],
      isDone: true,
      continueCursor: '',
    }))

    const attention = screen.getByRole('region', { name: 'Needs attention' })
    const recent = screen.getByRole('region', { name: 'Recent Calls' })
    const monthlySummary = screen.getByRole('region', { name: 'Period totals' })
    expect(within(attention).getAllByText('Tool attention')).toHaveLength(1)
    expect(within(attention).getAllByText('Needs review').length).toBeGreaterThan(0)
    expect(within(attention).queryByText('Tool routine')).toBeNull()
    expect(within(recent).getAllByText('Tool routine')).toHaveLength(1)
    expect(within(recent).getAllByText('Resolved — delivered').length).toBeGreaterThan(0)
    expect(within(recent).queryByText('Tool attention')).toBeNull()
    expect(attention.compareDocumentPosition(recent) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(recent.compareDocumentPosition(monthlySummary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(attention).getAllByRole('link', { name: 'Review Tool attention' })[0]?.getAttribute('href')).toBe('/calls/attention?returnRange=30d&returnStatus=all')
    expect(screen.queryByText('reconciliation required')).toBeNull()
  })

  it('routes contradictory completed facts to attention instead of claiming resolution', () => {
    renderActivity(available({
      page: [{ ...callRow('contradictory', 'completed', 2), paymentState: 'unknown' }],
      isDone: true,
      continueCursor: '',
    }))

    const attention = screen.getByRole('region', { name: 'Needs attention' })
    expect(within(attention).getAllByText('Tool contradictory')).toHaveLength(1)
    expect(within(attention).getAllByText('Needs review').length).toBeGreaterThan(0)
    expect(screen.getByRole('columnheader', { name: /Purchase status/u })).toBeTruthy()
  })

  it('preserves loaded Calls and the cursor when pagination fails, then retries that continuation', async () => {
    serverMocks.readCalls
      .mockRejectedValueOnce(new Error('continuation offline'))
      .mockResolvedValueOnce({ page: [callRow('older', 'completed', 1)], isDone: true, continueCursor: '' })
    renderActivity(available({
      page: [callRow('newer', 'completed', 2)],
      isDone: false,
      continueCursor: 'cursor:older',
    }))

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    const failure = await screen.findByRole('alert')
    expect(failure.textContent).toContain('Could not load older Calls.')
    expect(failure.textContent).toContain('The loaded Calls remain available')
    expect(failure.textContent).not.toContain('A$0.00')
    expect(screen.getAllByText('Tool newer')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Try loading more again' }))

    await waitFor(() => expect(screen.getAllByText('Tool older')).toHaveLength(1))
    expect(serverMocks.readCalls).toHaveBeenNthCalledWith(1, { data: { cursor: 'cursor:older', periodStartAt: usage.periodStartAt, periodEndAt: usage.periodEndAt }, signal: expect.any(AbortSignal) })
    expect(serverMocks.readCalls).toHaveBeenNthCalledWith(2, { data: { cursor: 'cursor:older', periodStartAt: usage.periodStartAt, periodEndAt: usage.periodEndAt }, signal: expect.any(AbortSignal) })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull()
  })

  it('continues pagination after a refresh returns identical Calls in a new object', async () => {
    const calls = {
      page: [callRow('newer', 'completed', 2)],
      isDone: false,
      continueCursor: 'cursor:older',
    }
    const view = renderActivity(available(calls))
    view.updateResult(available({ ...calls, page: [...calls.page] }))
    serverMocks.readCalls.mockResolvedValueOnce({
      page: [callRow('older', 'completed', 1)], isDone: true, continueCursor: '',
    })

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))

    expect(await screen.findAllByText('Tool older')).toHaveLength(1)
    expect(screen.getAllByText('Tool newer')).toHaveLength(1)
    expect(serverMocks.readCalls).toHaveBeenCalledWith({ data: { cursor: 'cursor:older', periodStartAt: usage.periodStartAt, periodEndAt: usage.periodEndAt }, signal: expect.any(AbortSignal) })
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull()
  })

  it('rejects a stale pagination response after refreshed loader Calls replace the page', async () => {
    let resolveContinuation: (value: unknown) => void = () => undefined
    serverMocks.readCalls.mockImplementation(() => new Promise((resolve) => { resolveContinuation = resolve }))
    const view = renderActivity(available({
      page: [callRow('initial', 'completed', 3)],
      isDone: false,
      continueCursor: 'cursor:initial',
    }))

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    const obsoleteSignal = serverMocks.readCalls.mock.calls[0]?.[0].signal as AbortSignal
    view.updateResult(available({
      page: [callRow('refreshed', 'completed', 4)],
      isDone: false,
      continueCursor: 'cursor:refreshed',
    }))
    expect(obsoleteSignal.aborted).toBe(true)
    resolveContinuation({ page: [callRow('stale', 'completed', 2)], isDone: true, continueCursor: '' })

    await waitFor(() => expect(screen.getAllByText('Tool refreshed')).toHaveLength(1))
    expect(screen.queryByText('Tool initial')).toBeNull()
    expect(screen.queryByText('Tool stale')).toBeNull()
    expect(screen.getByRole('button', { name: 'Load more' })).toBeTruthy()
  })

  it('ignores a prior-period continuation even when the new period starts with identical Calls', async () => {
    let resolveContinuation: (value: unknown) => void = () => undefined
    serverMocks.readCalls.mockImplementation(() => new Promise((resolve) => { resolveContinuation = resolve }))
    const calls = { page: [callRow('shared', 'completed', usage.periodStartAt + 3)], isDone: false, continueCursor: 'cursor:old' }
    const initial = available(calls)
    if (initial.kind !== 'available') throw new Error('Expected history')
    const view = renderActivity(initial)
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    view.updateResult({ ...initial, periodStartAt: usage.periodStartAt + 2 })
    resolveContinuation({ page: [callRow('outside-new-period', 'completed', usage.periodStartAt + 1)], isDone: true, continueCursor: '' })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Load more' })).toBeTruthy())
    expect(screen.queryByText('Tool outside-new-period')).toBeNull()
    expect(screen.getAllByText('Tool shared')).toHaveLength(1)
  })

  it('preserves the status filter through summary refresh, date changes and exact Agent changes', async () => {
    serverMocks.readReports.mockResolvedValue({ usage, spend })
    const initial = available({ page: [callRow('done', 'completed', 3), callRow('refused', 'refused', 2)],
      isDone: true, continueCursor: '' })
    if (initial.kind !== 'available') throw new Error('Expected history')
    const view = renderActivity({ ...initial, usage: { kind: 'unavailable', code: 'source_unavailable' } })
    fireEvent.click(screen.getByRole('button', { name: /Refused\s+1/u }))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh summaries' }))
    await waitFor(() => expect(serverMocks.readReports).toHaveBeenCalledTimes(1))
    expect(view.invalidate).not.toHaveBeenCalled()
    view.updateResult({ ...initial, periodEndAt: initial.periodEndAt + 1 })
    expect(screen.getByRole('button', { name: /Refused\s+1/u }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByText('Tool done')).toBeNull()
    view.updateResult({ ...initial, dateRangeFilter: '7d', periodStartAt: initial.periodStartAt + 1, filteredAgent: 'principal:agent' })
    expect(screen.getByRole('button', { name: /Refused\s+1/u }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByText('Tool done')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }))
    expect(screen.getAllByText('Tool done')).toHaveLength(1)
  })
})
