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
import type { ToolCardViewModel } from '@/modules/market/tool-view-model'

import { AeSupplyAgentProof } from './AeSupplyAgentProof'

export const SUPPLY_OFFER_SENTENCE = 'List one service agents can inspect and call. You describe the price, access, effects, and evidence; Agentic Economy records it as a Tool.'

const SUPPLY_STEPS = [
  { number: '01', title: 'Choose one service', detail: 'Choose one bounded service with exact inputs and one usable outcome—not an entire app or account.' },
  { number: '02', title: 'Add its source', detail: 'Start with a supported OpenAPI document, remote MCP server, Agent Plugin bundle, or public x402 endpoint.' },
  { number: '03', title: 'Describe and check it', detail: 'Provide price, access, effects, data use, and evidence. The check can reach your configured source.' },
  { number: '04', title: 'Submit, then check status', detail: 'A submitted service is not yet published. Read its current status before sharing it with agents.' },
] as const

const SUPPLY_REQUIREMENTS = [
  'One supported source and one service you are authorised to list.',
  'A clear input, expected output, price, material terms, data use, external effects, and evidence of completion.',
  'A safe example for the check. It may call your configured source, consume its quota, or incur its normal cost.',
  'An existing owner-controlled connection when the source needs credentials. Never paste a raw key or other provider secret into the service form.',
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
            <div className="mx-auto grid w-full max-w-xl justify-items-center gap-3">
              <AeSiteEyebrow>Providers</AeSiteEyebrow>
              <AeSiteHeading as="h1" size="md" id="supply-hero">
                List a service.
              </AeSiteHeading>
            </div>
            <div className="mx-auto w-full max-w-lg">
              <AeSiteBody muted size="sm" className="mx-auto">
                {SUPPLY_OFFER_SENTENCE}
              </AeSiteBody>
            </div>
          </AeSiteHeadingPair>
          <AeSiteButton asChild>
            <Link to="/owner/offerings">List a service</Link>
          </AeSiteButton>
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
            <AeSiteHeading as="h2" size="sm">Check whether your service is a fit.</AeSiteHeading>
            <AeSiteBody muted size="sm">
              List one service an agent can search, inspect, and call. Public sources need no provider secret. For a source that needs credentials, use an existing owner-controlled connection; this flow does not collect a raw provider key.
            </AeSiteBody>
          </div>
          <ul className="m-0 grid gap-intra pl-5 text-sm text-muted-foreground">
            {SUPPLY_REQUIREMENTS.map((item) => <li key={item}>{item}</li>)}
          </ul>
          <p className="text-sm text-muted-foreground">
            A check may reach the configured upstream. Use an example that is safe there and assume it may consume provider quota or cost. A successful check does not publish the service, create earnings, or guarantee delivery. Timing depends on the source and current requirements; check the current status rather than relying on an estimate.
          </p>
          <p className="text-sm text-muted-foreground">
            Creating the Provider business is an owner step. After that, an owner can approve a separate agent credential for maintenance. The source preview confirms the exact current contract. For x402, read the <a href="https://github.com/CreasyBear/Agentic-Economy/blob/main/X402_SELLER_ONBOARDING.md" className="font-medium text-foreground underline underline-offset-4">x402 Provider requirements</a> before you start.
          </p>
          <div className="grid gap-related sm:grid-cols-3" aria-label="Supported source paths">
            {SUPPLY_SOURCE_FIT.map((source) => (
              <article key={source.title} className="grid content-start gap-intra rounded-card border border-border bg-card p-gutter">
                <h3 className="font-semibold text-foreground">{source.title}</h3>
                <p className="text-sm text-muted-foreground">{source.body}</p>
              </article>
            ))}
          </div>
        </div>
      </AeSiteSection>
      <AeSiteSection ariaLabel="How to publish a Tool" scheme="surface">
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
            You control the listing and the source. Agents can inspect only the facts that are published. Publication means the current service passed Agentic Economy’s admission and readiness checks; it does not guarantee demand, payment, delivery, or payout. Setup and test calls do not create settled earnings or payouts.
          </AeSiteBody>
          <Link
            to="/owner/offerings"
            className="inline-flex min-h-touch items-center justify-self-start text-sm font-medium underline underline-offset-4"
          >
            Manage listed services
          </Link>
        </div>
      </AeSiteSection>
      {sourceError === undefined ? (
        <AeSiteSection ariaLabel="What agents can inspect" scheme="surface">
          <AeSupplyAgentProof tools={tools} publishedTools={publishedTools} />
        </AeSiteSection>
      ) : null}
    </>
  )
}
