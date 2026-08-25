import { uniqueSorted } from '@/modules/common/unique-sorted'

import { validTimestamp } from './shared'
import type { ProviderConnection, ProviderConnectionLifecycle, ProviderConnectionPublicProjection } from './types'

export type ProviderConnectionOwnerProjection = Readonly<{
  connectionRef: string
  businessId: string
  providerRef: string
  providerAccountRef: string
  adapterId: string
  grantedScopes: readonly string[]
  grantedResources: readonly string[]
  authorityGeneration: number
  authorityDigest: string
  lifecycle: ProviderConnectionLifecycle
  available: boolean
  credentialConfigured: boolean
  observedAt: number
  expiresAt?: number
  revokedAt?: number
  reasonCode: string | null
  evidenceRefs: readonly string[]
  createdAt: number
  updatedAt: number
}>

export function projectProviderConnectionPublic(connection: ProviderConnection, now: number): ProviderConnectionPublicProjection {
  return {
    lifecycle: connection.lifecycle,
    available: validTimestamp(now) && connection.lifecycle === 'active' && (connection.expiresAt === undefined || connection.expiresAt > now),
    reasonCode: connection.reasonCode ?? null,
  }
}

export function projectProviderConnectionOwner(
  connection: ProviderConnection,
  now: number,
): ProviderConnectionOwnerProjection {
  return {
    connectionRef: connection.connectionRef,
    businessId: connection.businessId,
    providerRef: connection.providerRef,
    providerAccountRef: connection.providerAccountRef,
    adapterId: connection.adapterId,
    grantedScopes: uniqueSorted(connection.grantedScopes),
    grantedResources: uniqueSorted(connection.grantedResources),
    authorityGeneration: connection.authorityGeneration,
    authorityDigest: connection.authorityDigest,
    lifecycle: connection.lifecycle,
    available: validTimestamp(now) && connection.lifecycle === 'active'
      && (connection.expiresAt === undefined || connection.expiresAt > now),
    credentialConfigured: connection.credentialRef !== null,
    observedAt: connection.observedAt,
    ...(connection.expiresAt === undefined ? {} : { expiresAt: connection.expiresAt }),
    ...(connection.revokedAt === undefined ? {} : { revokedAt: connection.revokedAt }),
    reasonCode: connection.reasonCode ?? null,
    evidenceRefs: [...connection.evidenceRefs],
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
  }
}
