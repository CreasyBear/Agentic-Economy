import { internal } from '../../_generated/api'
import type { Doc } from '../../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../../_generated/server'

const MAX_ENTRY_BYTES = 32_768
const encoder = new TextEncoder()
const everyFact = (facts: readonly boolean[]): boolean => facts.every(Boolean)

export function publicEntry(row: Doc<"marketExternalRegistryEntries">) {
  return {
    documentId: row.documentId,
    sourceUrl: row.sourceUrl,
    ...(row.providerUrl === undefined ? {} : { providerUrl: row.providerUrl }),
    ...(row.endpointUrl === undefined ? {} : { endpointUrl: row.endpointUrl }),
    ...(row.docsUrl === undefined ? {} : { docsUrl: row.docsUrl }),
    ...(row.routeIdentity === undefined
      ? {}
      : { routeIdentity: row.routeIdentity }),
    name: row.name,
    summary: row.summary,
    provider: row.provider,
    category: row.category,
    ...(row.capability === undefined ? {} : { capability: row.capability }),
    ...(row.method === undefined ? {} : { method: row.method }),
    tags: row.tags,
    networks: row.networks,
    ...(row.priceLabel === undefined ? {} : { priceLabel: row.priceLabel }),
    ...(row.exactPrice === undefined ? {} : { exactPrice: row.exactPrice }),
    access: row.access,
    ...(row.credentialRequirements === undefined
      ? {}
      : { credentialRequirements: row.credentialRequirements }),
    ...(row.readiness === undefined ? {} : { readiness: row.readiness }),
    ...(row.lastObservedAt === undefined
      ? {}
      : { lastObservedAt: row.lastObservedAt }),
    ...(row.lastVerifiedAt === undefined
      ? {}
      : { lastVerifiedAt: row.lastVerifiedAt }),
    ...(row.inputSchemaJson === undefined
      ? {}
      : { inputSchemaJson: row.inputSchemaJson }),
    ...(row.exampleInvocation === undefined
      ? {}
      : { exampleInvocation: row.exampleInvocation }),
    ...(row.sourceCheckedAt === undefined ? {} : { sourceCheckedAt: row.sourceCheckedAt }),
    ...(row.sourceCalls30d === undefined ? {} : { sourceCalls30d: row.sourceCalls30d }),
    ...(row.sourcePayers30d === undefined ? {} : { sourcePayers30d: row.sourcePayers30d }),
    ...(row.sourceMedianLatencyMs === undefined ? {} : { sourceMedianLatencyMs: row.sourceMedianLatencyMs }),
    ...(row.sourceP95LatencyMs === undefined ? {} : { sourceP95LatencyMs: row.sourceP95LatencyMs }),
    ...(row.sourceSampleSize === undefined ? {} : { sourceSampleSize: row.sourceSampleSize }),
    authority: "registry_metadata_only" as const,
  };
}

export async function registryState(ctx: QueryCtx | MutationCtx) {
  return await ctx.db
    .query("marketExternalRegistryState")
    .withIndex("by_key", (index) => index.eq("key", "registry"))
    .unique();
}

export async function scheduleGenerationCleanup(
  ctx: MutationCtx,
  generation: string,
): Promise<void> {
  await ctx.scheduler.runAfter(
    0,
    internal.marketExternalRegistry.deleteGenerationBatch,
    { generation },
  );
}

