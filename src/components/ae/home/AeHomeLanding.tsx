import { Link } from "@tanstack/react-router";
import { SearchIcon } from "lucide-react";
import { useMemo } from "react";

import { AeEmptyState } from "@/components/ae/shared/empty-state/AeEmptyState";
import { AeCapabilityTile } from "@/components/ae/market/AeCapabilityTile";
import { X402DirectoryCards } from "@/components/ae/market/AeX402Directory";
import { AeCollectionRail } from "@/components/ae/shared/AeCollectionRail";
import {
  AeAgentInstructionCard,
  AeConnectingFrame,
  AeSiteBody,
  AeSiteBrowser,
  AeSiteButton,
  AeSiteEyebrow,
  AeSiteHeading,
  AeSiteHeadingPair,
  AeSiteHeroIntro,
  AeSiteSection,
} from "@/components/ae/website";
import { ItemGroup } from "@/components/ui/item";
import { HOME } from "@/content/brand-copy";
import type { HomeCapabilityRead } from "@/modules/market/home-catalogue";
import { groupToolCards } from "@/modules/market/tool-view-model";

type AeHomeLandingProps = Readonly<{
  read: HomeCapabilityRead;
}>;

export function AeHomeLanding({ read }: AeHomeLandingProps) {
  const toolCount = read.kind === "unavailable" ? 0 : read.kind === 'directory' ? read.total ?? read.items.length : read.matchedCount ?? read.tools.length;
  const toolLabel = toolCount === 1 ? "Tool" : "Tools";
  const meta =
    read.kind === "unavailable"
      ? "Catalogue unavailable"
      : read.kind === 'directory'
        ? `${toolCount.toLocaleString()} Tools paid per Call in AUD`
      : read.matchedCount === undefined
        ? `${toolCount.toLocaleString()} shown`
        : `${toolCount.toLocaleString()} current ${toolLabel}`;

  return (
    <div className="flex flex-col">
      <HomeHero meta={meta} showMeta={read.kind !== "unavailable" && toolCount > 0} />
      <HomeCapabilityResults read={read} />
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
          <div className="w-full max-w-xl">
            <AeSiteHeading as="h1" size="xl" id="home-hero">
              {HOME.heroHeading}
            </AeSiteHeading>
          </div>
          <div className="w-full max-w-lg">
            <AeSiteBody muted size="sm">
              {HOME.heroSubhead}
            </AeSiteBody>
          </div>
        </AeSiteHeadingPair>
        <div className="flex flex-wrap items-center gap-related">
          <AeSiteButton asChild>
            <Link to="/market">Browse Tools</Link>
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
    () => (read.kind === "ok" ? groupToolCards(read.tools) : []),
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
        <AeCollectionRail title={HOME.catalogHeading} titleId="home-catalog-heading">
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
          ) : read.kind === 'directory' && read.items.length > 0 ? (
            <div className="grid gap-related">
              <AeSiteBody muted>Explore Tools paid per Call in AUD.</AeSiteBody>
              <X402DirectoryCards entries={read.items} />
            </div>
          ) : groups.length === 0 ? (
            <AeEmptyState
              icon={<SearchIcon />}
              title={HOME.catalogEmpty}
              description={HOME.catalogEmptyBody}
              action={
                <AeSiteButton asChild variant="outlined">
                  <Link to="/market">
                    Browse Tools
                  </Link>
                </AeSiteButton>
              }
            />
          ) : (
            <div className="grid gap-section">
              <AeSiteBody muted>{HOME.catalogBody}</AeSiteBody>
              <ItemGroup className="grid gap-related sm:grid-cols-2">
                {groups.map((group) => (
                  <li key={group.capabilityId}>
                    <AeCapabilityTile group={group} />
                  </li>
                ))}
              </ItemGroup>
            </div>
          )}
        </AeCollectionRail>
      </div>
    </AeSiteSection>
  );
}
