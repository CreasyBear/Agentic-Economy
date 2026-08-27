import { z } from "zod";

import { jsonValueSchema, type JsonValue } from "@/modules/capability-contract/public";

import { readBoundedRequestText } from "@/lib/server/bounded-request-body";
import { canonicalDigest } from "@/modules/common/canonical-digest";
import { isRecord } from "@/modules/common/is-record";

import type {
  AgenticMarketRegistrySourceEntry,
  RegistryExactPrice,
  RegistryProbeRequest,
  RegistrySourceFetchResult,
  TregRegistrySourceEntry,
} from "./registry-source-contracts";

const AGENTIC_MARKET_SERVICES_URL = "https://api.agentic.market/v1/services";
const TREG_PLATFORMS_URL = "https://treg.to/catalog/platforms";
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
export const REGISTRY_SOURCE_JOB_TIMEOUT_MS = 20_000;
const MAX_RESPONSE_BYTES = 6_291_456;
const MAX_TOTAL_ENTRIES = 1_000;
const MAX_AGENTIC_MARKET_SERVICES = 200;
const MAX_AGENTIC_MARKET_PAGES = 8;
const MAX_AGENTIC_MARKET_SWEEPS = 2;
const DEFAULT_AGENTIC_MARKET_SWEEPS = 1;
const MAX_TREG_SHELVES = 8;
const MIN_AGENTIC_MARKET_SERVICE_COVERAGE = 0.95;

type SourceFetch = (input: string, init?: RequestInit) => Promise<Response>;

const boundedText = (max: number) => z.string().max(max);
const nullableText = boundedText(2_000).nullable();
const safeCount = z.number().int().nonnegative().safe();
const httpUrl = z.url().max(2_000).refine((value) => {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
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
    l30DaysTotalCalls: z.string().regex(/^\d+$/u).max(80),
    l30DaysUniquePayers: z.string().regex(/^\d+$/u).max(80),
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
  slug: z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,118}[a-z0-9])?$/u),
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
    onEntries?: (
      entries: readonly AgenticMarketRegistrySourceEntry[]
    ) => Promise<void>;
  }> = {},
): Promise<RegistrySourceFetchResult<AgenticMarketRegistrySourceEntry>> {
  const fetchImpl = input.fetch ?? globalThis.fetch;
  const now = input.now ?? Date.now;
  const fetchedAt = now();
  const deadline = fetchedAt + (input.jobTimeoutMs ?? REGISTRY_SOURCE_JOB_TIMEOUT_MS);
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
    Math.max(1, input.maxSweeps ?? DEFAULT_AGENTIC_MARKET_SWEEPS),
  );
  const serviceIds = new Set<string>();
  const entries: AgenticMarketRegistrySourceEntry[] = [];
  let pages = 0;
  let sourceReportedCount = 0;
  let sourceEndpointCount = 0;
  let admittedCount = 0;
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
      if (serviceIds.size >= maxServices) {
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
      // The public catalogue has no snapshot cursor and can grow while a sweep
      // is in progress. Preserve the highest advertised target and continue;
      // a changing total is not itself evidence of an incomplete traversal.
      sourceReportedCount = Math.max(sourceReportedCount, page.total);
      for (const service of page.services) {
        if (serviceIds.has(service.id)) continue;
        serviceIds.add(service.id);
        sourceEndpointCount += service.endpoints.length;
        const admitted = agenticEntries(service, fetchedAt);
        const remaining = maxEntries - admittedCount;
        const bounded = admitted.slice(0, Math.max(0, remaining));
        admittedCount += bounded.length;
        if (input.onEntries === undefined) entries.push(...bounded);
        else {
          for (let offset = 0; offset < bounded.length; offset += 50) {
            await input.onEntries(bounded.slice(offset, offset + 50));
          }
        }
        if (bounded.length !== admitted.length) {
          incompleteReason = "entry_ceiling_reached";
          break;
        }
      }
      if (incompleteReason !== undefined) break;
      rowsThisSweep += page.services.length;
      offset += page.services.length;
      if (page.services.length === 0) {
        incompleteReason = "source_count_mismatch";
        break;
      }
    }
    if (incompleteReason !== undefined || serviceIds.size >= sourceReportedCount) break;
  }
  if (
    incompleteReason === undefined &&
    sourceReportedCount > 0 &&
    serviceIds.size / sourceReportedCount < MIN_AGENTIC_MARKET_SERVICE_COVERAGE
  ) {
    incompleteReason = "source_count_mismatch";
  }
  return {
    source: "agentic_market",
    fetchedAt,
    complete: incompleteReason === undefined,
    ...(incompleteReason === undefined ? {} : { incompleteReason }),
    sourceReportedCount,
    admittedCount,
    excludedCount: sourceEndpointCount - admittedCount,
    fetchedServiceCount: serviceIds.size,
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
): Promise<RegistrySourceFetchResult<TregRegistrySourceEntry>> {
  const fetchImpl = input.fetch ?? globalThis.fetch;
  const now = input.now ?? Date.now;
  const fetchedAt = now();
  const deadline = fetchedAt + (input.jobTimeoutMs ?? REGISTRY_SOURCE_JOB_TIMEOUT_MS);
  const maxEntries = Math.min(
    MAX_TOTAL_ENTRIES,
    Math.max(1, input.maxEntries ?? MAX_TOTAL_ENTRIES),
  );
  const maxShelves = Math.min(
    MAX_TREG_SHELVES,
    Math.max(1, input.maxShelves ?? MAX_TREG_SHELVES),
  );
  const index = tregPlatformIndex.parse(
    await fetchBoundedJson(fetchImpl, TREG_PLATFORMS_URL, input.timeoutMs),
  );
  const entries = new Map<string, TregRegistrySourceEntry>();
  let fetchedShelfCount = 0;
  let observedEndpointCount = 0;
  let incompleteReason: RegistrySourceFetchResult["incompleteReason"];
  const shelves = index.platforms.slice(0, maxShelves);
  if (shelves.length !== index.platforms.length) {
    incompleteReason = "page_ceiling_reached";
  }

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
    observedEndpointCount += endpointPairs.length;
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
    admittedCount: entries.size,
    excludedCount: observedEndpointCount - entries.size,
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
    try {
      return jsonValueSchema.parse(JSON.parse(body.text));
    } catch {
      throw new Error("external_registry_response_invalid_json");
    }
  } finally {
    clearTimeout(timer);
  }
}

