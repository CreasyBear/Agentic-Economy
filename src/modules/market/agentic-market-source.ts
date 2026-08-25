import { z } from "zod";

import { readBoundedRequestText } from "@/lib/server/bounded-request-body";
import { parseBoundedJson } from "@/modules/common/bounded-json";
import type { JsonValue } from "@/modules/capability-contract/public";

import {
  MARKET_MAX_DAILY_POINTS,
  MARKET_MAX_FEATURED_SERVICES,
  MARKET_MAX_RECENT_ACTIVITY,
  marketWindowToUpstream,
  type MarketActivityProjection,
  type MarketMetricProjection,
  type MarketWindow,
} from "./contracts";

const compactNumberFormatter = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const MAX_RESPONSE_BYTES = 6_291_456;

const isoDate = z.iso.datetime({ offset: true });
const safeUnsignedInteger = z.number().int().nonnegative().safe();
const nullableText = z.string().nullable().optional();
const responseMeta = z.unknown().optional();

const overviewResponse = z.strictObject({
  overview: z.strictObject({
    json: z.strictObject({
      total_transactions: safeUnsignedInteger,
      total_amount: safeUnsignedInteger,
      unique_buyers: safeUnsignedInteger,
      unique_sellers: safeUnsignedInteger,
      latest_block_timestamp: isoDate,
    }),
    meta: responseMeta,
  }),
});

const statsResponse = z.strictObject({
  stats: z.strictObject({
    json: z
      .array(
        z.strictObject({
          bucket_start: isoDate,
          total_transactions: safeUnsignedInteger,
          total_amount: safeUnsignedInteger,
          unique_buyers: safeUnsignedInteger,
          unique_sellers: safeUnsignedInteger,
        }),
      )
      .max(2_000),
    meta: responseMeta,
  }),
});

const transaction = z.strictObject({
  id: z.string().min(1).max(160),
  address: nullableText,
  transaction_from: nullableText,
  sender: nullableText,
  recipient: nullableText,
  amount: safeUnsignedInteger,
  block_timestamp: isoDate,
  tx_hash: z.string().min(8).max(160),
  chain: nullableText,
  provider: nullableText,
  decimals: z.number().int().min(0).max(30),
  facilitator_id: nullableText,
  log_index: z.number().int().nonnegative().safe().optional(),
  token_address: nullableText,
});

const transactionsResponse = z.strictObject({
  transactions: z.strictObject({
    json: z.strictObject({
      items: z.array(transaction).max(250),
      page: z.number().int().nonnegative(),
      hasNextPage: z.boolean(),
    }),
    meta: responseMeta,
  }),
});

const endpoint = z.strictObject({
  url: z.string(),
  description: z.string(),
  pricing: z.unknown(),
  method: z.string(),
  providerName: z.string(),
  parameters: z.array(z.unknown()).max(100),
  serviceName: z.string(),
  tags: z.array(z.string()).max(50),
  quality: z.unknown().nullable(),
});
const service = z.strictObject({
  id: z.string().min(1).max(240),
  name: z.string().min(1).max(240),
  description: z.string().max(2_000),
  domain: z.string().max(240),
  provider: z.string().max(240),
  providerUrl: z.union([z.literal(""), z.url().max(2_000)]),
  category: z.string().max(160),
  networks: z.array(z.string()).max(40),
  enriched: z.boolean(),
  endpoints: z.array(endpoint).max(2_000),
  integrationType: z.string().max(80),
  isNew: z.boolean(),
  priceSummary: z.unknown(),
  serviceName: z.string().max(240),
  tags: z.array(z.string()).max(2_000),
  iconUrl: z.string().max(2_000),
});
const servicesResponse = z.strictObject({
  services: z.array(service).max(100),
  total: safeUnsignedInteger,
  limit: safeUnsignedInteger,
  offset: safeUnsignedInteger,
});

const metricProjectionSchema = z.strictObject({
  key: z.string().min(1).max(80),
  label: z.string().min(1).max(160),
  value: z.string().regex(/^\d+$/u),
  displayValue: z.string().min(1).max(80),
  unit: z.enum(["count", "atomic_amount", "percent"]),
  currency: z.string().min(1).max(80).optional(),
  sourceTimestamp: isoDate,
  evidenceClass: z.literal("indexed_x402_payment"),
  definition: z.string().min(1).max(1_000),
});

