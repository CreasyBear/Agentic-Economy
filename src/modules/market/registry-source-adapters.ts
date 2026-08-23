import { z } from "zod";

import { readBoundedRequestText } from "@/lib/server/bounded-request-body";
import type { JsonValue } from "@/modules/capability-contract/public";
import { parseBoundedJson } from "@/modules/common/bounded-json";
import { canonicalDigest } from "@/modules/common/canonical-digest";
import { isRecord } from "@/modules/common/is-record";

import type {
  RegistrySourceEntry,
  RegistrySourceFetchResult,
} from "./registry-source-contracts";

const AGENTIC_MARKET_SERVICES_URL = "https://api.agentic.market/v1/services";
const TREG_PLATFORMS_URL = "https://treg.to/catalog/platforms";
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_JOB_TIMEOUT_MS = 240_000;
const MAX_RESPONSE_BYTES = 6_291_456;
const MAX_TOTAL_ENTRIES = 50_000;
const MAX_AGENTIC_MARKET_SERVICES = 5_000;
const MAX_AGENTIC_MARKET_PAGES = 120;
const MAX_AGENTIC_MARKET_SWEEPS = 10;
const MAX_TREG_SHELVES = 120;

type SourceFetch = (input: string, init?: RequestInit) => Promise<Response>;

const boundedText = (max: number) => z.string().max(max);
const nullableText = boundedText(2_000).nullable();
const safeCount = z.number().int().nonnegative().safe();
const httpUrl = z.url().max(2_000).refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === "https:" || protocol === "http:";
}, "Only HTTP(S) URLs are allowed");

const agenticPricing = z.strictObject({
  amount: boundedText(120),
  currency: boundedText(80),
  network: boundedText(160),
  scheme: boundedText(80),
  maxAmount: boundedText(120),
  minAmount: boundedText(120),
});
const agenticParameter = z.strictObject({
  group: boundedText(80),
  name: boundedText(160),
  type: boundedText(120),
  description: boundedText(1_000),
  example: z.unknown(),
  enumValues: z.array(z.unknown()).max(100),
  default: z.unknown().nullable(),
  required: z.boolean(),
});
const agenticQuality = z
  .strictObject({
    l30DaysTotalCalls: boundedText(80),
    l30DaysUniquePayers: boundedText(80),
  })
  .nullable();
const agenticEndpoint = z.strictObject({
  url: httpUrl,
  description: boundedText(6_000),
  pricing: agenticPricing,
  method: boundedText(24),
  providerName: boundedText(240),
  parameters: z.array(agenticParameter).max(100),
  serviceName: boundedText(240),
  tags: z.array(boundedText(120)).max(50),
  quality: agenticQuality,
});
const agenticPriceSummary = z.strictObject({
  minAmount: boundedText(120),
  maxAmount: boundedText(120),
  avgCostPerTransaction: boundedText(120),
  avgCostBasis: boundedText(80),
  currency: boundedText(80),
});
const agenticService = z.strictObject({
  id: boundedText(240).min(1),
  name: boundedText(240).min(1),
  description: boundedText(2_000),
  domain: boundedText(240),
  provider: boundedText(240),
  providerUrl: z.union([z.literal(""), httpUrl]),
  category: boundedText(160),
  networks: z.array(boundedText(160)).max(40),
  enriched: z.boolean(),
  endpoints: z.array(agenticEndpoint).max(2_000),
  integrationType: boundedText(80),
  isNew: z.boolean(),
  priceSummary: agenticPriceSummary.nullable(),
  serviceName: boundedText(240),
  tags: z.array(boundedText(120)).max(2_000),
  iconUrl: boundedText(2_000),
});
const agenticServicesPage = z.strictObject({
  services: z.array(agenticService).max(200),
  total: safeCount,
  limit: safeCount,
  offset: safeCount,
});

