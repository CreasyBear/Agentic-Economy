import { z } from 'zod'

import {
  type CatalogOfferingOperationMapEntry,
} from '@/modules/capability-supply/public'
import {
  readCatalogOfferingOperationMap,
} from '@/modules/capability-supply/operation-source'
import { defineAction } from '@/modules/common/action'
import {
  readPublicOfferingRegistryBusinessDetail,
  readPublicOfferingRegistryPage,
  readPublicOfferingRegistrySearchPage,
} from '@/modules/registry/registry.functions'
import {
  PublicBusinessCatalogApiSchemaVersion,
  PublicServicesApiSchemaVersion,
  type PublicBusinessCatalogApiV2Page,
  type PublicBusinessCatalogQueryInput,
  type PublicBusinessCatalogSearchInput,
  projectPublicServicesPage,
  projectPublicServicesSearchPage,
} from '@/modules/registry/public'

/**
 * Read-only AE actions over the public Offering supply projection.
 *
 * `registry.list`, `registry.search` and `registry.detail` are the machine
 * counterparts to `/api/businesses`, `/api/businesses/search` and
 * `/api/businesses/$slug`. Those routes invoke these actions, so the HTTP
 * response and the registered contract are one code path over one projection.
 * They stay literal: the registry does not typo-correct suburbs or rewrite
 * queries. Misspelling recovery is the caller's job - it chooses better tool
 * arguments.
 *
 * These actions power agent tools and agent JSON action descriptors. They never
 * expose private owner fields, raw DB rows, or booking/payment/dispatch claims.
 */

import {
  detailParameters,
  listParameters,
  registryDetailInputSchema,
  registryDetailOutputSchema,
  registryListInputSchema,
  registryPageOutputSchema,
  registrySearchInputSchema,
  registrySearchPageOutputSchema,
  searchParameters,
  servicesDetailOutputSchema,
  servicesPageOutputSchema,
  servicesSearchPageOutputSchema,
} from './internal/registry-action-contracts'

export const registryListAction = defineAction({
  id: 'registry.list',
  name: 'List published businesses',
  summary:
    'List published Agentic Economy business supply. ' +
    'Returns exactly what /api/businesses returns: that route runs this action.',
  boundaries: [
    'Read-only. Does not book, charge, dispatch, or send inquiries.',
    'Returns only public supply facts for published listings.',
    'Availability, quotes, and job acceptance require a published business contact channel.',
  ],
  schema: registryListInputSchema as z.ZodType<RegistryListActionInput>,
  outputSchema: registryPageOutputSchema,
  parameters: listParameters,
  readOnly: true,
  effect: {
    class: 'observation',
    reversible: true,
    recipientKind: 'none',
    dataClasses: [],
    spendExposure: 'none',
    approval: 'none',
  },
  surfaces: ['http', 'agentJson'],
  invocationContract: {
    version: 'registry.list:v2',
    consequenceClass: 'read_only',
    materialInputPaths: ['cursor', 'limit'],
    authorityRequirement: 'none',
    retryClass: 'replayable',
    expectedEvidence: ['public_registry_list_result'],
    safeContinuations: ['inspect_result'],
    invalidationConditions: ['action_contract_version_changed', 'cursor_changed', 'limit_changed'],
  },
  run: async ({ data }) => readPublicOfferingRegistryPage(
    normalizeRegistryListInput(data),
  ),
})

