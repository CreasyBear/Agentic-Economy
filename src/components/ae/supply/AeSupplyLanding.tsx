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
  { number: '01', title: 'Choose one Tool', detail: 'Choose one bounded Tool with exact inputs and one usable outcome—not an entire app or account.' },
  { number: '02', title: 'Add its source', detail: 'Start with a supported OpenAPI document, remote MCP server, Agent Plugin bundle, or public x402 endpoint.' },
  { number: '03', title: 'Describe and check it', detail: 'Provide price, access, effects, data use, and evidence. The check can reach your configured source.' },
  { number: '04', title: 'Submit, then check status', detail: 'A submitted Tool is not yet published. Read its current status before sharing it with agents.' },
] as const

const SUPPLY_REQUIREMENTS = [
  'One supported source and one Tool you are authorised to list.',
  'A clear input, expected output, price, material terms, data use, external effects, and evidence of completion.',
  'A safe example for the check. It may call your configured source, consume its quota, or incur its normal cost.',
  'An existing owner-controlled connection when the source needs credentials. Never paste a raw key or other provider secret into the Tool form.',
] as const

const SUPPLY_SOURCE_FIT = [
  {
    title: 'Public OpenAPI or MCP',
    body: 'A public HTTPS API or remote MCP server may be a fit. The source still needs a supported contract and a successful current check.',
  },
  {
    title: 'Source that needs credentials',
    body: 'Sign in and use an owner-controlled connection. If setup offers no compatible connection, that source cannot be listed yet.',
  },
  {
    title: 'Public x402 endpoint',
    body: 'Use a public HTTPS endpoint that returns the supported payment challenge. Prove control of the payout address; never paste a wallet private key.',
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
              List one Tool an agent can search, inspect, and call. Public sources need no provider secret. For a source that needs credentials, use an existing owner-controlled connection; this flow does not collect a raw provider key.
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
      <AeSiteSection ariaLabel="How to add a Tool" scheme="surface">
        <AeCollectionRail kicker="How to add" title="Steps to add a Tool" titleId="supply-publish-steps">
          <ol className="m-0 grid list-none gap-0 p-0">
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
            You control the listing and the source. Agents can inspect only the facts that are published. Publication means the current Tool passed Agentic Economy’s admission and readiness checks; it does not guarantee demand, payment, delivery, or payout. Setup and test calls do not create settled earnings or payouts.
          </AeSiteBody>
          <Link
            to="/owner/operations"
            className="inline-flex min-h-touch items-center justify-self-start text-sm font-medium underline underline-offset-4"
          >
            Manage listed Tools
          </Link>
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
