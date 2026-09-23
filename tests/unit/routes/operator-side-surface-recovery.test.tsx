/** @vitest-environment jsdom */
import { type ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { RouterContextProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

const serverMocks = vi.hoisted(() => ({
  readCalls: vi.fn(),
  readUsage: vi.fn(),
  readSpend: vi.fn(),
}))
const routeDiagnostics = vi.hoisted(() => ({ capture: vi.fn() }))

vi.mock('@/lib/observability/capture-route-exception', () => ({ captureRouteException: routeDiagnostics.capture }))
vi.mock('@/lib/server/call-history.functions', () => ({
  readOwnerCallsServer: serverMocks.readCalls,
  readOwnerUsageServer: serverMocks.readUsage,
  readOwnerSpendServer: serverMocks.readSpend,
}))
vi.mock('@/components/ae/layout/AeOperatorPage', () => ({
  AeOperatorPage: ({ children, title }: { children: ReactNode; title: string }) => <main><h1>{title}</h1>{children}</main>,
}))

import { AeActivity } from '@/components/ae/activity/AeActivity'
import type { ActivityLoaderResult } from '@/components/ae/activity/activity.contracts'
import { Route as ActivityRoute } from '@/routes/_operator/activity'

afterEach(() => {
  cleanup()
  serverMocks.readCalls.mockReset()
  serverMocks.readUsage.mockReset()
  serverMocks.readSpend.mockReset()
  routeDiagnostics.capture.mockReset()
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
  return { kind: 'available', calls, usage, spend, periodStart }
}

describe('Calls side-surface recovery', () => {
  it('projects a source rejection into an in-shell unavailable state', async () => {
    serverMocks.readCalls.mockRejectedValue(new Error('source offline'))
    serverMocks.readUsage.mockResolvedValue({ kind: 'unavailable' })
    serverMocks.readSpend.mockResolvedValue({ kind: 'unavailable' })
    const loader = ActivityRoute.options.loader as () => Promise<unknown>
    await expect(loader()).resolves.toEqual({ kind: 'unavailable' })
    expect(routeDiagnostics.capture).toHaveBeenCalledWith(expect.any(Error), { 'ae.surface': 'operator_activity_loader' })
    const { invalidate } = renderActivity({ kind: 'unavailable' })
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1))
  })

  it('keeps a successful empty directory explicitly available', async () => {
    const calls = { page: [], isDone: true, continueCursor: null }
    const usage = { kind: 'available', callCountUnits: '0', completedCountUnits: '0', outcomeUnknownCountUnits: '0' }
    const spend = { kind: 'available', spendUnits: '0' }
    serverMocks.readCalls.mockResolvedValue(calls)
    serverMocks.readUsage.mockResolvedValue(usage)
    serverMocks.readSpend.mockResolvedValue(spend)
    const loader = ActivityRoute.options.loader as () => Promise<unknown>
    await expect(loader()).resolves.toEqual({
      kind: 'available',
      calls,
      usage,
      spend,
      periodStart: new Date().toISOString().slice(0, 7),
    })
  })

  it('keeps Calls available with one actionable partial-state message when a summary fails', async () => {
    const calls = { page: [callRow('kept', 'completed', 1)], isDone: true, continueCursor: '' }
    const spend = { kind: 'available', spendUnits: '0' }
    serverMocks.readCalls.mockResolvedValue(calls)
    serverMocks.readUsage.mockRejectedValue(new Error('usage offline'))
    serverMocks.readSpend.mockResolvedValue(spend)
    const loader = ActivityRoute.options.loader as () => Promise<unknown>
    const result = await loader()

    expect(result).toMatchObject({
      kind: 'available',
      calls,
      usage: { kind: 'unavailable', code: 'source_unavailable' },
      spend,
    })
    const { invalidate } = renderActivity(result as ActivityLoaderResult)
    expect(screen.getAllByText('Some summaries are unavailable')).toHaveLength(1)
    expect(screen.getByText('Tool kept')).toBeTruthy()
    expect(screen.queryByText('No Calls yet')).toBeNull()
    expect(screen.queryByText('Usage unavailable')).toBeNull()
    const monthlySummary = screen.getByRole('region', { name: 'This month' })
    expect(within(monthlySummary).getByText('Some summaries are unavailable')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh summaries' }))
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1))
  })

  it('foregrounds Calls needing attention and keeps routine history separate', () => {
    renderActivity(available({
      page: [callRow('routine', 'completed', 2), callRow('attention', 'outcome_unknown', 1)],
      isDone: true,
      continueCursor: '',
    }))

    const attention = screen.getByRole('region', { name: 'Needs attention' })
    const recent = screen.getByRole('region', { name: 'Recent Calls' })
    const monthlySummary = screen.getByRole('region', { name: 'This month' })
    expect(within(attention).getByText('Tool attention')).toBeTruthy()
    expect(within(attention).getByText('Needs review')).toBeTruthy()
    expect(within(attention).queryByText('Tool routine')).toBeNull()
    expect(within(recent).getByText('Tool routine')).toBeTruthy()
    expect(within(recent).getByText('Resolved — delivered')).toBeTruthy()
    expect(within(recent).queryByText('Tool attention')).toBeNull()
    expect(attention.compareDocumentPosition(recent) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(recent.compareDocumentPosition(monthlySummary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(attention).getByRole('link', { name: 'Review Tool attention' }).getAttribute('href')).toBe('/calls/attention')
    expect(screen.queryByText('reconciliation required')).toBeNull()
  })

  it('routes contradictory completed facts to attention instead of claiming resolution', () => {
    renderActivity(available({
      page: [{ ...callRow('contradictory', 'completed', 2), paymentState: 'unknown' }],
      isDone: true,
      continueCursor: '',
    }))

    const attention = screen.getByRole('region', { name: 'Needs attention' })
    expect(within(attention).getByText('Tool contradictory')).toBeTruthy()
    expect(within(attention).getByText('Needs review')).toBeTruthy()
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
    expect(failure.textContent).toContain('A$0.00 affected')
    expect(screen.getByText('Tool newer')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try loading more again' }))

    await waitFor(() => expect(screen.getByText('Tool older')).toBeTruthy())
    expect(serverMocks.readCalls).toHaveBeenNthCalledWith(1, { data: { cursor: 'cursor:older' } })
    expect(serverMocks.readCalls).toHaveBeenNthCalledWith(2, { data: { cursor: 'cursor:older' } })
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

    expect(await screen.findByText('Tool older')).toBeTruthy()
    expect(screen.getByText('Tool newer')).toBeTruthy()
    expect(serverMocks.readCalls).toHaveBeenCalledWith({ data: { cursor: 'cursor:older' } })
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
    view.updateResult(available({
      page: [callRow('refreshed', 'completed', 4)],
      isDone: false,
      continueCursor: 'cursor:refreshed',
    }))
    resolveContinuation({ page: [callRow('stale', 'completed', 2)], isDone: true, continueCursor: '' })

    await waitFor(() => expect(screen.getByText('Tool refreshed')).toBeTruthy())
    expect(screen.queryByText('Tool initial')).toBeNull()
    expect(screen.queryByText('Tool stale')).toBeNull()
    expect(screen.getByRole('button', { name: 'Load more' })).toBeTruthy()
  })
})
