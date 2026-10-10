import { useEffect, useRef, useState } from 'react'
import { useServerFn } from '@tanstack/react-start'
import { Button } from '@/components/arc/button/button'
import { callFeedbackReasons, type CallFeedback, type CallFeedbackView } from '@/modules/capability-execution/call-feedback'
import { readOwnerCallFeedbackServer, writeOwnerCallFeedbackServer } from '@/modules/capability-execution/call-feedback.functions'

const choices = [{ choice: 'useful', label: 'Useful' }, { choice: 'partly_useful', label: 'Partly useful' }, { choice: 'not_useful', label: 'Not useful' }] as const
const reasons = { incorrect: 'Incorrect', incomplete: 'Incomplete', irrelevant: 'Did not fit the request', too_slow: 'Too slow' } as const

export function CallFeedbackControl({ callRef }: Readonly<{ callRef: string }>) {
  return <SelectedCallFeedback key={callRef} callRef={callRef} />
}

function SelectedCallFeedback({ callRef }: Readonly<{ callRef: string }>) {
  const read = useServerFn(readOwnerCallFeedbackServer)
  const write = useServerFn(writeOwnerCallFeedbackServer)
  const [view, setView] = useState<CallFeedbackView | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(false)
  const inFlight = useRef(false)
  useEffect(() => {
    let active = true
    void read({ data: { callRef } }).then(result => { if (active) setView(result) }, () => { if (active) setError(true) })
    return () => { active = false }
  }, [callRef, read])

  async function save(feedback: CallFeedback): Promise<void> {
    if (inFlight.current) return
    inFlight.current = true
    setPending(true)
    setError(false)
    try {
      const result = await write({ data: { callRef, feedback } })
      if (result.kind === 'refused') setError(true)
      else setView(result)
    } catch { setError(true) }
    finally { inFlight.current = false; setPending(false) }
  }

  if (view?.kind !== 'ready') return null
  const feedback = view.feedback
  return <section className="grid gap-intra text-sm" aria-label="Call usefulness feedback">
    <p>Did this result help you continue?</p>
    <div className="flex flex-wrap gap-intra" role="group" aria-label="Usefulness">
      {choices.map(({ choice, label }) => <Button key={choice} type="button" variant="secondary" className="min-h-touch"
        aria-pressed={feedback?.choice === choice} disabled={pending} onClick={() => { void save({ choice }) }}>{label}</Button>)}
    </div>
    {feedback !== null && feedback.choice !== 'useful' ? <label className="grid max-w-sm gap-intra">
      <span>Reason (optional)</span>
      <select className="min-h-touch rounded-sm border border-input bg-background px-3 text-foreground" disabled={pending}
        value={feedback.reason ?? ''} onChange={event => {
          const reason = callFeedbackReasons.find(value => value === event.target.value)
          void save(reason === undefined ? { choice: feedback.choice } : { choice: feedback.choice, reason })
        }}>
        <option value="">Choose a reason</option>
        {callFeedbackReasons.map(reason => <option key={reason} value={reason}>{reasons[reason]}</option>)}
      </select>
    </label> : null}
    <p className="text-xs text-muted-foreground">Feedback helps improve Tool quality. Use “Report this answer” for a credit return.</p>
    <p role={error ? 'alert' : 'status'} className="text-xs text-muted-foreground">
      {error ? 'Feedback was not confirmed. Select your choice to try again.' : pending ? 'Saving feedback…' : feedback === null ? '' : 'Feedback saved for 90 days. You can change your choice.'}
    </p>
  </section>
}
