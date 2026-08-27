import { Link } from '@tanstack/react-router'

import {
  AeCornerMarks,
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
import { AECON_MARK_SRC, aeconMarkClassName } from '@/content/brand-assets'

const MACHINE_FILES = [
  { name: 'llms.txt', description: 'Public catalog index', href: '/llms.txt', letter: 'L' },
  { name: 'SKILL.md', description: 'Assistant procedure', href: '/SKILL.md', letter: 'S' },
  { name: '.well-known/ucp', description: 'Machine handshake', href: '/.well-known/ucp', letter: 'U' },
] as const

export function AeAboutPage() {
  return (
    <>
      <AeSiteSection labelledBy="about-hero" rhythm="hero" scheme="ink">
        <AeSiteHeroIntro>
          <AeSiteHeadingPair>
            <AeSiteEyebrow>{ABOUT.eyebrow}</AeSiteEyebrow>
            <div className="mx-auto w-full max-w-xl">
              <AeSiteHeading as="h1" size="lg" id="about-hero">
                {ABOUT.heading}
              </AeSiteHeading>
            </div>
            <div className="mx-auto w-full max-w-lg">
              <AeSiteBody muted size="sm" className="mx-auto">
                {ABOUT.subhead}
              </AeSiteBody>
            </div>
          </AeSiteHeadingPair>
          <div className="flex flex-wrap items-center justify-center gap-related">
            <AeSiteButton asChild>
              <Link to="/for-agents">{AGENT_DOOR.cta}</Link>
            </AeSiteButton>
            <AeSiteButton asChild variant="outlined">
              <Link to="/for-providers">{BUSINESS_DOOR.cta}</Link>
            </AeSiteButton>
          </div>
        </AeSiteHeroIntro>
        <div className="relative mx-auto mt-hero size-20">
          <img src={AECON_MARK_SRC} alt="" aria-hidden="true" className={aeconMarkClassName.about} />
        </div>
      </AeSiteSection>
      <AeSiteSection labelledBy="about-doors" scheme="surface">
        <AeSiteStack>
          <AeSiteIntro>
            <AeSiteHeading as="h2" size="lg" id="about-doors">
              {ABOUT.doorsHeading}
            </AeSiteHeading>
          </AeSiteIntro>
          <AeSiteSplitPair
            left={
              <AboutDoor
                headingId="about-agent-door"
                heading={AGENT_DOOR.heading}
                body={AGENT_DOOR.body}
                href="/for-agents"
                cta={AGENT_DOOR.cta}
              />
            }
            right={
              <AboutDoor
                headingId="about-supplier-door"
                heading={BUSINESS_DOOR.heading}
                body={BUSINESS_DOOR.body}
                href="/for-providers"
                cta={BUSINESS_DOOR.cta}
              />
            }
          />
        </AeSiteStack>
      </AeSiteSection>
      <AeSiteSection labelledBy="about-settlement" scheme="canvas">
        <div className="grid max-w-3xl gap-related">
          <AeSiteHeading as="h2" size="md" id="about-settlement">
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
                <AeSiteHeading as="h2" size="md" id="about-suppliers">
                  {ABOUT.suppliersHeading}
                </AeSiteHeading>
                <AeSiteBody muted>{ABOUT.suppliersBody}</AeSiteBody>
              </div>
              <AeSiteButton asChild variant="outlined" className="w-fit">
                <Link to="/market" search={{ window: '30d' }}>
                  Browse the live catalog
                </Link>
              </AeSiteButton>
            </div>
          }
          right={
            <AeSiteCover
              className="max-w-none"
              eyebrow="Catalog"
              title="Live list"
              meta="Inspect before you call"
              href="/market?window=30d"
            />
          }
        />
      </AeSiteSection>
      <AeSiteSection labelledBy="about-machines" scheme="muted">
        <div className="relative max-w-3xl border border-border bg-container p-page">
          <AeCornerMarks />
          <div className="grid gap-section">
            <div className="grid gap-related">
              <AeSiteHeading as="h2" size="md" id="about-machines">
                {ABOUT.machinesHeading}
              </AeSiteHeading>
              <AeSiteBody muted>{ABOUT.machinesBody}</AeSiteBody>
            </div>
            <nav aria-label="Machine-readable files">
              <AeSiteResourceList items={MACHINE_FILES} />
            </nav>
          </div>
        </div>
      </AeSiteSection>
    </>
  )
}

function AboutDoor({
  heading,
  body,
  href,
  cta,
  headingId,
}: Readonly<{
  heading: string
  body: string
  href: '/for-agents' | '/for-providers'
  cta: string
  headingId: string
}>) {
  return (
    <div className="grid content-start gap-related">
      <div className="grid gap-intra">
        <h3 id={headingId} className="font-display text-2xl font-medium tracking-tight sm:text-3xl">
          {heading}
        </h3>
        <AeSiteBody muted size="sm">
          {body}
        </AeSiteBody>
      </div>
      <Link
        to={href}
        className="inline-flex min-h-touch w-fit items-center text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {cta}
      </Link>
    </div>
  )
}
