/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentType, ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

const routeState = vi.hoisted(() => ({ component: undefined as ComponentType | undefined }))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: { component: ComponentType }) => {
    routeState.component = options.component
    return { ...options, options }
  },
  Link: ({ children, to, className }: { children: ReactNode; to: string; className?: string }) => (
    <a href={to} className={className}>{children}</a>
  ),
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

import '@/routes/status'

type DeferredResponse = Readonly<{
  promise: Promise<Response>
  resolve: (response: Response) => void
  reject: (reason: unknown) => void
}>

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date('2026-08-31T04:05:06.000Z'))
})

afterEach(() => {
  cleanup()
  fetchMock.mockReset()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('/status', () => {
  it('owns each four-probe batch through initial and manual refreshes', async () => {
    const initial = queueDeferredBatch()
    renderRoute()

    const initialButton = screen.getByRole('button', { name: 'Checking status…' })
    expect(initialButton).toHaveProperty('disabled', true)
    expect(initialButton.getAttribute('aria-busy')).toBe('true')
    expect(screen.getByRole('list').getAttribute('aria-busy')).toBe('true')
    const initialStatus = screen.getByRole('status')
    expect(initialStatus.getAttribute('aria-live')).toBe('polite')
    expect(initialStatus.getAttribute('aria-atomic')).toBe('true')
    expect(initialStatus.textContent).toBe('Checking all systems…')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Checking system status.')
    expect(screen.queryByText(/Last checked/)).toBeNull()
    expect(screen.queryByText('Request reference')).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      '/api/health',
      '/api/ready',
      '/.well-known/ucp',
      '/api/v1/release',
    ])

    initial[0]?.resolve(responseForProbe(0, 200, {
      'X-AE-Request-Id': 'request:ignored-on-success',
    }))
    resolveBatch(initial.slice(1), [200, 200, 200], 1)

    const refreshButton = await screen.findByRole('button', { name: 'Refresh status' })
    expect(refreshButton).toHaveProperty('disabled', false)
    expect(refreshButton.getAttribute('aria-busy')).toBe('false')
    expect(screen.getByRole('list').getAttribute('aria-busy')).toBe('false')
    expect(screen.getByRole('status').textContent).toMatch(
      /^Status checked\. All 4 systems are operational\. Last checked .+\.$/,
    )
    const initialCheckedAt = screen.getByRole('status').textContent
    expect(screen.getAllByText('Operational')).toHaveLength(4)
    expect(screen.queryByText('Request reference')).toBeNull()

    const manual = queueDeferredBatch()
    fireEvent.click(refreshButton)
    fireEvent.click(refreshButton)

    expect(fetchMock).toHaveBeenCalledTimes(8)
    expect(screen.getByRole('button', { name: 'Checking status…' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('status').textContent).toBe('Checking all systems…')
    expect(screen.queryByText(/Last checked/)).toBeNull()

    vi.setSystemTime(new Date('2026-08-31T04:06:07.000Z'))
    const requestRef = 'corr_status_operation_api_01'
    manual[0]?.resolve(responseForProbe(0))
    manual[1]?.resolve(responseForProbe(1, 503, { 'X-AE-Request-Id': requestRef }))
    resolveBatch(manual.slice(2), [200, 200], 2)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh status' })).toHaveProperty('disabled', false))
    const degradedStatus = screen.getByText(
      /^Status checked\. 1 of 4 systems needs attention: Tool API\. Last checked .+\.$/,
    )
    expect(degradedStatus.getAttribute('role')).toBe('status')
    expect(degradedStatus.textContent).not.toBe(initialCheckedAt)
    expect(screen.getByText('New Calls may fail (HTTP 503). Check existing Calls before retrying.')).toBeTruthy()
    expect(screen.getByText('Degraded')).toBeTruthy()
    expect(screen.getAllByText('Operational')).toHaveLength(3)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Some systems are degraded.')
    expect(screen.getByRole('heading', { level: 2, name: 'Check existing calls before retrying' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open Calls' }).getAttribute('href')).toBe('/activity')
    expect(screen.getByRole('link', { name: 'Get help' }).getAttribute('href')).toBe('/support')

    expect(screen.getByText('Request reference').textContent).toBe('Request reference')
    expect(screen.getByText(requestRef).tagName).toBe('CODE')
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    fireEvent.click(screen.getByRole('button', { name: 'Copy Tool API request reference' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(requestRef))
    expect(screen.getByText('Copied').getAttribute('role')).toBe('status')
    expect(screen.getByRole('button', { name: 'Tool API request reference copied' })).toBeTruthy()

    const recovered = queueDeferredBatch()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh status' }))
    fireEvent.click(screen.getByRole('button', { name: 'Checking status…' }))

    expect(fetchMock).toHaveBeenCalledTimes(12)
    expect(screen.queryByText('Request reference')).toBeNull()
    expect(screen.queryByText(requestRef)).toBeNull()
    recovered[0]?.resolve(responseForProbe(0))
    recovered[1]?.resolve(responseForProbe(1, 200, {
      'X-AE-Request-Id': 'request:ignored-after-recovery',
    }))
    resolveBatch(recovered.slice(2), [200, 200], 2)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh status' })).toHaveProperty('disabled', false))
    expect(screen.queryByText('Request reference')).toBeNull()
    expect(screen.queryByText(requestRef)).toBeNull()
  })

  it('settles unreachable probes as degraded and releases the refresh control', async () => {
    const batch = queueDeferredBatch()
    renderRoute()

    batch[0]?.resolve(responseForProbe(0))
    batch[1]?.resolve(responseForProbe(1))
    batch[2]?.resolve(responseForProbe(2))
    batch[3]?.reject(new Error('network unavailable'))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh status' })).toHaveProperty('disabled', false))
    expect(screen.getByText('Release identity could not be reached. New Calls should wait.')).toBeTruthy()
    expect(screen.getByText('Degraded')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toMatch(
      /^Status checked\. 1 of 4 systems needs attention: Release identity\. Last checked .+\.$/,
    )
    expect(screen.queryByText('Request reference')).toBeNull()
  })

  it('treats an HTTP 200 with an invalid contract as degraded', async () => {
    const batch = queueDeferredBatch()
    renderRoute()

    batch[0]?.resolve(responseForProbe(0))
    batch[1]?.resolve(Response.json(
      { status: 'ready', checks: { config: 'ready' } },
      { headers: { 'X-AE-Request-Id': 'request:invalid-ready-contract' } },
    ))
    batch[2]?.resolve(responseForProbe(2))
    batch[3]?.resolve(responseForProbe(3))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh status' })).toHaveProperty('disabled', false))
    expect(screen.getByText('The Tool API returned an invalid readiness result. Check existing Calls before retrying.')).toBeTruthy()
    expect(screen.getAllByText('Operational')).toHaveLength(3)
    expect(screen.getByText('Degraded')).toBeTruthy()
    expect(screen.getByText('request:invalid-ready-contract')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open Calls' }).getAttribute('href')).toBe('/activity')
  })

  it('announces multiple degraded systems in probe order with plural copy', async () => {
    const batch = queueDeferredBatch()
    renderRoute()

    resolveBatch(batch, [503, 200, 500, 200])

    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh status' })).toHaveProperty('disabled', false))
    expect(screen.getByRole('status').textContent).toMatch(
      /^Status checked\. 2 of 4 systems need attention: Website, Machine discovery\. Last checked .+\.$/,
    )
    expect(screen.queryByText('Request reference')).toBeNull()
  })
})

function renderRoute() {
  const Component = routeState.component
  if (Component === undefined) throw new Error('Status route component was not captured.')
  render(<Component />)
}

function queueDeferredBatch(): readonly DeferredResponse[] {
  const batch = Array.from({ length: 4 }, deferredResponse)
  for (const deferred of batch) fetchMock.mockImplementationOnce(() => deferred.promise)
  return batch
}

function deferredResponse(): DeferredResponse {
  let resolve!: (response: Response) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<Response>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function resolveBatch(
  batch: readonly DeferredResponse[],
  statuses: readonly number[],
  startIndex = 0,
) {
  for (const [index, deferred] of batch.entries()) {
    deferred.resolve(responseForProbe(startIndex + index, statuses[index] ?? 200))
  }
}

function responseForProbe(
  index: number,
  status = 200,
  headers?: HeadersInit,
): Response {
  const validBodies = [
    { status: 'ok' },
    { status: 'ready', checks: { config: 'ready', convex: 'ready' } },
    {
      schemaVersion: 'ae-site-discovery:v2',
      name: 'Agentic Economy',
      origin: 'https://ae.test',
      endpoints: [],
      toolGateway: {},
    },
    { kind: 'ok', sourceRevision: 'a'.repeat(40) },
  ] as const
  return Response.json(
    status >= 200 && status < 300 ? validBodies[index] : { code: 'probe_failed' },
    { status, ...(headers === undefined ? {} : { headers }) },
  )
}