const tregPlatform = z.strictObject({
  slug: z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,118}[a-z0-9])?$/),
  label: boundedText(240).min(1),
  category: boundedText(160),
  featured: z.number().int().nonnegative().nullable(),
  summary: boundedText(2_000),
  price_from: z.unknown().nullable(),
  capabilities: safeCount,
  endpoints: safeCount,
  verified: safeCount,
  providers: z.array(boundedText(160)).max(100),
});
const tregPlatformIndex = z.strictObject({
  platforms: z.array(tregPlatform).max(MAX_TREG_SHELVES),
  generated_from: z.literal("catalog").optional(),
});
const tregEndpoint = z.strictObject({
  id: boundedText(240).min(1),
  provider: boundedText(160),
  provider_display: boundedText(240),
  name: boundedText(500).min(1),
  summary: boundedText(2_000),
  method: boundedText(24),
  path: boundedText(2_000),
  scope: boundedText(160),
  tier: boundedText(80),
  kind: boundedText(80),
  domain: boundedText(160),
  call_template: boundedText(4_000),
  cost: z.unknown().nullable(),
  platform_eligible: z.boolean(),
  platform_blocked: nullableText,
  miss: z.unknown().nullable(),
  status: nullableText,
  status_note: nullableText,
  superseded_by: nullableText,
  verified: boundedText(80).nullable(),
  docs_url: boundedText(2_000),
  has_example: z.boolean(),
  input: z.unknown().nullable(),
  test_request: z.unknown().nullable(),
  observed: z.unknown().optional(),
});
const tregCapability = z.strictObject({
  id: boundedText(240),
  description: boundedText(2_000),
  endpoints: z.array(tregEndpoint).max(1_000),
});
const tregDomain = z.strictObject({
  domain: boundedText(160),
  rows: z.array(z.unknown()).max(1_000),
});
const tregShelf = z.strictObject({
  platform: z.strictObject({
    slug: boundedText(120),
    label: boundedText(240),
    category: boundedText(160),
  }),
  capabilities: z.array(tregCapability).max(1_000),
  domains: z.array(tregDomain).max(1_000),
  extended: z.array(tregEndpoint).max(2_000),
  hidden_count: safeCount,
  providers: z.record(z.string(), z.unknown()),
});

export async function fetchAgenticMarketCatalog(
  input: Readonly<{
    fetch?: SourceFetch;
    now?: () => number;
    pageSize?: number;
    maxServices?: number;
    maxEntries?: number;
    maxPages?: number;
    maxSweeps?: number;
    timeoutMs?: number;
    jobTimeoutMs?: number;
  }> = {},
): Promise<RegistrySourceFetchResult> {
  const fetchImpl = input.fetch ?? globalThis.fetch;
  const now = input.now ?? Date.now;
  const fetchedAt = now();
  const deadline = fetchedAt + (input.jobTimeoutMs ?? DEFAULT_JOB_TIMEOUT_MS);
  const pageSize = Math.min(200, Math.max(1, input.pageSize ?? 200));
  const maxServices = Math.min(
    MAX_AGENTIC_MARKET_SERVICES,
    Math.max(1, input.maxServices ?? MAX_AGENTIC_MARKET_SERVICES),
  );
  const maxEntries = Math.min(
    MAX_TOTAL_ENTRIES,
    Math.max(1, input.maxEntries ?? MAX_TOTAL_ENTRIES),
  );
  const maxPages = Math.min(MAX_AGENTIC_MARKET_PAGES, Math.max(1, input.maxPages ?? MAX_AGENTIC_MARKET_PAGES));
  const maxSweeps = Math.min(
    MAX_AGENTIC_MARKET_SWEEPS,
    Math.max(1, input.maxSweeps ?? MAX_AGENTIC_MARKET_SWEEPS),
  );
  const services = new Map<string, z.infer<typeof agenticService>>();
  let pages = 0;
  let sourceReportedCount = 0;
  let incompleteReason: RegistrySourceFetchResult["incompleteReason"];

  for (let sweep = 0; sweep < maxSweeps; sweep += 1) {
    let offset = 0;
    let rowsThisSweep = 0;
    while (sourceReportedCount === 0 || rowsThisSweep < sourceReportedCount) {
      if (now() >= deadline) {
        incompleteReason = "deadline_reached";
        break;
      }
      if (pages >= maxPages) {
        incompleteReason = "page_ceiling_reached";
        break;
      }
      if (services.size >= maxServices) {
        incompleteReason = "entry_ceiling_reached";
        break;
      }
      const url = new URL(AGENTIC_MARKET_SERVICES_URL);
      url.searchParams.set("limit", String(pageSize));
      url.searchParams.set("offset", String(offset));
      const page = agenticServicesPage.parse(
        await fetchBoundedJson(fetchImpl, url.toString(), input.timeoutMs),
      );
      pages += 1;
      if (pages === 1) sourceReportedCount = page.total;
      else if (sourceReportedCount !== page.total) {
        incompleteReason = "source_count_mismatch";
        break;
      }
      for (const service of page.services) services.set(service.id, service);
      rowsThisSweep += page.services.length;
      offset += page.services.length;
      if (page.services.length === 0) {
        incompleteReason = "source_count_mismatch";
        break;
      }
    }
    if (incompleteReason !== undefined || services.size >= sourceReportedCount) break;
  }
  if (incompleteReason === undefined && services.size !== sourceReportedCount) {
    incompleteReason = "source_count_mismatch";
  }
  const allEntries = [...services.values()].flatMap(agenticEntries);
  const entries = allEntries.slice(0, maxEntries);
  if (entries.length !== allEntries.length) incompleteReason = "entry_ceiling_reached";
  return {
    source: "agentic_market",
    fetchedAt,
    complete: incompleteReason === undefined,
    ...(incompleteReason === undefined ? {} : { incompleteReason }),
    sourceReportedCount,
    fetchedServiceCount: services.size,
    entries,
  };
}

