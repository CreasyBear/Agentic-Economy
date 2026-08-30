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

export const SUPPLY_OFFER_SENTENCE = 'Publish one bounded job, its price, and its access terms. Agents inspect the Operation before they call.'

const SUPPLY_STEPS = [
  { number: '01', title: 'Define one Operation', detail: 'Choose one bounded job with exact inputs and one usable outcome—not an entire app or account.' },
  { number: '02', title: 'Connect one source', detail: 'Use one OpenAPI 3.1 GET or POST, remote MCP tool, Agent Plugin MCP tool, or public x402 HTTPS endpoint.' },
  { number: '03', title: 'Set terms and test', detail: 'Declare price, access, effects, and evidence. AE checks the selected route before publication.' },
  { number: '04', title: 'Publish and verify', detail: 'Publish only after readiness passes, then confirm agents can inspect the current Operation.' },
] as const

const SUPPLY_PREP = [
  'The current source document or endpoint and the exact operation or tool selector.',
  'The input and output schema, plus a safe example input for the readiness test.',
  'Price, material terms, data use, side effects, and the evidence returned after delivery.',
  'An existing owner-controlled provider connection if the upstream requires credentials. Never paste a raw key into the Operation form.',
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
                Publish an Operation.
              </AeSiteHeading>
            </div>
            <div className="mx-auto w-full max-w-lg">
              <AeSiteBody muted size="sm" className="mx-auto">
                {SUPPLY_OFFER_SENTENCE}
              </AeSiteBody>
            </div>
          </AeSiteHeadingPair>
          <AeSiteButton asChild>
            <Link to="/owner/supply">Create or continue an Operation</Link>
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
      <AeSiteSection ariaLabel="Check supplier fit" scheme="canvas">
        <div className="grid max-w-3xl gap-page">
          <div className="grid gap-intra">
            <AeSiteEyebrow>Before you sign in</AeSiteEyebrow>
            <AeSiteHeading as="h2" size="sm">Know what AE will ask for.</AeSiteHeading>
            <AeSiteBody muted size="sm">
              An Operation is one callable job an agent can search, compare, inspect, and buy. Public upstreams need no supplier secret. Keyed sources use an existing owner-controlled connection; AE does not collect a raw provider key in this flow.
            </AeSiteBody>
          </div>
          <ul className="m-0 grid gap-intra pl-5 text-sm text-muted-foreground">
            {SUPPLY_PREP.map((item) => <li key={item}>{item}</li>)}
          </ul>
          <p className="text-sm text-muted-foreground">
            Creating the supplier account and business is an owner step. After that, an owner can approve a separate agent credential for maintenance. <Link to="/SKILL.md" hash="supplier-path" className="font-medium text-foreground underline underline-offset-4">Read the supplier agent path</Link>.
          </p>
        </div>
      </AeSiteSection>
      <AeSiteSection ariaLabel="How to publish an Operation" scheme="surface">
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
            Manage Operations
          </Link>
        </div>
      </AeSiteSection>
      <AeSiteSection ariaLabel="What agents can inspect" scheme="surface">
        <AeSupplyAgentProof tools={tools} services={services} />
      </AeSiteSection>
    </>
  )
}
