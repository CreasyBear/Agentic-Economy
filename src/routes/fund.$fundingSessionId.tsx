import { useEffect, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'

import { AePageState } from '@/components/ae/layout/AePageState'
import { RouteError, RoutePending } from '@/components/ae/layout/AeRouteStates'
import { Button } from '@/components/ui/button'

type PublicFunding = Readonly<{
  state: 'awaiting_payment' | 'processing' | 'ready' | 'expired' | 'failed'
  agentName: string
  creditAmount: { currency: string; units: string; exponent: number }
}>

export const Route = createFileRoute('/fund/$fundingSessionId')({
  head: () => ({ meta: [
    { title: 'Funding status | Agentic Economy' },
    { name: 'robots', content: 'noindex, noarchive' },
    { name: 'referrer', content: 'no-referrer' },
  ] }),
  headers: () => ({ 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' }),
  pendingComponent: RoutePending,
  errorComponent: RouteError,
  component: FundingReturnPage,
})

function FundingReturnPage() {
  const { fundingSessionId } = Route.useParams()
  const [funding, setFunding] = useState<PublicFunding | null | undefined>(undefined)
  useEffect(() => {
    let active = true
    void fetch(`/api/v1/account/funding-sessions/public/${encodeURIComponent(fundingSessionId)}`, { cache: 'no-store' })
      .then(async (result) => result.ok ? await result.json() as { funding: PublicFunding } : null)
      .then((result) => { if (active) setFunding(result?.funding ?? null) })
      .catch(() => { if (active) setFunding(null) })
    return () => { active = false }
  }, [fundingSessionId])
  if (funding === undefined) return <AePageState tone="neutral" title="Checking funding" description="Confirming the latest Account credit status." />
  if (funding === null) return <AePageState tone="neutral" title="Funding link unavailable" description="Ask the agent for a current funding link." />
  const amount = `${funding.creditAmount.currency} ${(Number(funding.creditAmount.units) / 10 ** funding.creditAmount.exponent).toFixed(2)}`
  if (funding.state === 'ready') {
    return (
      <AePageState
        tone="positive"
        title="Account credit added"
        description={`${amount} is ready for ${funding.agentName}. You can return to the agent.`}
        action={(
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild variant="default" className="min-h-touch"><Link to="/owner/credit">Go to credit</Link></Button>
            <Button asChild variant="secondary" className="min-h-touch"><Link to="/market">Back to Market</Link></Button>
          </div>
        )}
      />
    )
  }
  if (funding.state === 'processing') {
    return (
      <AePageState
        tone="neutral"
        title="Payment received"
        description={`Account credit is being confirmed for ${funding.agentName}. Do not pay again.`}
        action={<Button asChild variant="default" className="min-h-touch"><Link to="/owner/credit">Check credit</Link></Button>}
      />
    )
  }
  if (funding.state === 'awaiting_payment') {
    return (
      <AePageState
        tone="neutral"
        title="Payment not completed"
        description={`Return to Stripe to finish adding ${amount} for ${funding.agentName}.`}
        action={<Button asChild variant="default" className="min-h-touch"><Link to="/owner/credit">Check credit</Link></Button>}
      />
    )
  }
  return (
    <AePageState
      tone="neutral"
      title="Funding link ended"
      description={`Ask ${funding.agentName} to create a new funding link.`}
      action={(
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button asChild variant="default" className="min-h-touch"><Link to="/owner/credit">Try again</Link></Button>
          <Button asChild variant="secondary" className="min-h-touch"><Link to="/market">Back to Market</Link></Button>
        </div>
      )}
    />
  )
}
