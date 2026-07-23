import type {
  BusinessId,
  OfferingRef,
  SourceHash,
} from '@/modules/common/ids'

import type {
  BusinessOfferingRecord,
  BusinessOfferingRevisionRecord,
} from './offering-supply'

export const OfferingHistorySafeDisplayDispositionValues = [
  'retain_safe_history',
  'hidden_privacy',
  'hidden_safety',
] as const

export type OfferingHistorySafeDisplayDisposition =
  (typeof OfferingHistorySafeDisplayDispositionValues)[number]

export type OfferingPublicRevisionHistoryRecord = Readonly<{
  businessId: BusinessId
  offeringRef: OfferingRef
  revision: number
  offeringSourceHash: SourceHash
  publishedAt: number
  withdrawnAt?: number
  safeDisplayDisposition: OfferingHistorySafeDisplayDisposition
}>

export type HistoricalOfferingSelection = Readonly<{
  businessId: BusinessId
  offeringRef: OfferingRef
  revision: number
  offeringSourceHash: SourceHash
}>

export type ResolveHistoricalPublicOfferingResult =
  | Readonly<{
      kind: 'resolved'
      revision: BusinessOfferingRevisionRecord
      publication: Readonly<{
        publishedAt: number
        withdrawnAt?: number
        safeDisplayDisposition: 'retain_safe_history'
      }>
      newerCurrentRevision?: HistoricalOfferingSelection
    }>
  | Readonly<{
      kind: 'unavailable'
      reason:
        | 'business_not_public'
        | 'business_suppressed'
        | 'legacy_reference'
        | 'never_public'
        | 'business_mismatch'
        | 'source_hash_mismatch'
        | 'revision_unavailable'
        | 'privacy_withdrawn'
        | 'safety_withdrawn'
    }>

export function resolveHistoricalPublicOffering(input: Readonly<{
  selection: HistoricalOfferingSelection
  business: Readonly<{
    businessId: BusinessId
    isPublic: boolean
    isSuppressed: boolean
  }>
  offering?: BusinessOfferingRecord
  selectedRevision?: BusinessOfferingRevisionRecord
  history?: OfferingPublicRevisionHistoryRecord
  currentRevision?: BusinessOfferingRevisionRecord
}>): ResolveHistoricalPublicOfferingResult {
  if (!input.business.isPublic) {
    return { kind: 'unavailable', reason: 'business_not_public' }
  }
  if (input.business.isSuppressed) {
    return { kind: 'unavailable', reason: 'business_suppressed' }
  }
  if (input.selection.offeringRef.startsWith('legacy-offering:')) {
    return { kind: 'unavailable', reason: 'legacy_reference' }
  }
  if (input.history === undefined) {
    return { kind: 'unavailable', reason: 'never_public' }
  }
  if (
    input.business.businessId !== input.selection.businessId
    || input.history.businessId !== input.selection.businessId
    || input.history.offeringRef !== input.selection.offeringRef
    || input.history.revision !== input.selection.revision
  ) {
    return { kind: 'unavailable', reason: 'business_mismatch' }
  }
  if (input.history.offeringSourceHash !== input.selection.offeringSourceHash) {
    return { kind: 'unavailable', reason: 'source_hash_mismatch' }
  }
  if (input.history.safeDisplayDisposition === 'hidden_privacy') {
    return { kind: 'unavailable', reason: 'privacy_withdrawn' }
  }
  if (input.history.safeDisplayDisposition === 'hidden_safety') {
    return { kind: 'unavailable', reason: 'safety_withdrawn' }
  }
  if (
    input.offering === undefined
    || input.offering.businessId !== input.selection.businessId
    || input.offering.offeringRef !== input.selection.offeringRef
  ) {
    return { kind: 'unavailable', reason: 'business_mismatch' }
  }
  if (
    input.selectedRevision === undefined
    || input.selectedRevision.businessId !== input.selection.businessId
    || input.selectedRevision.offeringRef !== input.selection.offeringRef
    || input.selectedRevision.revision !== input.selection.revision
  ) {
    return { kind: 'unavailable', reason: 'revision_unavailable' }
  }
  if (input.selectedRevision.sourceHash !== input.selection.offeringSourceHash) {
    return { kind: 'unavailable', reason: 'source_hash_mismatch' }
  }

  const current = input.currentRevision
  const newerCurrentRevision = (
    input.offering.status === 'published'
    && current !== undefined
    && current.businessId === input.selection.businessId
    && current.offeringRef === input.selection.offeringRef
    && current.revision === input.offering.currentRevision
    && current.revision > input.selection.revision
  )
    ? {
        businessId: current.businessId,
        offeringRef: current.offeringRef,
        revision: current.revision,
        offeringSourceHash: current.sourceHash,
      }
    : undefined

  return {
    kind: 'resolved',
    revision: input.selectedRevision,
    publication: {
      publishedAt: input.history.publishedAt,
      ...(input.history.withdrawnAt === undefined
        ? {}
        : { withdrawnAt: input.history.withdrawnAt }),
      safeDisplayDisposition: 'retain_safe_history',
    },
    ...(newerCurrentRevision === undefined ? {} : { newerCurrentRevision }),
  }
}
