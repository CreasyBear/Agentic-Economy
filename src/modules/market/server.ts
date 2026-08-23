import { callPublicSourceQuery, sourceQuery } from "@/lib/server/convex-source";
import { readCapabilityOperationSearch } from "@/modules/capability-supply/operation-source";
import type { OperationSearchResult } from "@/modules/capability-supply/public";
import {
  MARKET_MAX_DAILY_POINTS,
  MARKET_MAX_FEATURED_SERVICES,
  MARKET_MAX_RECENT_ACTIVITY,
  marketSourceStatus,
  type AgenticEconomyProjection,
  type MarketMetricProjection,
  type MarketPageProjection,
  type MarketWindow,
  type X402EcosystemProjection,
} from "./contracts";
import {
  agenticMarketSnapshotSchema,
  type AgenticMarketSnapshot,
} from "./agentic-market-source";
import {
  emptyMarketListingEvidence,
  projectMarketListingEvidence,
  type MarketListingEvidenceSource,
} from "./listing-evidence";
import {
  toOperationCardViewModel,
  type OperationCardViewModel,
} from "./operation-view-model";

const compactNumberFormatter = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});

type MarketSourceRead = Readonly<{
  snapshot: null | Readonly<{
    fetchedAt: number;
    sourceTimestamp: string;
    snapshotJson: string;
  }>;
  generatedAt: number;
  firstPartyAvailable: boolean;
  firstParty: Readonly<{
    operations: number;
    suppliers: number;
    invocations: number;
    completedInvocations: number;
    qualifiedUses: number;
    settlements: number;
    reconciliationRequired: number;
  }>;
}>;

export type RegistryAccessFilter = "all" | "x402" | "provider_account";

export type MarketAccess = RegistryAccessFilter | "agentic_economy";

export type RegistryCardViewModel = Readonly<{
  documentId: string;
  sourceUrl: string;
  endpointUrl?: string;
  docsUrl?: string;
  name: string;
  summary: string;
  provider: string;
  category: string;
  capability?: string;
  method?: string;
  tags: readonly string[];
  networks: readonly string[];
  priceLabel?: string;
  access: "x402" | "provider_account" | "unknown";
  sourceCheckedAt?: string;
  sourceCalls30d?: string;
  sourcePayers30d?: string;
  sourceMedianLatencyMs?: number;
  sourceP95LatencyMs?: number;
  sourceSampleSize?: number;
  authority: "registry_metadata_only";
}>;

export type RegistryRead =
  | Readonly<{ kind: "unavailable" }>
  | Readonly<{
      kind: "ok";
      generation: string;
      coverage: Readonly<{
        entries: number;
        completedAt: number;
      }>;
      page: readonly RegistryCardViewModel[];
      isDone: boolean;
      continueCursor: string;
    }>;

export type RegistryEntryRead =
  | Readonly<{ kind: "found"; entry: RegistryCardViewModel }>
  | Readonly<{ kind: "not_found" }>
  | Readonly<{ kind: "unavailable" }>;

const readMarket = sourceQuery<
  { window: MarketWindow; now: number },
  MarketSourceRead
>("marketExternalSnapshots:read");

const readListingEvidence = sourceQuery<
  { operationRefs: string[]; since: number },
  readonly MarketListingEvidenceSource[]
>("marketListingEvidence:read");

const readRegistry = sourceQuery<
  {
    query: string;
    access: RegistryAccessFilter;
    limit: number;
    cursor: string | null;
  },
  RegistryRead
>("marketExternalRegistry:search");

const readRegistryEntry = sourceQuery<
  { documentId: string },
  RegistryEntryRead
>("marketExternalRegistry:entry");

export type MarketCatalogProjection =
  | Readonly<{
      kind: "ok";
      items: readonly OperationCardViewModel[];
      matchedCount: number;
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
  registry: RegistryRead;
}>;

export type MarketCatalogQuery = Readonly<{
  query?: string;
  availability?: "routeable" | "integrated" | "unavailable";
  cursor?: string;
  access?: MarketAccess;
  registryCursor?: string;
}>;

export async function readMarketRouteProjection(
  window: MarketWindow,
  catalogQuery: MarketCatalogQuery = {},
): Promise<MarketRouteProjection> {
  const includeOperations = catalogQuery.access === "agentic_economy";
  const includeRegistry = catalogQuery.access !== "agentic_economy";
  const generatedAt = Date.now();
  const [catalogResult, registryResult] = await Promise.allSettled([
    includeOperations
      ? readCapabilityOperationSearch({
          query: catalogQuery.query ?? "",
          limit: 12,
          ...(catalogQuery.cursor === undefined
            ? {}
            : { cursor: catalogQuery.cursor }),
          ...(catalogQuery.availability === undefined
            ? {}
            : { filters: { availability: [catalogQuery.availability] } }),
        })
      : Promise.resolve<OperationSearchResult>({
          kind: "no_candidates",
          schemaVersion: "registry-operations:v1",
          query: catalogQuery.query ?? "",
          appliedFilters: {},
          matchedCount: 0,
          ranking: [],
          navigation: [],
        }),
    includeRegistry
      ? callPublicSourceQuery(readRegistry, {
          query: catalogQuery.query ?? "",
          access:
            catalogQuery.access === "x402" ||
            catalogQuery.access === "provider_account"
              ? catalogQuery.access
              : "all",
          limit: 24,
          cursor: catalogQuery.registryCursor ?? null,
        })
      : Promise.resolve<RegistryRead>({ kind: "unavailable" }),
  ]);
  const catalog: OperationSearchResult =
    catalogResult.status === "fulfilled"
      ? catalogResult.value
      : {
          kind: "unavailable",
          schemaVersion: "registry-operations:v1",
          reason: "source_unavailable",
          navigation: [],
        };
  const projectedCatalog = await projectCatalog(catalog, window, generatedAt);
  return {
    window,
    catalog: projectedCatalog,
    registry:
      registryResult.status === "fulfilled"
        ? registryResult.value
        : { kind: "unavailable" },
  };
}

