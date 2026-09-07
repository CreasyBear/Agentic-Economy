import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { z } from 'zod'

import { callSourceMutation, callSourceQuery, sourceMutation, sourceQuery } from '@/lib/server/convex-source'
import { requireStrictClerkConsequenceProof } from '@/lib/server/clerk-consequence-proof'
import { sourceWriteAdmissionFromContext } from '@/lib/server/source-write-admission'
import { sanitizeTelemetryError } from '@/lib/observability/private-route-safety'
import {
  readOwnerProviderConnections,
  readOwnerProviderEarnings,
  type OwnerProviderConnection,
} from '@/modules/capability-supply/supply-funnel.functions'
import { readOwnerConnectReadinessThroughSource } from '@/modules/money/money.functions'
import { readOwnerStatusThroughSource, type PublicOwnerStatusRouteReadbackResult } from '@/lib/server/owner-status.functions'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { ProviderOffboardingStatus } from '@/modules/capability-supply/provider-offboarding'
import { sourceWriteRequestFromAdmission } from '@/modules/security/source-write-admission'
import { readTrimmedEnv } from '@/lib/server/read-trimmed-env'
import { package5RolloutDecision } from '@/lib/server/package5-rollout'
import {
  providerToolStatusSchema,
  type ProviderToolStatus,
} from '@/modules/capability-supply/provider-tool-status'

export type ProviderWorkspaceInventoryRow = Readonly<{
  offeringRef: string
  currentRevision: number
  name: string
  category: string
  summary: string
  status: 'draft' | 'published' | 'paused' | 'retired'
  accessPathCount: number
}>

export type ProviderWorkspaceInventoryResult =
  | Readonly<{
      kind: 'available'
      provider: Readonly<{ name: string }>
      tools: readonly ProviderWorkspaceInventoryRow[]
      projection: 'current' | 'pending'
      isDone: boolean
      continueCursor: string
    }>
  | Readonly<{ kind: 'not_found' }>
  | Readonly<{ kind: 'conflict'; reason: 'multiple_providers' | 'business_mismatch' }>
  | Readonly<{ kind: 'unavailable' }>

export type ProviderWorkspaceLifecycleRow = Readonly<{
  offeringRef: string
  status: ProviderToolStatus
}>

export type ProviderWorkspaceLifecycleResult =
  | Readonly<{ kind: 'available'; value: readonly ProviderWorkspaceLifecycleRow[] }>
  | Readonly<{ kind: 'unavailable' | 'not_applicable' }>
  | Readonly<{ kind: 'conflict'; reason: 'multiple_providers' | 'business_mismatch' }>

export type ProviderToolStatusResult =
  | Readonly<{
      kind: 'available'
      status: ProviderToolStatus
      tool: ProviderWorkspaceInventoryRow
      maintenance?: Readonly<{
        offeringRef: string
        offeringRevision: number
        offeringSourceHash: string
        publicationRef: string
        publicationRevision: number
      }>
      resumeCandidateRef?: string
    }>
  | Readonly<{ kind: 'not_found' | 'unavailable' }>

export type ProviderWorkspaceConnectionsResult =
  | Readonly<{
      kind: 'available'
      value: Readonly<{
        total: number
        available: number
        needsAttention: number
      }>
    }>
  | Readonly<{ kind: 'unavailable' | 'not_applicable' }>
  | Readonly<{ kind: 'conflict'; reason: 'multiple_providers' | 'business_mismatch' }>

export type ProviderWorkspaceConnectionsDetailResult =
  | Readonly<{ kind: 'available'; businessId: string; connections: readonly OwnerProviderConnection[] }>
  | Readonly<{ kind: 'unavailable' | 'not_applicable' }>
  | Readonly<{ kind: 'conflict'; reason: 'multiple_providers' | 'business_mismatch' }>

export type ProviderWorkspacePayoutResult =
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
  | Readonly<{ kind: 'conflict'; reason: 'multiple_providers' | 'business_mismatch' }>

export type ProviderWorkspacePublicStatusResult =
  | Readonly<{
      kind: 'available'
      value: Extract<PublicOwnerStatusRouteReadbackResult, { kind: 'available' }>['readback']
    }>
  | Readonly<{ kind: 'unavailable' | 'not_applicable' }>
  | Readonly<{ kind: 'conflict'; reason: 'multiple_providers' | 'business_mismatch' }>

