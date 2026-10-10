import { Link } from '@tanstack/react-router'
import { ArrowUpRight } from 'lucide-react'

import { ProviderHero } from '@/components/ae/shared/reui-pro/hero/ProviderHero'
import { AeSiteFaq } from '@/components/ae/website'
import { Stepper, StepperDescription, StepperIndicator, StepperItem, StepperTitle } from '@/components/reui/stepper'
import { PROVIDER_FAQ, PROVIDER_SETUP_STEPS } from '@/content/provider-copy'

import './ProviderLandingComposition.css'

export function AeSupplyLanding() {
  return <div className="arc-market ae-provider-landing">
    <ProviderHero />

    <section id="provider-setup" className="ae-provider-setup" aria-labelledby="provider-setup-heading" tabIndex={-1}>
      <header className="ae-provider-section-heading">
        <h2 id="provider-setup-heading">Connect your <br />paid endpoint</h2>
        <p>Sign in to your Account and set up a Provider profile. Then connect an endpoint you are authorised to offer.</p>
      </header>
      <div className="ae-provider-setup-grid">
        {/* This is a read-only overview. No step represents completed Account setup. */}
        <Stepper value={0} orientation="vertical" role="list" aria-label="Steps to add a Tool" className="ae-provider-steps">
          {PROVIDER_SETUP_STEPS.map((step, index) => <StepperItem key={step.title} step={index + 1} role="listitem" className="ae-provider-step">
            <StepperIndicator><span aria-hidden="true">{index + 1}</span></StepperIndicator>
            <div>
              <StepperTitle>{step.title}</StepperTitle>
              <StepperDescription>{step.detail}</StepperDescription>
            </div>
          </StepperItem>)}
        </Stepper>
        <aside className="ae-provider-requirements" aria-labelledby="provider-requirements-heading">
          <h3 id="provider-requirements-heading">What your endpoint needs</h3>
          <ul>
            <li><span>Endpoint</span><p>A public HTTPS URL serving an x402 v2 payment challenge.</p></li>
            <li><span>Contract</span><p>Input and output schemas, an exact Base USDC price, and a payment recipient (<code>payTo</code>).</p></li>
            <li><span>Authority</span><p>Permission to list the service and a signature proving control of <code>payTo</code>. Never paste a private key.</p></li>
          </ul>
          <p className="ae-provider-requirements-note">Base Sepolia is sandbox; Base mainnet is production. Setup checks may reach your endpoint and consume quota or incur cost.</p>
        </aside>
      </div>
      <p className="ae-provider-setup-note">A successful check does not publish the Tool, create earnings, or guarantee delivery. Review the current readiness status before publishing.</p>
    </section>

    <section className="ae-provider-market" aria-labelledby="provider-market-heading">
      <header className="ae-provider-section-heading">
        <h2 id="provider-market-heading">See what <br />buyers can inspect</h2>
        <div><p>Browse Tool descriptions, listed prices and access requirements before creating your own Tool.</p>
          <Link to="/market" search={{ view: 'tools' }} preload={false} className="ae-provider-text-link">Browse the directory<ArrowUpRight size={20} aria-hidden="true" /></Link>
        </div>
      </header>

    </section>

    <AeSiteFaq labelledBy="provider-faq-heading" title={PROVIDER_FAQ.heading} questions={PROVIDER_FAQ.questions} />
    <nav className="ae-provider-utility" aria-label="Provider help and legal">
      <span>Aecon</span>
      <div><Link to="/developers/api">Developer guide</Link><Link to="/support">Help</Link><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link></div>
    </nav>
  </div>
}