export async function readMarketPageProjection(
  window: MarketWindow,
): Promise<MarketPageProjection> {
  const now = Date.now();
  let source: MarketSourceRead;
  try {
    source = await callPublicSourceQuery(readMarket, { window, now });
  } catch {
    source = emptyMarketSource(now);
  }
  const generatedAt = new Date(source.generatedAt).toISOString();
  return {
    window,
    generatedAt,
    x402Ecosystem: externalProjection(source, source.generatedAt),
    agenticEconomy: firstPartyProjection(source, generatedAt),
  };
}

export async function readRegistryProjection(
  input: Readonly<{
    query?: string;
    access?: RegistryAccessFilter;
    limit?: number;
    cursor?: string;
  }>,
): Promise<RegistryRead> {
  return await callPublicSourceQuery(readRegistry, {
    query: input.query ?? "",
    access: input.access ?? "all",
    limit: input.limit ?? 24,
    cursor: input.cursor ?? null,
  });
}

export async function readRegistryEntryProjection(
  documentId: string,
): Promise<RegistryEntryRead> {
  return await callPublicSourceQuery(readRegistryEntry, { documentId });
}

function externalProjection(
  source: MarketSourceRead,
  now: number,
): X402EcosystemProjection {
  const status = marketSourceStatus(source.snapshot?.fetchedAt, now);
  const base = {
    label: "Indexed x402 activity via Agentic Market" as const,
    source: "Agentic Market" as const,
    sourceUrl: "https://agentic.market/" as const,
    status,
    statusDetail:
      status === "live"
        ? "The latest bounded snapshot is current."
        : status === "delayed"
          ? "The last-known-good snapshot is more than ten minutes old."
          : "No snapshot newer than sixty minutes is available.",
  };
  if (source.snapshot === null)
    return {
      ...base,
      metrics: [],
      daily: [],
      recentActivity: [],
      featuredExternalServices: [],
    };
  const parsed = parseSnapshot(source.snapshot.snapshotJson);
  if (parsed === undefined)
    return {
      ...base,
      status: "unavailable",
      statusDetail: "The stored source snapshot could not be validated.",
      metrics: [],
      daily: [],
      recentActivity: [],
      featuredExternalServices: [],
    };
  return {
    ...base,
    fetchedAt: new Date(source.snapshot.fetchedAt).toISOString(),
    sourceTimestamp: source.snapshot.sourceTimestamp,
    metrics: parsed.metrics.slice(0, 4),
    daily: parsed.daily.slice(-MARKET_MAX_DAILY_POINTS),
    recentActivity: parsed.recentActivity.slice(0, MARKET_MAX_RECENT_ACTIVITY),
    featuredExternalServices: parsed.featuredExternalServices.slice(
      0,
      MARKET_MAX_FEATURED_SERVICES,
    ),
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
      "operations",
      "Ready Operations",
      counts.operations,
      generatedAt,
      "ae_operation",
      "Operations that are admitted and ready to run now.",
    ),
    firstPartyMetric(
      "suppliers",
      "Active suppliers",
      counts.suppliers,
      generatedAt,
      "ae_operation",
      "Suppliers with at least one Operation ready to run.",
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
      "Counts are derived from authoritative Agentic Economy write seams. Historical totals remain gated by the aggregate backfill.",
    metrics,
  };
}

async function projectCatalog(
  catalog: OperationSearchResult,
  window: MarketWindow,
  generatedAt: number,
): Promise<MarketCatalogProjection> {
  if (catalog.kind === "unavailable")
    return { kind: "unavailable", reason: catalog.reason };
  if (catalog.kind === "no_candidates")
    return { kind: "no_candidates", matchedCount: 0 };

  const operationRefs = catalog.items.map(
    (operation) => operation.operationRef,
  );
  let evidence: readonly MarketListingEvidenceSource[] = [];
  try {
    evidence = await callPublicSourceQuery(readListingEvidence, {
      operationRefs,
      since: generatedAt - windowMilliseconds(window),
    });
  } catch {
    evidence = [];
  }
  const evidenceByOperationRef = new Map(
    evidence.map((item) => [item.operationRef, item] as const),
  );
  return {
    kind: "ok",
    items: catalog.items.map((operation) => {
      const source = evidenceByOperationRef.get(operation.operationRef);
      const projection =
        source === undefined
          ? emptyMarketListingEvidence(
              operation.operationRef,
              operation.contract.capabilityId,
            )
          : projectMarketListingEvidence(
              source,
              operation.contract.capabilityId,
            );
      return toOperationCardViewModel(operation, projection);
    }),
    matchedCount: catalog.matchedCount,
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

function parseSnapshot(value: string): AgenticMarketSnapshot | undefined {
  try {
    const parsed = agenticMarketSnapshotSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

function emptyMarketSource(now: number): MarketSourceRead {
  return {
    snapshot: null,
    generatedAt: now,
    firstPartyAvailable: false,
    firstParty: {
      operations: 0,
      suppliers: 0,
      invocations: 0,
      completedInvocations: 0,
      qualifiedUses: 0,
      settlements: 0,
      reconciliationRequired: 0,
    },
  };
}
