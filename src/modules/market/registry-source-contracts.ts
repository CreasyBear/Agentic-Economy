import { canonicalDigest } from "@/modules/common/canonical-digest";

export const registryOrigins = ["agentic_market", "treg"] as const;
export type RegistryOrigin = (typeof registryOrigins)[number];

export type RegistryExactPrice = Readonly<{
  scheme: "exact";
  amount: string;
  currency: string;
  network: string;
}>;

export type RegistryProbeRequest = Readonly<{
  method: "GET" | "POST";
  url: string;
  headers: readonly Readonly<{ name: string; value: string }>[];
  bodyJson?: string;
}>;

type RegistrySourceEntryBase = Readonly<{
  kind: "registry_source_entry";
  upstreamServiceId: string;
  upstreamEndpointId: string;
  sourceUrl: string;
  providerUrl?: string;
  docsUrl?: string;
  name: string;
  summary: string;
  provider: string;
  category: string;
  capability?: string;
  tags: readonly string[];
  networks: readonly string[];
  sourceCheckedAt?: string;
  sourceCalls30d?: string;
  sourcePayers30d?: string;
  sourceMedianLatencyMs?: number;
  sourceP95LatencyMs?: number;
  sourceSampleSize?: number;
  authority: "source_metadata_only";
  sourceDigest: string;
}>;

export type AgenticMarketRegistrySourceEntry = RegistrySourceEntryBase & Readonly<{
      source: "agentic_market";
      endpointUrl: string;
      routeIdentity: string;
      method: "GET" | "POST";
      exactPrice: RegistryExactPrice;
      priceLabel: string;
      access: "x402";
      credentialRequirements: readonly ["x402_payment"];
      readiness: "source_declared_callable";
      lastObservedAt: string;
      lastVerifiedAt?: string;
      inputSchemaJson: string;
      exampleInvocation: string;
      probeRequest: RegistryProbeRequest;
    }>;
export type TregRegistrySourceEntry = RegistrySourceEntryBase & Readonly<{
      source: "treg";
      endpointUrl?: string;
      routeIdentity?: string;
      method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD";
      exactPrice?: RegistryExactPrice;
      priceLabel?: string;
      access: "provider_account";
      credentialRequirements?: never;
      readiness?: never;
      lastObservedAt?: never;
      lastVerifiedAt?: never;
      inputSchemaJson?: never;
      exampleInvocation?: never;
      probeRequest?: never;
    }>;
export type RegistrySourceEntry =
  | AgenticMarketRegistrySourceEntry
  | TregRegistrySourceEntry;

export type RegistrySourceFetchResult<
  Entry extends RegistrySourceEntry = RegistrySourceEntry,
> = Readonly<{
  source: RegistryOrigin;
  fetchedAt: number;
  complete: boolean;
  incompleteReason?:
    | "deadline_reached"
    | "entry_ceiling_reached"
    | "page_ceiling_reached"
    | "source_count_mismatch";
  sourceReportedCount: number;
  admittedCount: number;
  excludedCount: number;
  fetchedServiceCount?: number;
  fetchedShelfCount?: number;
  entries: readonly Entry[];
}>;

export function registryDocumentId(
  entry: Pick<AgenticMarketRegistrySourceEntry, "routeIdentity">,
): string;
export function registryDocumentId(entry: RegistrySourceEntry): string;
export function registryDocumentId(
  entry: RegistrySourceEntry | Pick<AgenticMarketRegistrySourceEntry, "routeIdentity">,
): string {
  const digest = !("source" in entry) || entry.source === "agentic_market"
    ? canonicalDigest({ routeIdentity: entry.routeIdentity })
    : canonicalDigest({
        source: entry.source,
        upstreamServiceId: entry.upstreamServiceId,
        upstreamEndpointId: entry.upstreamEndpointId,
      });
  return `registry:${digest.slice("sha256:".length)}`;
}