export async function fetchTregCatalog(
  input: Readonly<{
    fetch?: SourceFetch;
    now?: () => number;
    maxEntries?: number;
    maxShelves?: number;
    timeoutMs?: number;
    jobTimeoutMs?: number;
  }> = {},
): Promise<RegistrySourceFetchResult> {
  const fetchImpl = input.fetch ?? globalThis.fetch;
  const now = input.now ?? Date.now;
  const fetchedAt = now();
  const deadline = fetchedAt + (input.jobTimeoutMs ?? DEFAULT_JOB_TIMEOUT_MS);
  const maxEntries = Math.min(MAX_TOTAL_ENTRIES, Math.max(1, input.maxEntries ?? MAX_TOTAL_ENTRIES));
  const maxShelves = Math.min(MAX_TREG_SHELVES, Math.max(1, input.maxShelves ?? MAX_TREG_SHELVES));
  const index = tregPlatformIndex.parse(
    await fetchBoundedJson(fetchImpl, TREG_PLATFORMS_URL, input.timeoutMs),
  );
  const entries = new Map<string, RegistrySourceEntry>();
  let fetchedShelfCount = 0;
  let incompleteReason: RegistrySourceFetchResult["incompleteReason"];
  const shelves = index.platforms.slice(0, maxShelves);
  if (shelves.length !== index.platforms.length) incompleteReason = "page_ceiling_reached";

  for (const platform of shelves) {
    if (now() >= deadline) {
      incompleteReason = "deadline_reached";
      break;
    }
    const url = `${TREG_PLATFORMS_URL}/${encodeURIComponent(platform.slug)}?include_hidden=1`;
    const shelf = tregShelf.parse(
      await fetchBoundedJson(fetchImpl, url, input.timeoutMs),
    );
    if (shelf.platform.slug !== platform.slug) {
      throw new Error("treg_catalog_shelf_identity_mismatch");
    }
    fetchedShelfCount += 1;
    const endpointPairs = [
      ...shelf.capabilities.flatMap((capability) =>
        capability.endpoints.map((endpoint) => ({
          endpoint,
          capability: capability.id,
        })),
      ),
      ...shelf.extended.map((endpoint) => ({ endpoint, capability: undefined })),
    ];
    for (const pair of endpointPairs) {
      if (entries.size >= maxEntries) {
        incompleteReason = "entry_ceiling_reached";
        break;
      }
      const entry = tregEntry(platform, pair.endpoint, pair.capability);
      const existing = entries.get(entry.upstreamEndpointId);
      if (existing !== undefined && existing.sourceDigest !== entry.sourceDigest) {
        throw new Error("treg_catalog_duplicate_identity_conflict");
      }
      entries.set(entry.upstreamEndpointId, entry);
    }
    if (incompleteReason === "entry_ceiling_reached") break;
  }
  const sourceReportedCount = index.platforms.reduce(
    (total, platform) => total + platform.endpoints,
    0,
  );
  return {
    source: "treg",
    fetchedAt,
    complete: incompleteReason === undefined,
    ...(incompleteReason === undefined ? {} : { incompleteReason }),
    sourceReportedCount,
    fetchedShelfCount,
    entries: [...entries.values()],
  };
}

