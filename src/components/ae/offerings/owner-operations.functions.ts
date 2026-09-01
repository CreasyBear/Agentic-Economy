import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'

import { readOwnerOfferingSupplyThroughSource } from './owner-offering.functions'
import { callSourceQuery, sourceQuery } from '@/lib/server/convex-source'
import { sanitizeTelemetryError } from '@/lib/observability/private-route-safety'
import type { BusinessOfferingRecord } from '@/modules/catalog/public'
import {
  readOwnerProviderConnections,
  readOwnerProviderEarnings,
  readOwnerSupplyFunnel,
  type OwnerProviderConnection,
  type OwnerSupplyOfferingReadback,
  type SupplyFunnelRefusal,
  type SupplyFunnelStep,
  type SupplyFunnelStepState,
} from '@/modules/capability-supply/supply-funnel.functions'
import { readOwnerConnectReadinessThroughSource } from '@/modules/money/money.functions'
import { readOwnerStatusThroughSource, type PublicOwnerStatusRouteReadbackResult } from '@/lib/server/owner-status.functions'
import { supplierContinuationForOffering, type SupplierContinuation } from '@/components/ae/supply/supplier-continuation'

export type OwnerOperationsInventoryRow = Readonly<{
  offeringRef: string
  currentRevision: number
  name: string
  category: string
  summary: string
  status: BusinessOfferingRecord['status']
  accessPathCount: number
}>

export type OwnerOperationsInventoryResult =
  | Readonly<{
      kind: 'available'
      supplier: Readonly<{ name: string }>
      operations: readonly OwnerOperationsInventoryRow[]
      projection: 'current' | 'pending'
    }>
  | Readonly<{ kind: 'not_found' }>
  | Readonly<{ kind: 'conflict'; reason: 'multiple_suppliers' | 'business_mismatch' }>
  | Readonly<{ kind: 'unavailable' }>

export type OwnerOperationsLifecycleRow = Readonly<{
  offeringRef: string
  revision: number
  status: OwnerSupplyOfferingReadback['status']
  currentStep: SupplyFunnelStep
  readinessState: SupplyFunnelStepState
  publicationState?: NonNullable<OwnerSupplyOfferingReadback['publication']>['state']
  operationRef?: string
  lifecycleState: OwnerSupplyOfferingReadback['lifecycle']['state']
  readinessOutcome: OwnerSupplyOfferingReadback['readiness']['outcome']
  liveAvailable: boolean
  liveReason?: SupplyFunnelRefusal
  actionableReason?: SupplyFunnelRefusal
  continuation: SupplierContinuation
}>

export type OwnerOperationsLifecycleResult =
  | Readonly<{ kind: 'available'; value: readonly OwnerOperationsLifecycleRow[] }>
  | Readonly<{ kind: 'unavailable' | 'not_applicable' }>
  | Readonly<{ kind: 'conflict'; reason: 'multiple_suppliers' | 'business_mismatch' }>

export type OwnerOperationsConnectionsResult =
  | Readonly<{
      kind: 'available'
      value: Readonly<{
        total: number
        available: number
        needsAttention: number
      }>
    }>
  | Readonly<{ kind: 'unavailable' | 'not_applicable' }>
  | Readonly<{ kind: 'conflict'; reason: 'multiple_suppliers' | 'business_mismatch' }>

export type OwnerOperationsConnectionsDetailResult =
  | Readonly<{ kind: 'available'; businessId: string; connections: readonly OwnerProviderConnection[] }>
  | Readonly<{ kind: 'unavailable' | 'not_applicable' }>
  | Readonly<{ kind: 'conflict'; reason: 'multiple_suppliers' | 'business_mismatch' }>

export type OwnerOperationsPayoutResult =
  | Readonly<{
      kind: 'available'
      value: Readonly<{
        currencies: readonly string[]
        earningsAccounts: number
        payoutAccounts: number
        readyAccounts: number
        needsAttention: number
      }>
    }>
  | Readonly<{ kind: 'unavailable' | 'not_applicable' }>
  | Readonly<{ kind: 'conflict'; reason: 'multiple_suppliers' | 'business_mismatch' }>

export type OwnerOperationsPublicStatusResult =
  | Readonly<{
      kind: 'available'
      value: Extract<PublicOwnerStatusRouteReadbackResult, { kind: 'available' }>['readback']
    }>
  | Readonly<{ kind: 'unavailable' | 'not_applicable' }>
  | Readonly<{ kind: 'conflict'; reason: 'multiple_suppliers' | 'business_mismatch' }>

type CurrentOwnerScope = Readonly<{
  businessId: string
  inventory: Extract<OwnerOperationsInventoryResult, { kind: 'available' }>
}>

type CurrentOwnerIdentityResult =
  | Readonly<{ kind: 'available'; businessId: string; name: string; slug: string; publicStatus: 'unpublished' | 'published' | 'suppressed' }>
  | Readonly<{ kind: 'not_found' }>
  | Readonly<{ kind: 'conflict'; code: 'multiple_businesses' }>
  | Readonly<{ kind: 'error'; code: 'unauthenticated' | 'source_unavailable' }>

