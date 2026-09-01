import { createAuthenticatedSourceTransport, sourceQuery } from '@/lib/server/convex-source'
import { createConvexMoneyQueryPort, MoneyQueryError } from '@/lib/server/money-query'
import {
  addExactAmounts,
  listCreditActivity,
  readCreditAccount,
  readKeyUsage,
  type ExactAmount,
  type MoneyQueryPort,
} from '@/modules/money/public'
import { listAgentAccessKeysServer } from '@/modules/agent-access/agent-access.functions'
import type { AgentAccessKeyInventoryItem } from '@/modules/agent-access/agent-access'
import type { AgentAccessOwnerGrantReadback } from '@/modules/agent-access/policy'
import type {
  AgentCredentialSummary,
  AgentCredentialSource,
  AgentDetail,
  AgentDirectoryItem,
  AgentDirectoryProjection,
} from '@/modules/agent-access/agent-operator-view-model'

const listOwnerGrantReadbacksQuery = sourceQuery<Record<string, never>, readonly AgentAccessOwnerGrantReadback[]>(
  'agentAccessPolicy:listOwnerGrantReadbacks',
)
export type CanonicalAgentDirectoryRecord = Readonly<{
  principalRef: string
  principalRevision: number
  displayName: string
  applicationRef: string
  environment: 'sandbox' | 'production'
  currentProviderCredentialId: string
  lastSeenAt: number
  status: 'connected' | 'attention' | 'expired' | 'disconnected'
  admissionLifecycle: 'active' | 'revoked' | 'expired'
  authorityMode: AgentAccessKeyInventoryItem['authorityMode']
  scopes: readonly string[]
  credentialHistoryTruncated: boolean
  credentials: readonly Readonly<{
    credentialRef: string
    providerCredentialId: string
    generation: number
    lifecycle: 'active' | 'stale' | 'revoked'
    predecessorCredentialRef?: string
    issuedAt: number
    expiresAt: number
  }>[]
}>
type CanonicalAgentDirectoryPage = Readonly<{
  page: readonly CanonicalAgentDirectoryRecord[]
  isDone: boolean
  continueCursor: string
}>
const listOwnedAgentDirectoryQuery = sourceQuery<Readonly<{
  now: number
  paginationOpts: Readonly<{ numItems: number; cursor: string | null }>
}>, CanonicalAgentDirectoryPage>(
  'agentDirectory:listOwnedPage',
)


export async function loadAgentDirectoryReadback(
  operations: AgentAccessOperationActivityPort,
  cursor: string | null = null,
): Promise<AgentDirectoryProjection> {
  const [keys, source] = await Promise.all([
    listAgentAccessKeysServer(),
    createAuthenticatedSourceTransport(),
  ])
  const [grants, canonicalAgents] = await Promise.all([
    source.query(listOwnerGrantReadbacksQuery, {}),
    source.query(listOwnedAgentDirectoryQuery, {
      now: Date.now(),
      paginationOpts: { numItems: 25, cursor },
    }),
  ])
  const sources = await readAgentCredentialSources(keys, createConvexMoneyQueryPort(), grants)
  const projection = projectAgentDirectory(sources, canonicalAgents.page)
  const enriched = await enrichAgentDirectoryActivity(projection, operations)
  return canonicalAgents.isDone
    ? enriched
    : { ...enriched, nextCursor: canonicalAgents.continueCursor }
}

/**
 * Assemble the durable directory from credential source material. Canonical
 * principalRef is the sole grouping key: application names and credential
 * identifiers never merge two agents.
 */