export function validEntry(entry: {
  documentId: string;
  source: "agentic_market" | "treg";
  sourceDigest: string;
  endpointUrl?: string;
  routeIdentity?: string;
  method?: string;
  exactPrice?: { scheme: "exact"; amount: string; currency: string; network: string };
  access: "x402" | "provider_account" | "unknown";
  credentialRequirements?: string[];
  readiness?: "source_declared_callable";
  lastObservedAt?: string;
  inputSchemaJson?: string;
  exampleInvocation?: string;
  probeRequest?: {
    method: "GET" | "POST";
    url: string;
    headers: { name: string; value: string }[];
    bodyJson?: string;
  };
  quality?: "callable";
  tags: string[];
  networks: string[];
  searchText: string;
}): boolean {
  const serialized = JSON.stringify(entry);
  const commonValid = everyFact([
    /^registry:[0-9a-f]{64}$/u.test(entry.documentId),
    /^sha256:[0-9a-f]{64}$/u.test(entry.sourceDigest),
    entry.tags.length <= 50,
    entry.networks.length <= 40,
    entry.searchText.length <= 8_000,
    encoder.encode(serialized).byteLength <= MAX_ENTRY_BYTES,
  ]);
  if (!commonValid) return false;
  if (entry.source === "treg") {
    return everyFact([
      entry.access === "provider_account",
      entry.probeRequest === undefined,
    ]);
  }
  const exactPrice = entry.exactPrice;
  const probe = entry.probeRequest;
  if (exactPrice === undefined || probe === undefined) return false;
  const bodyIsValid = probe.bodyJson === undefined
    ? true
    : everyFact([probe.bodyJson.length <= 16_000, validJsonObject(probe.bodyJson)]);
  return everyFact([
    validHttpUrl(entry.endpointUrl),
    entry.routeIdentity === `${entry.method} ${entry.endpointUrl}`,
    /^(?:GET|POST)$/u.test(entry.method ?? ""),
    exactPrice.scheme === "exact",
    /^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(exactPrice.amount),
    /[1-9]/u.test(exactPrice.amount),
    exactPrice.currency.length > 0,
    exactPrice.network.length > 0,
    entry.access === "x402",
    entry.credentialRequirements?.length === 1,
    entry.credentialRequirements?.[0] === "x402_payment",
    entry.readiness === "source_declared_callable",
    entry.lastObservedAt !== undefined,
    Number.isFinite(Date.parse(entry.lastObservedAt ?? "")),
    entry.inputSchemaJson !== undefined,
    validJsonSchemaDocument(entry.inputSchemaJson ?? ""),
    entry.exampleInvocation !== undefined,
    (entry.exampleInvocation?.length ?? 0) > 0,
    (entry.exampleInvocation?.length ?? 0) <= 16_000,
    probe.method === entry.method,
    validSameOriginProbeUrl(entry.endpointUrl, probe.url),
    probe.headers.length <= 32,
    probe.headers.every(({ name, value }) =>
      everyFact([/^[!#$%&'*+\-.^_`|~0-9A-Za-z]{1,100}$/u.test(name), value.length <= 2_000])
    ),
    bodyIsValid,
    entry.quality === "callable",
  ]);
}

export function validJsonObject(value: string): boolean {
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

export function validHttpUrl(value: string | undefined): boolean {
  if (value === undefined) return false;
  try {
    const protocol = new URL(value).protocol;
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

export function validSameOriginProbeUrl(
  endpointValue: string | undefined,
  probeValue: string,
): boolean {
  if (
    endpointValue === undefined ||
    !validHttpUrl(endpointValue) ||
    !validHttpUrl(probeValue)
  ) {
    return false;
  }
  try {
    const endpoint = new URL(endpointValue);
    const probe = new URL(probeValue);
    return (
      endpoint.username === "" &&
      endpoint.password === "" &&
      probe.username === "" &&
      probe.password === "" &&
      endpoint.origin === probe.origin
    );
  } catch {
    return false;
  }
}

export function validJsonSchemaDocument(value: string): boolean {
  if (value.length < 2 || value.length > 12_000) return false;
  try {
    const parsed = JSON.parse(value) as unknown;
    return (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed) &&
      "type" in parsed &&
      parsed.type === "object"
    );
  } catch {
    return false;
  }
}

export function validCoverage(args: {
  expectedEntries: number;
  agenticMarketReported: number;
  agenticMarketFetched: number;
  tregReported?: number;
  tregFetched?: number;
}): boolean {
  return [
    args.expectedEntries,
    args.agenticMarketReported,
    args.agenticMarketFetched,
    args.tregReported,
    args.tregFetched,
  ].filter((value): value is number => value !== undefined).every(
    (value) => Number.isSafeInteger(value) && value >= 0,
  );
}

export function assertGeneration(value: string): void {
  if (value.length < 1 || value.length > 200) {
    throw new Error("external_registry_generation_invalid");
  }
}
