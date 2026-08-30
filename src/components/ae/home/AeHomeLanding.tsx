import { Link } from "@tanstack/react-router";
import { SearchIcon } from "lucide-react";
import { useMemo } from "react";

import { AeEmptyState } from "@/components/ae/feedback/AeEmptyState";
import { AeCapabilityTile } from "@/components/ae/market/AeCapabilityTile";
import {
  AeAgentInstructionCard,
  AeConnectingFrame,
  AeSiteBody,
  AeSiteBrowser,
  AeSiteButton,
  AeSiteEntrance,
  AeSiteEyebrow,
  AeSiteHeading,
  AeSiteHeadingPair,
  AeSiteHeroIntro,
  AeSiteIntro,
  AeSiteSection,
  AeSiteSignoff,
  AeSiteStack,
} from "@/components/ae/website";
import { ItemGroup } from "@/components/ui/item";
import {
  AGENT_INSTRUCTION,
  BUSINESS_DOOR,
  HOME,
} from "@/content/brand-copy";
import type { HomeCapabilityRead } from "@/modules/market/home-catalogue";
import { groupOperationCards } from "@/modules/market/operation-view-model";

type AeHomeLandingProps = Readonly<{
  read: HomeCapabilityRead;
}>;

export function AeHomeLanding({ read }: AeHomeLandingProps) {
  const operationCount = read.kind === "unavailable" ? 0 : read.matchedCount;
  const operationLabel = operationCount === 1 ? "Operation" : "Operations";
  const meta =
    read.kind === "unavailable"
      ? "Catalogue unavailable"
      : `${operationCount.toLocaleString()} current ${operationLabel}`;

  return (
    <div className="flex flex-col">
      <HomeHero meta={meta} showMeta={read.kind === "ok" && operationCount > 0} />
      <HomeCapabilityResults read={read} />
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
            <AeSiteHeading as="h1" size="xl" id="home-hero">
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
            <Link to="/market" search={{ window: "30d" }}>Browse Operations</Link>
          </AeSiteButton>
        </div>
      </AeSiteHeroIntro>
      <div className="mx-auto mt-hero w-full max-w-3xl">
        <AeSiteBrowser url="/llms.txt">
          <AeAgentInstructionCard framed />
        </AeSiteBrowser>
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
                  Browse Operations
                </Link>
              </AeSiteButton>
            </div>
          </AeSiteIntro>
          {read.kind === "unavailable" ? (
            <AeEmptyState
              icon={<SearchIcon />}
              title={HOME.catalogUnavailable}
              description={HOME.catalogUnavailableBody}
              action={
                <AeSiteButton asChild>
                  <Link to="/">Try again</Link>
                </AeSiteButton>
              }
            />
          ) : groups.length === 0 ? (
            <AeEmptyState
              icon={<SearchIcon />}
              title={HOME.catalogEmpty}
              description={HOME.catalogEmptyBody}
              action={
                <AeSiteButton asChild variant="outlined">
                  <Link to="/market" search={{ window: "30d" }}>
                    Browse Operations
                  </Link>
                </AeSiteButton>
              }
            />
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

function HomeClose() {
  return (
    <AeSiteSignoff
      heading={AGENT_INSTRUCTION.heading}
      headingId="home-close"
      body={HOME.closeBody}
    >
      <AeSiteButton asChild>
        <Link to="/market" search={{ window: "30d" }}>Browse Operations</Link>
      </AeSiteButton>
      <AeSiteButton asChild variant="outlined">
        <Link to={BUSINESS_DOOR.href}>{BUSINESS_DOOR.cta}</Link>
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