export const registrySearchAction = defineAction({
  id: 'registry.search',
  name: 'Search listed businesses',
  summary:
    'Search the Agentic Economy catalog for published local service businesses. ' +
    'Returns exactly what /api/businesses/search returns: that route runs this action. ' +
    'Read-only and public-fact-only; always use this before naming providers in an answer.',
  boundaries: [
    'Read-only. Does not book, charge, dispatch, or send inquiries.',
    'Returns only public supply facts: slug, name, category, suburb, trust tier, and each offering\'s summary, service area, availability, price, and published access paths.',
    'An access path is how a person can reach the business, not a bookable slot. An AE-supported offering is still not a booking, payment, or dispatch.',
    'The registry is literal. Misspelled suburbs (e.g. "paramata") do not auto-correct; choose better search arguments instead.',
    'maxPrice filters on the published comparable price using exact currency units and exponent. A business is kept when any one of its offerings fits the budget. An offering quoted on request has no comparable ceiling, so it is never removed by a budget: absence of a price is not evidence of an expensive one.',
    'hasPrice set to true narrows to businesses publishing at least one comparable price. Most local supply quotes on request, so this filter hides real options; use it only when a number is genuinely required.',
    'Availability, quotes, and job acceptance require a published business contact channel.',
  ],
  schema: registrySearchInputSchema,
  outputSchema: registrySearchPageOutputSchema,
  parameters: searchParameters,
  readOnly: true,
  effect: {
    class: 'observation',
    reversible: true,
    recipientKind: 'none',
    dataClasses: [],
    spendExposure: 'none',
    approval: 'none',
  },
  surfaces: ['http', 'agentJson', 'mcp'],
  invocationContract: {
    version: 'registry.search:v2',
    consequenceClass: 'read_only',
    materialInputPaths: ['query', 'limit', 'cursor', 'mode', 'location', 'maxPrice', 'hasPrice'],
    authorityRequirement: 'none',
    retryClass: 'replayable',
    expectedEvidence: ['public_registry_search_result'],
    safeContinuations: ['inspect_result'],
    invalidationConditions: [
      'action_contract_version_changed',
      'query_changed',
      'limit_changed',
      'cursor_changed',
      'mode_changed',
      'location_changed',
      'maxPrice_changed',
      'hasPrice_changed',
    ],
  },
  run: async ({ data, context }) => readPublicOfferingRegistrySearchPage(
    normalizeRegistrySearchInput(data),
    { ...(context.timing === undefined ? {} : { timing: context.timing }) },
  ),
})

export const registryServicesListAction = defineAction({
  id: 'registry.services_list',
  name: 'List published business portfolios',
  summary:
    'List one public portfolio for each published business, including its offerings and external endpoint links. ' +
    'This is a read-only projection of the same public business catalog used by /api/businesses; it does not return Agent Services.',
  boundaries: [
    'Read-only. Does not book, charge, dispatch, or send inquiries.',
    'Returns one published business portfolio per business; offering facts remain under ae.offerings[].',
  ],
  schema: registryListInputSchema as z.ZodType<RegistryListActionInput>,
  outputSchema: servicesPageOutputSchema,
  parameters: listParameters,
  readOnly: true,
  effect: {
    class: 'observation',
    reversible: true,
    recipientKind: 'none',
    dataClasses: [],
    spendExposure: 'none',
    approval: 'none',
  },
  surfaces: ['http', 'agentJson', 'mcp'],
  invocationContract: {
    version: 'registry.services_list:v1',
    consequenceClass: 'read_only',
    materialInputPaths: ['cursor', 'limit'],
    authorityRequirement: 'none',
    retryClass: 'replayable',
    expectedEvidence: ['public_services_list_result'],
    safeContinuations: ['inspect_result'],
    invalidationConditions: ['action_contract_version_changed', 'cursor_changed', 'limit_changed'],
  },
  run: async ({ data }) => {
    const page = await readPublicOfferingRegistryPage(
      normalizeRegistryListInput(data),
    )
    return projectPublicServicesPage(page, await offeringOperationMapFor(page.page.map((item) => item.businessId)))
  },
})

