import { normalizePricingConfig } from '@/modules/money/public'
import {
  ownerSupplyAccessPathDescriptor,
  ownerSupplyLiteral,
  ownerSupplyStringArray,
} from '@/modules/capability-supply/owner-supply-validators'
import type { Doc } from '../_generated/dataModel'
import type { OwnerSupplyFunnelResult } from './contracts'

type OwnerSupplyAvailable = Extract<
  OwnerSupplyFunnelResult,
  { kind: 'available' }
>
export type OwnerSupplyOffering = OwnerSupplyAvailable['offerings'][number]
export type OwnerSupplyPublication = NonNullable<OwnerSupplyOffering['publication']>
type OwnerSupplyPricing = NonNullable<OwnerSupplyPublication['pricing']>
type OwnerSupplyReadiness = OwnerSupplyPublication['readiness']
type OwnerSupplyLifecycle = OwnerSupplyPublication['lifecycle']
type OwnerSupplyStepStates = OwnerSupplyOffering['stepStates']
type OwnerSupplyAuthority = NonNullable<OwnerSupplyOffering['authority']>
type OwnerSupplyActionableReason = OwnerSupplyOffering['actionableReason']

export const everyFact = (facts: readonly boolean[]): boolean =>
  facts.every(Boolean)

export function ownerSupplyPricing(
  publication: Doc<'capabilityPublications'> | undefined,
): OwnerSupplyPricing | undefined {
  if (publication?.pricingConfigJson === undefined) return undefined
  try {
    const parsed = normalizePricingConfig(JSON.parse(publication.pricingConfigJson))
    if (parsed.kind !== 'valid' || publication.priceDigest === undefined) {
      return undefined
    }
    const config =
      parsed.config.freeTier === undefined
        ? {
            version: parsed.config.version,
            unit: parsed.config.unit,
            paidAmount: parsed.config.paidAmount,
          }
        : { ...parsed.config, freeTier: parsed.config.freeTier }
    return { config, priceDigest: publication.priceDigest }
  } catch {
    return undefined
  }
}

export function ownerSupplyReadiness(
  publication: Doc<'capabilityPublications'> | undefined,
): OwnerSupplyReadiness | undefined {
  if (publication === undefined) return undefined
  const outcome = publication.readinessOutcome
    ?? (publication.healthState === 'healthy'
      ? ('healthy' as const)
      : publication.healthState === 'unhealthy'
        ? ('response_invalid' as const)
        : ('unobserved' as const))
  return {
    outcome,
    ...(publication.readinessObservedAt === undefined
      ? {}
      : { observedAt: publication.readinessObservedAt }),
    ...(publication.readinessValidUntil === undefined
      ? {}
      : { validUntil: publication.readinessValidUntil }),
    ...(publication.readinessTargetDigest === undefined
      ? {}
      : { targetDigest: publication.readinessTargetDigest }),
    ...(publication.readinessRequestDigest === undefined
      ? {}
      : { requestDigest: publication.readinessRequestDigest }),
    ...(publication.readinessResponseStatus === undefined
      ? {}
      : { responseStatus: publication.readinessResponseStatus }),
    ...(publication.readinessResponseContentType === undefined
      ? {}
      : { responseContentType: publication.readinessResponseContentType }),
    ...(publication.readinessResponseDigest === undefined
      ? {}
      : { responseDigest: publication.readinessResponseDigest }),
    evidenceRefs: ownerSupplyStringArray(
      publication.readinessEvidenceRefs,
      'readiness evidence',
    ),
  }
}