export type OwnerProviderOffboardingResult =
  | Readonly<{ kind: 'available'; status: ProviderOffboardingStatus }>
  | Readonly<{ kind: 'not_found' }>
  | Readonly<{ kind: 'refused'; reason: string }>
  | Readonly<{ kind: 'unavailable' }>

const readProviderOffboardingQuery = sourceQuery<
  { businessId: string },
  Exclude<OwnerProviderOffboardingResult, { kind: 'unavailable' }>
>('capabilityProviderOffboarding:readStatus')
const startProviderOffboardingMutation = sourceMutation<
  Record<string, unknown>,
  Exclude<OwnerProviderOffboardingResult, { kind: 'unavailable' }>
>('capabilityProviderOffboarding:startCase')
const resumeProviderOffboardingMutation = sourceMutation<
  Record<string, unknown>,
  Exclude<OwnerProviderOffboardingResult, { kind: 'unavailable' }>
>('capabilityProviderOffboarding:resumeCase')
const cancelProviderOffboardingMutation = sourceMutation<
  Record<string, unknown>,
  Exclude<OwnerProviderOffboardingResult, { kind: 'unavailable' }>
>('capabilityProviderOffboarding:cancelCase')

type CurrentOwnerIdentityResult =
  | Readonly<{ kind: 'available'; businessId: string; name: string; slug: string; publicStatus: 'unpublished' | 'published' | 'suppressed' }>
  | Readonly<{ kind: 'not_found' }>
  | Readonly<{ kind: 'conflict'; code: 'multiple_businesses' }>
  | Readonly<{ kind: 'error'; code: 'unauthenticated' | 'source_unavailable' }>

const readCurrentOwnerIdentityQuery = sourceQuery<Record<string, never>, CurrentOwnerIdentityResult>(
  'catalog:getCurrentOwnerProviderIdentity',
)
const readOwnerProviderToolQuery = sourceQuery<
  { businessId: string; offeringRef: string; now: number },
  | {
      kind: 'available'
      statusJson: string
      tool: ProviderWorkspaceInventoryRow
      maintenance?: NonNullable<Extract<ProviderToolStatusResult, { kind: 'available' }>['maintenance']>
      resumeCandidateRef?: string
    }
  | { kind: 'not_found' }
>('capabilityProviderTools:readOwner')
type OwnerProviderToolDirectoryReadback =
  | Readonly<{
      kind: 'available'
      page: readonly Readonly<ProviderWorkspaceInventoryRow & { statusJson: string }>[]
      isDone: boolean
      continueCursor: string
    }>
  | Readonly<{ kind: 'not_found' }>
const listOwnerProviderToolsQuery = sourceQuery<
  { businessId: string; now: number; paginationOpts: { numItems: number; cursor: string | null } },
  OwnerProviderToolDirectoryReadback
>('capabilityProviderTools:listOwner')

export type ProviderWorkspaceIdentityDetailResult =
  | Extract<CurrentOwnerIdentityResult, { kind: 'available' }>
  | Readonly<{ kind: 'unavailable' | 'not_applicable' }>
  | Readonly<{ kind: 'conflict'; reason: 'multiple_providers' }>

export type ProviderWorkspacePageResult = Readonly<{
  inventory: ProviderWorkspaceInventoryResult
  lifecycle?: ProviderWorkspaceLifecycleResult
}>

export const readProviderWorkspacePageServer = createServerFn()
  .validator((data) => z.strictObject({ cursor: z.string().min(1).max(10_000).optional() }).parse(data))
  .handler(async ({ data }): Promise<ProviderWorkspacePageResult> => {
    privateOwnerResponse()
    return readProviderWorkspacePageThroughSource(data.cursor === undefined ? {} : { cursor: data.cursor })
  })

