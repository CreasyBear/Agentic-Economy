import { captureRouteException } from "@/lib/observability/capture-route-exception";
import { degrade } from "@/lib/observability/degrade";
import { callPublicSourceQuery, sourceQuery } from "@/lib/server/convex-source";
import { readCapabilityToolSearch } from "@/modules/capability-supply/tool-source";
import type {
  ToolSearchResult,
  PublicToolDescriptor,
} from "@/modules/capability-supply/public";
import {
  type AgenticEconomyProjection,
  type MarketMetricProjection,
  type MarketPageProjection,
  type MarketWindow,
  type X402EcosystemProjection,
} from "./contracts";
import {
  emptyMarketListingEvidence,
  projectMarketListingEvidence,
  type MarketListingEvidenceProjection,
  type MarketListingEvidenceSource,
} from "./listing-evidence";
import {
  catalogJobLabel,
  catalogJobSummary,
  toToolCardViewModel,
  type ToolCardViewModel,
} from "./tool-view-model";

const compactNumberFormatter = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});

type MarketSourceRead = Readonly<{
  generatedAt: number;
  firstPartyAvailable: boolean;
  firstParty: Readonly<{
    tools: number;
    providers: number;
    invocations: number;
    completedInvocations: number;
    qualifiedUses: number;
    settlements: number;
    reconciliationRequired: number;
  }>;
}>;

const readMarket = sourceQuery<
  { window: MarketWindow; now: number },
  MarketSourceRead
>("marketMetrics:read");

const readListingEvidence = sourceQuery<
  { toolRefs: string[]; since: number },
  readonly MarketListingEvidenceSource[]
>("marketListingEvidence:read");

export type MarketCatalogProjection =
  | Readonly<{
      kind: "ok";
      items: readonly ToolCardViewModel[];
      matchedCount?: number;
      partialResults?: boolean;
      pagination: Readonly<{
        limit: number;
        nextCursor?: string;
        hasMore: boolean;
      }>;
    }>
  | Readonly<{ kind: "no_candidates"; matchedCount: 0 }>
  | Readonly<{ kind: "unavailable"; reason: string }>;

export type MarketRouteProjection = Readonly<{
  window: MarketWindow;
  catalog: MarketCatalogProjection;
}>;

export type MarketCatalogQuery = Readonly<{
  query?: string;
  availability?: "routeable" | "setup_required" | "unavailable";
  cursor?: string;
}>;

export async function readToolListingEvidence(
  tool: PublicToolDescriptor,
  window: MarketWindow = "30d",
): Promise<MarketListingEvidenceProjection> {
  const summary = catalogJobSummary(
    tool.summary || tool.listing.summary,
  );
  const catalogText = `${catalogJobLabel(
    tool.contract.capabilityId,
    tool.listing.label,
    summary,
  )} ${summary}`;
  try {
    const [source] = await callPublicSourceQuery(readListingEvidence, {
      toolRefs: [tool.toolRef],
      since: Date.now() - windowMilliseconds(window),
    });
    return source === undefined
      ? emptyMarketListingEvidence(
          tool.toolRef,
          tool.contract.capabilityId,
          catalogText,
        )
      : projectMarketListingEvidence(
          source,
          tool.contract.capabilityId,
          catalogText,
        );
  } catch (cause) {
    return degrade(
      cause,
      emptyMarketListingEvidence(
        tool.toolRef,
        tool.contract.capabilityId,
        catalogText,
      ),
      { site: "readToolListingEvidence", reason: "source_unavailable" },
    );
  }
}

export async function readMarketRouteProjection(
  window: MarketWindow,
  catalogQuery: MarketCatalogQuery = {},
): Promise<MarketRouteProjection> {
  const generatedAt = Date.now();
  let catalog: ToolSearchResult;
  try {
    catalog = await readCapabilityToolSearch({
      source: "coinbase",
      query: catalogQuery.query ?? "",
      limit: 12,
      ...(catalogQuery.cursor === undefined
        ? {}
        : { cursor: catalogQuery.cursor }),
      ...(catalogQuery.availability === undefined
        ? {}
        : { filters: { availability: [catalogQuery.availability] } }),
    });
  } catch (cause) {
    captureRouteException(cause, { site: "readMarketRouteProjection" }, "warning");
    catalog = {
      kind: "unavailable",
      schemaVersion: "registry-tools:v3",
      reason: "source_unavailable",
      navigation: [],
    };
  }
  const projectedCatalog = await projectCatalog(catalog, window, generatedAt);
  return { window, catalog: projectedCatalog };
}

export async function readMarketPageProjection(
  window: MarketWindow,
): Promise<MarketPageProjection> {
  const now = Date.now();
  let source: MarketSourceRead;
  try {
    source = await callPublicSourceQuery(readMarket, { window, now });
  } catch (cause) {
    captureRouteException(cause, { site: "readMarketPageProjection" }, "warning");
    source = emptyMarketSource(now);
  }
  const generatedAt = new Date(source.generatedAt).toISOString();
  return {
    window,
    generatedAt,
    x402Ecosystem: externalProjection(),
    agenticEconomy: firstPartyProjection(source, generatedAt),
  };
}

function externalProjection(): X402EcosystemProjection {
  return {
    label: "Indexed x402 activity via AEcon directory" as const,
    source: "AEcon directory" as const,
    sourceUrl: "/market" as const,
    status: "unavailable",
    statusDetail:
      "AEcon does not yet publish an x402 ecosystem snapshot; first-party counts below are live.",
    metrics: [],
    daily: [],
    recentActivity: [],
    featuredExternalServices: [],
  };
}

