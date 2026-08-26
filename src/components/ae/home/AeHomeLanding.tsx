import { Link } from "@tanstack/react-router";
import { useMemo } from "react";

import { AeCopyCommand } from "@/components/ae/data/AeCopyCommand";
import { AeLandingBand } from "@/components/ae/layout/AeLandingBand";
import { AeCapabilityTile } from "@/components/ae/market/AeCapabilityTile";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { ItemGroup } from "@/components/ui/item";
import {
  AGENT_INSTRUCTION,
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
        <HomeClaimChapter
          key={claim.number}
          claim={claim}
          reverse={index % 2 === 1}
        />
      ))}
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
    <AeLandingBand
      labelledBy="home-hero"
      height="fold"
      tone="canvas"
      footer={
        <a
          href="#home-catalog"
          className="inline-flex min-h-touch items-center font-display text-xl font-medium tracking-tight underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-2xl"
        >
          {HOME.heroPeek}
        </a>
      }
    >
      <div className="grid items-center gap-hero lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="grid gap-section">
          {showMeta ? (
            <p className="font-mono text-xs font-medium tabular-nums text-muted-foreground">
              {meta}
            </p>
          ) : null}
          <div className="grid gap-related">
            <h1
              id="home-hero"
              className="max-w-2xl font-display text-6xl font-medium leading-[1.04] tracking-tight text-balance sm:text-7xl"
            >
              {HOME.heroHeading}
            </h1>
            <p className="max-w-prose text-pretty text-lg leading-7 text-muted-foreground sm:text-xl sm:leading-8">
              {HOME.heroSubhead}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-related">
            <Button asChild size="lg" className="min-h-touch px-6">
              <Link to="/for-agents">Set up an agent</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="min-h-touch px-6">
              <Link to="/market" search={{ window: "30d" }}>
                Browse tools
              </Link>
            </Button>
          </div>
        </div>
        <aside aria-labelledby="agent-instruction" className="min-w-0">
          <Card className="gap-section py-page">
            <CardHeader className="gap-related">
              <h2
                id="agent-instruction"
                className="font-display text-2xl font-medium tracking-tight sm:text-3xl"
              >
                {AGENT_INSTRUCTION.heading}
              </h2>
              <CardDescription className="text-pretty text-base leading-7">
                {AGENT_INSTRUCTION.body}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AeCopyCommand
                comfortable
                label={AGENT_INSTRUCTION.label}
                code={AGENT_INSTRUCTION.code}
                copyText={AGENT_INSTRUCTION.copyText}
              />
            </CardContent>
          </Card>
        </aside>
      </div>
    </AeLandingBand>
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
    <AeLandingBand
      id="home-catalog"
      labelledBy="home-catalog-heading"
      height={groups.length > 0 ? "chapter" : "strip"}
      tone="surface"
      align="start"
      className="scroll-mt-anchor"
    >
      <div className="grid gap-section">
        <div className="flex flex-col gap-related sm:flex-row sm:items-end sm:justify-between">
          <h2
            id="home-catalog-heading"
            className="max-w-2xl font-display text-4xl font-medium tracking-tight text-balance sm:text-5xl"
          >
            {HOME.catalogHeading}
          </h2>
          <Button
            asChild
            variant="outline"
            size="lg"
            className="min-h-touch self-start px-6 sm:self-auto"
          >
            <Link to="/market" search={{ window: "30d" }}>
              Browse tools
            </Link>
          </Button>
        </div>

        {read.kind === "unavailable" ? (
          <p className="max-w-prose text-pretty text-lg leading-7 text-muted-foreground">
            {HOME.catalogUnavailable}
          </p>
        ) : groups.length === 0 ? (
          <p className="max-w-prose text-pretty text-lg leading-7 text-muted-foreground">
            {HOME.catalogEmpty}
          </p>
        ) : (
          <div className="grid gap-section">
            <p className="max-w-prose text-pretty text-lg leading-7 text-muted-foreground">
              {HOME.catalogBody}
            </p>
            <ItemGroup className="grid gap-related sm:grid-cols-2">
              {groups.map((group) => (
                <li key={group.capabilityId}>
                  <AeCapabilityTile group={group} window="30d" />
                </li>
              ))}
            </ItemGroup>
          </div>
        )}
      </div>
    </AeLandingBand>
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
    <AeLandingBand
      labelledBy={headingId}
      height="chapter"
      tone={reverse ? "surface" : "canvas"}
    >
      <div className="grid items-center gap-hero lg:grid-cols-2">
        <div className={cn("grid max-w-xl gap-related", reverse && "lg:order-2")}>
          <p className="font-display text-7xl font-medium leading-none tracking-tight sm:text-8xl">
            {claim.number}
          </p>
          <div className="grid gap-intra">
            <h2
              id={headingId}
              className="font-display text-4xl font-medium tracking-tight text-balance sm:text-6xl"
            >
              {claim.title}
            </h2>
            <p className="max-w-prose text-pretty text-lg leading-7 text-muted-foreground sm:text-xl sm:leading-8">
              {claim.body}
            </p>
          </div>
        </div>
        <ClaimFigure number={claim.number} {...(reverse ? { className: "lg:order-1" } : {})} />
      </div>
    </AeLandingBand>
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
        <Card className={cn("gap-section py-page", className)}>
          <CardContent>
            <dl className="grid gap-section">
              {rows.map((row) => (
                <div
                  key={row.term}
                  className="grid gap-intra border-b border-border pb-section last:border-b-0 last:pb-0"
                >
                  <dt className="font-display text-2xl font-medium tracking-tight sm:text-3xl">
                    {row.term}
                  </dt>
                  <dd className="text-base leading-7 text-muted-foreground">
                    {row.detail}
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      );
    case "02":
      return (
        <dl className={cn("grid gap-page", className)}>
          {rows.map((row) => (
            <div
              key={row.term}
              className="grid gap-intra border-b border-border pb-page last:border-b-0 last:pb-0"
            >
              <dt className="font-display text-4xl font-medium tracking-tight sm:text-5xl">
                {row.term}
              </dt>
              <dd className="text-lg leading-7 text-muted-foreground">
                {row.detail}
              </dd>
            </div>
          ))}
        </dl>
      );
    case "03":
      return (
        <dl className={cn("grid gap-page", className)}>
          {rows.map((row) => (
            <div key={row.term} className="grid gap-intra">
              <dt className="font-mono text-sm text-muted-foreground">
                {row.term}
              </dt>
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

function HomeFaq() {
  return (
    <AeLandingBand
      labelledBy="home-faq"
      height="chapter"
      tone="muted"
      align="start"
    >
      <div className="grid max-w-3xl gap-page">
        <h2
          id="home-faq"
          className="font-display text-4xl font-medium tracking-tight text-balance sm:text-5xl"
        >
          {HOME.faqHeading}
        </h2>
        <Accordion type="single" collapsible className="w-full">
          {HOME_FAQ.map((item) => (
            <AccordionItem key={item.question} value={item.question}>
              <AccordionTrigger className="min-h-touch py-section text-start text-lg font-medium">
                {item.question}
              </AccordionTrigger>
              <AccordionContent className="text-pretty text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
                {item.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </AeLandingBand>
  );
}

function HomeClose() {
  return (
    <AeLandingBand labelledBy="home-close" height="fold" tone="ink">
      <div className="grid max-w-3xl gap-section">
        <div className="grid gap-related">
          <h2
            id="home-close"
            className="font-display text-6xl font-medium leading-[1.04] tracking-tight text-balance sm:text-7xl"
          >
            {HOME.closeHeading}
          </h2>
          <p className="max-w-prose text-pretty text-xl leading-8 tracking-wide text-background/80">
            {HOME.closeBody}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-related">
          <Button
            asChild
            size="lg"
            variant="secondary"
            className="min-h-touch px-6 focus-visible:ring-background"
          >
            <Link to="/for-agents">Set up an agent</Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="min-h-touch border-background bg-transparent px-6 text-background hover:bg-background hover:text-foreground focus-visible:ring-background"
          >
            <Link to={BUSINESS_DOOR.href}>List a tool</Link>
          </Button>
        </div>
      </div>
    </AeLandingBand>
  );
}
