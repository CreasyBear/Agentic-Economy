import { Link } from '@tanstack/react-router'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  AeSiteBody,
  AeSiteButton,
  AeSiteEyebrow,
  AeSiteHeading,
  AeSiteHeadingPair,
  AeSiteHeroIntro,
  AeSiteSection,
  AeSiteStack,
} from '@/components/ae/website'

import type { SupplyLandingTool } from '@/modules/capability-supply/supply-funnel.functions'
import type { ServiceDto } from '@/modules/registry/public'

import { AeSupplyAgentProof } from './AeSupplyAgentProof'

export const SUPPLY_OFFER_SENTENCE = 'Publish the job, the price, and the access terms. Agents compare before they call.'

const SUPPLY_STEPS = [
  { number: '01', title: 'Describe the tool', detail: 'Publish the job it does, its exact inputs and the outcome it returns.' },
  { number: '02', title: 'Set access and price', detail: 'Make availability, price and payment terms clear before any call.' },
  { number: '03', title: 'Test and publish', detail: 'Confirm the route works, then make it discoverable in the catalog.' },
] as const

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
      <AeSiteSection labelledBy="supply-hero" rhythm="hero" scheme="muted">
        <AeSiteHeroIntro>
          <AeSiteHeadingPair>
            <div className="mx-auto grid w-full max-w-xl justify-items-center gap-3">
              <AeSiteEyebrow>Suppliers</AeSiteEyebrow>
              <AeSiteHeading as="h1" size="md" id="supply-hero">
                List your tool.
              </AeSiteHeading>
            </div>
            <div className="mx-auto w-full max-w-lg">
              <AeSiteBody muted size="sm" className="mx-auto">
                {SUPPLY_OFFER_SENTENCE}
              </AeSiteBody>
            </div>
          </AeSiteHeadingPair>
          <AeSiteButton asChild>
            <Link to="/owner/supply">List a tool</Link>
          </AeSiteButton>
        </AeSiteHeroIntro>
      </AeSiteSection>
      {sourceError === undefined ? null : (
        <AeSiteSection ariaLabel="Supplier recovery" scheme="canvas">
          <Alert variant="destructive" className="max-w-3xl">
            <AlertTitle>Supplier information is unavailable</AlertTitle>
            <AlertDescription>
              <p>{sourceError}</p>
              {onRetry === undefined ? null : (
                <Button type="button" variant="outline" className="mt-intra min-h-touch" onClick={onRetry}>
                  Try again
                </Button>
              )}
            </AlertDescription>
          </Alert>
        </AeSiteSection>
      )}
      <AeSiteSection ariaLabel="How to list a tool" scheme="surface">
        <AeSiteStack>
          <ol className="m-0 grid list-none gap-page p-0">
            {SUPPLY_STEPS.map((step) => (
              <li key={step.number} className="grid gap-intra border-b border-border pb-page last:border-b-0 last:pb-0">
                <AeSiteEyebrow>{step.number}</AeSiteEyebrow>
                <h2 className="font-display text-2xl font-medium tracking-tight sm:text-3xl">{step.title}</h2>
                <AeSiteBody muted size="sm">{step.detail}</AeSiteBody>
              </li>
            ))}
          </ol>
        </AeSiteStack>
      </AeSiteSection>
      <AeSiteSection ariaLabel="Listing control" scheme="canvas">
        <div className="grid max-w-3xl gap-section">
          <AeSiteBody muted>
            You control the listing and the route. Agents see your published facts before choosing. Setup and test calls do not create settled earnings or payouts.
          </AeSiteBody>
          <Link
            to="/owner/supply"
            className="inline-flex min-h-touch items-center justify-self-start text-sm font-medium underline underline-offset-4"
          >
            Manage listings
          </Link>
        </div>
      </AeSiteSection>
      <AeSiteSection ariaLabel="What agents can inspect" scheme="surface">
        <AeSupplyAgentProof tools={tools} services={services} />
      </AeSiteSection>
    </>
  )
}
