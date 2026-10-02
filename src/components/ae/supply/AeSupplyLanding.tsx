import { Link } from '@tanstack/react-router'
import { Button as ArcButton } from '@/components/arc/button/button'
import buttonStyles from '@/components/arc/button/button.module.css'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AeSiteFaq } from '@/components/ae/website'
import { PROVIDER_FAQ } from '@/content/provider-copy'

import type { SupplyLandingTool } from '@/modules/capability-supply/supply-funnel.functions'
import type { ToolCardViewModel } from '@/modules/market/tool-view-model'

import { AeSupplyAgentProof } from './AeSupplyAgentProof'
import './ProviderLandingComposition.css'

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
    <div className="arc-market arc-provider-landing">
      <section className="arc-provider-hero" aria-labelledby="supply-hero">
        <div className="arc-provider-hero-inner">
          <div className="arc-provider-hero-copy">
            <h1 className="arc-provider-hero-title" id="supply-hero">Add a Tool.</h1>
            <p className="arc-provider-hero-description">{SUPPLY_OFFER_SENTENCE}</p>
            <div className="arc-provider-hero-actions">
              <Link
                to="/owner/operations/new"
                className={[
                  buttonStyles.button,
                  buttonStyles.primary,
                  buttonStyles.lg,
                  'arc-provider-action',
                ].join(' ')}
              >
                Add Tool
              </Link>
            </div>
          </div>
          <aside className="arc-provider-requirements" aria-labelledby="supply-requirements-heading">
            <h2 className="arc-provider-requirements-title" id="supply-requirements-heading">
              Before you sign in
            </h2>
            <ul className="arc-provider-requirement-list">
              {SUPPLY_REQUIREMENTS.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </aside>
        </div>
      </section>
      {sourceError === undefined ? null : (
        <section className="arc-provider-error" aria-label="Provider recovery">
          <div className="arc-provider-error-inner">
            <Alert variant="destructive" className="arc-provider-error-alert">
              <AlertTitle>Provider information is unavailable</AlertTitle>
              <AlertDescription>
                <p>{sourceError}</p>
                {onRetry === undefined ? null : (
                  <ArcButton type="button" variant="secondary" size="md" className="arc-provider-action" onClick={onRetry}>
                    Try again
                  </ArcButton>
                )}
              </AlertDescription>
            </Alert>
          </div>
        </section>
      )}
      <section className="arc-provider-fit" aria-labelledby="supply-fit-heading">
        <div className="arc-provider-fit-inner">
          <div className="arc-provider-fit-copy">
            <h2 className="arc-provider-section-title" id="supply-fit-heading">Check whether your Tool is a fit.</h2>
            <p>
              List one x402 Tool an agent can search, inspect, and call. Paste the public HTTPS endpoint. This page does not ask for OpenAPI, MCP, an API key, or a private key.
            </p>
            <p>
              A check may reach the configured upstream. Use an example that is safe there and assume it may consume provider quota or cost. A successful check does not publish the Tool, create earnings, or guarantee delivery. Timing depends on the source and current requirements; check the current status rather than relying on an estimate.
            </p>
            <p>
              Creating the Provider business is an owner step. After that, an owner can approve a separate agent credential for maintenance. The source preview confirms the exact current contract.
            </p>
          </div>
          {SUPPLY_SOURCE_FIT.map((source) => (
            <article className="arc-provider-source-card" key={source.title} aria-labelledby="supply-source-fit-heading">
              <h3 className="arc-provider-source-title" id="supply-source-fit-heading">{source.title}</h3>
              <p className="arc-provider-source-copy">{source.body}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="arc-provider-steps" aria-labelledby="supply-publish-steps">
        <div className="arc-provider-steps-inner">
          <header className="arc-provider-steps-header">
            <h2 className="arc-provider-steps-title" id="supply-publish-steps">Steps to add a Tool</h2>
          </header>
          <ol className="arc-provider-steps-list">
            {SUPPLY_STEPS.map((step) => (
              <li key={step.number} className="arc-provider-step">
                <span className="arc-provider-step-node" aria-hidden="true">{step.number}</span>
                <div className="arc-provider-step-copy">
                  <h3 className="arc-provider-step-title">{step.title}</h3>
                  <p className="arc-provider-step-detail">{step.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>
      <section className="arc-provider-listing-control" aria-label="Listing control">
        <div className="arc-provider-listing-inner">
          <p className="arc-provider-listing-copy">
            You control the listing and the source. Agents can inspect only the facts that are published. Publication means the current Tool passed Agentic Economy’s admission and readiness checks; it does not guarantee demand, payment, delivery, or payout. Setup checks do not create settled earnings or payouts.
          </p>
        </div>
      </section>
      {sourceError === undefined ? (
        <section className="arc-provider-proof" aria-label="What agents can inspect">
          <div className="arc-provider-proof-inner">
            <AeSupplyAgentProof tools={tools} publishedTools={publishedTools} />
          </div>
        </section>
      ) : null}
      <AeSiteFaq
        labelledBy="provider-faq-heading"
        title={PROVIDER_FAQ.heading}
        questions={PROVIDER_FAQ.questions}
      />
    </div>
  )
}
