import type { Doc } from '../../_generated/dataModel'

export function publicEntry(row: Doc<"marketExternalRegistryEntries">) {
  return {
    documentId: row.documentId,
    sourceUrl: row.sourceUrl,
    ...(row.endpointUrl === undefined ? {} : { endpointUrl: row.endpointUrl }),
    name: row.name,
    summary: row.summary,
    provider: row.provider,
    category: row.category,
    ...(row.method === undefined ? {} : { method: row.method }),
    tags: row.tags,
    networks: row.networks,
    access: row.access,
    authority: "registry_metadata_only" as const,
  };
}