export const agenticMarketSnapshotSchema = z.strictObject({
  fetchedAt: safeUnsignedInteger,
  sourceTimestamp: isoDate,
  metrics: z.array(metricProjectionSchema).max(4),
  daily: z
    .array(
      z.strictObject({
        date: isoDate,
        transactions: z.string().regex(/^\d+$/u),
        atomicAmount: z.string().regex(/^\d+$/u),
        buyers: z.string().regex(/^\d+$/u),
        sellers: z.string().regex(/^\d+$/u),
      }),
    )
    .max(MARKET_MAX_DAILY_POINTS),
  recentActivity: z
    .array(
      z.strictObject({
        id: z.string().min(1).max(160),
        hash: z.string().min(8).max(160),
        shortHash: z.string().min(1).max(40),
        explorerUrl: z.url().max(2_000).optional(),
        atomicAmount: z.string().regex(/^\d+$/u),
        decimals: z.number().int().min(0).max(30),
        currency: z.string().min(1).max(80),
        chain: z.string().min(1).max(160),
        facilitator: z.string().min(1).max(160),
        occurredAt: isoDate,
        evidenceClass: z.literal("indexed_x402_payment"),
      }),
    )
    .max(MARKET_MAX_RECENT_ACTIVITY),
  featuredExternalServices: z
    .array(
      z.strictObject({
        id: z.string().min(1).max(240),
        name: z.string().min(1).max(240),
        description: z.string().max(2_000),
        category: z.string().min(1).max(160),
        provider: z.string().min(1).max(240),
        href: z.url().max(2_000),
      }),
    )
    .max(MARKET_MAX_FEATURED_SERVICES),
});

export type AgenticMarketSnapshot = Readonly<
  z.output<typeof agenticMarketSnapshotSchema>
>;

type SourceFetch = (input: string, init?: RequestInit) => Promise<Response>;

async function fetchJson(
  fetchImpl: SourceFetch,
  url: string,
  timeoutMs: number,
): Promise<JsonValue> {
  const response = await fetchImpl(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`agentic_market_http_${response.status}`);
  const body = await readBoundedRequestText(response, MAX_RESPONSE_BYTES);
  if (!body.ok) throw new Error("agentic_market_response_too_large");
  const parsed = parseBoundedJson(body.text);
  if (parsed === undefined) throw new Error("agentic_market_response_invalid_json");
  return parsed;
}

