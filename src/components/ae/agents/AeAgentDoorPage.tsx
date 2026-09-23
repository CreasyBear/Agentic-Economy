import { AeAssistantInstallFunnel } from '@/components/ae/console/AeAssistantInstallFunnel'
import {
  AeSiteBody,
  AeSiteButton,
  AeSiteEyebrow,
  AeSiteHeading,
  AeSiteHeadingPair,
  AeSiteHeroIntro,
  AeSiteSection,
  AeSiteFaq,
} from '@/components/ae/website'
import { AGENT_PAGE } from '@/content/brand-copy'

export function AeAgentDoorPage({ canonicalBaseUrl }: { canonicalBaseUrl: string }) {
  return (
    <>
      <AeSiteSection labelledBy="agent-hero" rhythm="hero" scheme="muted">
        <AeSiteHeroIntro>
          <AeSiteHeadingPair>
            <AeSiteEyebrow>{AGENT_PAGE.eyebrow}</AeSiteEyebrow>
            <div className="w-full max-w-xl">
              <AeSiteHeading as="h1" size="lg" id="agent-hero">
                {AGENT_PAGE.heading}
              </AeSiteHeading>
            </div>
            <div className="w-full max-w-lg">
              <AeSiteBody muted size="sm">
                {AGENT_PAGE.subhead}
              </AeSiteBody>
            </div>
          </AeSiteHeadingPair>
          <div className="flex flex-wrap items-center gap-related">
            <AeSiteButton asChild>
              <a href="#agent-setup">{AGENT_PAGE.primaryCta}</a>
            </AeSiteButton>
          </div>
        </AeSiteHeroIntro>
      </AeSiteSection>
      <AeSiteSection id="agent-setup" ariaLabel="Agent connection" scheme="surface">
        <AeAssistantInstallFunnel canonicalBaseUrl={canonicalBaseUrl} />
      </AeSiteSection>
      <AeSiteFaq
        labelledBy="agent-faq"
        title={AGENT_PAGE.faqHeading}
        questions={AGENT_PAGE.faqQuestions}
        statusLinkLead={AGENT_PAGE.faqStatusLinkLead}
        statusLinkLabel={AGENT_PAGE.faqStatusLinkLabel}
      />
    </>
  )
}
