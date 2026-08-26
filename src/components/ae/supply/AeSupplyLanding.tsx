import { Link } from '@tanstack/react-router'
import { ArrowRightIcon } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { AePageHeader } from '@/components/ae/layout/AePageHeader'

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
    <>
      <AePageHeader
        title="List your tool or API."
        description={SUPPLY_OFFER_SENTENCE}
        actions={
          <Button asChild className="min-h-11">
            <Link to="/owner/supply">List a tool</Link>
          </Button>
        }
      />
      <div className="ae-rail grid gap-section pb-page">
        {sourceError === undefined ? null : (
          <Alert variant="destructive">
            <AlertTitle>Supplier information is unavailable</AlertTitle>
            <AlertDescription>
              <p>{sourceError}</p>
              {onRetry === undefined ? null : (
                <Button type="button" variant="outline" className="mt-2 min-h-11" onClick={onRetry}>
                  Try again
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}

        <ol className="m-0 grid list-decimal gap-6 border-y border-border py-8 pl-6 marker:font-mono marker:text-sm marker:text-muted-foreground">
          <SupplierStep title="Describe the tool" detail="Publish the job it does, its exact inputs and the outcome it returns." />
          <SupplierStep title="Set access and price" detail="Make availability, price and payment terms clear before any call." />
          <SupplierStep title="Test and publish" detail="Confirm the route works, then make the Operation discoverable in the market." />
        </ol>

        <p className="max-w-2xl text-sm text-muted-foreground">
          You control the listing and the route. Agents see your published facts before choosing. Setup and test calls do not create settled earnings or payouts.
        </p>

        <Link
          to="/owner/supply"
          className="inline-flex min-h-11 items-center gap-1 justify-self-start text-sm font-medium underline-offset-4 hover:underline"
        >
          Open supplier dashboard <ArrowRightIcon aria-hidden="true" className="size-3.5" />
        </Link>

        <AeSupplyAgentProof tools={tools} services={services} />
      </div>
    </>
  )
}

function SupplierStep({ title, detail }: Readonly<{ title: string; detail: string }>) {
  return (
    <li className="grid gap-1 pl-2">
      <h2 className="text-base font-medium">{title}</h2>
      <p className="text-sm leading-6 text-muted-foreground">{detail}</p>
    </li>
  )
}
