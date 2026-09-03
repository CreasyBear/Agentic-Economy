import { Link } from '@tanstack/react-router'

import { AeAssistantInstallFunnel } from '@/components/ae/console/AeAssistantInstallFunnel'
import {
  AeSiteBody,
  AeSiteButton,
  AeSiteEyebrow,
  AeSiteHeading,
  AeSiteHeadingPair,
  AeSiteHeroIntro,
  AeSiteSection,
} from '@/components/ae/website'
import { AGENT_PAGE } from '@/content/brand-copy'

export function AeAgentDoorPage({ canonicalBaseUrl }: { canonicalBaseUrl: string }) {
  return (
    <>
      <AeSiteSection labelledBy="agent-hero" rhythm="hero" scheme="muted">
        <AeSiteHeroIntro>
          <AeSiteHeadingPair>
            <AeSiteEyebrow>{AGENT_PAGE.eyebrow}</AeSiteEyebrow>
            <div className="mx-auto w-full max-w-xl">
              <AeSiteHeading as="h1" size="md" id="agent-hero">
                {AGENT_PAGE.heading}
              </AeSiteHeading>
            </div>
            <p className="font-medium text-foreground">{AGENT_PAGE.harnesses}</p>
            <div className="mx-auto w-full max-w-lg">
              <AeSiteBody muted size="sm" className="mx-auto">
                {AGENT_PAGE.subhead}
              </AeSiteBody>
            </div>
          </AeSiteHeadingPair>
          <div className="flex flex-wrap items-center justify-center gap-related">
            <AeSiteButton asChild>
              <Link to="/market" search={{ window: '30d' }}>Browse Operations</Link>
            </AeSiteButton>
            <AeSiteButton asChild variant="outlined">
              <Link to="/SKILL.md">Read the skill</Link>
            </AeSiteButton>
          </div>
        </AeSiteHeroIntro>
      </AeSiteSection>
      <AeSiteSection ariaLabel="Agent connection" scheme="surface">
        <div className="mx-auto w-full max-w-5xl">
          <AeAssistantInstallFunnel canonicalBaseUrl={canonicalBaseUrl} />
        </div>
      </AeSiteSection>
    </>
  )
}
