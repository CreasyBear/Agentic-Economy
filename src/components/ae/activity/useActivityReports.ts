import { useCallback, useEffect, useRef, useState } from 'react'
import { readOwnerActivityReportsServer } from '@/lib/server/activity.functions'
import { BROWSER_READ_TIMEOUT_MS, awaitBoundedRead } from '@/lib/bounded-read'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import type { ActivityLoaderResult } from './activity.contracts'

type AvailableActivity = Extract<ActivityLoaderResult, { kind: 'available' }>
type Reports = Pick<AvailableActivity, 'usage' | 'spend' | 'reconciliation'>
// A loader-started request has no controller: the router's loader signal owns its cancellation.
type ReportRequest = { controller?: AbortController; promise: Promise<Reports> }

/** The parent is keyed by Call page and scope, so a new scope starts a new report request. */
export function useActivityReports(initial: AvailableActivity) {
  const [reports, setReports] = useState<Reports>(() => ({ usage: initial.usage, spend: initial.spend,
    ...(initial.reconciliation === undefined ? {} : { reconciliation: initial.reconciliation }) }))
  const [retryPending, setRetryPending] = useState(false)
  // One request lifetime per mounted Account/page scope, including effect replay.
  const lifetimeRef = useRef<{ generation: number; inFlight: boolean; mounted: boolean;
    initialRequest?: ReportRequest; activeRequest?: ReportRequest }>({ generation: 0, inFlight: false, mounted: false })
  const pending = reports.usage.kind === 'pending' || reports.spend.kind === 'pending'

  const read = useCallback(async (reuseInitial = false) => {
    const lifetime = lifetimeRef.current
    if (lifetime.inFlight) return
    lifetime.inFlight = true
    const current = ++lifetime.generation
    setRetryPending(true)
    try {
      let request: ReportRequest | undefined = !reuseInitial ? undefined
        : initial.reports !== undefined ? { promise: initial.reports } : lifetime.initialRequest
      if (request === undefined) {
        const controller = new AbortController()
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(BROWSER_READ_TIMEOUT_MS)])
        request = { controller, promise: awaitBoundedRead(signal => readOwnerActivityReportsServer({
          data: { periodStartAt: initial.periodStartAt, periodEndAt: initial.periodEndAt,
            ...(initial.filteredAgent === undefined ? {} : { principalRef: initial.filteredAgent }) }, signal,
        }), signal) }
        if (reuseInitial) lifetime.initialRequest = request
      }
      lifetime.activeRequest = request
      const result = await request.promise
      if (current === lifetime.generation) setReports(result)
    } catch (cause) {
      if (current !== lifetime.generation) return
      captureClientExceptionOnClient(cause)
      setReports({ usage: { kind: 'unavailable', code: 'source_unavailable' },
        spend: { kind: 'unavailable', code: 'source_unavailable' },
        ...(initial.filteredAgent === undefined ? { reconciliation: { kind: 'unavailable', code: 'source_unavailable' } } : {}) })
    } finally {
      if (current === lifetime.generation) { lifetime.inFlight = false; setRetryPending(false) }
    }
  }, [initial.periodStartAt, initial.periodEndAt, initial.filteredAgent, initial.reports])

  useEffect(() => {
    const lifetime = lifetimeRef.current
    lifetime.mounted = true
    if (initial.usage.kind === 'pending' || initial.spend.kind === 'pending') void read(true)
    return () => {
      lifetime.mounted = false
      lifetime.generation++
      lifetime.inFlight = false
      // Effect replay happens synchronously. A genuine unmount remains unmounted next microtask.
      queueMicrotask(() => {
        if (!lifetime.mounted) lifetime.activeRequest?.controller?.abort(new DOMException('Activity request cancelled.', 'AbortError'))
      })
    }
  }, [initial.usage.kind, initial.spend.kind, read])

  return { reports, pending, retryPending, retry: () => { void read() } }
}
