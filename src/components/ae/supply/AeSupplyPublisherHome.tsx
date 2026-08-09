import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'

import { AeSupplyEarningsCard } from './AeSupplyEarningsCard'
import type { OwnerProviderEarningsReadback, OwnerSupplyFunnelReadback } from '@/modules/capability-supply/supply-funnel.functions'

export function AeSupplyPublisherHome({ readback, earnings }: Readonly<{
  readback: OwnerSupplyFunnelReadback
  earnings: OwnerProviderEarningsReadback
}>) {
  if (readback.kind === 'error') {
    return (
      <Card>
        <CardHeader className="p-5 pb-0">
          <CardTitle><h2 className="text-2xl font-semibold text-foreground">Your services are unavailable</h2></CardTitle>
        </CardHeader>
        <CardContent className="p-5">
          <p className="text-muted-foreground">We could not load your business services. Try again to continue.</p>
        </CardContent>
        <CardFooter className="p-5 pt-0">
          <Button asChild variant="default" className="min-h-11">
            <Link to="/owner/supply">Try again</Link>
          </Button>
        </CardFooter>
      </Card>
    )
  }
  if (readback.kind === 'not_found') {
    return (
      <Card>
        <CardHeader className="p-5 pb-0">
          <CardTitle><h2 className="text-2xl font-semibold text-foreground">Claim your business to publish</h2></CardTitle>
        </CardHeader>
        <CardContent className="p-5">
          <p className="text-muted-foreground">A business claim connects your service to the right owner.</p>
        </CardContent>
        <CardFooter className="p-5 pt-0">
          <Button asChild variant="default" className="min-h-11">
            <Link to="/claim" search={{ source: 'supply' }}>Claim your business</Link>
          </Button>
        </CardFooter>
      </Card>
    )
  }
  const { liquidity } = readback
  return (
    <div className="grid gap-8">
      <header className="grid gap-2">
        <p className="block text-sm font-semibold text-muted-foreground">BUSINESS SERVICES</p>
        <h2 className="text-2xl font-semibold text-foreground">Get your service ready for AI assistants</h2>
        <p className="block text-muted-foreground">Describe what you do, set a price, test it, and go live. Source readbacks show operational usage and earnings separately.</p>
      </header>
      <Card>
        <CardHeader className="p-5 pb-0">
          <CardTitle><h2 className="text-lg font-semibold text-foreground">Your services</h2></CardTitle>
        </CardHeader>
        <CardContent className="p-5">
          {readback.offerings.length === 0 ? (
            <Empty className="border border-dashed">
              <EmptyHeader>
                <EmptyTitle>No services yet.</EmptyTitle>
                <EmptyDescription>Describe your first service to get started.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className="m-0 grid list-none gap-2 p-0">
              {readback.offerings.map((offering) => (
                <li key={offering.offeringRef} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3">
                  <div>
                    <p className="block font-semibold text-foreground">{offering.name}</p>
                    <p className="block text-sm text-muted-foreground">{offering.summary}</p>
                  </div>
                  <Button asChild variant="secondary" className="min-h-11">
                    <Link to="/owner/supply/$offeringRef" params={{ offeringRef: offering.offeringRef }}>Continue setup</Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
        <CardFooter className="p-5 pt-0">
          <Button asChild variant="default" className="min-h-11">
            <Link to="/owner/offerings/new" search={{ next: 'supply' }}>Describe a service</Link>
          </Button>
        </CardFooter>
      </Card>
      <Card>
        <CardHeader className="p-5 pb-0">
          <CardTitle><h2 className="text-lg font-semibold text-foreground">Operational usage</h2></CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 p-5">
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="grid gap-1">
              <dt className="text-sm font-medium text-muted-foreground">Observed calls</dt>
              <dd className="m-0 text-foreground">{readback.callLog.length}</dd>
            </div>
            <div className="grid gap-1">
              <dt className="text-sm font-medium text-muted-foreground">Filled observations</dt>
              <dd className="m-0 text-foreground">{liquidity.fillCount}</dd>
            </div>
            <div className="grid gap-1">
              <dt className="text-sm font-medium text-muted-foreground">Zero-result observations</dt>
              <dd className="m-0 text-foreground">{liquidity.zeroCount}</dd>
            </div>
            <div className="grid gap-1">
              <dt className="text-sm font-medium text-muted-foreground">First-success p50</dt>
              <dd className="m-0 text-foreground">{liquidity.firstSuccessP50Ms === undefined ? 'Not observed' : `${liquidity.firstSuccessP50Ms} ms`}</dd>
            </div>
            <div className="grid gap-1">
              <dt className="text-sm font-medium text-muted-foreground">First-success p95</dt>
              <dd className="m-0 text-foreground">{liquidity.firstSuccessP95Ms === undefined ? 'Not observed' : `${liquidity.firstSuccessP95Ms} ms`}</dd>
            </div>
            <div className="grid gap-1">
              <dt className="text-sm font-medium text-muted-foreground">Depth samples</dt>
              <dd className="m-0 text-foreground">{liquidity.depthSamples}</dd>
            </div>
          </dl>
          <p className="text-sm text-muted-foreground">These are operational observations only. They are not Qualified Use or revenue, and setup or test calls do not create earnings.</p>
        </CardContent>
      </Card>
      <AeSupplyEarningsCard readback={earnings} />
    </div>
  )
}
