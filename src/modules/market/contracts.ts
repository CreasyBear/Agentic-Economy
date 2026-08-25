import { z } from "zod";

export const marketWindows = ["24h", "7d", "30d"] as const;
export const marketWindowSchema = z.enum(marketWindows);
export type MarketWindow = z.infer<typeof marketWindowSchema>;

export type MarketSourceStatus = "live" | "delayed" | "unavailable";
export type MarketEvidenceClass =
  | "indexed_x402_payment"
  | "ae_invocation"
  | "ae_settlement"
  | "ae_qualified_use"
  | "ae_operation";

export type MarketMetricProjection = Readonly<{
  key: string;
  label: string;
  value: string;
  displayValue: string;
  unit: "count" | "atomic_amount" | "percent";
  currency?: string | undefined;
  sourceTimestamp: string;
  evidenceClass: MarketEvidenceClass;
  definition: string;
}>;

export type MarketDailyPoint = Readonly<{
  date: string;
  transactions: string;
  atomicAmount: string;
  buyers: string;
  sellers: string;
}>;

export type MarketActivityProjection = Readonly<{
  id: string;
  hash: string;
  shortHash: string;
  explorerUrl?: string | undefined;
  atomicAmount: string;
  decimals: number;
  currency: string;
  chain: string;
  facilitator: string;
  occurredAt: string;
  evidenceClass: "indexed_x402_payment";
}>;

export type FeaturedExternalService = Readonly<{
  id: string;
  name: string;
  description: string;
  category: string;
  provider: string;
  href: string;
}>;

export type X402EcosystemProjection = Readonly<{
  label: "Indexed x402 activity via Agentic Market";
  source: "Agentic Market";
  sourceUrl: "https://agentic.market/";
  status: MarketSourceStatus;
  fetchedAt?: string;
  sourceTimestamp?: string;
  statusDetail: string;
  metrics: readonly MarketMetricProjection[];
  daily: readonly MarketDailyPoint[];
  recentActivity: readonly MarketActivityProjection[];
  featuredExternalServices: readonly FeaturedExternalService[];
}>;

export type AgenticEconomyProjection = Readonly<{
  label: "Agentic Economy market evidence";
  status: MarketSourceStatus;
  sourceTimestamp: string;
  statusDetail: string;
  metrics: readonly MarketMetricProjection[];
}>;

export type MarketPageProjection = Readonly<{
  window: MarketWindow;
  generatedAt: string;
  x402Ecosystem: X402EcosystemProjection;
  agenticEconomy: AgenticEconomyProjection;
}>;

export const marketWindowToUpstream = {
  "24h": 1,
  "7d": 7,
  "30d": 30,
} as const satisfies Record<MarketWindow, 1 | 7 | 30>;

export const MARKET_SOURCE_DELAYED_AFTER_MS = 10 * 60_000;
export const MARKET_SOURCE_UNAVAILABLE_AFTER_MS = 60 * 60_000;
export const MARKET_MAX_DAILY_POINTS = 31;
export const MARKET_MAX_RECENT_ACTIVITY = 24;
export const MARKET_MAX_FEATURED_SERVICES = 6;

export function marketSourceStatus(
  fetchedAt: number | undefined,
  now: number,
): MarketSourceStatus {
  if (
    fetchedAt === undefined ||
    now - fetchedAt >= MARKET_SOURCE_UNAVAILABLE_AFTER_MS
  )
    return "unavailable";
  if (now - fetchedAt >= MARKET_SOURCE_DELAYED_AFTER_MS) return "delayed";
  return "live";
}
