import { Link } from "@tanstack/react-router";
import { useMemo } from "react";

import { AeCapabilityTile } from "@/components/ae/market/AeCapabilityTile";
import {
  AeAgentInstructionCard,
  AeConnectingFrame,
  AeCornerMarks,
  AeSiteBody,
  AeSiteBrowser,
  AeSiteButton,
  AeSiteEntrance,
  AeSiteEyebrow,
  AeSiteFaq,
  AeSiteHeading,
  AeSiteHeadingPair,
  AeSiteHeroIntro,
  AeSiteIntro,
  AeSiteSection,
  AeSiteSignoff,
  AeSiteSplitPair,
  AeSiteStack,
} from "@/components/ae/website";
import { ItemGroup } from "@/components/ui/item";
import {
  AGENT_DOOR,
  BUSINESS_DOOR,
  HOME,
  HOME_CLAIM_FIGURES,
  HOME_CLAIMS,
  HOME_FAQ,
} from "@/content/brand-copy";
import type { HomeCapabilityRead } from "@/modules/market/home-catalogue";
import { groupOperationCards } from "@/modules/market/operation-view-model";
import { cn } from "@/lib/utils";

type AeHomeLandingProps = Readonly<{
  read: HomeCapabilityRead;
}>;

export function AeHomeLanding({ read }: AeHomeLandingProps) {
  const toolCount = read.kind === "unavailable" ? 0 : read.matchedCount;
  const toolLabel = toolCount === 1 ? "tool" : "tools";
  const meta =
    read.kind === "unavailable"
      ? "Catalogue unavailable"
      : `${toolCount.toLocaleString()} ${toolLabel} in the live catalog`;

  return (
    <div className="flex flex-col">
      <HomeHero meta={meta} showMeta={read.kind === "ok"} />
      <HomeCapabilityResults read={read} />
      {HOME_CLAIMS.map((claim, index) => (
        <HomeClaimChapter key={claim.number} claim={claim} reverse={index % 2 === 1} />
      ))}
      <HomeDoors />
      <HomeFaq />
      <HomeClose />
    </div>
  );
}

function HomeHero({
  meta,
  showMeta,
}: Readonly<{ meta: string; showMeta: boolean }>) {
  return (
    <AeSiteSection labelledBy="home-hero" rhythm="hero" scheme="muted">
      <AeSiteHeroIntro>
        <AeSiteHeadingPair>
          {showMeta ? <AeSiteEyebrow>{meta}</AeSiteEyebrow> : null}
          <div className="mx-auto w-full max-w-xl">
            <AeSiteHeading as="h1" size="lg" id="home-hero">
              {HOME.heroHeading}
            </AeSiteHeading>
          </div>
          <div className="mx-auto w-full max-w-lg">
            <AeSiteBody muted size="sm" className="mx-auto">
              {HOME.heroSubhead}
            </AeSiteBody>
          </div>
        </AeSiteHeadingPair>
        <div className="flex flex-wrap items-center justify-center gap-related">
          <AeSiteButton asChild>
            <Link to="/for-agents">Set up an agent</Link>
          </AeSiteButton>
          <AeSiteButton asChild variant="outlined">
            <Link to="/market" search={{ window: "30d" }}>
              Browse tools
            </Link>
          </AeSiteButton>
        </div>
      </AeSiteHeroIntro>
      <div className="mx-auto mt-hero w-full max-w-3xl">
        <AeSiteBrowser url="/llms.txt">
          <AeAgentInstructionCard framed />
        </AeSiteBrowser>
      </div>
      <div className="mt-section text-center">
        <a
          href="#home-catalog"
          className="inline-flex min-h-touch items-center font-display text-xl font-medium tracking-tight underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-2xl"
        >
          {HOME.heroPeek}
        </a>
      </div>
    </AeSiteSection>
  );
}

export function HomeCapabilityResults({
  read,
}: Readonly<{ read: HomeCapabilityRead }>) {
  const groups = useMemo(
    () => (read.kind === "ok" ? groupOperationCards(read.operations) : []),
    [read],
  );

  return (
    <AeSiteSection
      id="home-catalog"
      labelledBy="home-catalog-heading"
      scheme="muted"
      rhythm="flush"
      connectsUp
      background={<AeConnectingFrame />}
      className="scroll-mt-anchor"
    >
      <div className="py-page md:pb-hero">
        <AeSiteStack>
          <AeSiteIntro>
            <div className="flex flex-col gap-related sm:flex-row sm:items-end sm:justify-between">
              <AeSiteHeading as="h2" size="md" id="home-catalog-heading">
                {HOME.catalogHeading}
              </AeSiteHeading>
              <AeSiteButton asChild variant="outlined" className="self-start sm:self-auto">
                <Link to="/market" search={{ window: "30d" }}>
                  Browse tools
                </Link>
              </AeSiteButton>
            </div>
          </AeSiteIntro>
          {read.kind === "unavailable" ? (
            <AeSiteBody muted>{HOME.catalogUnavailable}</AeSiteBody>
          ) : groups.length === 0 ? (
            <AeSiteBody muted>{HOME.catalogEmpty}</AeSiteBody>
          ) : (
            <div className="grid gap-section">
              <AeSiteBody muted>{HOME.catalogBody}</AeSiteBody>
              <AeSiteEntrance>
                <ItemGroup className="grid gap-related sm:grid-cols-2">
                  {groups.map((group) => (
                    <li key={group.capabilityId}>
                      <AeCapabilityTile group={group} window="30d" />
                    </li>
                  ))}
                </ItemGroup>
              </AeSiteEntrance>
            </div>
          )}
        </AeSiteStack>
      </div>
    </AeSiteSection>
  );
}