function agenticEntries(
  service: z.infer<typeof agenticService>,
  fetchedAt: number,
): AgenticMarketRegistrySourceEntry[] {
  return service.endpoints.flatMap((endpoint) => {
    const method = callableMethod(endpoint.method);
    const exactPrice = exactX402Price(endpoint.pricing);
    const name = cleanRequiredText(endpoint.serviceName || service.name);
    const summary = cleanRequiredText(endpoint.description || service.description);
    const provider = cleanRequiredText(
      endpoint.providerName || service.provider || service.domain,
    );
    const endpointUrl = canonicalHttpUrl(endpoint.url);
    if (
      method === undefined ||
      exactPrice === undefined ||
      name === undefined ||
      summary === undefined ||
      provider === undefined ||
      endpointUrl === undefined
    ) {
      return [];
    }
    const inputContract = inputContractFor(endpoint.parameters, endpointUrl, method);
    if (inputContract === undefined) return [];
    const providerUrl = canonicalHttpUrl(service.providerUrl);
    const upstreamEndpointId = `${method}:${endpointUrl}`;
    const routeIdentity = `${method} ${endpointUrl}`;
    const observedAt = new Date(fetchedAt).toISOString();
    const digestInput = {
      source: "agentic_market",
      serviceId: service.id,
      endpointId: upstreamEndpointId,
      routeIdentity,
      name,
      description: summary,
      provider,
      category: service.category,
      method,
      endpointUrl,
      tags: uniqueBounded([...endpoint.tags, ...service.tags]),
      networks: uniqueBounded(service.networks),
      pricing: exactPrice,
      inputSchemaJson: inputContract.inputSchemaJson,
      probeRequest: inputContract.probeRequest,
      quality: endpoint.quality,
    };
    return [{
      kind: "registry_source_entry",
      source: "agentic_market",
      upstreamServiceId: service.id,
      upstreamEndpointId,
      sourceUrl: `https://agentic.market/services/${encodeURIComponent(service.id)}`,
      ...(providerUrl === undefined ? {} : { providerUrl }),
      endpointUrl,
      routeIdentity,
      name,
      summary,
      provider,
      category: cleanText(service.category, "Uncategorised"),
      method,
      tags: uniqueBounded([...endpoint.tags, ...service.tags]),
      networks: uniqueBounded([exactPrice.network, ...service.networks]),
      exactPrice,
      priceLabel: `${exactPrice.currency} ${exactPrice.amount}`,
      access: "x402",
      credentialRequirements: ["x402_payment"],
      readiness: "source_declared_callable",
      lastObservedAt: observedAt,
      inputSchemaJson: inputContract.inputSchemaJson,
      exampleInvocation: inputContract.exampleInvocation,
      probeRequest: inputContract.probeRequest,
      ...(endpoint.quality?.l30DaysTotalCalls
        ? { sourceCalls30d: endpoint.quality.l30DaysTotalCalls }
        : {}),
      ...(endpoint.quality?.l30DaysUniquePayers
        ? { sourcePayers30d: endpoint.quality.l30DaysUniquePayers }
        : {}),
      authority: "source_metadata_only",
      sourceDigest: canonicalDigest(digestInput),
    }];
  });
}

