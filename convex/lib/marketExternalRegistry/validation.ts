import type { Doc } from '../../_generated/dataModel'

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