function HomeClaimChapter({
  claim,
  reverse,
}: Readonly<{
  claim: (typeof HOME_CLAIMS)[number];
  reverse: boolean;
}>) {
  const headingId = `home-claim-${claim.number}`;

  return (
    <AeSiteSection labelledBy={headingId} scheme="canvas" keepTopRhythm>
      <div className="grid items-start gap-hero lg:grid-cols-2 lg:gap-page">
        <div className={cn("grid gap-10 md:gap-20 lg:p-page", reverse && "lg:order-2")}>
          <AeSiteIntro>
            <AeSiteEyebrow>{claim.number}</AeSiteEyebrow>
            <AeSiteHeading as="h2" size="md" id={headingId}>
              {claim.title}
            </AeSiteHeading>
            <AeSiteBody muted>{claim.body}</AeSiteBody>
          </AeSiteIntro>
        </div>
        <AeSiteEntrance>
          <ClaimFigure number={claim.number} {...(reverse ? { className: "lg:order-1" } : {})} />
        </AeSiteEntrance>
      </div>
    </AeSiteSection>
  );
}

function ClaimFigure({
  number,
  className,
}: Readonly<{
  number: (typeof HOME_CLAIMS)[number]["number"];
  className?: string;
}>) {
  const rows = claimFigureRows(number);

  switch (number) {
    case "01":
      return (
        <div className={cn("relative border border-border bg-container p-page", className)}>
          <AeCornerMarks />
          <dl className="grid gap-section">
            {rows.map((row) => (
              <div
                key={row.term}
                className="grid gap-intra border-b border-border pb-section last:border-b-0 last:pb-0"
              >
                <dt className="font-display text-2xl font-medium tracking-tight sm:text-3xl">
                  {row.term}
                </dt>
                <dd className="text-base leading-7 text-muted-foreground">{row.detail}</dd>
              </div>
            ))}
          </dl>
        </div>
      );
    case "02":
      return (
        <dl className={cn("grid gap-page", className)}>
          {rows.map((row) => (
            <div
              key={row.term}
              className="grid gap-intra border-b border-dashed border-border pb-page last:border-b-0 last:pb-0"
            >
              <dt className="font-display text-4xl font-medium tracking-tight sm:text-5xl">
                {row.term}
              </dt>
              <dd className="text-lg leading-7 text-muted-foreground">{row.detail}</dd>
            </div>
          ))}
        </dl>
      );
    case "03":
      return (
        <dl className={cn("grid gap-page", className)}>
          {rows.map((row) => (
            <div key={row.term} className="grid gap-intra">
              <dt className="font-mono text-sm text-muted-foreground">{row.term}</dt>
              <dd className="font-display text-5xl font-medium tracking-tight sm:text-6xl">
                {row.detail}
              </dd>
            </div>
          ))}
        </dl>
      );
    default: {
      const _never: never = number;
      return _never;
    }
  }
}

function claimFigureRows(number: (typeof HOME_CLAIMS)[number]["number"]) {
  switch (number) {
    case "01":
      return HOME_CLAIM_FIGURES["01"];
    case "02":
      return HOME_CLAIM_FIGURES["02"];
    case "03":
      return HOME_CLAIM_FIGURES["03"];
    default: {
      const _never: never = number;
      return _never;
    }
  }
}

function HomeDoors() {
  return (
    <AeSiteSection labelledBy="home-doors" scheme="surface">
      <AeSiteStack>
        <AeSiteIntro>
          <AeSiteHeading as="h2" size="lg" id="home-doors">
            {HOME.doorsHeading}
          </AeSiteHeading>
        </AeSiteIntro>
        <AeSiteSplitPair
          left={
            <HomeDoor
              headingId="home-agent-door"
              heading={AGENT_DOOR.heading}
              body={AGENT_DOOR.body}
              href="/for-agents"
              cta={AGENT_DOOR.cta}
            />
          }
          right={
            <HomeDoor
              headingId="home-supplier-door"
              heading={BUSINESS_DOOR.heading}
              body={BUSINESS_DOOR.body}
              href="/for-providers"
              cta={BUSINESS_DOOR.cta}
            />
          }
        />
      </AeSiteStack>
    </AeSiteSection>
  );
}

function HomeDoor({
  headingId,
  heading,
  body,
  href,
  cta,
}: Readonly<{
  headingId: string
  heading: string
  body: string
  href: "/for-agents" | "/for-providers"
  cta: string
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
  );
}

function HomeFaq() {
  return (
    <AeSiteSection labelledBy="home-faq" rhythm="spacious" scheme="ink">
      <AeSiteStack>
        <AeSiteIntro>
          <div className="max-w-2xl">
            <AeSiteHeading as="h2" size="lg" id="home-faq">
              {HOME.faqHeading}
            </AeSiteHeading>
          </div>
        </AeSiteIntro>
        <AeSiteFaq labelledBy="home-faq" questions={HOME_FAQ} />
      </AeSiteStack>
    </AeSiteSection>
  );
}

function HomeClose() {
  return (
    <AeSiteSignoff heading={HOME.closeHeading} headingId="home-close" body={HOME.closeBody}>
      <AeSiteButton asChild>
        <Link to="/for-agents">Set up an agent</Link>
      </AeSiteButton>
      <AeSiteButton asChild variant="outlined">
        <Link to={BUSINESS_DOOR.href}>List a tool</Link>
      </AeSiteButton>
      <a
        href="/about"
        className="inline-flex min-h-touch items-center underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {HOME.aboutLink}
      </a>
    </AeSiteSignoff>
  );
}
