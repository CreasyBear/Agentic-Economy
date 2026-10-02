import { AeAssistantInstallFunnel } from '@/components/ae/console/AeAssistantInstallFunnel'
import { AeSiteFaq } from '@/components/ae/website/AeSiteFaq'
import buttonStyles from '@/components/arc/button/button.module.css'
import { AGENT_PAGE } from '@/content/brand-copy'
import './AgentDoorComposition.css'

export function AeAgentDoorPage({ canonicalBaseUrl }: { canonicalBaseUrl: string }) {
  return (
    <div className="arc-market arc-agent-door">
      <section className="arc-agent-door-hero" aria-labelledby="agent-hero">
        <div className="arc-agent-door-layout">
          <div className="arc-agent-door-copy">
            <h1 id="agent-hero">{AGENT_PAGE.heading}</h1>
            <p>{AGENT_PAGE.subhead}</p>
            <a
              href="#agent-setup"
              className={[buttonStyles.button, buttonStyles.primary, buttonStyles.md].join(' ')}
            >
              {AGENT_PAGE.primaryCta}
            </a>
          </div>
          <section
            id="agent-setup"
            aria-label="Agent connection"
            tabIndex={-1}
            className="arc-agent-door-setup"
          >
            <AeAssistantInstallFunnel canonicalBaseUrl={canonicalBaseUrl} />
          </section>
        </div>
      </section>
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
