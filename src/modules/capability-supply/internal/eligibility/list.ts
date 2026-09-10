import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  capabilityToolId,
  createAdmittedToolRef,
  createPublicToolRef,
  type AdmittedToolRef,
  type PublicToolRef,
} from '@/modules/capability-supply/public'
import type { CapabilityConnectionAuthoritySnapshot } from '../binding/registration'
import { bindingIntegrityIsValid } from '../binding/integrity'
import { offeringIntegrityIsValid } from '../offering/integrity'
import { contractRefFromRow } from '../offering/registration'
import type { PricingConfig } from '@/modules/money/public'
import { availability, type CapabilityAvailabilityInput } from '../availability'
import type { PublicCapabilityUnavailableReason } from '../tool-projection-types'

import { bindingEligibilityIsValid, offeringEligibilityIsValid } from './integrity'
import {
  compareStableIdentifier,
  eligibleBindingProjection,
  eligibleOfferingProjection,
  type EligibleBindingProjection,
  type EligibleOfferingProjection,
} from './projection'
import type { EligiblePublicationRow, EligibleSupplyPorts } from './ports'

export const MAX_ELIGIBLE_SUPPLY = 256

export async function listIntegratedCapabilitySupply(
  ports: EligibleSupplyPorts,
  input: Readonly<{ networkId: string; limit: number; now: number }>,
) {
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > MAX_ELIGIBLE_SUPPLY) {
    return { kind: 'unavailable' as const, reason: 'limit_invalid' as const }
  }
  const bindings = await ports.listAdmittedConformantBindingsByNetwork(
    input.networkId, input.limit + 1,
  )
  if (bindings.length > input.limit) {
    return { kind: 'unavailable' as const, reason: 'eligible_supply_limit_exceeded' as const }
  }
  const supplies: Array<{
    offering: EligibleOfferingProjection
    binding: EligibleBindingProjection
    publication?: Readonly<{
      publicationRef: string
      revision: number
      readinessValidUntil: number
      toolRef: PublicToolRef
      pricingConfig: PricingConfig
      priceDigest: string
      connectionAuthority?: CapabilityConnectionAuthoritySnapshot
      admittedTool: AdmittedToolRef
    }>
  }> = []
  for (const binding of bindings) {
    if (!bindingIntegrityIsValid(binding) || !bindingEligibilityIsValid(binding)) {
      return { kind: 'unavailable' as const, reason: 'supply_integrity_failure' as const }
    }
    const offering = await ports.loadOfferingByOfferingId(binding.offeringId)
    if (offering === null || offering.status !== 'active') continue
    if (!offeringIntegrityIsValid(offering) || !offeringEligibilityIsValid(offering)) {
      return { kind: 'unavailable' as const, reason: 'supply_integrity_failure' as const }
    }
    if (
      offering.networkId !== input.networkId
      || offering.networkId !== binding.networkId
      || contractRefFromRow(offering).capabilityId !== contractRefFromRow(binding).capabilityId
      || contractRefFromRow(offering).version !== contractRefFromRow(binding).version
      || contractRefFromRow(offering).contractDigest !== contractRefFromRow(binding).contractDigest
    ) continue
    if (await ports.loadPublishedBusiness(offering.businessId) === null) continue

    let publication: {
      publicationRef: string
      revision: number
      readinessValidUntil: number
      toolRef: PublicToolRef
      pricingConfig: PricingConfig
      priceDigest: string
      connectionAuthority?: CapabilityConnectionAuthoritySnapshot
      admittedTool: AdmittedToolRef
    } | undefined
    const currentPublication = await ports.loadCurrentPublicationByBindingId(binding.bindingId)
    if (currentPublication !== null) {
      const contractRef = contractRefFromRow(binding)
      const qualification = await ports.qualifySuppliedCandidate({
        publicationRef: currentPublication.publicationRef,
        revision: currentPublication.revision,
        networkId: input.networkId,
        businessId: offering.businessId,
        offeringId: offering.offeringId,
        bindingId: binding.bindingId,
        contractRef,
      }, input.now)
      if (qualification.status === 'eligible') {
        const pricingConfig = currentPublication.pricingConfig
        const priceDigest = currentPublication.priceDigest
        if (pricingConfig !== undefined && priceDigest !== undefined) {
          const contract = await ports.getActiveExactCapabilityContract(contractRef)
          if (contract.kind === 'found') {
            const admittedTool = deriveAdmittedTool(
              currentPublication, offering, binding, contract.registeredAt, contract.documentJson, input.now,
            )
            if (admittedTool !== undefined) {
              publication = {
                publicationRef: currentPublication.publicationRef,
                revision: currentPublication.revision,
                readinessValidUntil: currentPublication.readinessValidUntil ?? 0,
                toolRef: currentPublication.toolRef,
                pricingConfig,
                priceDigest,
                ...(currentPublication.connectionAuthority === undefined
                  ? {}
                  : { connectionAuthority: currentPublication.connectionAuthority }),
                admittedTool,
              }
            }
          }
        }
      }
    }
    supplies.push({
      offering: eligibleOfferingProjection(offering),
      binding: eligibleBindingProjection(binding),
      ...(publication === undefined ? {} : { publication }),
    })
  }
  supplies.sort((left, right) => (
    compareStableIdentifier(left.offering.offeringId, right.offering.offeringId)
    || compareStableIdentifier(left.binding.bindingId, right.binding.bindingId)
  ))
  return { kind: 'available' as const, supplies }
}

