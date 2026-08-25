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
    description: "Operations that do not yet belong to a narrower category.",
  },
] as const;

export type MarketCategoryId = (typeof marketCategories)[number]["id"];
export type MarketCategory = Readonly<{
  id: MarketCategoryId;
  label: string;
  description: string;
}>;

export type MarketListingEvidenceSource = Readonly<{
  operationRef: string;
  categoryId?: string;
  ratingCount: number;
  ratingSum: number;
  completedInvocations: number;
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
      completedInvocations: number;
      display: string;
      definition: string;
    }>
  | Readonly<{
      kind: "no_activity";
      completedInvocations: 0;
      display: "No completed calls yet";
      definition: string;
    }>;

export type MarketLatencyProjection =
  | Readonly<{
      kind: "measured";
      medianMs: number;
      p95Ms: number;
      sampleSize: number;
      display: string;
      definition: string;
    }>
  | Readonly<{
      kind: "insufficient_sample";
      sampleSize: number;
      minimumSampleSize: number;
      display: "Not enough data";
      definition: string;
    }>;

export type MarketListingEvidenceProjection = Readonly<{
  operationRef: string;
  category: MarketCategory;
  rating: MarketRatingProjection;
  popularity: MarketPopularityProjection;
  latency: MarketLatencyProjection;
}>;

export const MARKET_MIN_LATENCY_SAMPLE_SIZE = 5;
export const MARKET_MAX_LATENCY_SAMPLE_SIZE = 48;

export function projectMarketListingEvidence(
  source: MarketListingEvidenceSource,
  capabilityId: string,
): MarketListingEvidenceProjection {
  const category = resolveMarketCategory(source.categoryId, capabilityId);
  const rating = projectRating(source.ratingCount, source.ratingSum);
  const popularity: MarketPopularityProjection =
    source.completedInvocations === 0
      ? {
          kind: "no_activity",
          completedInvocations: 0,
          display: "No completed calls yet",
          definition:
            "Completed Agentic Economy invocations for this published Operation during the selected period.",
        }
      : {
          kind: "observed",
          completedInvocations: source.completedInvocations,
          display: `${source.completedInvocations.toLocaleString()} completed ${source.completedInvocations === 1 ? "call" : "calls"}`,
          definition:
            "Completed Agentic Economy invocations for this published Operation during the selected period.",
        };

  return {
    operationRef: source.operationRef,
    category,
    rating,
    popularity,
    latency: projectLatency(source.latencySamplesMs),
  };
}

export function emptyMarketListingEvidence(
  operationRef: string,
  capabilityId: string,
): MarketListingEvidenceProjection {
  return projectMarketListingEvidence(
    {
      operationRef,
      ratingCount: 0,
      ratingSum: 0,
      completedInvocations: 0,
      latencySamplesMs: [],
    },
    capabilityId,
  );
}

export function isMarketCategoryId(value: string): value is MarketCategoryId {
  return marketCategories.some((category) => category.id === value);
}

function resolveMarketCategory(
  persistedCategoryId: string | undefined,
  capabilityId: string,
): MarketCategory {
  const persisted = marketCategories.find(
    (category) => category.id === persistedCategoryId,
  );
  if (persisted !== undefined) return persisted;
  const normalized = capabilityId.toLowerCase();
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
        "Ratings submitted by authenticated Agentic Economy principals for this published Operation.",
    };
  const average = Math.round((sum / count) * 10) / 10;
  return {
    kind: "rated",
    average,
    count,
    display: `${average.toFixed(1)} (${count.toLocaleString()})`,
    definition:
      "Average rating submitted by authenticated Agentic Economy principals for this published Operation.",
  };
}

function projectLatency(samples: readonly number[]): MarketLatencyProjection {
  const valid = samples
    .filter((sample) => Number.isSafeInteger(sample) && sample >= 0)
    .slice(0, MARKET_MAX_LATENCY_SAMPLE_SIZE)
    .sort((left, right) => left - right);
  if (valid.length < MARKET_MIN_LATENCY_SAMPLE_SIZE)
    return {
      kind: "insufficient_sample",
      sampleSize: valid.length,
      minimumSampleSize: MARKET_MIN_LATENCY_SAMPLE_SIZE,
      display: "Not enough data",
      definition:
        "Median admitted-to-completed latency appears after at least five completed calls in the selected period.",
    };
  const medianMs = percentile(valid, 0.5);
  const p95Ms = percentile(valid, 0.95);
  return {
    kind: "measured",
    medianMs,
    p95Ms,
    sampleSize: valid.length,
    display: formatDuration(medianMs),
    definition:
      "Median admitted-to-completed latency for completed calls in the selected period; the detail view also preserves the p95 and sample size.",
  };
}

function percentile(sorted: readonly number[], percentileValue: number): number {
  const index = Math.ceil(percentileValue * sorted.length) - 1;
  return sorted[Math.max(0, index)] ?? 0;
}

function formatDuration(milliseconds: number): string {
  if (milliseconds < 1_000) return `${milliseconds} ms`;
  const seconds = milliseconds / 1_000;
  if (seconds < 60) return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)} s`;
  const minutes = seconds / 60;
  return `${minutes < 10 ? minutes.toFixed(1) : Math.round(minutes)} min`;
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
    terms: ["price", "finance", "payment", "market", "rate", "quote"],
  },
  {
    categoryId: "commerce",
    terms: ["commerce", "purchase", "order", "inventory", "shipping"],
  },
  {
    categoryId: "media",
    terms: ["image", "audio", "video", "document", "media", "publish"],
  },
  {
    categoryId: "developer-tools",
    terms: ["code", "deploy", "compute", "automation", "developer", "software"],
  },
  {
    categoryId: "data-research",
    terms: ["search", "research", "extract", "data", "analysis", "lookup"],
  },
];
