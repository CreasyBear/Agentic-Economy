import { callPublicSourceQuery, sourceQuery } from '@/lib/server/convex-source'
import { LOCAL_E2E_BUSINESS_FIXTURES } from '@/lib/dev/local-e2e-business-fixtures'
import { isLocalE2EAuthBypassEnabled } from '@/lib/server/local-e2e-bypass'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import type { DiscoveryManifestContract } from '@/modules/discovery/public'
import type {
  PublicBusinessCatalogApiV2Dto,
  PublicBusinessCatalogApiV2Page,
  PublicBusinessCatalogApiV2SearchPage,
  PublicBusinessCatalogV2DetailResult,
  PublicOfferingAccessPathDto,
  PublicOfferingDto,
} from '@/modules/registry/public'

/** `inquiries:readPublicCatalogInquiryAvailability` refuses more than this per read. */
const MaxInquiryAvailabilityTargetsPerRead = 100


type InquiryAvailabilityTarget = {
  businessSlug: string
  offeringRef: string
}

type InquiryAvailability = InquiryAvailabilityTarget & { admitted: boolean }

type ProjectionDependencies = {
  readAvailability: (targets: readonly InquiryAvailabilityTarget[]) => Promise<readonly InquiryAvailability[]>
}

const readPublicCatalogInquiryAvailabilityQuery = sourceQuery<
  { targets: readonly InquiryAvailabilityTarget[] },
  readonly InquiryAvailability[]
>('inquiries:readPublicCatalogInquiryAvailability')

/**
 * Local development has no Convex admission source. Reading `[]` there means
 * "nothing is admitted", which silently withheld the inquiry path from every
 * local surface — including the one fixture that exists precisely to model an
 * admitted business. Resolve admission from the fixture set instead, so local
 * behavior matches the fact the fixture declares.
 */
const defaultDependencies: ProjectionDependencies = {
  readAvailability: async (targets) => {
    if (isLocalE2EAuthBypassEnabled()) {
      return targets.map((target) => ({
        ...target,
        admitted: LOCAL_E2E_BUSINESS_FIXTURES.some((fixture) =>
          fixture.requestedSlug === target.businessSlug
          && fixture.inquiryAdmission === 'admitted'),
      }))
    }
    try {
      return await callPublicSourceQuery(readPublicCatalogInquiryAvailabilityQuery, { targets })
    } catch {
      return []
    }
  },
}


export async function projectCurrentDiscoveryInquiryAvailability(
  manifest: DiscoveryManifestContract,
  dependencies: ProjectionDependencies = defaultDependencies,
): Promise<DiscoveryManifestContract> {
  const targets = inquiryTargetsForOfferings(manifest.slug, manifest.offerings)
  if (targets.length === 0) return manifest
  const admitted = await readAdmittedKeys(dependencies, targets)
  const offerings = projectOfferingInquiryOfferings(manifest.slug, manifest.offerings, admitted)
  const unchanged = offerings.length === manifest.offerings.length && offerings.every(
    (offering, index) => offering === manifest.offerings[index],
  )
  if (unchanged) return manifest
  return rebindDiscoveryManifest(manifest, offerings)
}

function availabilityKey(target: InquiryAvailabilityTarget): string {
  return `${target.businessSlug}\u0000${target.offeringRef}`
}



function inquiryTargetsForOfferings(
  businessSlug: string,
  offerings: readonly PublicOfferingDto[],
): InquiryAvailabilityTarget[] {
  const targets: InquiryAvailabilityTarget[] = []
  const seen = new Set<string>()
  for (const offering of offerings) {
    if (!offering.accessPaths.some(isAeInquiryAccessPath)) continue
    const target = { businessSlug, offeringRef: offering.offeringRef }
    const key = availabilityKey(target)
    if (seen.has(key)) continue
    seen.add(key)
    targets.push(target)
  }
  return targets
}

function isAeInquiryAccessPath(
  path: PublicOfferingAccessPathDto,
): path is Extract<PublicOfferingAccessPathDto, { kind: 'human_request'; channel: 'ae_inquiry' }> {
  return path.kind === 'human_request' && path.channel === 'ae_inquiry'
}

function rebindDiscoveryManifest(
  manifest: DiscoveryManifestContract,
  offerings: DiscoveryManifestContract['offerings'],
): DiscoveryManifestContract {
  const {
    bodyHash: _bodyHash,
    generatedHash: _generatedHash,
    generatedAt,
    urlHash: _urlHash,
    ...currentBody
  } = manifest
  const body = { ...currentBody, offerings }
  const bodyHash = canonicalDigest(body as StableHashValue)
  const urlHash = canonicalDigest({ urls: manifest.routes.map(({ url }) => url) })
  const generatedHash = canonicalDigest({
    bodyHash,
    ...(manifest.sourceHash === undefined ? {} : { sourceHash: manifest.sourceHash }),
    sourceVersion: manifest.sourceVersion,
    urlHash,
  })
  return { ...body, generatedHash, bodyHash, urlHash, generatedAt }
}

