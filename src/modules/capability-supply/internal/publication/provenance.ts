import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

import type { SupplyCommandActor } from '../shared'

export const CAPABILITY_PUBLICATION_AUTHORITY_MODES = [
  'provider_owned',
  'ae_curated_external',
  'third_party_gateway',
  'observed_external',
] as const

export type CapabilityPublicationAuthorityMode =
  typeof CAPABILITY_PUBLICATION_AUTHORITY_MODES[number]

export type CapabilityPublicationProvenance = Readonly<{
  publisherRef: string
  authorityMode: CapabilityPublicationAuthorityMode
  sourceRevision: string
  provenanceDigest: string
}>

export type CapabilityPublicationSourceIdentity = Readonly<{
  sourceRevision: string
  sourceDigest: string
}>

export function validCapabilityPublicationAuthority(
  actor: SupplyCommandActor,
  authorityMode: CapabilityPublicationAuthorityMode,
): boolean {
  if (actor.ref.trim().length === 0) return false
  switch (authorityMode) {
    case 'provider_owned':
      return actor.kind === 'owner'
    case 'ae_curated_external':
    case 'third_party_gateway':
      return actor.kind === 'admin' || actor.kind === 'system'
    case 'observed_external':
      // observed entries are not yet verified: only system may admit them
      return actor.kind === 'system'
  }
}

export function validCapabilityPublicationSourceRevision(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(value)
}

export function capabilityPublicationProvenanceDigest(input: Readonly<{
  publisherRef: string
  authorityMode: CapabilityPublicationAuthorityMode
  sourceRevision: string
  sourceDigest: string
}>): string {
  return canonicalDigest({
    publisherRef: input.publisherRef,
    authorityMode: input.authorityMode,
    sourceRevision: input.sourceRevision,
    sourceDigest: input.sourceDigest,
  } as StableHashValue)
}

export function defineCapabilityPublicationProvenance(input: Readonly<{
  actor: SupplyCommandActor
  authorityMode: CapabilityPublicationAuthorityMode
  sourceRevision: string
  sourceDigest: string
}>): CapabilityPublicationProvenance {
  if (!validCapabilityPublicationAuthority(input.actor, input.authorityMode)
    || !validCapabilityPublicationSourceRevision(input.sourceRevision)
    || !/^sha256:[0-9a-f]{64}$/.test(input.sourceDigest)) {
    throw new Error('capability_publication_provenance_invalid')
  }
  const publisherRef = input.actor.ref
  return {
    publisherRef,
    authorityMode: input.authorityMode,
    sourceRevision: input.sourceRevision,
    provenanceDigest: capabilityPublicationProvenanceDigest({
      publisherRef,
      authorityMode: input.authorityMode,
      sourceRevision: input.sourceRevision,
      sourceDigest: input.sourceDigest,
    }),
  }
}