export const registryServicesSearchAction = defineAction({
  id: 'registry.services_search',
  name: 'Search published business portfolios',
  summary:
    'Search the public business catalog and return each matching business with its offering portfolio and external endpoint links. ' +
    'This is the same public business supply used by /api/businesses/search; it does not search Agent Services or select a Market Operation.',
  boundaries: [
    'Read-only. Does not book, charge, dispatch, or send inquiries.',
    'Returns one published business portfolio per business; offering facts remain under ae.offerings[].',
  ],
  schema: registrySearchInputSchema,
  outputSchema: servicesSearchPageOutputSchema,
  parameters: searchParameters,
  readOnly: true,
  effect: {
    class: 'observation',
    reversible: true,
    recipientKind: 'none',
    dataClasses: [],
    spendExposure: 'none',
    approval: 'none',
  },
  surfaces: ['http', 'agentJson', 'mcp'],
  invocationContract: {
    version: 'registry.services_search:v1',
    consequenceClass: 'read_only',
    materialInputPaths: ['query', 'limit', 'cursor', 'mode', 'location', 'maxPrice', 'hasPrice'],
    authorityRequirement: 'none',
    retryClass: 'replayable',
    expectedEvidence: ['public_services_search_result'],
    safeContinuations: ['inspect_result'],
    invalidationConditions: [
      'action_contract_version_changed',
      'query_changed',
      'limit_changed',
      'cursor_changed',
      'mode_changed',
      'location_changed',
      'maxPrice_changed',
      'hasPrice_changed',
    ],
  },
  run: async ({ data, context }) => {
    const page = await readPublicOfferingRegistrySearchPage(
      normalizeRegistrySearchInput(data),
      { ...(context.timing === undefined ? {} : { timing: context.timing }) },
    )
    const services = projectPublicServicesSearchPage(
      page,
      await offeringOperationMapFor(page.items.map((item) => item.businessId)),
    )
    // Echo the caller's query verbatim; the search pipeline normalizes internally.
    return { ...services, query: data.query }
  },
})
export const registryServicesDetailAction = defineAction({
  id: 'registry.services_detail',
  name: 'Read a published business portfolio',
  summary:
    'Read one published business portfolio by business slug. ' +
    'The detail response is the same portfolio projection returned by the list and search routes, not an Agent Service.',
  boundaries: [
    'Read-only. Does not book, charge, dispatch, or send inquiries.',
    'Returns only the public business portfolio for the requested business slug.',
    'A not_found result means no public business exists for that slug; do not invent Provider details.',
  ],
  schema: registryDetailInputSchema,
  outputSchema: servicesDetailOutputSchema,
  parameters: detailParameters,
  readOnly: true,
  effect: {
    class: 'observation',
    reversible: true,
    recipientKind: 'none',
    dataClasses: [],
    spendExposure: 'none',
    approval: 'none',
  },
  surfaces: ['http', 'agentJson'],
  invocationContract: {
    version: 'registry.services_detail:v1',
    consequenceClass: 'read_only',
    materialInputPaths: ['slug'],
    authorityRequirement: 'none',
    retryClass: 'replayable',
    expectedEvidence: ['public_services_detail_result'],
    safeContinuations: ['inspect_result'],
    invalidationConditions: ['action_contract_version_changed', 'slug_changed'],
  },
  run: async ({ data }) => {
    const detail = await readPublicOfferingRegistryBusinessDetail({ slug: data.slug.trim() })
    if (detail.kind === 'not_found') {
      return {
        kind: 'not_found' as const,
        code: 'service_not_found' as const,
        reason: detail.reason,
      }
    }
    const page: PublicBusinessCatalogApiV2Page = {
      kind: 'ok',
      schemaVersion: PublicBusinessCatalogApiSchemaVersion,
      page: [detail.business],
      isDone: true,
      continueCursor: '',
    }
    const service = projectPublicServicesPage(
      page,
      await offeringOperationMapFor([detail.business.businessId]),
    ).services[0]
    if (service === undefined) {
      return {
        kind: 'not_found' as const,
        code: 'service_not_found' as const,
        reason: `Service ${data.slug.trim()} is not publicly available.`,
      }
    }
    return {
      kind: 'found' as const,
      schemaVersion: PublicServicesApiSchemaVersion,
      service,
    }
  },
})

type RegistryListActionInput = {
  cursor?: string | undefined
  limit?: number | undefined
}

