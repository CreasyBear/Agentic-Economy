import { uniqueSorted } from '@/modules/common/unique-sorted'

import { validTimestamp } from './shared'
import type {
  ProviderConnection,
  ProviderConnectionLifecycle,
  ProviderConnectionPublicProjection,
  ProviderConnectionSourceAuthentication,
} from './types'

export type ProviderConnectionOwnerProjection = Readonly<{
  connectionRef: string
  businessId: string
  providerRef: string
  providerAccountRef: string
  adapterId: string
  sourceOrigin?: string
  sourceEnvironment?: 'sandbox' | 'production'
  sourceAuthentication?: ProviderConnectionSourceAuthentication
  grantedScopes: readonly string[]
  grantedResources: readonly string[]
  authorityGeneration: number
  authorityDigest: string
  lifecycle: ProviderConnectionLifecycle
  available: boolean
  credentialConfigured: boolean
  x402Method?: 'GET' | 'POST'
  x402Payee?: string
  healthStatus?: 'healthy' | 'unhealthy'
  healthCheckedAt?: number
  healthSubject?: string
  healthReasonCode?: string
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
    ...(connection.sourceOrigin === undefined ? {} : { sourceOrigin: connection.sourceOrigin }),
    ...(connection.sourceEnvironment === undefined ? {} : { sourceEnvironment: connection.sourceEnvironment }),
    ...(connection.sourceAuthentication === undefined ? {} : { sourceAuthentication: connection.sourceAuthentication }),
    grantedScopes: uniqueSorted(connection.grantedScopes),
    grantedResources: uniqueSorted(connection.grantedResources),
    authorityGeneration: connection.authorityGeneration,
    authorityDigest: connection.authorityDigest,
    lifecycle: connection.lifecycle,
    available: validTimestamp(now) && connection.lifecycle === 'active'
      && (connection.expiresAt === undefined || connection.expiresAt > now),
    credentialConfigured: connection.credentialRef !== null,
    ...(connection.x402Method === undefined ? {} : { x402Method: connection.x402Method }),
    ...(connection.x402Payee === undefined ? {} : { x402Payee: connection.x402Payee }),
    ...(connection.healthStatus === undefined ? {} : { healthStatus: connection.healthStatus }),
    ...(connection.healthCheckedAt === undefined ? {} : { healthCheckedAt: connection.healthCheckedAt }),
    ...(connection.healthSubject === undefined ? {} : { healthSubject: connection.healthSubject }),
    ...(connection.healthReasonCode === undefined ? {} : { healthReasonCode: connection.healthReasonCode }),
    observedAt: connection.observedAt,
    ...(connection.expiresAt === undefined ? {} : { expiresAt: connection.expiresAt }),
    ...(connection.revokedAt === undefined ? {} : { revokedAt: connection.revokedAt }),
    reasonCode: connection.reasonCode ?? null,
    evidenceRefs: [...connection.evidenceRefs],
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
  }
}
