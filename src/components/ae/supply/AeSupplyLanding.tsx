import { Link } from '@tanstack/react-router'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { AeCollectionRail } from '@/components/ae/shared/AeCollectionRail'
import {
  AeSiteBody,
  AeSiteFaq,
  AeSiteButton,
  AeSiteEyebrow,
  AeSiteHeading,
  AeSiteHeadingPair,
  AeSiteHeroIntro,
  AeSiteSection,
} from '@/components/ae/website'
import { PROVIDER_FAQ } from '@/content/provider-copy'

import type { SupplyLandingTool } from '@/modules/capability-supply/supply-funnel.functions'
import type { ToolCardViewModel } from '@/modules/market/tool-view-model'

import { AeSupplyAgentProof } from './AeSupplyAgentProof'

export const SUPPLY_OFFER_SENTENCE = 'Connect a Tool you already run. Agentic Economy checks what agents can buy.'

const SUPPLY_STEPS = [
  { number: '01', title: 'Paste the endpoint', detail: 'Paste one public HTTPS x402 URL. If both GET and POST return a payment challenge, choose the method.' },
  { number: '02', title: 'Read the challenge', detail: 'The payment challenge supplies the network, price, schema, and payTo. There is no separate price or environment choice.' },
  { number: '03', title: 'Prove the payee', detail: 'Sign one claim that this business controls that payTo. Do not paste a private key.' },
  { number: '04', title: 'Record the Tool', detail: 'One authority statement records the listing. It becomes callable when the readiness check passes; otherwise the page names the missing fact.' },
] as const

const SUPPLY_REQUIREMENTS = [
  'One public HTTPS x402 endpoint you are authorised to list for this business.',
  'A payment challenge that includes the input schema, output schema, amount, network, and payTo.',
  'One signature proving control of that payTo. Never paste a wallet private key.',
] as const

const SUPPLY_SOURCE_FIT = [
  {
    title: 'Public x402 endpoint',
    body: 'Paste the HTTPS URL that returns the payment challenge. The network in that challenge is the environment. Prove control of payTo; never paste a wallet private key.',
  },
] as const

export function AeSupplyLanding({
  tools,
  publishedTools,
  sourceError,
  onRetry,
}: Readonly<{
  tools: readonly SupplyLandingTool[]
  publishedTools: readonly ToolCardViewModel[]
  sourceError?: string
  onRetry?: () => void
}>) {
  return (
    <>
      <AeSiteSection labelledBy="supply-hero" rhythm="hero" scheme="muted">
        <AeSiteHeroIntro>
          <AeSiteHeadingPair>
            <div className="grid w-full max-w-xl justify-items-start gap-3">
              <AeSiteEyebrow>Providers</AeSiteEyebrow>
              <AeSiteHeading as="h1" size="lg" id="supply-hero">
                Add a Tool.
              </AeSiteHeading>
            </div>
            <div className="w-full max-w-lg">
              <AeSiteBody muted size="sm">
                {SUPPLY_OFFER_SENTENCE}
              </AeSiteBody>
            </div>
          </AeSiteHeadingPair>
          <div className="flex flex-wrap items-center gap-related">
            <AeSiteButton asChild>
              <Link to="/owner/operations/new">Add Tool</Link>
            </AeSiteButton>
          </div>
        </AeSiteHeroIntro>
      </AeSiteSection>
      {sourceError === undefined ? null : (
        <AeSiteSection ariaLabel="Provider recovery" scheme="canvas">
          <Alert variant="destructive" className="max-w-3xl">
            <AlertTitle>Provider information is unavailable</AlertTitle>
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
      <AeSiteSection ariaLabel="Check provider fit" scheme="canvas">
        <div className="grid max-w-3xl gap-page">
          <div className="grid gap-intra">
            <AeSiteEyebrow>Before you sign in</AeSiteEyebrow>
            <AeSiteHeading as="h2" size="md">Check whether your Tool is a fit.</AeSiteHeading>
            <AeSiteBody muted size="sm">
              List one x402 Tool an agent can search, inspect, and call. Paste the public HTTPS endpoint. This page does not ask for OpenAPI, MCP, an API key, or a private key.
            </AeSiteBody>
          </div>
          <ul className="m-0 grid gap-intra pl-5 text-sm text-muted-foreground">
            {SUPPLY_REQUIREMENTS.map((item) => <li key={item}>{item}</li>)}
          </ul>
          <p className="text-sm text-muted-foreground">
            A check may reach the configured upstream. Use an example that is safe there and assume it may consume provider quota or cost. A successful check does not publish the Tool, create earnings, or guarantee delivery. Timing depends on the source and current requirements; check the current status rather than relying on an estimate.
          </p>
          <p className="text-sm text-muted-foreground">
            Creating the Provider business is an owner step. After that, an owner can approve a separate agent credential for maintenance. The source preview confirms the exact current contract.
          </p>
          <ul className="m-0 grid list-none gap-0 p-0" aria-label="Supported source paths">
            {SUPPLY_SOURCE_FIT.map((source) => (
              <li key={source.title} className="grid gap-intra border-b border-border py-related last:border-b-0">
                <h3 className="font-medium text-foreground">{source.title}</h3>
                <p className="text-sm text-muted-foreground">{source.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </AeSiteSection>
      <AeSiteSection scheme="surface">
        <AeCollectionRail kicker="How to add" title="Steps to add a Tool" titleId="supply-publish-steps">
          <ol className="m-0 grid gap-0 p-0">
            {SUPPLY_STEPS.map((step) => (
              <li key={step.number} className="grid gap-intra border-b border-border py-related last:border-b-0">
                <AeSiteHeading as="h3" size="sm">{step.title}</AeSiteHeading>
                <AeSiteBody muted size="sm">{step.detail}</AeSiteBody>
              </li>
            ))}
          </ol>
        </AeCollectionRail>
      </AeSiteSection>
      <AeSiteSection ariaLabel="Listing control" scheme="canvas">
        <div className="grid max-w-3xl gap-section">
          <AeSiteBody muted>
            You control the listing and the source. Agents can inspect only the facts that are published. Publication means the current Tool passed Agentic Economy’s admission and readiness checks; it does not guarantee demand, payment, delivery, or payout. Setup checks do not create settled earnings or payouts.
          </AeSiteBody>
        </div>
      </AeSiteSection>
      {sourceError === undefined ? (
        <AeSiteSection ariaLabel="What agents can inspect" scheme="surface">
          <AeSupplyAgentProof tools={tools} publishedTools={publishedTools} />
        </AeSiteSection>
      ) : null}
      <AeSiteFaq
        labelledBy="provider-faq-heading"
        title={PROVIDER_FAQ.heading}
        questions={PROVIDER_FAQ.questions}
      />
    </>
  )
}
