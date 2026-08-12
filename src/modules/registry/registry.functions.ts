import { callPublicSourceQuery, sourceQuery } from '@/lib/server/convex-source'
import type { ActionTimingSink } from '@/modules/common/action'
import { recordSearchGaps } from '@/modules/demand/demand.functions'
import { toSearchGapCandidateV2, type SearchGapSurface } from '@/modules/demand/public'
import type {
  PublicBusinessCatalogQueryInput,
  PublicBusinessCatalogSearchInput,
  PublicBusinessCatalogApiV2Page,
  PublicBusinessCatalogApiV2SearchPage,
  PublicBusinessCatalogV2DetailResult,
  PublishedInquiryTargetResolution,
} from '@/modules/registry/public'

export type PublicRegistrySourcePort = {
  list: (input: PublicBusinessCatalogQueryInput) => Promise<PublicBusinessCatalogApiV2Page>
  search: (input: PublicBusinessCatalogSearchInput) => Promise<PublicBusinessCatalogApiV2SearchPage>
  detail: (input: { slug: string }) => Promise<PublicBusinessCatalogV2DetailResult>
  resolveInquiryTarget: (input: {
    businessSlug: string
    offeringRef: string
  }) => Promise<PublishedInquiryTargetResolution>
}

export type PublicRegistryReadOptions = {
  timing?: ActionTimingSink
  surface?: SearchGapSurface
}

const listPublicBusinessOfferingSupplyQuery = sourceQuery<PublicBusinessCatalogQueryInput, PublicBusinessCatalogApiV2Page>(
  'registry:listPublicBusinessOfferingSupply'
)
const searchPublicBusinessOfferingSupplyQuery = sourceQuery<PublicBusinessCatalogSearchInput, PublicBusinessCatalogApiV2SearchPage>(
  'registry:searchPublicBusinessOfferingSupply'
)
const getPublicBusinessOfferingSupplyBySlugQuery = sourceQuery<{ slug: string }, PublicBusinessCatalogV2DetailResult>(
  'registry:getPublicBusinessOfferingSupplyBySlug'
)
const resolvePublishedInquiryTargetQuery = sourceQuery<
  { businessSlug: string; offeringRef: string },
  PublishedInquiryTargetResolution
>('registry:resolvePublishedInquiryTargetBySlug')

let publicRegistrySourcePortForTests: PublicRegistrySourcePort | undefined

export function setPublicRegistrySourcePortForTests(port: PublicRegistrySourcePort | undefined): () => void {
  const previous = publicRegistrySourcePortForTests
  publicRegistrySourcePortForTests = port
  return () => {
    publicRegistrySourcePortForTests = previous
  }
}


export async function readPublicOfferingRegistryPage(
  input: PublicBusinessCatalogQueryInput,
): Promise<PublicBusinessCatalogApiV2Page> {
  if (publicRegistrySourcePortForTests !== undefined) {
    return getPublicRegistrySourcePort().list(input)
  }
  return callPublicSourceQuery(listPublicBusinessOfferingSupplyQuery, input)
}

export async function readPublicOfferingRegistrySearchPage(
  input: PublicBusinessCatalogSearchInput,
  options: PublicRegistryReadOptions = {},
): Promise<PublicBusinessCatalogApiV2SearchPage> {
  const page = await readOfferingSearchPageUninstrumented(input, options)
  if (options.surface !== undefined && input.cursor === undefined) {
    await recordSearchGaps({
      queryText: input.query,
      surface: options.surface,
      candidates: page.items.map(toSearchGapCandidateV2),
    })
  }
  return page
}

async function readOfferingSearchPageUninstrumented(
  input: PublicBusinessCatalogSearchInput,
  options: PublicRegistryReadOptions,
): Promise<PublicBusinessCatalogApiV2SearchPage> {
  return withTiming(options.timing, 'registry.search.convex', { backend: 'convex' }, () =>
    readOfferingSearchPageFromSource(input))
}

function readOfferingSearchPageFromSource(
  input: PublicBusinessCatalogSearchInput,
): Promise<PublicBusinessCatalogApiV2SearchPage> {
  if (publicRegistrySourcePortForTests !== undefined) {
    return getPublicRegistrySourcePort().search(input)
  }
  return callPublicSourceQuery(searchPublicBusinessOfferingSupplyQuery, input)
}


export async function readPublicOfferingRegistryBusinessDetail(
  input: { slug: string },
): Promise<PublicBusinessCatalogV2DetailResult> {
  if (publicRegistrySourcePortForTests !== undefined) {
    return getPublicRegistrySourcePort().detail(input)
  }
  return callPublicSourceQuery(getPublicBusinessOfferingSupplyBySlugQuery, input)
}

export async function resolvePublicRegistryInquiryTarget(input: {
  businessSlug: string
  offeringRef: string
}): Promise<PublishedInquiryTargetResolution> {
  return getPublicRegistrySourcePort().resolveInquiryTarget(input)
}

function getPublicRegistrySourcePort(): PublicRegistrySourcePort {
  if (publicRegistrySourcePortForTests !== undefined) {
    return publicRegistrySourcePortForTests
  }
  return {
    list: (input) => callPublicSourceQuery(listPublicBusinessOfferingSupplyQuery, input),
    search: (input) => callPublicSourceQuery(searchPublicBusinessOfferingSupplyQuery, input),
    detail: (input) => callPublicSourceQuery(getPublicBusinessOfferingSupplyBySlugQuery, input),
    resolveInquiryTarget: (input) => callPublicSourceQuery(resolvePublishedInquiryTargetQuery, input),
  }
}

async function withTiming<T>(
  timing: ActionTimingSink | undefined,
  name: string,
  metadata: Record<string, string | number | boolean | null>,
  run: () => Promise<T>,
): Promise<T> {
  if (timing === undefined) {
    return run()
  }

  const started = Date.now()
  try {
    return await run()
  } finally {
    timing.record(name, Date.now() - started, metadata)
  }
}