/**
 * Offering-supply (v2) counterpart of the discovery-manifest projection.
 *
 * An `ae_inquiry` access path is the public claim that AE will carry a first
 * contact for that offering. Admission is a current source fact, so the claim
 * is re-checked on every read and the path is dropped when the source will not
 * accept an inquiry. Phone, website and external-operation paths are the
 * business's own reachability and are never touched here.
 */
export async function projectCurrentOfferingInquiryAvailability(
  business: PublicBusinessCatalogApiV2Dto,
  dependencies: ProjectionDependencies = defaultDependencies,
): Promise<PublicBusinessCatalogApiV2Dto> {
  const targets = inquiryTargetsForOfferings(business.slug, business.offerings)
  if (targets.length === 0) return business
  return applyOfferingInquiryAdmission(business, await readAdmittedKeys(dependencies, targets))
}

export function projectCurrentOfferingInquiryPage(
  page: PublicBusinessCatalogApiV2Page,
  dependencies?: ProjectionDependencies,
): Promise<PublicBusinessCatalogApiV2Page>
export function projectCurrentOfferingInquiryPage(
  page: PublicBusinessCatalogApiV2SearchPage,
  dependencies?: ProjectionDependencies,
): Promise<PublicBusinessCatalogApiV2SearchPage>
export async function projectCurrentOfferingInquiryPage(
  page: PublicBusinessCatalogApiV2Page | PublicBusinessCatalogApiV2SearchPage,
  dependencies: ProjectionDependencies = defaultDependencies,
): Promise<PublicBusinessCatalogApiV2Page | PublicBusinessCatalogApiV2SearchPage> {
  const items = 'page' in page ? page.page : page.items
  const targets = items.flatMap((business) => inquiryTargetsForOfferings(business.slug, business.offerings))
  if (targets.length === 0) return page
  const admitted = await readAdmittedKeys(dependencies, targets)
  const projectedItems = items.map((business) => applyOfferingInquiryAdmission(business, admitted))
  return 'page' in page
    ? { ...page, page: projectedItems }
    : { ...page, items: projectedItems }
}

export async function projectCurrentOfferingInquiryDetail(
  detail: PublicBusinessCatalogV2DetailResult,
  dependencies: ProjectionDependencies = defaultDependencies,
): Promise<PublicBusinessCatalogV2DetailResult> {
  return detail.kind === 'not_found'
    ? detail
    : {
        ...detail,
        business: await projectCurrentOfferingInquiryAvailability(detail.business, dependencies),
      }
}


function projectOfferingInquiryOfferings(
  businessSlug: string,
  offerings: readonly PublicOfferingDto[],
  admitted: ReadonlySet<string>,
): readonly PublicOfferingDto[] {
  return offerings.map((offering) => {
    if (!offering.accessPaths.some(isAeInquiryAccessPath)) return offering
    const reachable = admitted.has(availabilityKey({
      businessSlug,
      offeringRef: offering.offeringRef,
    }))
    return reachable
      ? offering
      : {
          ...offering,
          accessPaths: offering.accessPaths.filter((path) => !isAeInquiryAccessPath(path)),
        }
  })
}

function applyOfferingInquiryAdmission(
  business: PublicBusinessCatalogApiV2Dto,
  admitted: ReadonlySet<string>,
): PublicBusinessCatalogApiV2Dto {
  const offerings = projectOfferingInquiryOfferings(business.slug, business.offerings, admitted)
  if (offerings.every((offering, index) => offering === business.offerings[index])) return business
  return {
    ...business,
    offerings,
    accessSummary: {
      ...business.accessSummary,
      humanRequest: offerings.some((offering) => offering.accessPaths.some((path) => path.kind === 'human_request')),
    },
  }
}

async function readAdmittedKeys(
  dependencies: ProjectionDependencies,
  targets: readonly InquiryAvailabilityTarget[],
): Promise<ReadonlySet<string>> {
  const admitted = new Set<string>()
  for (let start = 0; start < targets.length; start += MaxInquiryAvailabilityTargetsPerRead) {
    const availability = await dependencies.readAvailability(
      targets.slice(start, start + MaxInquiryAvailabilityTargetsPerRead),
    )
    for (const item of availability) {
      if (item.admitted) admitted.add(availabilityKey(item))
    }
  }
  return admitted
}