export function projectAgentDirectory(
  readbacks: readonly AgentCredentialSource[],
  canonicalAgents: readonly CanonicalAgentDirectoryRecord[],
): AgentDirectoryProjection {
  const byPrincipal = new Map<string, AgentCredentialSource[]>()
  for (const readback of readbacks) {
    const group = byPrincipal.get(readback.principalId)
    if (group === undefined) byPrincipal.set(readback.principalId, [readback])
    else group.push(readback)
  }

  const details = canonicalAgents.flatMap((canonical) => {
    const sources = byPrincipal.get(canonical.principalRef) ?? []
    return [projectAgentDetail(canonical, sources)]
  }).toSorted((left, right) => (
    right.agent.lastSeenAt === left.agent.lastSeenAt
      ? left.agent.displayName.localeCompare(right.agent.displayName)
      : (right.agent.lastSeenAt ?? 0) - (left.agent.lastSeenAt ?? 0)
  ))

  return {
    items: details.map(({ agent }) => agent),
    details,
  }
}

function projectAgentDetail(
  canonical: CanonicalAgentDirectoryRecord,
  readbacks: readonly AgentCredentialSource[],
): AgentDetail {
  const ordered = [...readbacks].toSorted((left, right) => (
    (left.key.createdAt ?? 0) - (right.key.createdAt ?? 0)
      || left.key.keyId.localeCompare(right.key.keyId)
  ))
  const current = ordered.find(({ key }) => key.keyId === canonical.currentProviderCredentialId)

  const currentCanonicalCredential = canonical.credentials.find(({ providerCredentialId }) => (
    providerCredentialId === canonical.currentProviderCredentialId
  ))
  if (currentCanonicalCredential === undefined) throw new Error('agent_directory_current_credential_missing')
  const credentials: AgentCredentialSummary[] = canonical.credentials.map((credential) => ({
    credentialRef: credential.credentialRef,
    generation: credential.generation,
    lifecycle: credential.lifecycle,
    ...(credential.predecessorCredentialRef === undefined
      ? {}
      : { predecessorCredentialRef: credential.predecessorCredentialRef }),
    issuedAt: credential.issuedAt,
    expiresAt: credential.expiresAt,
  }))
  const hasUnavailable = ordered.some(({ dataState }) => dataState === 'unavailable')
  const allUnavailable = ordered.every(({ dataState }) => dataState === 'unavailable')
  const status: AgentDirectoryItem['status'] = canonical.status === 'connected' && hasUnavailable
    ? 'attention'
    : canonical.status
  const lastSeenAt = Math.max(
    ...ordered.flatMap(({ key, activity }) => [
      ...(key.createdAt === undefined ? [] : [key.createdAt]),
      ...activity.map(({ observedAt }) => observedAt),
    ]),
    0,
  )
  const agent: AgentDirectoryItem = {
    principalRef: canonical.principalRef,
    principalRevision: canonical.principalRevision,
    displayName: canonical.displayName,
    applicationRef: canonical.applicationRef,
    environment: canonical.environment,
    status,
    ...(canonical.admissionLifecycle !== 'active' ? {} : { currentCredentialGeneration: currentCanonicalCredential.generation }),
    lastSeenAt: Math.max(lastSeenAt, canonical.lastSeenAt),
  }
  const activity = ordered
    .flatMap((readback) => readback.activity)
    .toSorted((left, right) => right.observedAt - left.observedAt)
  const usageRows = ordered.flatMap(({ usage }) => usage === undefined ? [] : [usage])
  const grossSpend = usageRows.reduce<ExactAmount | undefined>((total, row, index) => (
    index === 0 ? row.grossSpend : total === undefined ? undefined : addExactAmounts(total, row.grossSpend)
  ), undefined)
  const usage = usageRows.length === 0 || grossSpend === undefined ? undefined : {
    callCount: usageRows.reduce((total, row) => total + row.callCount, 0),
    paidCallCount: usageRows.reduce((total, row) => total + row.paidCallCount, 0),
    freeCallCount: usageRows.reduce((total, row) => total + row.freeCallCount, 0),
    grossSpend,
    states: [...new Set(usageRows.flatMap((row) => row.states))],
  }
  return {
    agent,
    credentials,
    ...(canonical.admissionLifecycle !== 'active' ? {} : { currentCredentialRef: currentCanonicalCredential.credentialRef }),
    authorityMode: current?.key.authorityMode ?? canonical.authorityMode,
    scopes: current?.key.scopes ?? canonical.scopes,
    ...(current?.grant === undefined ? {} : { grant: current.grant }),
    ...(current?.account === undefined ? {} : { account: current.account }),
    activity,
    ...(usage === undefined ? {} : { usage }),
    dataState: ordered.length === 0 || allUnavailable
      ? 'unavailable'
      : hasUnavailable
        ? 'partial'
        : ordered.every(({ dataState }) => dataState === 'empty')
          ? 'empty'
          : 'source',
    ...(canonical.credentialHistoryTruncated ? { credentialHistoryTruncated: true } : {}),
  }
}

