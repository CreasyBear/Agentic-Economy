/**
 * Tool-call harness case catalog.
 *
 * Cluster A/B/C capability ids are not product catalog. Cases that ranked those
 * rows are retired with the seed.
 */

export type ToolCallCase = Readonly<{
  id: string
  request: string
  pool: readonly string[]
  expected?: readonly string[]
  expectedSelection?: readonly string[]
  executable: boolean
  input?: Readonly<Record<string, unknown>>
}>

export type CapabilityCatalogEntry = Readonly<{
  capabilityId: string
  name: string
  description: string
  searchTerms: readonly string[]
  domain?: 'crypto' | 'fiat_fx' | 'none'
  executable: boolean
}>

export const CAPABILITY_CATALOG: readonly CapabilityCatalogEntry[] = []

export const CAPABILITY_BY_ID: Record<string, CapabilityCatalogEntry> = Object.fromEntries(
  CAPABILITY_CATALOG.map((entry) => [entry.capabilityId, entry]),
)

export const TOOLCALL_CASES: readonly ToolCallCase[] = []
