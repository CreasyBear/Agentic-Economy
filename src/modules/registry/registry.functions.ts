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
    return {
      list: (input) => Promise.resolve(legacyPublicRegistryList(input)),
      search: (input) => Promise.resolve(legacyPublicRegistrySearch(input)),
      detail: (input) => Promise.resolve(legacyPublicRegistryDetail(input)),
    }
  }

  return {
    list: (input) => callPublicSourceQuery(listPublicBusinessCatalogQuery, input),
    search: (input) => callPublicSourceQuery(searchPublicBusinessCatalogQuery, input),
    detail: (input) => callPublicSourceQuery(getPublicBusinessCatalogBySlugQuery, input),
  }
}

function usesLocalE2eBypass(): boolean {
  return process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E === 'true'
}
