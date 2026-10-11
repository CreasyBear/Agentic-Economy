import { Link } from '@tanstack/react-router'

import {
  AeAssistantInstallFunnel,
  type AeAssistantInstallFunnelProps,
} from '@/components/ae/console/AeAssistantInstallFunnel'
import { AeSiteFaq } from '@/components/ae/website/AeSiteFaq'
import { RouterLinkBoundary } from '@/components/ae/shared/router-link-boundary/RouterLinkBoundary'
import { HeroSection } from '@/components/arc/blocks/hero-section/hero-section'
import { AGENT_PAGE } from '@/content/brand-copy'
import './AgentDoorComposition.css'

type AeAgentDoorPageProps = Readonly<Pick<
  AeAssistantInstallFunnelProps,
  'setupApp' | 'onSetupAppChange'
> & { canonicalBaseUrl: string; availability: string }>

export function AeAgentDoorPage({ canonicalBaseUrl, availability, setupApp, onSetupAppChange }: AeAgentDoorPageProps) {
  return (
    <div className="arc-market arc-agent-door">
      <section role="region" aria-label={AGENT_PAGE.heading}>
        <RouterLinkBoundary>
          <HeroSection
            variant="split"
            title={AGENT_PAGE.heading}
            description={AGENT_PAGE.subhead}
            primaryAction={{ label: AGENT_PAGE.primaryCta, href: '#agent-setup' }}
            animateIn={false}
            media={(
              <section
                id="agent-setup"
                aria-label="Agent connection"
                tabIndex={-1}
                className="arc-agent-door-setup"
              >
                <AeAssistantInstallFunnel
                  canonicalBaseUrl={canonicalBaseUrl}
                  {...(setupApp === undefined ? {} : { setupApp })}
                  {...(onSetupAppChange === undefined ? {} : { onSetupAppChange })}
                />
              </section>
            )}
          />
        </RouterLinkBoundary>
        <p>
          {AGENT_PAGE.trialLead} <Link to="/trial">{AGENT_PAGE.trialLabel}</Link>
        </p>
      </section>
      <AeSiteFaq
        labelledBy="agent-faq"
        title={AGENT_PAGE.faqHeading}
        questions={AGENT_PAGE.faqQuestions.map((item) => item.question === AGENT_PAGE.faqAvailabilityQuestion
          ? { ...item, answer: `${availability} ${item.answer}` }
          : item)}
        statusLinkLead={AGENT_PAGE.faqStatusLinkLead}
        statusLinkLabel={AGENT_PAGE.faqStatusLinkLabel}
      />
    </div>
  )
}
