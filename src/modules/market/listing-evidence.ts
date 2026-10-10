import { formatCount } from '@/lib/ui/format-time'
import { projectToolLatency, type ToolLatencyProjection } from '@/modules/registry/tool-latency';
export { TOOL_MIN_LATENCY_SAMPLE_SIZE as MARKET_MIN_LATENCY_SAMPLE_SIZE, TOOL_MAX_LATENCY_SAMPLE_SIZE as MARKET_MAX_LATENCY_SAMPLE_SIZE } from '@/modules/registry/tool-latency';

export const marketCategories = [
  {
    id: "data-research",
    label: "Data & research",
    description: "Search, extraction, analysis, and decision-ready data.",
  },
  {
    id: "finance",
    label: "Finance",
    description: "Pricing, payments, market data, and financial operations.",
  },
  {
    id: "identity-compliance",
    label: "Identity & compliance",
    description: "Verification, screening, records, and compliance checks.",
  },
  {
    id: "commerce",
    label: "Commerce",
    description: "Purchasing, fulfilment, inventory, and customer operations.",
  },
  {
    id: "media",
    label: "Media",
    description: "Image, audio, video, document, and publishing capabilities.",
  },
  {
    id: "developer-tools",
    label: "Developer tools",
    description: "Code, infrastructure, automation, and software operations.",
  },
  {
    id: "other",
    label: "Other",
    description: "Tools that do not yet belong to a narrower category.",
  },
] as const;

export type MarketCategoryId = (typeof marketCategories)[number]["id"];
export type MarketCategory = Readonly<{
  id: MarketCategoryId;
  label: string;
  description: string;
}>;

export type MarketListingEvidenceSource = Readonly<{
  toolRef: string;
  categoryId?: string;
  ratingCount: number;
  ratingSum: number;
  completedCalls: number;
  qualifiedUses?: number;
  latencySamplesMs: readonly number[];
}>;

export type MarketRatingProjection =
  | Readonly<{
      kind: "rated";
      average: number;
      count: number;
      display: string;
      definition: string;
    }>
  | Readonly<{
      kind: "unrated";
      count: 0;
      display: "No ratings yet";
      definition: string;
    }>;

export type MarketPopularityProjection =
  | Readonly<{
      kind: "observed";
      completedCalls: number;
      display: string;
      definition: string;
    }>
  | Readonly<{
      kind: "no_activity";
      completedCalls: 0;
      display: "No completed calls yet";
      definition: string;
    }>;

export type MarketLatencyProjection = ToolLatencyProjection;

export type MarketListingEvidenceProjection = Readonly<{
  toolRef: string;
  category: MarketCategory;
  rating: MarketRatingProjection;
  popularity: MarketPopularityProjection;
  latency: MarketLatencyProjection;
}>;

export function projectMarketListingEvidence(
  source: MarketListingEvidenceSource,
  capabilityId: string,
  catalogText = "",
): MarketListingEvidenceProjection {
  const category = resolveMarketCategory(
    source.categoryId,
    capabilityId,
    catalogText,
  );
  const rating = projectRating(source.ratingCount, source.ratingSum);
  const popularity: MarketPopularityProjection =
    source.completedCalls === 0
      ? {
          kind: "no_activity",
          completedCalls: 0,
          display: "No completed calls yet",
          definition:
            "Completed Agentic Economy calls for this published Tool during the selected period.",
        }
      : {
          kind: "observed",
          completedCalls: source.completedCalls,
          display: `${formatCount(source.completedCalls)} completed ${source.completedCalls === 1 ? "call" : "calls"}`,
          definition:
            "Completed Agentic Economy calls for this published Tool during the selected period.",
        };

  return {
    toolRef: source.toolRef,
    category,
    rating,
    popularity,
    latency: projectToolLatency(source.latencySamplesMs),
  };
}

export function emptyMarketListingEvidence(
  toolRef: string,
  capabilityId: string,
  catalogText = "",
): MarketListingEvidenceProjection {
  return projectMarketListingEvidence(
    {
      toolRef,
      ratingCount: 0,
      ratingSum: 0,
      completedCalls: 0,
      latencySamplesMs: [],
    },
    capabilityId,
    catalogText,
  );
}

export function isMarketCategoryId(value: string): value is MarketCategoryId {
  return marketCategories.some((category) => category.id === value);
}

function resolveMarketCategory(
  persistedCategoryId: string | undefined,
  capabilityId: string,
  catalogText = "",
): MarketCategory {
  const persisted = marketCategories.find(
    (category) => category.id === persistedCategoryId,
  );
  if (persisted !== undefined) return persisted;
  const normalized = `${capabilityId} ${catalogText}`.toLowerCase();
  const inferred = categoryRules.find(({ terms }) =>
    terms.some((term) => normalized.includes(term)),
  );
  const categoryId = inferred?.categoryId ?? "other";
  const category = marketCategories.find((candidate) => candidate.id === categoryId);
  if (category === undefined) throw new Error("market_category_configuration_invalid");
  return category;
}

function projectRating(count: number, sum: number): MarketRatingProjection {
  if (count <= 0)
    return {
      kind: "unrated",
      count: 0,
      display: "No ratings yet",
      definition:
        "Ratings submitted by authenticated Agentic Economy principals for this published Tool.",
    };
  const average = Math.round((sum / count) * 10) / 10;
  return {
    kind: "rated",
    average,
    count,
    display: `${average.toFixed(1)} (${formatCount(count)})`,
    definition:
      "Average rating submitted by authenticated Agentic Economy principals for this published Tool.",
  };
}

const categoryRules: readonly Readonly<{
  categoryId: MarketCategoryId;
  terms: readonly string[];
}>[] = [
  {
    categoryId: "identity-compliance",
    terms: ["identity", "verify", "compliance", "kyc", "screen", "registry"],
  },
  {
    categoryId: "finance",
    terms: [
      "price",
      "finance",
      "payment",
      "liquidation",
      "forex",
      "bitcoin",
      "crypto",
      "swap",
      "yield",
      "rate",
      "quote",
    ],
  },
  {
    categoryId: "commerce",
    terms: [
      "commerce",
      "purchase",
      "order",
      "inventory",
      "shipping",
      "amazon",
      "shop",
      "sku",
      "cart",
      "product",
    ],
  },
  {
    categoryId: "media",
    terms: [
      "image",
      "audio",
      "video",
      "document",
      "media",
      "publish",
      "tweet",
      "twitter",
      "youtube",
    ],
  },
  {
    categoryId: "developer-tools",
    terms: [
      "code",
      "deploy",
      "compute",
      "automation",
      "developer",
      "software",
      "gas",
      "evm",
      "oracle",
      "rpc",
      "webhook",
    ],
  },
  {
    categoryId: "data-research",
    terms: [
      "search",
      "research",
      "extract",
      "data",
      "analysis",
      "lookup",
      "weather",
      "tide",
      "forecast",
      "dns",
      "whois",
      "scrape",
      "outline",
      "flight",
    ],
  },
];
