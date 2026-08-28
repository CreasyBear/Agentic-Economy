import type { BusinessContextRecord, BusinessRecord, BusinessSourceState } from '@/modules/business/public'
import {
  createEmptyCatalogSourceState,
  reconcilePublishedOfferings,
  validateServiceCatalogInput,
  type ServiceCatalogInput,
} from '@/modules/catalog/public'
import { brandNonEmpty } from '@/modules/common/ids'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { RegistrySourceState } from '@/modules/registry/public'
import {
  DEV_SEED_BUSINESS_FIXTURES,
  type DevSeedBusinessFixture,
  type DevSeedOfferingFixture,
} from './dev-seed-business-fixtures'
export {
  DEV_SEED_BUSINESS_COUNT,
  DEV_SEED_BUSINESS_FIXTURES,
  type DevSeedBusinessFixture,
  type DevSeedOfferingAccessPathFixture,
  type DevSeedOfferingFixture,
} from './dev-seed-business-fixtures'



export type DevSeedCatalogState = BusinessSourceState & RegistrySourceState

export type DevSeedCatalogBundle = {
  state: DevSeedCatalogState
  seededSlugs: readonly string[]
}

const devSeedNow = 1_777_100_000_000


export function buildDevSeedCatalogState(
  fixtures: readonly DevSeedBusinessFixture[] = DEV_SEED_BUSINESS_FIXTURES,
  owningAccountRef: string,
): DevSeedCatalogBundle {
  let state: DevSeedCatalogState = {
    businesses: [],
    businessContexts: [],
    ...createEmptyCatalogSourceState(),
    operationKeys: [],
    auditEvents: [],
    registryProjectionItems: [],
    registryProjectionAttempts: [],
    indexStatus: [],
  }

  for (const [index, fixture] of fixtures.entries()) {
    const now = devSeedNow + index * 1_000
    state = seedBusinessFixture(state, fixture, owningAccountRef, now)
  }

  return {
    state,
    seededSlugs: fixtures.map((fixture) => fixture.requestedSlug),
  }
}

function seedBusinessFixture(
  state: DevSeedCatalogState,
  fixture: DevSeedBusinessFixture,
  owningAccountRef: string,
  now: number
): DevSeedCatalogState {

  const businessId = brandNonEmpty(`business:${fixture.requestedSlug}`, 'BusinessId')
  const slug = brandNonEmpty(fixture.requestedSlug, 'Slug')
  const businessContext = fixture.stateTerritory === 'External'
    ? {
        kind: 'programmable_provider' as const,
        website: sourceWebsite(fixture.sourceLabel),
        providerIdentifier: fixture.businessName,
      }
    : {
        kind: 'local_human' as const,
        suburb: fixture.suburb,
        stateTerritory: fixture.stateTerritory,
        ...(fixture.publishedPhone === undefined ? {} : { publishedPhone: fixture.publishedPhone }),
      }
  const sourceHash = canonicalDigest({ fixture, businessContext })
  const business: BusinessRecord = {
    businessId,
    slug,
    name: fixture.businessName,
    normalizedName: fixture.businessName.trim().toLowerCase().replace(/\s+/gu, ' '),
    category: fixture.category,
    businessContext,
    publicStatus: 'published',
    trustTier: 'claimed',
    sourceHash,
    createdAt: now,
    updatedAt: now + 500,
  }
  const context: BusinessContextRecord = {
    businessId,
    category: fixture.category,
    businessContext,
    ownerMessage: fixture.ownerMessage,
    sourceRefs: [{
      label: fixture.sourceLabel,
      evidenceRef: `private:evidence:dev-seed:${fixture.requestedSlug}`,
      sourceHash,
    }],
    sourceHash,
    approvedAt: now,
    ...(fixture.photoUrl === undefined || fixture.photoUrl.length === 0
      ? {}
      : { photos: [{ url: fixture.photoUrl, alt: `${fixture.businessName} photo` }] }),
    ...(fixture.responseTimeMinutes === undefined ? {} : { responseTimeMinutes: fixture.responseTimeMinutes }),
  }
  const services = validateServiceCatalogInput(fixture.offerings.map(toServiceCatalogInput))
  if (services.kind === 'invalid') throw new Error(`Invalid dev seed offering: ${services.reason}`)

  const reconciled = reconcilePublishedOfferings({
    offerings: state.offerings,
    revisions: state.revisions,
    accessPaths: state.accessPaths,
    operations: [],
  }, {
    businessId,
    authority: { actorRef: owningAccountRef, ownerRef: owningAccountRef, businessOwnerRef: owningAccountRef },
    services: services.services,
    operationKey: operationKey(`publish:${fixture.requestedSlug}`),
    now: now + 500,
  })
  if (reconciled.kind === 'error') throw new Error(`Dev seed publish failed: ${reconciled.reason}`)

  return {
    ...state,
    businesses: [...state.businesses, business],
    businessContexts: [...state.businessContexts, context],
    offerings: [...reconciled.state.offerings],
    revisions: [...reconciled.state.revisions],
    accessPaths: [...reconciled.state.accessPaths],
  }
}

function sourceWebsite(sourceLabel: string): string {
  const matched = sourceLabel.match(/https:\/\/\S+/u)?.[0]
  if (matched === undefined) throw new Error('Dev seed programmable provider source URL is required.')
  const website = new URL(matched)
  website.search = ''
  website.hash = ''
  return website.href
}

function toServiceCatalogInput(offering: DevSeedOfferingFixture): ServiceCatalogInput {
  return {
    name: offering.name,
    category: offering.category,
    summary: offering.summary,
    serviceArea: offering.serviceAreaSummary,
    hoursOrUnknown: offering.availabilitySummary,
    firstRequest:
      offering.firstRequestMode === 'not_available_yet'
        ? {
            mode: offering.firstRequestMode,
            publicChannel: 'not_available',
            publicDisclosure: offering.publicDisclosure,
            noContactReason: offering.noContactReason,
          }
        : {
            mode: offering.firstRequestMode,
            publicChannel: offering.firstRequestMode === 'quote_request_available' ? 'ae_status_only' : 'public_business_contact',
            publicDisclosure: offering.publicDisclosure,
          },
  }
}


function operationKey(value: string) {
  return brandNonEmpty(`op:dev-seed:${value}`, 'OperationKey')
}