const readCurrentOwnerIdentityQuery = sourceQuery<Record<string, never>, CurrentOwnerIdentityResult>(
  'catalog:getCurrentOwnerSupplierIdentity',
)

export type OwnerOperationsIdentityDetailResult =
  | Extract<CurrentOwnerIdentityResult, { kind: 'available' }>
  | Readonly<{ kind: 'unavailable' | 'not_applicable' }>
  | Readonly<{ kind: 'conflict'; reason: 'multiple_suppliers' }>

export const readOwnerOperationsInventoryServer = createServerFn().handler(async (): Promise<OwnerOperationsInventoryResult> => {
  privateOwnerResponse()
  return readOwnerOperationsInventoryThroughSource()
})

export async function readOwnerOperationsInventoryThroughSource(): Promise<OwnerOperationsInventoryResult> {
  const scope = await readCurrentOwnerScope()
  return 'inventory' in scope ? scope.inventory : scope
}

export const readOwnerOperationsIdentityDetailServer = createServerFn().handler(async (): Promise<OwnerOperationsIdentityDetailResult> => {
  privateOwnerResponse()
  const identity = await readCurrentOwnerIdentity()
  if (identity.kind === 'available') return identity
  return secondaryFromIdentity(identity)
})

export const readOwnerOperationsLifecycleServer = createServerFn().handler(async (): Promise<OwnerOperationsLifecycleResult> => {
  privateOwnerResponse()
  return readOwnerOperationsLifecycleThroughSource()
})

export async function readOwnerOperationsLifecycleThroughSource(): Promise<OwnerOperationsLifecycleResult> {
  const identity = await readCurrentOwnerIdentity()
  if (identity.kind !== 'available') return secondaryFromIdentity(identity)
  try {
    const result = await readOwnerSupplyFunnel({ data: { businessId: identity.businessId } })
    if (result.kind === 'not_found') return { kind: 'not_applicable' }
    if (result.kind !== 'available') return { kind: 'unavailable' }
    if (result.businessId !== identity.businessId) return { kind: 'conflict', reason: 'business_mismatch' }
    return { kind: 'available', value: result.offerings.map(toLifecycleRow) }
  } catch {
    return { kind: 'unavailable' }
  }
}

export const readOwnerOperationsConnectionsSummaryServer = createServerFn().handler(async (): Promise<OwnerOperationsConnectionsResult> => {
  privateOwnerResponse()
  return readOwnerOperationsConnectionsSummaryThroughSource()
})

export async function readOwnerOperationsConnectionsSummaryThroughSource(): Promise<OwnerOperationsConnectionsResult> {
  const identity = await readCurrentOwnerIdentity()
  if (identity.kind !== 'available') return secondaryFromIdentity(identity)
  try {
    const connections = await readOwnerProviderConnections()
    if (connections.some((connection) => connection.businessId !== identity.businessId)) {
      return { kind: 'conflict', reason: 'business_mismatch' }
    }
    return {
      kind: 'available',
      value: {
        total: connections.length,
        available: connections.filter((connection) => connection.available).length,
        needsAttention: connections.filter((connection) => !connection.available).length,
      },
    }
  } catch {
    return { kind: 'unavailable' }
  }
}

export const readOwnerOperationsConnectionsDetailServer = createServerFn().handler(async (): Promise<OwnerOperationsConnectionsDetailResult> => {
  privateOwnerResponse()
  const identity = await readCurrentOwnerIdentity()
  if (identity.kind !== 'available') return secondaryFromIdentity(identity)
  try {
    const connections = await readOwnerProviderConnections()
    if (connections.some((connection) => connection.businessId !== identity.businessId)) {
      return { kind: 'conflict', reason: 'business_mismatch' }
    }
    return { kind: 'available', businessId: identity.businessId, connections }
  } catch {
    return { kind: 'unavailable' }
  }
})

export const readOwnerOperationsPayoutSummaryServer = createServerFn().handler(async (): Promise<OwnerOperationsPayoutResult> => {
  privateOwnerResponse()
  return readOwnerOperationsPayoutSummaryThroughSource()
})

export async function readOwnerOperationsPayoutSummaryThroughSource(): Promise<OwnerOperationsPayoutResult> {
  const identity = await readCurrentOwnerIdentity()
  if (identity.kind !== 'available') return secondaryFromIdentity(identity)
  let reads: readonly [
    Awaited<ReturnType<typeof readOwnerProviderEarnings>>,
    Awaited<ReturnType<typeof readOwnerConnectReadinessThroughSource>>,
  ]
  try {
    reads = await Promise.all([
      readOwnerProviderEarnings(),
      readOwnerConnectReadinessThroughSource(),
    ])
  } catch {
    return { kind: 'unavailable' }
  }
  const [earnings, connect] = reads
  if (earnings.kind === 'not_found' && connect.kind === 'not_found') return { kind: 'not_applicable' }
  if (earnings.kind === 'error' || connect.kind === 'error') return { kind: 'unavailable' }
  if (earnings.kind === 'available' && earnings.businessId !== identity.businessId) return { kind: 'conflict', reason: 'business_mismatch' }
  if (connect.kind === 'available' && connect.businessId !== identity.businessId) return { kind: 'conflict', reason: 'business_mismatch' }
  const earningsAccounts = earnings.kind === 'available' ? earnings.accounts : []
  const payoutAccounts = connect.kind === 'available' ? connect.accounts : []
  const currencies = [...new Set([
    ...earningsAccounts.map((account) => account.currency),
    ...payoutAccounts.map((account) => account.currency),
  ])].sort()
  const readyAccounts = payoutAccounts.filter((account) => account.account.state === 'ready').length
  return {
    kind: 'available',
    value: {
      currencies,
      earningsAccounts: earningsAccounts.length,
      payoutAccounts: payoutAccounts.length,
      readyAccounts,
      needsAttention: Math.max(0, currencies.length - readyAccounts),
    },
  }
}