export function ownerSupplyPublicationDetails(input: Readonly<{
  publication: Doc<'capabilityPublications'> | undefined
  binding: Doc<'capabilityTransportBindings'> | undefined
  pricing: OwnerSupplyPricing | undefined
  lifecycle: OwnerSupplyLifecycle
  readiness: OwnerSupplyReadiness
}>): OwnerSupplyPublication | undefined {
  const { publication, binding, pricing, lifecycle, readiness } = input
  if (publication === undefined || binding === undefined) return undefined
  return {
    state: ownerSupplyLiteral(
      publication.disposition,
      ['current', 'withdrawn', 'superseded', 'incompatible'] as const,
      'publication state',
    ),
    publicationRef: publication.publicationRef,
    publicationRevision: publication.revision,
    operationRef: publication.operationRef,
    authorityMode: ownerSupplyLiteral(
      publication.authorityMode,
      [
        'provider_owned',
        'ae_curated_external',
        'third_party_gateway',
        'observed_external',
      ] as const,
      'publication authority',
    ),
    contractRef: {
      capabilityId: publication.capabilityId,
      version: publication.version,
      contractDigest: publication.contractDigest,
    },
    source: {
      kind: publication.sourceKind,
      selector: publication.sourceSelector ?? {},
      revision: publication.sourceRevision,
      digest: publication.sourceDigest,
    },
    ...(pricing === undefined ? {} : { pricing }),
    binding: {
      bindingId: binding.bindingId,
      bindingDigest: binding.registrationHash,
      endpointUrl: binding.endpointUrl,
      adapterId: binding.adapterId,
      admission: binding.admission,
      conformance: binding.conformance,
      authority:
        binding.authority.kind === 'public_upstream'
          ? { kind: 'public_upstream' as const }
          : {
              kind: 'provider_connection' as const,
              providerRef: binding.authority.providerRef,
            },
      ...(publication.connectionAuthority === undefined
        ? {}
        : {
            authoritySnapshot: {
              providerRef: publication.connectionAuthority.providerRef,
              authorityGeneration:
                publication.connectionAuthority.authorityGeneration,
              authorityDigest: publication.connectionAuthority.authorityDigest,
            },
          }),
    },
    lifecycle,
    readiness,
  }
}

export function ownerSupplyStepProgress(input: Readonly<{
  hasRevision: boolean
  hasPublication: boolean
  readyNow: boolean
  readinessOutcome: OwnerSupplyReadiness['outcome']
  testCompleted: boolean
}>): Readonly<{
  currentStep: OwnerSupplyOffering['currentStep']
  stepStates: OwnerSupplyStepStates
}> {
  const describe = input.hasRevision ? 'completed' : 'in_progress'
  const admission = input.hasPublication
    ? 'completed'
    : input.hasRevision
      ? 'in_progress'
      : 'not_started'
  const readiness = !input.hasPublication
    ? 'not_started'
    : input.readyNow
      ? 'completed'
      : input.readinessOutcome === 'unobserved'
        ? 'in_progress'
        : 'refused'
  const test = !input.hasPublication || !input.readyNow
    ? 'not_started'
    : input.testCompleted
      ? 'completed'
      : 'in_progress'
  const stepStates = { describe, admission, readiness, test } as const
  const currentStep = describe !== 'completed'
    ? 'describe'
    : admission !== 'completed'
      ? 'admission'
      : readiness !== 'completed'
        ? 'readiness'
        : 'test'
  return { currentStep, stepStates }
}

export function ownerSupplyAuthority(
  publication: OwnerSupplyPublication | undefined,
): OwnerSupplyAuthority | undefined {
  if (publication === undefined) return undefined
  const bindingAuthority = publication.binding.authority
  if (bindingAuthority.kind === 'public_upstream') {
    return { mode: publication.authorityMode, kind: 'public_upstream' }
  }
  return {
    mode: publication.authorityMode,
    kind: 'provider_connection',
    providerRef: bindingAuthority.providerRef,
    ...(publication.binding.authoritySnapshot === undefined
      ? {}
      : {
          authorityGeneration:
            publication.binding.authoritySnapshot.authorityGeneration,
          authorityDigest: publication.binding.authoritySnapshot.authorityDigest,
        }),
  }
}