async function fetchBoundedJson(
  fetchImpl: SourceFetch,
  url: string,
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
): Promise<JsonValue> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { accept: "application/json" },
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`external_registry_http_${response.status}`);
    const body = await readBoundedRequestText(response, MAX_RESPONSE_BYTES);
    if (!body.ok) throw new Error("external_registry_response_too_large");
    const parsed = parseBoundedJson(body.text);
    if (parsed === undefined) throw new Error("external_registry_response_invalid_json");
    return parsed;
  } finally {
    clearTimeout(timer);
  }
}

function agenticEntries(
  service: z.infer<typeof agenticService>,
): RegistrySourceEntry[] {
  const endpoints =
    service.endpoints.length === 0
      ? [undefined]
      : service.endpoints;
  return endpoints.map((endpoint) => {
    const method = endpoint?.method.trim().toUpperCase();
    const upstreamEndpointId =
      endpoint === undefined ? `service:${service.id}` : `${method}:${endpoint.url}`;
    const declaredPrice = priceLabel(endpoint?.pricing ?? service.priceSummary);
    const digestInput = {
      source: "agentic_market",
      serviceId: service.id,
      endpointId: upstreamEndpointId,
      name: endpoint?.serviceName || service.name,
      description: endpoint?.description || service.description,
      provider: endpoint?.providerName || service.provider || service.domain,
      category: service.category,
      method: method ?? null,
      endpointUrl: endpoint?.url ?? null,
      tags: uniqueBounded([...(endpoint?.tags ?? []), ...service.tags]),
      networks: uniqueBounded(service.networks),
      pricing: endpoint?.pricing ?? service.priceSummary,
      quality: endpoint?.quality ?? null,
    };
    return {
      kind: "registry_source_entry",
      source: "agentic_market",
      upstreamServiceId: service.id,
      upstreamEndpointId,
      sourceUrl: `https://agentic.market/services/${encodeURIComponent(service.id)}`,
      ...(endpoint === undefined ? {} : { endpointUrl: endpoint.url }),
      name: cleanText(endpoint?.serviceName || service.name, "Unnamed service"),
      summary: cleanText(endpoint?.description || service.description, "No source description."),
      provider: cleanText(endpoint?.providerName || service.provider || service.domain, "Unknown provider"),
      category: cleanText(service.category, "Uncategorised"),
      ...(method === undefined || method === "" ? {} : { method }),
      tags: uniqueBounded([...(endpoint?.tags ?? []), ...service.tags]),
      networks: uniqueBounded(service.networks),
      ...(declaredPrice === undefined ? {} : { priceLabel: declaredPrice }),
      access: "x402",
      ...(endpoint?.quality?.l30DaysTotalCalls
        ? { sourceCalls30d: endpoint.quality.l30DaysTotalCalls }
        : {}),
      ...(endpoint?.quality?.l30DaysUniquePayers
        ? { sourcePayers30d: endpoint.quality.l30DaysUniquePayers }
        : {}),
      authority: "source_metadata_only",
      sourceDigest: canonicalDigest(digestInput),
    };
  });
}

