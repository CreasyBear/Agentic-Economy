export const registryOrigins = ["agentic_market", "treg"] as const;
export type RegistryOrigin = (typeof registryOrigins)[number];

export type RegistryExactPrice = Readonly<{
  scheme: "exact";
  amount: string;
  currency: string;
  network: string;
}>;

export type RegistrySourceEntry = Readonly<{
  kind: "registry_source_entry";
  source: RegistryOrigin;
  upstreamServiceId: string;
  upstreamEndpointId: string;
  sourceUrl: string;
  providerUrl?: string;
  endpointUrl: string;
  docsUrl?: string;
  routeIdentity: string;
  name: string;
  summary: string;
  provider: string;
  category: string;
  capability?: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD";
  tags: readonly string[];
  networks: readonly string[];
  exactPrice: RegistryExactPrice;
  priceLabel: string;
  access: "x402";
  credentialRequirements: readonly ["x402_payment"];
  readiness: "source_declared_callable";
  lastObservedAt: string;
  lastVerifiedAt?: string;
  inputSchemaJson: string;
  exampleInvocation: string;
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
  admittedCount: number;
  excludedCount: number;
  fetchedServiceCount?: number;
  fetchedShelfCount?: number;
  entries: readonly RegistrySourceEntry[];
}>;

export function registryDocumentId(
  entry: Pick<RegistrySourceEntry, "routeIdentity">,
): string {
  const digest = canonicalDigest({ routeIdentity: entry.routeIdentity });
  return `registry:${digest.slice("sha256:".length)}`;
}
import { canonicalDigest } from "@/modules/common/canonical-digest";
