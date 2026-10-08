import { useEffect, useState } from 'react'
import { buyerReturnDestination, type ActivityReturnScope } from '@/lib/call-recovery/activity-return-scope'
import { readFundingReturnScope } from '@/lib/call-recovery/funding-return-scope'

/** Presentation only: opening a saved task never resumes execution or adds authority. */
export function FundingReturnNavigation() {
  const [scope, setScope] = useState<ActivityReturnScope>()
  useEffect(() => {
    const sessionId = new URLSearchParams(window.location.search).get('funding')
    if (sessionId !== null) setScope(readFundingReturnScope(sessionId))
  }, [])
  const destination = buyerReturnDestination(scope)
  if (destination === undefined) return null
  return <section className="grid gap-2" aria-label="Return after funding"><a href={destination.href} className="underline underline-offset-4">{destination.label}</a><p className="text-sm text-muted-foreground">Check this payment’s recorded status before continuing. Returning to the task does not spend or grant authority.</p></section>
}