export function ownerSupplyActionableReason(input: Readonly<{
  hasPublication: boolean
  qualificationRouteable: boolean
  qualificationReasons: readonly OwnerSupplyActionableReason[] | undefined
  lifecycleReasons: readonly OwnerSupplyActionableReason[]
  readinessOutcome: OwnerSupplyReadiness['outcome']
}>): OwnerSupplyActionableReason {
  if (!input.hasPublication) return 'admission_unproven'
  if (!input.qualificationRouteable) {
    return input.qualificationReasons?.[0]
      ?? input.lifecycleReasons[0]
      ?? 'eligibility_integrity_failure'
  }
  return input.lifecycleReasons[0]
    ?? (input.readinessOutcome === 'unobserved'
      ? 'health_unobserved'
      : undefined)
}

export function ownerSupplyOfferingResult(input: Readonly<{
  offering: Doc<'businessOfferings'>
  revision: Doc<'businessOfferingRevisions'> | undefined
  paths: readonly Doc<'offeringAccessPaths'>[]
  binding: Doc<'capabilityTransportBindings'> | undefined
  pricing: OwnerSupplyPricing | undefined
  authority: OwnerSupplyAuthority | undefined
  publication: Doc<'capabilityPublications'> | undefined
  publicationDetails: OwnerSupplyPublication | undefined
  lifecycle: OwnerSupplyLifecycle
  readiness: OwnerSupplyReadiness
  qualificationRouteable: boolean
  currentStep: OwnerSupplyOffering['currentStep']
  stepStates: OwnerSupplyStepStates
  actionableReason: OwnerSupplyOffering['actionableReason']
}>): OwnerSupplyOffering {
  const {
    offering,
    revision,
    paths,
    binding,
    pricing,
    authority,
    publication,
    publicationDetails,
    lifecycle,
    readiness,
    qualificationRouteable,
    currentStep,
    stepStates,
    actionableReason,
  } = input
  const sourceHash = revision?.sourceHash
  const source = publicationDetails?.source
  return {
    offeringRef: offering.offeringRef,
    revision: offering.currentRevision,
    name: revision?.name ?? offering.offeringRef,
    summary: revision?.summary ?? '',
    status: ownerSupplyLiteral(
      offering.status,
      ['draft', 'published', 'paused', 'retired'] as const,
      'offering status',
    ),
    ...(sourceHash === undefined ? {} : { sourceHash }),
    ...(source === undefined ? {} : { source }),
    ...(binding === undefined ? {} : { endpointUrl: binding.endpointUrl }),
    ...(pricing === undefined ? {} : { pricing }),
    ...(authority === undefined ? {} : { authority }),
    admission: {
      state: binding?.admission ?? 'not_admitted',
      ...(binding?.admission === 'admitted' || actionableReason === undefined
        ? {}
        : { reason: actionableReason }),
    },
    ...(publication === undefined
      ? {}
      : {
          operationRef: publication.operationRef,
          publicationRef: publication.publicationRef,
        }),
    ...(publicationDetails === undefined ? {} : { publication: publicationDetails }),
    lifecycle,
    readiness: {
      outcome: readiness.outcome,
      ...(readiness.observedAt === undefined ? {} : { observedAt: readiness.observedAt }),
      ...(readiness.validUntil === undefined ? {} : { validUntil: readiness.validUntil }),
      evidenceRefs: readiness.evidenceRefs,
    },
    live: {
      available: qualificationRouteable,
      ...(qualificationRouteable
        ? {}
        : { reason: actionableReason ?? 'readiness_unavailable' }),
    },
    currentStep,
    stepStates,
    ...(actionableReason === undefined ? {} : { actionableReason }),
    accessPaths: paths.map((path) => ({
      accessPathRef: path.accessPathRef,
      offeringSourceHash: path.offeringSourceHash,
      sourceHash: path.sourceHash,
      status: ownerSupplyLiteral(
        path.status,
        ['draft', 'published', 'withdrawn'] as const,
        'access path status',
      ),
      descriptor: ownerSupplyAccessPathDescriptor(path.descriptor),
    })),
  }
}