export async function readProviderWorkspacePageThroughSource(
  data: Readonly<{ cursor?: string }> = {},
): Promise<ProviderWorkspacePageResult> {
  const identity = await readCurrentOwnerIdentity()
  if (identity.kind === 'not_found') return { inventory: { kind: 'not_found' } }
  if (identity.kind === 'conflict') return { inventory: { kind: 'conflict', reason: 'multiple_providers' } }
  if (identity.kind !== 'available') return { inventory: { kind: 'unavailable' } }
  try {
    const result = await callSourceQuery(listOwnerProviderToolsQuery, {
      businessId: identity.businessId,
      now: Date.now(),
      paginationOpts: { numItems: 50, cursor: data.cursor ?? null },
    })
    if (result.kind === 'not_found') return { inventory: { kind: 'not_found' } }
    const lifecycle: ProviderWorkspaceLifecycleRow[] = []
    for (const row of result.page) {
      const parsed = providerToolStatusSchema.safeParse(JSON.parse(row.statusJson) as unknown)
      if (!parsed.success || parsed.data.businessRef !== identity.businessId) {
        return { inventory: { kind: 'unavailable' } }
      }
      lifecycle.push({ offeringRef: row.offeringRef, status: parsed.data })
    }
    return {
      inventory: {
        kind: 'available',
        provider: { name: identity.name },
        tools: result.page.map(({ statusJson: _statusJson, ...row }) => row),
        projection: 'current',
        isDone: result.isDone,
        continueCursor: result.continueCursor,
      },
      lifecycle: { kind: 'available', value: lifecycle },
    }
  } catch {
    return { inventory: { kind: 'unavailable' } }
  }
}

export const readProviderWorkspaceIdentityDetailServer = createServerFn().handler(async (): Promise<ProviderWorkspaceIdentityDetailResult> => {
  privateOwnerResponse()
  const identity = await readCurrentOwnerIdentity()
  if (identity.kind === 'available') return identity
  return secondaryFromIdentity(identity)
})

export const readProviderToolStatusServer = createServerFn()
  .validator((data) => z.strictObject({
    businessId: z.string().trim().min(1),
    offeringRef: z.string().trim().min(1),
  }).parse(data))
  .handler(async ({ data }): Promise<ProviderToolStatusResult> => {
    privateOwnerResponse()
    try {
      const result = await callSourceQuery(readOwnerProviderToolQuery, {
        ...data,
        now: Date.now(),
      })
      if (result.kind === 'not_found') return result
      const parsed = providerToolStatusSchema.safeParse(JSON.parse(result.statusJson) as unknown)
      if (!parsed.success) return { kind: 'unavailable' }
      return {
        kind: 'available',
        status: parsed.data,
        tool: result.tool,
        ...(result.maintenance === undefined ? {} : { maintenance: result.maintenance }),
        ...(result.resumeCandidateRef === undefined ? {} : { resumeCandidateRef: result.resumeCandidateRef }),
      }
    } catch {
      return { kind: 'unavailable' }
    }
  })

export const readProviderWorkspaceConnectionsSummaryServer = createServerFn().handler(async (): Promise<ProviderWorkspaceConnectionsResult> => {
  privateOwnerResponse()
  return readProviderWorkspaceConnectionsSummaryThroughSource()
})

