import { isRecord } from '@/modules/common/is-record'
import type { X402DirectoryEntry } from './x402-directory'

/** Published structure, not a judgment of correctness, usefulness or runtime support. */
export function directoryMetadataFlags(entry: X402DirectoryEntry) {
  const meaningfulExample = (json: string | undefined): boolean => {
    if (json === undefined) return false
    try {
      const value: unknown = JSON.parse(json)
      if (value === null) return false
      if (typeof value === 'string') return value.trim().length > 0
      if (Array.isArray(value)) return value.length > 0
      if (isRecord(value)) return Object.keys(value).length > 0
      return typeof value === 'number' || typeof value === 'boolean'
    } catch { return false }
  }
  return {
    hasInputFields: (entry.input?.fields.length ?? 0) > 0,
    hasOutputFields: (entry.output?.fields.length ?? 0) > 0,
    hasInputSchema: entry.input?.schemaJson !== undefined || entry.input?.schemaOmitted === true,
    hasOutputSchema: entry.output?.schemaJson !== undefined || entry.output?.schemaOmitted === true,
    hasOutputExample: meaningfulExample(entry.output?.exampleJson),
  }
}

/** Coinbase-supplied curation and collection membership retained in the public observation. */
export function directorySourceLabels(source: unknown): { curated?: true; bundleSlugs?: string[] } {
  if (!isRecord(source)) return {}
  const bundleSlugs = Array.isArray(source.bundleSlugs)
    ? [...new Set(source.bundleSlugs.filter((value): value is string => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value) && value.length <= 64))].slice(0, 20)
    : []
  return {
    ...(source.curated === true ? { curated: true as const } : {}),
    ...(bundleSlugs.length === 0 ? {} : { bundleSlugs }),
  }
}
