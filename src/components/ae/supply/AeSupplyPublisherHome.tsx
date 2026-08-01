import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'

import type { OwnerSupplyFunnelReadback } from '@/modules/capability-supply/supply-funnel.functions'

export function AeSupplyPublisherHome({ readback }: Readonly<{ readback: OwnerSupplyFunnelReadback }>) {
  if (readback.kind === 'error') {
    return (
      <Card>
        <CardHeader className="p-5 pb-0">
          <CardTitle><h1 className="text-2xl font-semibold text-foreground">Your services are unavailable</h1></CardTitle>
        </CardHeader>
        <CardContent className="p-5">
          <p className="text-muted-foreground">We could not load your business services. Try again to continue.</p>
        </CardContent>
        <CardFooter className="p-5 pt-0">
          <Button asChild variant="default" className="min-h-11">
            <a href="/owner/supply">Try again</a>
          </Button>
        </CardFooter>
      </Card>
    )
  }
  if (readback.kind === 'not_found') {
    return (
      <Card>
        <CardHeader className="p-5 pb-0">
          <CardTitle><h1 className="text-2xl font-semibold text-foreground">Claim your business to publish</h1></CardTitle>
        </CardHeader>
        <CardContent className="p-5">
          <p className="text-muted-foreground">A business claim connects your service to the right owner.</p>
        </CardContent>
        <CardFooter className="p-5 pt-0">
          <Button asChild variant="default" className="min-h-11">
            <a href="/claim?source=supply">Claim your business</a>
          </Button>
        </CardFooter>
      </Card>
    )
  }
  return (
    <div className="grid gap-8">
      <header className="grid gap-2">
        <p className="block text-sm font-semibold text-muted-foreground">BUSINESS SERVICES</p>
        <h1 className="text-2xl font-semibold text-foreground">Get your service ready for AI assistants</h1>
        <p className="block text-muted-foreground">Describe what you do, set a price, test it, and go live. Earn when agents bring you work.</p>
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
                    <a href={`/owner/supply/${encodeURIComponent(offering.offeringRef)}`}>Continue setup</a>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
        <CardFooter className="p-5 pt-0">
          <Button asChild variant="default" className="min-h-11">
            <a href="/owner/offerings/new?next=supply">Describe a service</a>
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