function tregEntry(
  platform: z.infer<typeof tregPlatform>,
  endpoint: z.infer<typeof tregEndpoint>,
  capability: string | undefined,
): RegistrySourceEntry {
  const observed = isRecord(endpoint.observed) ? endpoint.observed : undefined;
  const docsUrl = safeHttpUrl(endpoint.docs_url);
  const declaredPrice = priceLabel(endpoint.cost);
  const medianLatency = safeNonnegativeNumber(observed?.p50_ms);
  const p95Latency = safeNonnegativeNumber(observed?.p95_ms);
  const sampleSize = safeNonnegativeNumber(observed?.samples);
  const digestInput = {
    source: "treg",
    platform: platform.slug,
    endpointId: endpoint.id,
    name: endpoint.name,
    summary: endpoint.summary,
    provider: endpoint.provider_display || endpoint.provider,
    category: platform.category,
    capability: capability ?? null,
    method: endpoint.method,
    path: endpoint.path,
    scope: endpoint.scope,
    cost: endpoint.cost,
    checkedAt: endpoint.verified,
    observed: observed ?? null,
  };
  return {
    kind: "registry_source_entry",
    source: "treg",
    upstreamServiceId: platform.slug,
    upstreamEndpointId: endpoint.id,
    sourceUrl: `https://treg.to/catalog/endpoints/${encodeURIComponent(endpoint.id)}`,
    ...(docsUrl === undefined ? {} : { docsUrl }),
    name: cleanText(endpoint.name, "Unnamed endpoint"),
    summary: cleanText(endpoint.summary, "No source description."),
    provider: cleanText(endpoint.provider_display || endpoint.provider, "Unknown provider"),
    category: cleanText(platform.category, "Uncategorised"),
    ...(capability === undefined || capability === "" ? {} : { capability }),
    ...(endpoint.method === "" ? {} : { method: endpoint.method.toUpperCase() }),
    tags: uniqueBounded([endpoint.kind, endpoint.domain, endpoint.tier]),
    networks: [],
    ...(declaredPrice === undefined ? {} : { priceLabel: declaredPrice }),
    access: "provider_account",
    ...(endpoint.verified === null || endpoint.verified === ""
      ? {}
      : { sourceCheckedAt: endpoint.verified }),
    ...(medianLatency === undefined ? {} : { sourceMedianLatencyMs: medianLatency }),
    ...(p95Latency === undefined ? {} : { sourceP95LatencyMs: p95Latency }),
    ...(sampleSize === undefined ? {} : { sourceSampleSize: sampleSize }),
    authority: "source_metadata_only",
    sourceDigest: canonicalDigest(digestInput),
  };
}

function priceLabel(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const type = typeof value.type === "string" ? value.type : undefined;
  if (type === "free") return "Free";
  const amount = scalarText(value.amount) ?? scalarText(value.value);
  const min = scalarText(value.minAmount);
  const max = scalarText(value.maxAmount);
  const currency = scalarText(value.currency);
  if (min !== undefined && max !== undefined && min !== max) {
    return `${currency === undefined ? "" : `${currency} `}${min}–${max}`.trim();
  }
  const chosen = amount ?? min ?? max;
  return chosen === undefined
    ? undefined
    : `${currency === undefined ? "" : `${currency} `}${chosen}`.trim();
}

function scalarText(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" || trimmed.length > 120 ? undefined : trimmed;
  }
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return String(value);
  }
  return undefined;
}

function safeNonnegativeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function safeHttpUrl(value: string): string | undefined {
  if (value === "") return undefined;
  const parsed = httpUrl.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function cleanText(value: string, fallback: string): string {
  const trimmed = value.trim();
  return trimmed === "" ? fallback : trimmed;
}

function uniqueBounded(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
    .sort()
    .slice(0, 50);
}