function tregEntry(
  platform: z.infer<typeof tregPlatform>,
  endpoint: z.infer<typeof tregEndpoint>,
  capability: string | undefined,
): TregRegistrySourceEntry {
  const observed = isRecord(endpoint.observed) ? endpoint.observed : undefined;
  const docsUrl = safeHttpUrl(endpoint.docs_url);
  const endpointUrl = safeHttpUrl(endpoint.path);
  const method = metadataMethod(endpoint.method);
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
    method: method ?? null,
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
    ...(endpointUrl === undefined ? {} : { endpointUrl }),
    ...(docsUrl === undefined ? {} : { docsUrl }),
    ...(endpointUrl === undefined || method === undefined
      ? {}
      : { routeIdentity: `${method} ${endpointUrl}` }),
    name: cleanText(endpoint.name, "Unnamed endpoint"),
    summary: cleanText(endpoint.summary, "No source description."),
    provider: cleanText(
      endpoint.provider_display || endpoint.provider,
      "Unknown provider",
    ),
    category: cleanText(platform.category, "Uncategorised"),
    ...(capability === undefined || capability === "" ? {} : { capability }),
    ...(method === undefined ? {} : { method }),
    tags: uniqueBounded([endpoint.kind, endpoint.domain, endpoint.tier]),
    networks: [],
    ...(declaredPrice === undefined ? {} : { priceLabel: declaredPrice }),
    access: "provider_account",
    ...(endpoint.verified === null || endpoint.verified === ""
      ? {}
      : { sourceCheckedAt: endpoint.verified }),
    ...(medianLatency === undefined
      ? {}
      : { sourceMedianLatencyMs: medianLatency }),
    ...(p95Latency === undefined
      ? {}
      : { sourceP95LatencyMs: p95Latency }),
    ...(sampleSize === undefined ? {} : { sourceSampleSize: sampleSize }),
    authority: "source_metadata_only",
    sourceDigest: canonicalDigest(digestInput),
  };
}

const callableMethods = new Set(["GET", "POST"] as const);
type CallableMethod = "GET" | "POST";

function callableMethod(value: string): CallableMethod | undefined {
  const normalized = value.trim().toUpperCase();
  return callableMethods.has(normalized as CallableMethod)
    ? (normalized as CallableMethod)
    : undefined;
}

const metadataMethods = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
] as const);
type MetadataMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD";

function metadataMethod(value: string): MetadataMethod | undefined {
  const normalized = value.trim().toUpperCase();
  return metadataMethods.has(normalized as MetadataMethod)
    ? (normalized as MetadataMethod)
    : undefined;
}

function canonicalHttpUrl(value: string): string | undefined {
  const parsed = httpUrl.safeParse(value);
  if (!parsed.success) return undefined;
  const url = new URL(parsed.data);
  url.hash = "";
  return url.toString();
}

function exactX402Price(
  pricing: z.infer<typeof agenticPricing>,
): RegistryExactPrice | undefined {
  const amount = pricing.amount.trim();
  const currency = pricing.currency.trim();
  const network = pricing.network.trim();
  if (
    pricing.scheme.trim().toLowerCase() !== "exact" ||
    !/^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(amount) ||
    !/[1-9]/u.test(amount) ||
    currency === "" ||
    network === ""
  ) {
    return undefined;
  }
  return { scheme: "exact", amount, currency, network };
}

function priceLabel(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  if (value.type === "free") return "Free";
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

function cleanRequiredText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length >= 3 ? trimmed : undefined;
}

