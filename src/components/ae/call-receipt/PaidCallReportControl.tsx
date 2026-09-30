import { useEffect, useRef, useState } from 'react'
import { useServerFn } from '@tanstack/react-start'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDisplayAmount } from '@/modules/money/public'
import { readOwnerPaidCallReportServer, reportOwnerPaidCallServer } from '@/modules/capability-execution/paid-call-report.functions'
import type { PaidCallReportView } from '@/modules/capability-execution/paid-call-report'

type ReportState =
  | { kind: 'checking' }
  | { kind: 'ready'; view: PaidCallReportView }
  | { kind: 'error'; message: string }

const CHECK_INTERVAL_MS = 2_000
const MAX_PENDING_CHECKS = 5

function amount(units: string): string {
  return formatDisplayAmount({ currency: 'AUD', units, exponent: 6 })
}

function supportHref(callRef: string): string {
  return `/support?callRef=${encodeURIComponent(callRef)}`
}

function refusalMessage(view: Extract<PaidCallReportView, { kind: 'refused' }>): string {
  switch (view.code) {
    case 'owner_required': return 'Sign in as the Call owner to report this answer.'
    case 'call_not_eligible': return 'This Call is not eligible for an answer report.'
    case 'report_limit_reached': return 'The daily report limit has been reached.'
    case 'rate_limited': return 'Please wait before checking this report again.'
    case 'source_unavailable': return 'The report status is temporarily unavailable.'
  }
}

/** The server read establishes ownership, paid settlement and eligibility before the action is enabled. */
export function PaidCallReportControl({
  callRef,
  paidLabel,
  onPosted,
}: Readonly<{ callRef: string; paidLabel?: string; onPosted?: () => void | Promise<void> }>) {
  const readReport = useServerFn(readOwnerPaidCallReportServer)
  const report = useServerFn(reportOwnerPaidCallServer)
  const [state, setState] = useState<ReportState>({ kind: 'checking' })
  const [submitting, setSubmitting] = useState(false)
  const inFlight = useRef(false)
  const postedNotified = useRef<string | null>(null)

  useEffect(() => {
    let active = true
    void readReport({ data: { callRef } }).then(view => {
      if (active) setState({ kind: 'ready', view })
    }, () => {
      if (active) setState({ kind: 'error', message: 'We could not check this Call right now.' })
    })
    return () => { active = false }
  }, [callRef, readReport])

  const view = state.kind === 'ready' ? state.view : undefined
  const pendingReportRef = view?.kind === 'pending' ? view.reportRef : undefined
  const hiddenRefusal = view?.kind === 'refused'
    && (view.code === 'owner_required' || view.code === 'call_not_eligible')
  useEffect(() => {
    if (view?.kind !== 'posted' || postedNotified.current === view.reportRef) return
    postedNotified.current = view.reportRef
    void onPosted?.()
  }, [view, onPosted])

  useEffect(() => {
    if (view?.kind !== 'pending') return
    let active = true
    let checks = 0
    const timer = setInterval(() => {
      if (!active || inFlight.current || checks >= MAX_PENDING_CHECKS) {
        if (checks >= MAX_PENDING_CHECKS) clearInterval(timer)
        return
      }
      checks += 1
      inFlight.current = true
      void readReport({ data: { callRef } }).then(next => {
        if (active) setState({ kind: 'ready', view: next })
      }, () => {
        if (active) setState({ kind: 'error', message: 'We could not confirm whether credit was returned.' })
      }).finally(() => { inFlight.current = false })
    }, CHECK_INTERVAL_MS)
    return () => { active = false; clearInterval(timer) }
  }, [callRef, readReport, view?.kind, pendingReportRef])

  async function check(): Promise<void> {
    if (inFlight.current) return
    inFlight.current = true
    setSubmitting(true)
    try {
      setState({ kind: 'ready', view: await readReport({ data: { callRef } }) })
    } catch {
      setState({ kind: 'error', message: 'We could not confirm whether credit was returned.' })
    } finally {
      inFlight.current = false
      setSubmitting(false)
    }
  }

  async function submit(): Promise<void> {
    if (inFlight.current || (view?.kind !== 'eligible' && view?.kind !== 'pending')) return
    inFlight.current = true
    setSubmitting(true)
    try {
      setState({ kind: 'ready', view: await report({ data: { callRef } }) })
    } catch {
      setState({ kind: 'error', message: 'We could not confirm whether the report was recorded.' })
    } finally {
      inFlight.current = false
      setSubmitting(false)
    }
  }

  return (
    <div className="grid gap-intra text-sm">
      {paidLabel === undefined ? null : <Badge variant="secondary" className="w-fit">{view?.kind === 'posted' ? 'Credit returned' : paidLabel}</Badge>}
      {view?.kind === 'eligible' ? (
        <div className="grid gap-intra">
          <p>{view.expiredPromotionalUnits === '0'
            ? `Return ${amount(view.amountUnits)} credit for an answer that was not useful.`
            : 'Return this purchase to its original credit sources if the answer was not useful.'}</p>
          {view.expiredPromotionalUnits !== '0' ? <p>Original promotional credit of {amount(view.expiredPromotionalUnits)} has expired and will stay expired.</p> : null}
          <Button type="button" variant="outline" className="min-h-touch w-fit" disabled={submitting} onClick={() => { void submit() }}>
            {submitting ? 'Reporting…' : 'Report this answer'}
          </Button>
        </div>
      ) : null}
      {view?.kind === 'pending' ? (
        <div className="grid gap-intra" role="status">
          <p>Report received. Credit return is pending; {amount(view.amountUnits)} is not yet confirmed in your balance.</p>
          {view.expiredPromotionalUnits !== '0' ? <p>Original promotional credit of {amount(view.expiredPromotionalUnits)} has expired and will stay expired.</p> : null}
          <Button type="button" variant="outline" className="min-h-touch w-fit" disabled={submitting} onClick={() => { void submit() }}>
            {submitting ? 'Checking…' : 'Check refund'}
          </Button>
        </div>
      ) : null}
      {view?.kind === 'posted' ? (
        <div role="status" className="grid gap-intra">
          <p>Credit returned: {amount(view.amountUnits)}.</p>
          {view.expiredPromotionalUnits !== '0' ? <p>Original promotional credit of {amount(view.expiredPromotionalUnits)} was expired and remains expired.</p> : null}
        </div>
      ) : null}
      {view?.kind === 'refused' && !hiddenRefusal ? (
        <div className="grid gap-intra">
          <p role="status">{refusalMessage(view)}</p>
          {view.retryable ? <Button type="button" variant="outline" className="min-h-touch w-fit" disabled={submitting} onClick={() => { void check() }}>Try again</Button> : null}
          <a href={supportHref(callRef)} className="w-fit underline">Contact support</a>
        </div>
      ) : null}
      {state.kind === 'error' ? (
        <div className="grid gap-intra">
          <p role="alert">{state.message} Check the status before relying on a refund.</p>
          <Button type="button" variant="outline" className="min-h-touch w-fit" disabled={submitting} onClick={() => { void check() }}>Check refund</Button>
          <a href={supportHref(callRef)} className="w-fit underline">Contact support</a>
        </div>
      ) : null}
    </div>
  )
}
