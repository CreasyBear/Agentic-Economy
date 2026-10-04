import {
  AeAssistantInstallFunnel,
  type AeAssistantInstallFunnelProps,
} from '@/components/ae/console/AeAssistantInstallFunnel'
import { AeSiteFaq } from '@/components/ae/website/AeSiteFaq'
import { HeroContent } from '@/components/arc/blocks/hero-section/hero-content'
import { AGENT_PAGE } from '@/content/brand-copy'
import './AgentDoorComposition.css'

type AeAgentDoorPageProps = Readonly<Pick<
  AeAssistantInstallFunnelProps,
  'setupApp' | 'onSetupAppChange'
> & { canonicalBaseUrl: string }>

export function AeAgentDoorPage({ canonicalBaseUrl, setupApp, onSetupAppChange }: AeAgentDoorPageProps) {
  return (
    <div className="arc-market arc-agent-door">
      <HeroContent
        layout="split"
        title={AGENT_PAGE.heading}
        titleId="agent-hero"
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
      <AeSiteFaq
        labelledBy="agent-faq"
        title={AGENT_PAGE.faqHeading}
        questions={AGENT_PAGE.faqQuestions}
        statusLinkLead={AGENT_PAGE.faqStatusLinkLead}
        statusLinkLabel={AGENT_PAGE.faqStatusLinkLabel}
      />
    </div>
  )
}