function firstPartyProjection(
  source: MarketSourceRead,
  generatedAt: string,
): AgenticEconomyProjection {
  if (!source.firstPartyAvailable) {
    return {
      label: "Agentic Economy market evidence",
      status: "unavailable",
      sourceTimestamp: generatedAt,
      statusDetail:
        "First-party market evidence is temporarily unavailable. No zero values have been inferred.",
      metrics: [],
    };
  }
  const counts = source.firstParty;
  const completionRate =
    counts.invocations === 0
      ? 0
      : Math.round((counts.completedInvocations / counts.invocations) * 1_000) /
        10;
  const metrics: MarketMetricProjection[] = [
    firstPartyMetric(
      "tools",
      "Ready Tools",
      counts.tools,
      generatedAt,
      "ae_tool",
      "Tools that are admitted and ready to run now.",
    ),
    firstPartyMetric(
      "providers",
      "Active Providers",
      counts.providers,
      generatedAt,
      "ae_provider",
      "Providers with at least one Tool ready to run.",
    ),
    firstPartyMetric(
      "invocations",
      "Calls started",
      counts.invocations,
      generatedAt,
      "ae_invocation",
      "Calls accepted by Agentic Economy during this period.",
    ),
    firstPartyMetric(
      "completed",
      "Calls completed",
      counts.completedInvocations,
      generatedAt,
      "ae_invocation",
      "Accepted calls that reached completed delivery during this period.",
    ),
    {
      ...firstPartyMetric(
        "completion-rate",
        "Completion rate",
        completionRate,
        generatedAt,
        "ae_invocation",
        "The share of accepted calls that reached completed delivery.",
      ),
      unit: "percent",
      displayValue: `${completionRate}%`,
    },
    firstPartyMetric(
      "qualified-uses",
      "Qualified uses",
      counts.qualifiedUses,
      generatedAt,
      "ae_qualified_use",
      "Completed production deliveries that passed Qualified Use rules.",
    ),
    firstPartyMetric(
      "settlements",
      "Payments reconciled",
      counts.settlements,
      generatedAt,
      "ae_settlement",
      "x402 payment attempts matched to settlement evidence.",
    ),
    firstPartyMetric(
      "reconciliation",
      "Needs review",
      counts.reconciliationRequired,
      generatedAt,
      "ae_settlement",
      "Calls or payments that need reconciliation before retry.",
    ),
  ];
  return {
    label: "Agentic Economy market evidence",
    status: "live",
    sourceTimestamp: generatedAt,
    statusDetail:
      "Counts are derived from authoritative Agentic Economy write seams.",
    metrics,
  };
}

async function projectCatalog(
  catalog: ToolSearchResult,
  window: MarketWindow,
  generatedAt: number,
): Promise<MarketCatalogProjection> {
  if (catalog.kind === "unavailable")
    return { kind: "unavailable", reason: catalog.reason };
  if (catalog.kind === "no_candidates")
    return { kind: "no_candidates", matchedCount: 0 };

  const toolRefs = catalog.items.map(
    (tool) => tool.toolRef,
  );
  let evidence: readonly MarketListingEvidenceSource[] = [];
  try {
    evidence = await callPublicSourceQuery(readListingEvidence, {
      toolRefs,
      since: generatedAt - windowMilliseconds(window),
    });
  } catch (cause) {
    captureRouteException(cause, { site: "projectCatalog" }, "warning");
    evidence = [];
  }
  const evidenceByToolRef = new Map(
    evidence.map((item) => [item.toolRef, item] as const),
  );
  return {
    kind: "ok",
    items: catalog.items.map((tool) => {
      const summary = catalogJobSummary(
        tool.summary || tool.listing.summary,
      );
      const catalogText = `${catalogJobLabel(
        tool.contract.capabilityId,
        tool.listing.label,
        summary,
      )} ${summary}`;
      const source = evidenceByToolRef.get(tool.toolRef);
      const projection =
        source === undefined
          ? emptyMarketListingEvidence(
              tool.toolRef,
              tool.contract.capabilityId,
              catalogText,
            )
          : projectMarketListingEvidence(
              source,
              tool.contract.capabilityId,
              catalogText,
            );
      return toToolCardViewModel(tool, projection);
    }),
    ...(catalog.matchedCount === undefined ? {} : { matchedCount: catalog.matchedCount }),
    ...(catalog.partialResults === undefined ? {} : { partialResults: catalog.partialResults }),
    pagination: catalog.pagination,
  };
}

function windowMilliseconds(window: MarketWindow): number {
  if (window === "24h") return 24 * 60 * 60_000;
  if (window === "7d") return 7 * 24 * 60 * 60_000;
  return 30 * 24 * 60 * 60_000;
}

function firstPartyMetric(
  key: string,
  label: string,
  value: number,
  timestamp: string,
  evidenceClass: MarketMetricProjection["evidenceClass"],
  definition: string,
): MarketMetricProjection {
  return {
    key,
    label,
    value: Number.isInteger(value) ? value.toFixed(0) : value.toString(),
    displayValue: compactNumberFormatter.format(value),
    unit: "count",
    sourceTimestamp: timestamp,
    evidenceClass,
    definition,
  };
}

function emptyMarketSource(now: number): MarketSourceRead {
  return {
    generatedAt: now,
    firstPartyAvailable: false,
    firstParty: {
      tools: 0,
      providers: 0,
      invocations: 0,
      completedInvocations: 0,
      qualifiedUses: 0,
      settlements: 0,
      reconciliationRequired: 0,
    },
  };
}
