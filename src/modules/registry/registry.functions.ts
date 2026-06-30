import { callPublicSourceQuery, sourceQuery } from '@/lib/server/convex-source'
import {
  createDefaultRegistrySourceState,
  getPublicBusinessCatalogBySlug,
  listPublicBusinessCatalog,
  searchPublicBusinessCatalog,
} from '@/modules/registry/public'
import type {
  PublicBusinessCatalogApiPage,
  PublicBusinessCatalogDetailResult,
  PublicBusinessCatalogQueryInput,
  PublicBusinessCatalogSearchInput,
} from '@/modules/registry/public'

export type PublicRegistrySourcePort = {
  list: (input: PublicBusinessCatalogQueryInput) => Promise<PublicBusinessCatalogApiPage>
  search: (input: PublicBusinessCatalogSearchInput) => Promise<PublicBusinessCatalogApiPage>
  detail: (input: { slug: string }) => Promise<PublicBusinessCatalogDetailResult>
}

const listPublicBusinessCatalogQuery = sourceQuery<PublicBusinessCatalogQueryInput, PublicBusinessCatalogApiPage>(
  'registry:listPublicBusinessCatalog'
)
const searchPublicBusinessCatalogQuery = sourceQuery<PublicBusinessCatalogSearchInput, PublicBusinessCatalogApiPage>(
  'registry:searchPublicBusinessCatalog'
)
const getPublicBusinessCatalogBySlugQuery = sourceQuery<{ slug: string }, PublicBusinessCatalogDetailResult>(
  'registry:getPublicBusinessCatalogBySlug'
)

let publicRegistrySourcePortForTests: PublicRegistrySourcePort | undefined

export function setPublicRegistrySourcePortForTests(port: PublicRegistrySourcePort): () => void {
  const previous = publicRegistrySourcePortForTests
  publicRegistrySourcePortForTests = port
  return () => {
    publicRegistrySourcePortForTests = previous
  }
}

export async function readPublicRegistryCatalogPage(
  input: PublicBusinessCatalogQueryInput
): Promise<PublicBusinessCatalogApiPage> {
  return getPublicRegistrySourcePort().list(input)
}

export async function readPublicRegistrySearchPage(
  input: PublicBusinessCatalogSearchInput
): Promise<PublicBusinessCatalogApiPage> {
  return getPublicRegistrySourcePort().search(input)
}

export async function readPublicRegistryBusinessDetail(input: {
  slug: string
}): Promise<PublicBusinessCatalogDetailResult> {
  return getPublicRegistrySourcePort().detail(input)
}

export function legacyPublicRegistryList(
  input: PublicBusinessCatalogQueryInput = {}
): PublicBusinessCatalogApiPage {
  return listPublicBusinessCatalog(createDefaultRegistrySourceState(), input)
}

export function legacyPublicRegistrySearch(input: PublicBusinessCatalogSearchInput): PublicBusinessCatalogApiPage {
  return searchPublicBusinessCatalog(createDefaultRegistrySourceState(), input)
}

export function legacyPublicRegistryDetail(input: { slug: string }): PublicBusinessCatalogDetailResult {
  return getPublicBusinessCatalogBySlug(createDefaultRegistrySourceState(), input)
}

function getPublicRegistrySourcePort(): PublicRegistrySourcePort {
  if (publicRegistrySourcePortForTests !== undefined) {
    return publicRegistrySourcePortForTests
  }

  if (usesLocalE2eBypass()) {
    return createLegacyRegistrySourcePort()
  }

  return {
    list: (input) => queryRegistryWithLegacyFallback(() => callPublicSourceQuery(listPublicBusinessCatalogQuery, input), () => legacyPublicRegistryList(input)),
    search: (input) =>
      queryRegistryWithLegacyFallback(() => callPublicSourceQuery(searchPublicBusinessCatalogQuery, input), () =>
        legacyPublicRegistrySearch(input),
      ),
    detail: (input) =>
      queryRegistryWithLegacyFallback(() => callPublicSourceQuery(getPublicBusinessCatalogBySlugQuery, input), () =>
        legacyPublicRegistryDetail(input),
      ),
  }
}

function createLegacyRegistrySourcePort(): PublicRegistrySourcePort {
  return {
    list: (input) => Promise.resolve(legacyPublicRegistryList(input)),
    search: (input) => Promise.resolve(legacyPublicRegistrySearch(input)),
    detail: (input) => Promise.resolve(legacyPublicRegistryDetail(input)),
  }
}

async function queryRegistryWithLegacyFallback<T>(query: () => Promise<T>, fallback: () => T): Promise<T> {
  try {
    return await query()
  } catch {
    if (shouldFallbackToLegacyRegistry()) {
      return fallback()
    }
    throw new Error('registry_query_failed')
  }
}

function shouldFallbackToLegacyRegistry(): boolean {
  return usesLocalE2eBypass() || process.env.NODE_ENV !== 'production'
}

function usesLocalE2eBypass(): boolean {
  return process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E === 'true'
}