export const readOwnerOperationsPublicStatusServer = createServerFn().handler(async (): Promise<OwnerOperationsPublicStatusResult> => {
  privateOwnerResponse()
  return readOwnerOperationsPublicStatusThroughSource()
})

export async function readOwnerOperationsPublicStatusThroughSource(): Promise<OwnerOperationsPublicStatusResult> {
  const identity = await readCurrentOwnerIdentity()
  if (identity.kind !== 'available') return secondaryFromIdentity(identity)
  let result: Awaited<ReturnType<typeof readOwnerStatusThroughSource>>
  try {
    result = await readOwnerStatusThroughSource(undefined)
  } catch {
    return { kind: 'unavailable' }
  }
  if (result.kind === 'not_found') return { kind: 'not_applicable' }
  if (result.kind !== 'available') return { kind: 'unavailable' }
  if (result.readback.catalog.businessId !== identity.businessId) return { kind: 'conflict', reason: 'business_mismatch' }
  return { kind: 'available', value: result.readback }
}

async function readCurrentOwnerScope(): Promise<CurrentOwnerScope | Exclude<OwnerOperationsInventoryResult, { kind: 'available' }>> {
  const identity = await readCurrentOwnerIdentity()
  if (identity.kind === 'not_found') return { kind: 'not_found' }
  if (identity.kind === 'conflict') return { kind: 'conflict', reason: 'multiple_suppliers' }
  if (identity.kind !== 'available') return { kind: 'unavailable' }
  const result = await readOwnerOfferingSupplyThroughSource()
  if (result.kind === 'not_found') return { kind: 'not_found' }
  if (result.kind !== 'available') return { kind: 'unavailable' }
  if (result.businessId !== identity.businessId) return { kind: 'conflict', reason: 'business_mismatch' }
  return {
    businessId: result.businessId,
    inventory: {
      kind: 'available',
      supplier: { name: result.business.name },
      operations: result.offerings.map((item) => ({
        offeringRef: item.offeringRef,
        currentRevision: item.currentRevision,
        name: item.revision?.name ?? item.offeringRef,
        category: item.revision?.category ?? 'Unavailable',
        summary: item.revision?.summary ?? 'The current Operation revision is unavailable.',
        status: item.status,
        accessPathCount: item.accessPaths.filter((path) => path.status !== 'withdrawn').length,
      })),
      projection: result.projection.status === 'current' ? 'current' : 'pending',
    },
  }
}

async function readCurrentOwnerIdentity(): Promise<CurrentOwnerIdentityResult> {
  try {
    return await callSourceQuery(readCurrentOwnerIdentityQuery, {})
  } catch (error) {
    console.error('[owner-operations] owner scope read failed', sanitizeTelemetryError(error))
    return { kind: 'error', code: 'source_unavailable' }
  }
}

function secondaryFromIdentity(
  result: Exclude<CurrentOwnerIdentityResult, { kind: 'available' }>,
): { kind: 'unavailable' | 'not_applicable' } | { kind: 'conflict'; reason: 'multiple_suppliers' } {
  if (result.kind === 'not_found') return { kind: 'not_applicable' }
  if (result.kind === 'conflict') return { kind: 'conflict', reason: 'multiple_suppliers' }
  return { kind: 'unavailable' }
}

function toLifecycleRow(offering: OwnerSupplyOfferingReadback): OwnerOperationsLifecycleRow {
  return {
    offeringRef: offering.offeringRef,
    revision: offering.revision,
    status: offering.status,
    currentStep: offering.currentStep,
    readinessState: offering.stepStates.readiness,
    ...(offering.publication === undefined ? {} : {
      publicationState: offering.publication.state,
      operationRef: offering.publication.operationRef,
    }),
    lifecycleState: offering.lifecycle.state,
    readinessOutcome: offering.readiness.outcome,
    liveAvailable: offering.live.available,
    ...(offering.live.reason === undefined ? {} : { liveReason: offering.live.reason }),
    ...(offering.actionableReason === undefined ? {} : { actionableReason: offering.actionableReason }),
    continuation: supplierContinuationForOffering(offering),
  }
}

function privateOwnerResponse(): void {
  setResponseHeader('cache-control', 'private, no-store')
}
