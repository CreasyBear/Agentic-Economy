import { useEffect, useRef, useState } from 'react'
import { useQuery } from 'convex/react'
import { useServerFn } from '@tanstack/react-start'
import { api } from '../../../../../convex/_generated/api'
import { Button } from '@/components/arc/button/button'
import { AeSection } from '@/components/ae/layout/AeSection'
import { useTypedReverification } from '@/lib/client/useTypedReverification'
import { ADMIN_REFUSAL_PRESENTATION } from '@/lib/operator/admin-console/refusal-presentation'
import type { CallContentReview as ReviewResult } from '@/lib/operator/admin-console/call-content-review'
import type { AdminCommandRequest } from '../actions/actions.contracts'
import { reviewCallContentServer } from './call-content-review.functions'

type ReviewRequest = Extract<AdminCommandRequest, { action: 'review_call_content' }>

export function CallContentReview({ callRef }: Readonly<{ callRef: string }>) {
  const access = useQuery(api.adminConsoleAudit.readAdminAuditAccess, {})
  if (access?.kind !== 'allowed' || access.role !== 'owner_admin') return null
  return <SelectedCallContentReview key={callRef} callRef={callRef} />
}

function SelectedCallContentReview({ callRef }: Readonly<{ callRef: string }>) {
  const send = useServerFn(reviewCallContentServer)
  const execute = useTypedReverification(async (request: ReviewRequest) => await send({ data: request }), result =>
    result.kind === 'command' && result.receipt.kind === 'refused' && result.receipt.code === 'mfa_reverification_required' ? 'strict_mfa' : null)
  const [reason, setReason] = useState<ReviewRequest['reasonCode']>('alpha_quality')
  const [result, setResult] = useState<ReviewResult | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(false)
  const request = useRef<ReviewRequest | null>(null)
  const inFlight = useRef(false)

  useEffect(() => {
    if (result?.kind !== 'content') return
    const timeout = setTimeout(() => { setResult(null); request.current = null }, Math.max(0, result.expiresAt - Date.now()))
    return () => clearTimeout(timeout)
  }, [result])
  async function review(): Promise<void> {
    if (inFlight.current) return
    inFlight.current = true
    setPending(true)
    setError(false)
    request.current ??= { action: 'review_call_content', input: { callRef }, reasonCode: reason,
      evidenceRefs: [callRef], operationKey: `review:${crypto.randomUUID()}`, correlationId: `review:${crypto.randomUUID()}`, approval: { kind: 'execute' } }
    try {
      const next = await execute(request.current)
      setResult(next)
      if (next.kind === 'command') request.current = null
    } catch { setError(true) }
    finally { inFlight.current = false; setPending(false) }
  }
  const refusal = result?.kind === 'command' && result.receipt.kind === 'refused' ? result.receipt : null
  return <AeSection title="Founder content review" description="Open this Call’s retained input and output for a recorded alpha review. Access is limited to 10 minutes.">
    {result?.kind === 'content' ? <div className="grid gap-intra">
      <p className="text-sm text-muted-foreground">This access is recorded in Audit. Keep content out of routine notes and issue reports.</p>
      {result.inputJson === undefined ? null : <details><summary>Call input</summary><pre className="overflow-auto whitespace-pre-wrap break-all text-sm">{result.inputJson}</pre></details>}
      {result.outputJson === undefined ? null : <details><summary>Call output</summary><pre className="overflow-auto whitespace-pre-wrap break-all text-sm">{result.outputJson}</pre></details>}
      {result.inputJson === undefined && result.outputJson === undefined ? <p>No input or output was recorded for this Call.</p> : null}
      <Button type="button" variant="secondary" className="w-fit" onClick={() => { setResult(null); request.current = null }}>Close content</Button>
    </div> : <div className="grid gap-intra">
      <label className="grid max-w-sm gap-intra text-sm"><span>Review reason</span>
        <select className="min-h-touch rounded-sm border border-input bg-background px-3 text-foreground" value={reason} disabled={pending}
          onChange={event => { setReason(event.target.value === 'failure_investigation' ? 'failure_investigation' : 'alpha_quality'); request.current = null }}>
          <option value="alpha_quality">Improve alpha quality</option><option value="failure_investigation">Investigate a failure</option>
        </select>
      </label>
      <Button type="button" variant="secondary" className="min-h-touch w-fit" disabled={pending || refusal?.code === 'content_expired'}
        onClick={() => { void review() }}>{pending ? 'Opening…' : 'Review Call content'}</Button>
      {refusal === null ? null : <p role="status">{ADMIN_REFUSAL_PRESENTATION[refusal.code].copy}</p>}
      {error ? <p role="alert">Content access was not confirmed. Retry to check the same review.</p> : null}
    </div>}
  </AeSection>
}