function inputContractFor(
  parameters: readonly z.infer<typeof agenticParameter>[],
  endpointUrl: string,
  method: CallableMethod,
): Readonly<{
  inputSchemaJson: string;
  exampleInvocation: string;
  probeRequest: RegistryProbeRequest;
}> | undefined {
  const groups: Record<string, Record<string, unknown>> = {};
  const requiredByGroup: Record<string, string[]> = {};
  const url = new URL(endpointUrl);
  const body: Record<string, unknown> = {};
  const headers: Array<readonly [string, string]> = [];

  for (const parameter of parameters) {
    const group = normalizeParameterGroup(parameter.group);
    const name = parameter.name.trim();
    if (group === undefined || name === "" || name.length > 160) return undefined;
    if (group === "headers" && isCredentialHeader(name)) return undefined;
    const example = parameterExample(parameter);
    if (parameter.required && example === undefined) return undefined;
    const schema = parameterSchema(parameter, example);
    (groups[group] ??= {})[name] = schema;
    if (parameter.required) (requiredByGroup[group] ??= []).push(name);
    if (example === undefined) continue;
    if (group === "query") appendQueryValue(url, name, example);
    else if (group === "path" && !replacePathValue(url, name, example)) return undefined;
    else if (group === "body") body[name] = example;
    else if (group === "headers") headers.push([name, scalarInvocationValue(example)]);
  }

  const groupSchemas = Object.fromEntries(
    Object.entries(groups).map(([group, properties]) => [
      group,
      {
        type: "object",
        properties,
        ...(requiredByGroup[group]?.length
          ? { required: requiredByGroup[group] }
          : {}),
        additionalProperties: false,
      },
    ]),
  );
  const inputSchemaJson = JSON.stringify({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    properties: groupSchemas,
    additionalProperties: false,
  });
  if (inputSchemaJson.length > 12_000) return undefined;

  const command = [
    `curl --request ${method}`,
    `--url '${url.toString()}'`,
    ...headers.map(([name, value]) => `--header '${name}: ${value.replaceAll("'", "")}'`),
    ...(Object.keys(body).length === 0
      ? []
      : [
          "--header 'content-type: application/json'",
          `--data '${JSON.stringify(body).replaceAll("'", "")}'`,
        ]),
  ].join(" \\\n  ");
  return {
    inputSchemaJson,
    exampleInvocation: command,
    probeRequest: {
      method,
      url: url.toString(),
      headers: headers.map(([name, value]) => ({ name, value })),
      ...(Object.keys(body).length === 0 ? {} : { bodyJson: JSON.stringify(body) }),
    },
  };
}

function normalizeParameterGroup(value: string): "path" | "query" | "body" | "headers" | undefined {
  const normalized = value.trim().toLowerCase();
  if (normalized === "path" || normalized === "pathparams") return "path";
  if (normalized === "query" || normalized === "queryparams") return "query";
  if (normalized === "body" || normalized === "json") return "body";
  if (normalized === "header" || normalized === "headers") return "headers";
  return undefined;
}

function isCredentialHeader(value: string): boolean {
  return /authorization|api[-_ ]?key|token|secret|credential/iu.test(value);
}

function parameterExample(
  parameter: z.infer<typeof agenticParameter>,
): unknown | undefined {
  const candidates = [parameter.example, parameter.default, parameter.enumValues[0]];
  return candidates.find((candidate) =>
    candidate !== undefined &&
    candidate !== null &&
    JSON.stringify(candidate).length <= 2_000
  );
}

function parameterSchema(
  parameter: z.infer<typeof agenticParameter>,
  example: unknown | undefined,
): Record<string, unknown> {
  const type = parameter.type.trim().toLowerCase();
  const jsonType = type.includes("bool")
    ? "boolean"
    : type.includes("int") || type.includes("number") || type.includes("float")
      ? "number"
      : type.includes("array") || type.includes("list")
        ? "array"
        : type.includes("object") || type.includes("json")
          ? "object"
          : "string";
  return {
    type: jsonType,
    ...(parameter.description.trim() === ""
      ? {}
      : { description: parameter.description.trim() }),
    ...(parameter.enumValues.length === 0 ? {} : { enum: parameter.enumValues }),
    ...(example === undefined ? {} : { examples: [example] }),
  };
}

function appendQueryValue(url: URL, name: string, value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) url.searchParams.append(name, scalarInvocationValue(item));
    return;
  }
  url.searchParams.set(name, scalarInvocationValue(value));
}

function replacePathValue(url: URL, name: string, value: unknown): boolean {
  const encoded = encodeURIComponent(scalarInvocationValue(value));
  const replaced = url.pathname
    .replaceAll(`{${name}}`, encoded)
    .replaceAll(`:${name}`, encoded);
  if (replaced === url.pathname) return false;
  url.pathname = replaced;
  return true;
}

function scalarInvocationValue(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function cleanText(value: string, fallback: string): string {
  const trimmed = value.trim();
  return trimmed === "" ? fallback : trimmed;
}

function uniqueBounded(values: readonly string[]): string[] {
  const unique = new Set<string>();
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed !== "") unique.add(trimmed);
  }
  return [...unique].sort().slice(0, 50);
}
