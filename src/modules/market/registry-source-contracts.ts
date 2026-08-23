export const registryOrigins = ["agentic_market", "treg"] as const;
export type RegistryOrigin = (typeof registryOrigins)[number];

export type RegistrySourceEntry = Readonly<{
  kind: "registry_source_entry";
  source: RegistryOrigin;
  upstreamServiceId: string;
  upstreamEndpointId: string;
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
  authority: "source_metadata_only";
  sourceDigest: string;
}>;

export type RegistrySourceFetchResult = Readonly<{
  source: RegistryOrigin;
  fetchedAt: number;
  complete: boolean;
  incompleteReason?:
    | "deadline_reached"
    | "entry_ceiling_reached"
    | "page_ceiling_reached"
    | "source_count_mismatch";
  sourceReportedCount: number;
  fetchedServiceCount?: number;
  fetchedShelfCount?: number;
  entries: readonly RegistrySourceEntry[];
}>;

export function registryDocumentId(
  entry: Pick<
    RegistrySourceEntry,
    "source" | "upstreamServiceId" | "upstreamEndpointId"
  >,
): string {
  const digest = canonicalDigest({
    source: entry.source,
    upstreamServiceId: entry.upstreamServiceId,
    upstreamEndpointId: entry.upstreamEndpointId,
  });
  return `registry:${digest.slice("sha256:".length)}`;
}
import { canonicalDigest } from "@/modules/common/canonical-digest";