function deriveAdmittedTool(
  publication: EligiblePublicationRow,
  offering: Parameters<typeof eligibleOfferingProjection>[0],
  binding: Parameters<typeof eligibleBindingProjection>[0],
  contractRegisteredAt: number,
  contractDocumentJson: string,
  _now: number,
): AdmittedToolRef | undefined {
  const contractRef = contractRefFromRow(binding)
  const operationId = capabilityToolId(contractRef.capabilityId)
  const expectedToolRef = createPublicToolRef({
    operationId,
    publicationRef: publication.publicationRef,
    publicationRevision: publication.revision,
    contractRef,
  })
  if (expectedToolRef !== publication.toolRef) return undefined
  const origin = offering.origin?.kind === 'catalog_offering'
    ? offering.origin
    : undefined
  const catalogOfferingRef = origin?.offeringRef ?? offering.offeringId
  const catalogOfferingRevision = origin?.offeringRevision ?? 1
  try {
    return createAdmittedToolRef({
      operationId,
      publisherRef: publication.publisherRef,
      provenanceDigest: publication.provenanceDigest,
      businessId: publication.businessId,
      publicationRef: publication.publicationRef,
      publicationRevision: publication.revision,
      sourceRevision: publication.sourceRevision,
      sourceDigest: publication.sourceDigest,
      contractRef,
      catalogOfferingRef,
      catalogOfferingRevision,
      offeringId: offering.offeringId,
      offeringRegistrationHash: offering.registrationHash,
      offeringEligibilityHash: offering.eligibilityHash,
      bindingId: binding.bindingId,
      bindingRegistrationHash: binding.registrationHash,
      bindingEligibilityHash: binding.eligibilityHash,
      bindingConfigDigest: binding.configDigest,
      qualificationDigest: canonicalDigest({
        contractRegisteredAt,
        contractRef,
        publication: {
          publicationRef: publication.publicationRef,
          revision: publication.revision,
          sourceRevision: publication.sourceRevision,
          sourceDigest: publication.sourceDigest,
          registrationEvidenceRefs: publication.registrationEvidenceRefs,
          readinessEvidenceRefs: publication.readinessEvidenceRefs,
          ...(publication.connectionAuthority === undefined
            ? {}
            : { connectionAuthority: publication.connectionAuthority }),
        },
        offering: {
          offeringId: offering.offeringId,
          registrationHash: offering.registrationHash,
          eligibilityHash: offering.eligibilityHash,
        },
        binding: {
          bindingId: binding.bindingId,
          registrationHash: binding.registrationHash,
          eligibilityHash: binding.eligibilityHash,
          configDigest: binding.configDigest,
          ...(binding.connectionAuthority === undefined
            ? {}
            : { connectionAuthority: binding.connectionAuthority }),
        },
      }),
      readinessValidUntil: publication.readinessValidUntil ?? 0,
      commercialDigest: canonicalDigest(offering.presentation.commercialRelationship),
      effectDigest: canonicalDigest({ contractRef, contractDocumentJson }),
    })
  } catch {
    return undefined
  }
}


