import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

import type { SupplyLandingTool } from '@/modules/capability-supply/supply-funnel.functions'
import type { ServiceDto } from '@/modules/registry/public'

import { AeSupplyAgentProof } from './AeSupplyAgentProof'

export const SUPPLY_OFFER_SENTENCE = 'Publish what you do once. Assistants find and share your services. Test it, go live, and prepare for paid work when agents bring you work and payment support is enabled.'

export function AeSupplyLanding({
  tools,
  services,
}: Readonly<{
  tools: readonly SupplyLandingTool[]
  services: readonly ServiceDto[]
}>) {
  return (
    <>
      <header className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-12 sm:px-6 md:py-16">
        <div className="grid max-w-4xl gap-5">
          <p className="block text-sm font-semibold text-muted-foreground">FOR BUSINESSES</p>
          <h1 className="text-4xl leading-tight font-semibold tracking-tight text-foreground md:text-5xl">Let AI assistants bring your business more work.</h1>
          <p className="block max-w-3xl text-lg text-muted-foreground">
            {SUPPLY_OFFER_SENTENCE}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild variant="default" className="min-h-11">
              <Link to="/claim" search={{ source: 'supply' }}>Start publishing your service</Link>
            </Button>
            <Link to="/owner/supply" className="min-h-11 px-2 py-3 text-sm font-semibold underline underline-offset-4">Manage your service</Link>
          </div>
        </div>
      </header>
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 pb-16 sm:px-6">
        <Card className="border-border bg-brand-muted text-foreground">
          <CardContent className="grid gap-3 p-6">
            <p className="block text-sm font-semibold text-foreground">YOUR PATH TO PAID WORK WHEN ENABLED</p>
            <p className="block max-w-3xl text-muted-foreground">Publish once, then prepare for paid work when payment support is enabled.</p>
            <p className="block max-w-3xl text-muted-foreground">Setup and test calls do not create AE-settled earnings or payouts.</p>
          </CardContent>
        </Card>
        <section aria-labelledby="supply-payment-flow" className="grid gap-4">
          <div className="grid gap-1">
            <h2 id="supply-payment-flow" className="text-xl font-semibold text-foreground">Set terms assistants can review</h2>
            <p className="block max-w-3xl text-muted-foreground">Choose the price for each call. Any fee and total charge are shown before approval; no fixed fee or provider proceeds are promised until payment support is enabled.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <FlowCard label="Your price" detail="The amount you choose for each call." />
            <FlowCard label="Payment terms" detail="Any fee and total charge are shown before approval." />
            <FlowCard label="Earnings" detail="AE-settled earnings and payouts are unavailable until payment support is enabled." />
          </div>
        </section>
        <AeSupplyAgentProof tools={tools} services={services} />
      </div>
    </>
  )
}

function FlowCard({ label, detail }: Readonly<{ label: string; detail: string }>) {
  return (
    <Card className="border border-border bg-card">
      <CardHeader className="p-4 pb-0">
        <CardTitle><p className="font-semibold text-foreground">{label}</p></CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-1">
        <CardDescription><p>{detail}</p></CardDescription>
      </CardContent>
    </Card>
  )
}