export async function fetchAgenticMarketSnapshot(
  input: Readonly<{
    window: MarketWindow;
    fetch?: SourceFetch;
    now?: number;
    timeoutMs?: number;
  }>,
): Promise<AgenticMarketSnapshot> {
  const fetchImpl = input.fetch ?? globalThis.fetch;
  const now = input.now ?? Date.now();
  const timeframe = marketWindowToUpstream[input.window];
  const timeoutMs = input.timeoutMs ?? 12_000;
  const [overviewResult, statsResult, transactionsResult, servicesResult] =
    await Promise.allSettled([
      fetchJson(
        fetchImpl,
        `https://api.agentic.market/v1/ecosystem/overview?timeframe=${timeframe}`,
        timeoutMs,
      ).then((value) => overviewResponse.parse(value).overview.json),
      fetchJson(
        fetchImpl,
        `https://api.agentic.market/v1/ecosystem/stats?timeframe=${timeframe}`,
        timeoutMs,
      ).then((value) => statsResponse.parse(value).stats.json),
      fetchJson(
        fetchImpl,
        "https://api.agentic.market/v1/ecosystem/transactions?page=0",
        timeoutMs,
      ).then(
        (value) => transactionsResponse.parse(value).transactions.json.items,
      ),
      fetchJson(
        fetchImpl,
        `https://api.agentic.market/v1/services?limit=${MARKET_MAX_FEATURED_SERVICES}&offset=0`,
        timeoutMs,
      ).then((value) => servicesResponse.parse(value).services),
    ]);
  if (overviewResult.status === "rejected") throw overviewResult.reason;
  const overview = overviewResult.value;
  const stats =
    statsResult.status === "fulfilled"
      ? statsResult.value.slice(-MARKET_MAX_DAILY_POINTS)
      : [];
  const transactions =
    transactionsResult.status === "fulfilled"
      ? transactionsResult.value.slice(0, MARKET_MAX_RECENT_ACTIVITY)
      : [];
  const services =
    servicesResult.status === "fulfilled"
      ? servicesResult.value.slice(0, MARKET_MAX_FEATURED_SERVICES)
      : [];
  const sourceTimestamp = overview.latest_block_timestamp;
  return agenticMarketSnapshotSchema.parse({
    fetchedAt: now,
    sourceTimestamp,
    metrics: [
      metric(
        "transactions",
        "Transactions",
        overview.total_transactions,
        "count",
        sourceTimestamp,
        "Source-indexed x402 payment transactions in the selected window.",
      ),
      metric(
        "payment-volume",
        "Payment volume",
        overview.total_amount,
        "atomic_amount",
        sourceTimestamp,
        "Source-reported atomic payment amount. The upstream aggregate does not declare one currency, so no fiat value is inferred.",
      ),
      metric(
        "buyers",
        "Buyers",
        overview.unique_buyers,
        "count",
        sourceTimestamp,
        "Distinct payer identities indexed by the source in the selected window.",
      ),
      metric(
        "sellers",
        "Sellers",
        overview.unique_sellers,
        "count",
        sourceTimestamp,
        "Distinct payee identities indexed by the source in the selected window.",
      ),
    ],
    daily: stats.map((point) => ({
      date: point.bucket_start,
      transactions: integerString(point.total_transactions),
      atomicAmount: integerString(point.total_amount),
      buyers: integerString(point.unique_buyers),
      sellers: integerString(point.unique_sellers),
    })),
    recentActivity: transactions.map(toActivity),
    featuredExternalServices: services.flatMap((item) =>
      item.providerUrl === ""
        ? []
        : [
            {
              id: item.id,
              name: item.name,
              description: item.description,
              category: item.category || "Uncategorised",
              provider: item.provider || item.domain || "Unknown provider",
              href: item.providerUrl,
            },
          ],
    ),
  });
}

function metric(
  key: string,
  label: string,
  value: number,
  unit: MarketMetricProjection["unit"],
  sourceTimestamp: string,
  definition: string,
): MarketMetricProjection {
  const exact = integerString(value);
  return {
    key,
    label,
    value: exact,
    displayValue: compactNumberFormatter.format(value),
    unit,
    ...(unit === "atomic_amount" ? { currency: "unknown" } : {}),
    sourceTimestamp,
    evidenceClass: "indexed_x402_payment",
    definition,
  };
}

function integerString(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error("agentic_market_unsafe_integer");
  return value.toFixed(0);
}

function toActivity(
  item: z.infer<typeof transaction>,
): MarketActivityProjection {
  const chain = cleanUnknown(item.chain);
  const hash = item.tx_hash;
  const link = explorerUrl(chain, hash);
  return {
    id: item.id,
    hash,
    shortHash: shortenHash(hash),
    ...(link === undefined ? {} : { explorerUrl: link }),
    atomicAmount: integerString(item.amount),
    decimals: item.decimals,
    currency: "unknown",
    chain,
    facilitator: cleanUnknown(item.facilitator_id),
    occurredAt: item.block_timestamp,
    evidenceClass: "indexed_x402_payment",
  };
}

function cleanUnknown(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? "Unknown" : trimmed;
}

export function shortenHash(hash: string): string {
  return hash.length <= 16 ? hash : `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

export function explorerUrl(chain: string, hash: string): string | undefined {
  const normalized = chain.toLowerCase();
  if (normalized === "base" || normalized === "eip155:8453")
    return `https://basescan.org/tx/${encodeURIComponent(hash)}`;
  if (normalized === "ethereum" || normalized === "eip155:1")
    return `https://etherscan.io/tx/${encodeURIComponent(hash)}`;
  if (normalized === "solana" || normalized.startsWith("solana:"))
    return `https://solscan.io/tx/${encodeURIComponent(hash)}`;
  return undefined;
}
