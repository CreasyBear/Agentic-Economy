import { Link } from '@tanstack/react-router'
import { ArrowRightIcon } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

import type { SupplyLandingTool } from '@/modules/capability-supply/supply-funnel.functions'
import type { ServiceDto } from '@/modules/registry/public'

import { AeSupplyAgentProof } from './AeSupplyAgentProof'

export const SUPPLY_OFFER_SENTENCE = 'Publish the capability, price and access terms agents need to discover, compare and call your tool.'

export function AeSupplyLanding({
  tools,
  services,
  sourceError,
  onRetry,
}: Readonly<{
  tools: readonly SupplyLandingTool[]
  services: readonly ServiceDto[]
  sourceError?: string
  onRetry?: () => void
}>) {
  return (
    <div className="mx-auto grid w-full max-w-[1080px] gap-8 px-4 py-10 sm:px-6 sm:py-14">
      <header className="grid gap-5 border-b pb-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div className="grid max-w-3xl gap-3">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Supplier setup</p>
          <h1 className="text-4xl font-semibold leading-tight tracking-[-0.035em] sm:text-5xl">List your tool or API.</h1>
          <p className="max-w-3xl text-base leading-7 text-muted-foreground">{SUPPLY_OFFER_SENTENCE}</p>
          {sourceError === undefined ? null : (
            <Alert variant="destructive">
              <AlertTitle>Supplier information is unavailable</AlertTitle>
              <AlertDescription><p>{sourceError}</p>{onRetry === undefined ? null : <Button type="button" variant="outline" className="mt-2" onClick={onRetry}>Try again</Button>}</AlertDescription>
            </Alert>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild><Link to="/owner/supply">Manage listings</Link></Button>
          <Button asChild variant="outline"><Link to="/market" search={{ window: '30d' }}>Browse market</Link></Button>
        </div>
      </header>

      <section aria-labelledby="supplier-path" className="grid overflow-hidden rounded-lg border bg-card md:grid-cols-3">
        <h2 id="supplier-path" className="sr-only">How supplier listing works</h2>
        <SupplierStep number="01" title="Describe the tool" detail="Publish the job it does, its exact inputs and the outcome it returns." />
        <SupplierStep number="02" title="Set access and price" detail="Make availability, price and payment terms clear before any call." />
        <SupplierStep number="03" title="Test and publish" detail="Confirm the route works, then make the Operation discoverable in the market." />
      </section>

      <section aria-labelledby="supplier-expectations" className="grid gap-3 rounded-lg border bg-muted/30 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div><h2 id="supplier-expectations" className="font-semibold">You control the listing and the route.</h2><p className="text-sm leading-6 text-muted-foreground">Agents see your published facts before choosing. Setup and test calls do not create settled earnings or payouts.</p></div>
        <Link to="/owner/supply" className="inline-flex min-h-11 items-center gap-1 justify-self-start text-sm font-semibold underline-offset-4 hover:underline">Open supplier dashboard <ArrowRightIcon aria-hidden="true" className="size-3.5" /></Link>
      </section>

      <AeSupplyAgentProof tools={tools} services={services} />
    </div>
  )
}

function SupplierStep({ number, title, detail }: Readonly<{ number: string; title: string; detail: string }>) {
  return (
    <article className="grid content-start gap-3 border-b p-5 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0">
      <span className="font-mono text-xs text-muted-foreground">{number}</span>
      <div><h2 className="font-semibold">{title}</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">{detail}</p></div>
    </article>
  )
}