export async function readProviderWorkspaceConnectionsSummaryThroughSource(): Promise<ProviderWorkspaceConnectionsResult> {
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

export const readProviderWorkspaceConnectionsDetailServer = createServerFn().handler(async (): Promise<ProviderWorkspaceConnectionsDetailResult> => {
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

export const readProviderWorkspacePayoutSummaryServer = createServerFn().handler(async (): Promise<ProviderWorkspacePayoutResult> => {
  privateOwnerResponse()
  return readProviderWorkspacePayoutSummaryThroughSource()
})

export async function readProviderWorkspacePayoutSummaryThroughSource(): Promise<ProviderWorkspacePayoutResult> {
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

export const readProviderWorkspacePublicStatusServer = createServerFn().handler(async (): Promise<ProviderWorkspacePublicStatusResult> => {
  privateOwnerResponse()
  return readProviderWorkspacePublicStatusThroughSource()
})

export const readOwnerProviderOffboardingServer = createServerFn().handler(async (): Promise<OwnerProviderOffboardingResult> => {
  privateOwnerResponse()
  const identity = await readCurrentOwnerIdentity()
  if (identity.kind !== 'available') return identity.kind === 'not_found' ? { kind: 'not_found' } : { kind: 'unavailable' }
  try {
    return await callSourceQuery(readProviderOffboardingQuery, { businessId: identity.businessId })
  } catch {
    return { kind: 'unavailable' }
  }
})

export const startOwnerProviderOffboardingServer = createServerFn({ method: 'POST' })
  .validator((data) => z.strictObject({
    idempotencyKey: z.string().trim().min(8).max(200),
  }).parse(data))
  .handler(async ({ data, context }): Promise<OwnerProviderOffboardingResult> => {
    privateOwnerResponse()
    const rollout = package5RolloutDecision('providerOffboarding')
    if (!rollout.enabled) return { kind: 'refused', reason: rollout.code }
    const identity = await readCurrentOwnerIdentity()
    if (identity.kind !== 'available') return identity.kind === 'not_found' ? { kind: 'not_found' } : { kind: 'unavailable' }
    const retentionPolicyVersion = readTrimmedEnv(process.env, 'AE_RETENTION_POLICY_VERSION')
    if (retentionPolicyVersion === undefined) return { kind: 'refused', reason: 'retention_policy_unavailable' }
    const operationKey = canonicalDigest({ action: 'supply.offboarding.start', businessRef: identity.businessId, idempotencyKey: data.idempotencyKey })
    const command = {
      businessId: identity.businessId,
      idempotencyKey: data.idempotencyKey,
      retentionPolicyVersion,
      operationKey,
      correlationId: operationKey,
      proof: await requireStrictClerkConsequenceProof(operationKey),
    }
    try {
      const sourceWrite = await sourceWriteAdmissionFromContext({ context, command, scope: 'catalog_publish', operationKey, correlationId: operationKey })
      return await callSourceMutation(startProviderOffboardingMutation, {
        ...command,
        sourceWrite,
        sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
      })
    } catch {
      return { kind: 'unavailable' }
    }
  })

export const resumeOwnerProviderOffboardingServer = createServerFn({ method: 'POST' })
  .validator((data) => z.strictObject({
    caseRef: z.string().trim().min(1),
    expectedRevision: z.number().int().positive(),
    idempotencyKey: z.string().trim().min(8).max(200),
  }).parse(data))
  .handler(async ({ data, context }): Promise<OwnerProviderOffboardingResult> => {
    privateOwnerResponse()
    const operationKey = canonicalDigest({ action: 'supply.offboarding.resume', ...data })
    const command = {
      ...data,
      operationKey,
      correlationId: operationKey,
      proof: await requireStrictClerkConsequenceProof(operationKey),
    }
    try {
      const sourceWrite = await sourceWriteAdmissionFromContext({ context, command, scope: 'catalog_publish', operationKey, correlationId: operationKey })
      return await callSourceMutation(resumeProviderOffboardingMutation, {
        ...command,
        sourceWrite,
        sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
      })
    } catch {
      return { kind: 'unavailable' }
    }
  })

export const cancelOwnerProviderOffboardingServer = createServerFn({ method: 'POST' })
  .validator((data) => z.strictObject({
    caseRef: z.string().trim().min(1),
    expectedRevision: z.number().int().positive(),
    idempotencyKey: z.string().trim().min(8).max(200),
  }).parse(data))
  .handler(async ({ data, context }): Promise<OwnerProviderOffboardingResult> => {
    privateOwnerResponse()
    const operationKey = canonicalDigest({ action: 'supply.offboarding.cancel', ...data })
    const command = {
      ...data,
      operationKey,
      correlationId: operationKey,
      proof: await requireStrictClerkConsequenceProof(operationKey),
    }
    try {
      const sourceWrite = await sourceWriteAdmissionFromContext({ context, command, scope: 'catalog_publish', operationKey, correlationId: operationKey })
      return await callSourceMutation(cancelProviderOffboardingMutation, {
        ...command,
        sourceWrite,
        sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
      })
    } catch {
      return { kind: 'unavailable' }
    }
  })

export async function readProviderWorkspacePublicStatusThroughSource(): Promise<ProviderWorkspacePublicStatusResult> {
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

async function readCurrentOwnerIdentity(): Promise<CurrentOwnerIdentityResult> {
  try {
    return await callSourceQuery(readCurrentOwnerIdentityQuery, {})
  } catch (error) {
    console.error('[provider-workspace] owner scope read failed', sanitizeTelemetryError(error))
    return { kind: 'error', code: 'source_unavailable' }
  }
}

function secondaryFromIdentity(
  result: Exclude<CurrentOwnerIdentityResult, { kind: 'available' }>,
): { kind: 'unavailable' | 'not_applicable' } | { kind: 'conflict'; reason: 'multiple_providers' } {
  if (result.kind === 'not_found') return { kind: 'not_applicable' }
  if (result.kind === 'conflict') return { kind: 'conflict', reason: 'multiple_providers' }
  return { kind: 'unavailable' }
}

function privateOwnerResponse(): void {
  setResponseHeader('cache-control', 'private, no-store')
}