/**
 * Derive the `unavailableReason` a withdrawn/incompatible/under-review
 * disposition already implies, so `availability()`'s disposition
 * short-circuit (see `../availability.ts`) can resolve it upstream of the
 * readiness clock, exactly as its docstring expects.
 */
function routeableUnavailableReason(
  publication: EligiblePublicationRow,
): PublicCapabilityUnavailableReason | undefined {
  if (publication.disposition === 'withdrawn') return 'publisher_withdrew'
  if (publication.disposition === 'incompatible') return 'updated_terms_require_review'
  if (publication.sourceAuthorityState === 'review_required') return 'under_review'
  return undefined
}

/**
 * The same lifecycle signals `publicationLifecycle()` (`../publication/lifecycle.ts`)
 * folds into its `active` state -- minus the eligibility-integrity/connection-authority
 * checks the caller already performed to reach this point -- expressed as the
 * `routeable`/`integrated` flags `availability()` reads. `admission`/`conformance`
 * are fixed literals here, mirroring `eligibleBindingProjection`: every row that
 * reaches this point was sourced from `listAdmittedConformantBindingsByNetwork`,
 * which only ever returns admitted, conformant bindings.
 */
function routeableAvailabilityInput(
  publication: EligiblePublicationRow,
): CapabilityAvailabilityInput {
  const routeable = publication.disposition === 'current'
    && publication.sourceAuthorityState !== 'review_required'
    && publication.credentialState === 'ready'
    && publication.healthState === 'healthy'
    && publication.readinessObservedAt !== undefined
  const unavailableReason = routeableUnavailableReason(publication)
  return {
    routeable,
    integrated: true,
    ...(unavailableReason === undefined ? {} : { unavailableReason }),
    readiness: {
      ...(publication.readinessObservedAt === undefined ? {} : { observedAt: publication.readinessObservedAt }),
      ...(publication.readinessValidUntil === undefined ? {} : { validUntil: publication.readinessValidUntil }),
      ...(publication.readinessLastHealthyAt === undefined
        ? {}
        : { lastHealthyAt: publication.readinessLastHealthyAt }),
    },
    disposition: publication.disposition,
    ...(publication.sourceAuthorityState === undefined
      ? {}
      : { sourceAuthorityState: publication.sourceAuthorityState }),
    admission: 'admitted',
    conformance: 'conformant',
    credentialState: publication.credentialState,
    healthState: publication.healthState,
    ...(publication.readinessValidUntil === undefined ? {} : { readinessValidUntil: publication.readinessValidUntil }),
  }
}

export async function listRouteableCapabilitySupply(
  ports: EligibleSupplyPorts,
  input: Readonly<{ networkId: string; limit: number; now: number }>,
) {
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > MAX_ELIGIBLE_SUPPLY) {
    return { kind: 'unavailable' as const, reason: 'limit_invalid' as const }
  }
  const integrated = await listIntegratedCapabilitySupply(ports, {
    ...input,
    limit: MAX_ELIGIBLE_SUPPLY,
  })
  if (integrated.kind === 'unavailable') return integrated
  const routeable: typeof integrated.supplies = []
  for (const supply of integrated.supplies) {
    if (supply.publication === undefined) continue
    // Re-load the raw publication: the catalogue-shaped `supply.publication`
    // carries `readinessValidUntil` but not `disposition`/`credentialState`/
    // `healthState`/`sourceAuthorityState`/`readinessObservedAt`, so
    // presentation and Quote can read the same posture off the same
    // underlying row instead of a re-derived summary.
    const currentPublication = await ports.loadCurrentPublicationByBindingId(supply.binding.bindingId)
    if (currentPublication === null) continue
    const posture = availability(routeableAvailabilityInput(currentPublication), input.now).posture
    if (posture === 'routeable') routeable.push(supply)
  }
  return { kind: 'available' as const, supplies: routeable.slice(0, input.limit) }
}