type OperationCompareResult = Readonly<
  | {
      kind: 'ok'
      operations: readonly Readonly<{
        operationRef: string
        offering: Readonly<{ label: string }>
        business: Readonly<{ name: string }>
      }>[]
    }
  | { kind: 'unavailable' }
>

export type CompareOperations = (
  input: Readonly<{ operationRefs: readonly string[] }>,
) => Promise<OperationCompareResult>

export type AgentAccessOperationActivityPort = Readonly<{
  compare: CompareOperations
  isOperationRef: (value: string) => boolean
}>

export async function enrichAgentDirectoryActivity(
  directory: AgentDirectoryProjection,
  operations: AgentAccessOperationActivityPort,
): Promise<AgentDirectoryProjection> {
  const recentActivity = directory.details
    .flatMap(({ activity }) => activity)
    .toSorted((left, right) => right.observedAt - left.observedAt)
  const operationRefs = [...new Set(recentActivity.reduce<string[]>((refs, { operationKey }) => {
    if (operations.isOperationRef(operationKey)) refs.push(operationKey)
    return refs
  }, []))]
    .slice(0, 40)
  if (operationRefs.length === 0) return directory

  const batches = Array.from({ length: Math.ceil(operationRefs.length / 4) }, (_, index) => (
    operationRefs.slice(index * 4, index * 4 + 4)
  ))
  const comparisons = await Promise.all(batches.map(async (operationRefs) => {
    try {
      return await operations.compare({ operationRefs })
    } catch {
      return undefined
    }
  }))
  const labels = new Map(comparisons.flatMap((comparison) => (
    comparison?.kind === 'ok'
      ? comparison.operations.map((operation) => [operation.operationRef, {
        label: operation.offering.label,
        supplier: operation.business.name,
      }] as const)
      : []
  )))
  return {
    ...directory,
    details: directory.details.map((detail) => ({
      ...detail,
      activity: detail.activity.map((entry) => {
        const operation = operations.isOperationRef(entry.operationKey)
          ? labels.get(entry.operationKey)
          : undefined
        return operation === undefined ? entry : { ...entry, operation }
      }),
    })),
  }
}

export async function readAgentCredentialSources(
  keys: readonly AgentAccessKeyInventoryItem[],
  port: MoneyQueryPort,
  grants: readonly AgentAccessOwnerGrantReadback[] = [],
): Promise<readonly AgentCredentialSource[]> {
  const grantsByCredential = new Map(grants.map((grant) => [grant.credentialId, grant]))
  const boundKeys = keys.flatMap((key) => {
    const grant = grantsByCredential.get(key.keyId)
    return grant === undefined ? [] : [{ key, grant }]
  })
  return await Promise.all(boundKeys.map(async ({ key, grant }) => {
    const { principalId } = grant
    try {
      const [account, activity, usage] = await Promise.all([
        readCreditAccount({ port, query: { principalId, currency: 'USD' } }),
        listCreditActivity({ port, query: { principalId, credentialId: key.keyId, currency: 'USD', paginationOpts: { numItems: 50, cursor: null } } }),
        readKeyUsage({ port, query: { principalId, credentialId: key.keyId, currency: 'USD' } }),
      ])
      return { key, grant, principalId, account, activity: activity.page, usage, dataState: 'source' as const }
    } catch (error) {
      const dataState = error instanceof MoneyQueryError && error.code === 'billing_identity_missing' ? 'empty' as const : 'unavailable' as const
      return { key, grant, principalId, activity: [], dataState }
    }
  }))
}