type RegistryReadInput = RegistryListActionInput & {
  query?: string | undefined
  mode?: PublicBusinessCatalogSearchInput['mode'] | undefined
  location?: string | undefined
  maxPrice?: PublicBusinessCatalogSearchInput['maxPrice'] | undefined
  hasPrice?: boolean | undefined
}

function normalizeRegistryListInput(
  data: RegistryListActionInput,
): PublicBusinessCatalogQueryInput {
  return {
    paginationOpts: {
      numItems: normalizeActionLimit(data.limit),
      cursor: data.cursor?.trim() ?? null,
    },
  }
}

function normalizeRegistrySearchInput(
  data: RegistryReadInput & { query: string },
): PublicBusinessCatalogSearchInput {
  return {
    query: data.query.trim(),
    ...(data.cursor === undefined ? {} : { cursor: data.cursor.trim() }),
    ...(data.limit === undefined ? {} : { limit: data.limit }),
    ...(data.mode === undefined ? {} : { mode: data.mode }),
    ...(data.location === undefined ? {} : { location: data.location.trim() }),
    ...(data.maxPrice === undefined ? {} : { maxPrice: data.maxPrice }),
    ...(data.hasPrice === undefined ? {} : { hasPrice: data.hasPrice }),
  }
}

function normalizeActionLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return 20
  return Math.min(Math.max(Math.trunc(limit), 1), 50)
}

/**
 * W1 origin seam: fetch the per-offering admitted-operation map for the page's
 * businesses as plain data from the capability-supply source port. Any read
 * failure (e.g. capability supply unavailable / local registry fixture path)
 * degrades to an empty map — the projection simply leaves unlinked endpoints
 * un-enriched rather than throwing or fabricating.
 */
async function offeringOperationMapFor(
  businessIds: readonly string[],
): Promise<Readonly<Record<string, readonly CatalogOfferingOperationMapEntry[]>>> {
  if (businessIds.length === 0) return {}
  try {
    const entries = await readCatalogOfferingOperationMap(businessIds)
    const map: Record<string, CatalogOfferingOperationMapEntry[]> = {}
    for (const entry of entries) {
      const current = map[entry.offeringRef]
      if (current === undefined) map[entry.offeringRef] = [entry]
      else current.push(entry)
    }
    return map
  } catch {
    return {}
  }
}

export const registryDetailAction = defineAction({
  id: 'registry.detail',
  name: 'Read a listed business',
  summary:
    'Read one published business supply record by slug. ' +
    'Returns exactly what /api/businesses/$slug returns: that route runs this action. ' +
    'A missing slug returns a not_found result.',
  boundaries: [
    'Read-only. Does not book, charge, dispatch, or send inquiries.',
    'Returns only public supply facts for the requested slug.',
    'A not_found result means no public listing exists for that slug; do not invent provider details.',
  ],
  schema: registryDetailInputSchema,
  outputSchema: registryDetailOutputSchema,
  parameters: detailParameters,
  readOnly: true,
  effect: {
    class: 'observation',
    reversible: true,
    recipientKind: 'none',
    dataClasses: [],
    spendExposure: 'none',
    approval: 'none',
  },
  surfaces: ['http', 'agentJson', 'mcp'],
  invocationContract: {
    version: 'registry.detail:v2',
    consequenceClass: 'read_only',
    materialInputPaths: ['slug'],
    authorityRequirement: 'none',
    retryClass: 'replayable',
    expectedEvidence: ['public_registry_detail_result'],
    safeContinuations: ['inspect_result'],
    invalidationConditions: ['action_contract_version_changed', 'slug_changed'],
  },
  run: async ({ data, context }) => {
    if (context.developmentOnlyRegistryDetailAdapter !== undefined) {
      return registryDetailOutputSchema.parse(
        await context.developmentOnlyRegistryDetailAdapter({ slug: data.slug.trim() }),
      )
    }
    return readPublicOfferingRegistryBusinessDetail({ slug: data.slug.trim() })
  },
})
export {
  registryOperationsSearchAction,
  registryOperationsDetailAction,
  registryOperationsCompareAction,
  registryOperationsInspectPlanAction,
} from './operations.actions'
