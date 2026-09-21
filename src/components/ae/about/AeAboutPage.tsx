import { Link } from '@tanstack/react-router'

import { AeCollectionRail } from '@/components/ae/shared/AeCollectionRail'
import {
  AeSiteBody,
  AeSiteButton,
  AeSiteCover,
  AeSiteEyebrow,
  AeSiteHeading,
  AeSiteHeadingPair,
  AeSiteHeroIntro,
  AeSiteIntro,
  AeSiteResourceList,
  AeSiteSection,
  AeSiteSplitPair,
  AeSiteStack,
} from '@/components/ae/website'
import { ABOUT, AGENT_DOOR, BUSINESS_DOOR } from '@/content/brand-copy'

const MACHINE_FILES = [
  { name: 'llms.txt', description: 'Public catalog index', href: '/llms.txt', letter: 'L' },
  { name: 'SKILL.md', description: 'Assistant procedure', href: '/SKILL.md', letter: 'S' },
  { name: '.well-known/ucp', description: 'Machine handshake', href: '/.well-known/ucp', letter: 'U' },
] as const

export function AeAboutPage() {
  return (
    <>
      <AeSiteSection labelledBy="about-hero" rhythm="hero" scheme="muted">
        <AeSiteHeroIntro>
          <AeSiteHeadingPair>
            <AeSiteEyebrow>{ABOUT.eyebrow}</AeSiteEyebrow>
            <div className="w-full max-w-xl">
              <AeSiteHeading as="h1" size="lg" id="about-hero">
                {ABOUT.heading}
              </AeSiteHeading>
            </div>
            <div className="w-full max-w-lg">
              <AeSiteBody muted size="sm">
                {ABOUT.subhead}
              </AeSiteBody>
            </div>
          </AeSiteHeadingPair>
          <div className="flex flex-wrap items-center gap-related">
            <AeSiteButton asChild>
              <Link to="/for-agents">{AGENT_DOOR.cta}</Link>
            </AeSiteButton>
            <AeSiteButton asChild variant="outlined">
              <Link to="/for-providers">{BUSINESS_DOOR.cta}</Link>
            </AeSiteButton>
          </div>
        </AeSiteHeroIntro>
      </AeSiteSection>
      <AeSiteSection labelledBy="about-doors" scheme="surface">
        <AeSiteStack>
          <AeSiteIntro>
            <AeSiteHeading as="h2" size="sm" id="about-doors">
              {ABOUT.doorsHeading}
            </AeSiteHeading>
          </AeSiteIntro>
          <AeSiteSplitPair
            left={
              <AboutDoor
                headingId="about-agent-door"
                heading={AGENT_DOOR.heading}
                body={AGENT_DOOR.body}
              />
            }
            right={
              <AboutDoor
                headingId="about-provider-door"
                heading={BUSINESS_DOOR.heading}
                body={BUSINESS_DOOR.body}
              />
            }
          />
        </AeSiteStack>
      </AeSiteSection>
      <AeSiteSection labelledBy="about-settlement" scheme="canvas">
        <div className="grid max-w-3xl gap-related">
          <AeSiteHeading as="h2" size="sm" id="about-settlement">
            {ABOUT.settlementHeading}
          </AeSiteHeading>
          <AeSiteBody muted>{ABOUT.settlementBody}</AeSiteBody>
        </div>
      </AeSiteSection>
      <AeSiteSection labelledBy="about-suppliers" scheme="surface">
        <AeSiteSplitPair
          left={
            <div className="grid content-start gap-section">
              <div className="grid gap-related">
                <AeSiteHeading as="h2" size="sm" id="about-suppliers">
                  {ABOUT.providersHeading}
                </AeSiteHeading>
                <AeSiteBody muted>{ABOUT.providersBody}</AeSiteBody>
              </div>
              <AeSiteButton asChild variant="outlined" className="w-fit">
                <Link to="/market">
                  Browse the live catalog
                </Link>
              </AeSiteButton>
            </div>
          }
          right={
            <AeSiteCover
              className="max-w-none"
              eyebrow="Catalog"
              title="Market"
              meta="Inspect before you call"
              href="/market"
            />
          }
        />
      </AeSiteSection>
      <AeSiteSection labelledBy="about-machines" scheme="muted">
        <AeCollectionRail
          title={ABOUT.machinesHeading}
          titleId="about-machines"
          deck={ABOUT.machinesBody}
        >
          <nav aria-label="Machine-readable files">
            <AeSiteResourceList items={MACHINE_FILES} />
          </nav>
        </AeCollectionRail>
      </AeSiteSection>
    </>
  )
}

function AboutDoor({
  heading,
  body,
  headingId,
}: Readonly<{
  heading: string
  body: string
  headingId: string
}>) {
  return (
    <div className="grid content-start gap-related">
      <div className="grid gap-intra">
        <AeSiteHeading as="h3" size="sm" id={headingId}>
          {heading}
        </AeSiteHeading>
        <AeSiteBody muted size="sm">
          {body}
        </AeSiteBody>
      </div>
    </div>
  )
}
