import { createAuthenticatedSourceTransport, sourceAction, sourceQuery } from '@/lib/server/convex-source'
import { listAgentAccessKeysServer } from '@/modules/agent-access/agent-access.functions'
import type { AgentAccessKeyInventoryItem } from '@/modules/agent-access/agent-access'
import type { AgentAccessOwnerGrantReadback } from '@/modules/agent-access/policy'
import type { AgentConnectionReadback } from '@/modules/agent-access/agent-connection'
import type { AccountFundingBalance } from '@/modules/money/server'
import type {
  AgentActivityView,
  AgentCredentialSummary,
  AgentCredentialSource,
  AgentDetail,
  AgentDirectoryItem,
  AgentDirectoryProjection,
  AgentOwnerReadback,
  AgentUsageSummary,
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
    lastAuthenticatedAt?: number
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
const listOwnerConnectionReadbacksQuery = sourceQuery<Readonly<{
  principalRefs: readonly string[]
  now: number
}>, readonly AgentConnectionReadback[]>(
  'agentAccessOAuth:listOwnerConnectionReadbacks',
)
const listOwnerReconnectCandidatesQuery = sourceQuery<Readonly<{
  clientId: string
  principalRefs: readonly string[]
  now: number
}>, readonly Readonly<{ principalRef: string; principalRevision: number }>[]>(
  'agentAccessOAuth:listOwnerReconnectCandidates',
)
const readOwnerAccountBalanceAction = sourceAction<Record<string, never>, AccountFundingBalance>(
  'moneyAccountFundingFormance:readBalance',
)
type OwnerAgentCallReadback = Readonly<{
  callRef: string
  accountRef: string
  principalRef: string
  credentialRef: string
  applicationRef: string
  toolRef: string
  providerRef: string
  toolLabel: string
  state: 'completed' | 'refused' | 'outcome_unknown'
  deliveryState: 'delivered' | 'not_delivered' | 'unknown'
  paymentState: 'settled' | 'released' | 'unknown' | 'not_applicable'
  providerObligationState?: 'accrued' | 'held' | 'payable' | 'settled' | 'reversed' | 'disputed'
  providerAmountUnits?: string
  audAmountUnits?: string
  receiptRef?: string
  recoveryRef?: string
  latencyMs: number
  createdAt: number
  updatedAt: number
}>
type OwnerAgentUsageReadback = Readonly<{
  kind: 'available'
  dimensionKind: 'agent'
  dimensionRef: string
  periodStartAt: number
  periodEndAt: number
  callCountUnits: string
  completedCountUnits: string
  outcomeUnknownCountUnits: string
  settledSpendUnits?: string
  amountCoverage: 'complete' | 'incomplete'
  updatedAt: number
  source: 'convex_call_evidence'
}> | Readonly<{
  kind: 'empty'
  dimensionKind: 'agent'
  dimensionRef: string
  periodStartAt: number
  periodEndAt: number
}> | Readonly<{ kind: 'unavailable'; code: 'usage_window_too_large' }>
type OwnerAgentReadback = Readonly<{
  activity: Readonly<{
    page: readonly OwnerAgentCallReadback[]
    isDone: boolean
    continueCursor: string
  }>
  usage: OwnerAgentUsageReadback
}>
const readOwnerAgentReadbackQuery = sourceQuery<Readonly<{
  principalRef: string
  periodStartAt: number
  periodEndAt: number
  paginationOpts: Readonly<{ numItems: number; cursor: string | null }>
}>, OwnerAgentReadback>('capabilityCallProjections:readOwnerAgentReadback')

export async function loadOwnerReconnectCandidates(
  clientId: string,
  principalRefs: readonly string[],
  now: number,
): Promise<readonly Readonly<{ principalRef: string; principalRevision: number }>[]> {
  if (principalRefs.length === 0) return []
  const source = await createAuthenticatedSourceTransport()
  return await source.query(listOwnerReconnectCandidatesQuery, { clientId, principalRefs, now })
}


export async function loadAgentDirectoryReadback(
  tools: AgentAccessToolActivityPort,
  cursor: string | null = null,
): Promise<AgentDirectoryProjection> {
  const now = Date.now()
  const { periodStartAt, periodEndAt } = currentUtcMonthBounds(now)
  const [keys, source] = await Promise.all([
    listAgentAccessKeysServer(),
    createAuthenticatedSourceTransport(),
  ])
  const [grants, canonicalAgents, accountBalance] = await Promise.all([
    source.query(listOwnerGrantReadbacksQuery, {}),
    source.query(listOwnedAgentDirectoryQuery, {
      now,
      paginationOpts: { numItems: 25, cursor },
    }),
    source.action(readOwnerAccountBalanceAction, {}),
  ])
  const principalRefs = canonicalAgents.page.map(({ principalRef }) => principalRef)
  const [ownerAgentReadbacks, connections] = await Promise.all([
    Promise.all(canonicalAgents.page.map(async ({ principalRef }) => {
      try {
        const readback = await source.query(readOwnerAgentReadbackQuery, {
          principalRef,
          periodStartAt,
          periodEndAt,
          paginationOpts: { numItems: 50, cursor: null },
        })
        return { principalRef, readback: mapOwnerAgentReadback(principalRef, readback) }
      } catch {
        return {
          principalRef,
          readback: {
            principalRef,
            activity: [],
            activityIsDone: true,
            dataState: 'unavailable' as const,
          },
        }
      }
    })),
    principalRefs.length === 0
      ? Promise.resolve([] as readonly AgentConnectionReadback[])
      : source.query(listOwnerConnectionReadbacksQuery, {
          principalRefs,
          now,
        }),
  ])
  const sources = readAgentCredentialSources(keys, grants)
  const projection = projectAgentDirectory(sources, canonicalAgents.page, connections, ownerAgentReadbacks.map(({ readback }) => readback))
  const enriched = await enrichAgentDirectoryActivity(projection, tools)
  const withAccount = {
    ...enriched,
    accountBalance,
    activityCoverage: enriched.details.some(({ activityTruncated }) => activityTruncated)
      ? 'recent' as const
      : 'complete' as const,
  }
  return canonicalAgents.isDone
    ? withAccount
    : { ...withAccount, nextCursor: canonicalAgents.continueCursor }
}

export function currentUtcMonthBounds(now: number = Date.now()): Readonly<{
  periodStartAt: number
  periodEndAt: number
}> {
  const date = new Date(now)
  const periodStartAt = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)
  return {
    periodStartAt,
    periodEndAt: Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1),
  }
}

function mapOwnerAgentReadback(
  principalRef: string,
  readback: OwnerAgentReadback,
): AgentOwnerReadback {
  const activity = readback.activity.page.map(({ callRef, credentialRef, toolRef, toolLabel, providerRef, state, deliveryState, paymentState, audAmountUnits, receiptRef, recoveryRef, createdAt, updatedAt }): AgentActivityView => ({
    callRef,
    credentialRef,
    toolRef,
    toolLabel,
    providerRef,
    state,
    deliveryState,
    paymentState,
    ...(audAmountUnits === undefined ? {} : { audAmountUnits }),
    ...(receiptRef === undefined ? {} : { receiptRef }),
    ...(recoveryRef === undefined ? {} : { recoveryRef }),
    createdAt,
    updatedAt,
  }))
  const usage = readback.usage.kind === 'available'
    ? {
        periodStartAt: readback.usage.periodStartAt,
        periodEndAt: readback.usage.periodEndAt,
        callCount: countUnits(readback.usage.callCountUnits),
        completedCallCount: countUnits(readback.usage.completedCountUnits),
        outcomeUnknownCallCount: countUnits(readback.usage.outcomeUnknownCountUnits),
        ...(readback.usage.settledSpendUnits === undefined
          ? {}
          : {
              settledSpend: {
                currency: 'AUD' as const,
                exponent: 6 as const,
                units: readback.usage.settledSpendUnits,
              },
            }),
        amountCoverage: readback.usage.amountCoverage,
        updatedAt: readback.usage.updatedAt,
      } satisfies AgentUsageSummary
    : readback.usage.kind === 'empty'
      ? {
          periodStartAt: readback.usage.periodStartAt,
          periodEndAt: readback.usage.periodEndAt,
          callCount: 0,
          completedCallCount: 0,
          outcomeUnknownCallCount: 0,
          settledSpend: { currency: 'AUD', exponent: 6, units: '0' },
          amountCoverage: 'complete' as const,
          updatedAt: readback.usage.periodStartAt,
        }
      : undefined
  const dataState = readback.usage.kind === 'unavailable'
    ? activity.length === 0 ? 'unavailable' as const : 'partial' as const
    : activity.length === 0 && readback.usage.kind === 'empty'
      ? 'empty' as const
      : 'source' as const
  return {
    principalRef,
    activity,
    activityIsDone: readback.activity.isDone,
    ...(readback.activity.isDone ? {} : { activityContinueCursor: readback.activity.continueCursor }),
    ...(usage === undefined ? {} : { usage }),
    dataState,
  }
}

function countUnits(value: string): number {
  const count = Number(value)
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('owner_agent_usage_count_invalid')
  return count
}

/**
 * Assemble the durable directory from credential source material. Canonical
 * principalRef is the sole grouping key: application names and credential
 * identifiers never merge two agents.
 */
export function projectAgentDirectory(
  readbacks: readonly AgentCredentialSource[],
  canonicalAgents: readonly CanonicalAgentDirectoryRecord[],
  connections: readonly AgentConnectionReadback[] = [],
  ownerReadbacks: readonly AgentOwnerReadback[] = [],
): AgentDirectoryProjection {
  const byPrincipal = new Map<string, AgentCredentialSource[]>()
  for (const readback of readbacks) {
    const group = byPrincipal.get(readback.principalId)
    if (group === undefined) byPrincipal.set(readback.principalId, [readback])
    else group.push(readback)
  }

  const details = canonicalAgents.flatMap((canonical) => {
    const sources = byPrincipal.get(canonical.principalRef) ?? []
    return [projectAgentDetail(
      canonical,
      sources,
      connections.filter(({ principalRef }) => principalRef === canonical.principalRef),
      ownerReadbacks.find(({ principalRef }) => principalRef === canonical.principalRef),
    )]
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
  connections: readonly AgentConnectionReadback[],
  ownerReadback?: AgentOwnerReadback,
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
    ...(credential.lastAuthenticatedAt === undefined
      ? {}
      : { lastAuthenticatedAt: credential.lastAuthenticatedAt }),
  }))
  const hasUnavailable = ordered.some(({ dataState }) => dataState === 'unavailable')
  const allUnavailable = ordered.every(({ dataState }) => dataState === 'unavailable')
  const ownerUnavailable = ownerReadback?.dataState === 'unavailable'
    || ownerReadback?.dataState === 'partial'
  const status: AgentDirectoryItem['status'] = canonical.status === 'connected' && (hasUnavailable || ownerUnavailable)
    ? 'attention'
    : canonical.status
  const activityReadback = ownerReadback?.activity ?? ordered.flatMap(({ activity }) => activity)
  const activityByCallRef = new Map<string, AgentActivityView>()
  for (const entry of activityReadback) {
    if (!activityByCallRef.has(entry.callRef)) activityByCallRef.set(entry.callRef, entry)
  }
  const activity = [...activityByCallRef.values()]
    .toSorted((left, right) => right.createdAt - left.createdAt)
  const lastSeenAt = Math.max(
    ...ordered.flatMap(({ key, activity }) => [
      ...(key.createdAt === undefined ? [] : [key.createdAt]),
      ...activity.map(({ updatedAt }) => updatedAt),
    ]),
    ...activity.map(({ updatedAt }) => updatedAt),
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
    ...(currentCanonicalCredential.lastAuthenticatedAt === undefined
      ? {}
      : { lastAuthenticatedAt: currentCanonicalCredential.lastAuthenticatedAt }),
    lastSeenAt: Math.max(lastSeenAt, canonical.lastSeenAt),
    connectionCount: connections.length,
    connectorDisplayNames: [...new Set(connections.map(({ connectorDisplayName }) => connectorDisplayName))],
    authorityMode: current?.key.authorityMode ?? canonical.authorityMode,
  }
  const usage = ownerReadback === undefined ? ordered.find(({ usage }) => usage !== undefined)?.usage : ownerReadback.usage
  const dataState = ownerReadback === undefined
    ? ordered.length === 0 || allUnavailable
      ? 'unavailable' as const
      : hasUnavailable
        ? 'partial' as const
        : ordered.every(({ dataState }) => dataState === 'empty')
          ? 'empty' as const
          : 'source' as const
    : ownerReadback.dataState
  return {
    agent,
    connections,
    credentials,
    ...(canonical.admissionLifecycle !== 'active' ? {} : { currentCredentialRef: currentCanonicalCredential.credentialRef }),
    authorityMode: current?.key.authorityMode ?? canonical.authorityMode,
    scopes: current?.key.scopes ?? canonical.scopes,
    ...(current?.grant === undefined ? {} : { grant: current.grant }),
    activity,
    ...(usage === undefined ? {} : { usage }),
    dataState,
    ...(canonical.credentialHistoryTruncated ? { credentialHistoryTruncated: true } : {}),
    ...(ownerReadback?.activityIsDone === false ? { activityTruncated: true } : {}),
  }
}

type AgentAccessToolCompareResult =
  | Readonly<{
      kind: 'ok'
      tools: readonly Readonly<{
        toolRef: string
        offering: Readonly<{ label: string }>
        business: Readonly<{ name: string }>
      }>[]
    }>
  | Readonly<{ kind: 'unavailable' }>

export type CompareTools = (
  input: Readonly<{ toolRefs: readonly string[] }>,
) => Promise<AgentAccessToolCompareResult>

export type AgentAccessToolActivityPort = Readonly<{
  compare: CompareTools
  isToolRef: (value: string) => boolean
}>

export async function enrichAgentDirectoryActivity(
  directory: AgentDirectoryProjection,
  tools: AgentAccessToolActivityPort,
): Promise<AgentDirectoryProjection> {
  const recentActivity = directory.details
    .flatMap(({ activity }) => activity)
    .toSorted((left, right) => right.updatedAt - left.updatedAt)
  const toolRefs = [...new Set(recentActivity.reduce<string[]>((refs, { toolRef }) => {
    if (tools.isToolRef(toolRef)) refs.push(toolRef)
    return refs
  }, []))]
    .slice(0, 40)
  if (toolRefs.length === 0) return directory

  const batches = Array.from({ length: Math.ceil(toolRefs.length / 4) }, (_, index) => (
    toolRefs.slice(index * 4, index * 4 + 4)
  ))
  const comparisons = await Promise.all(batches.map(async (toolRefs) => {
    try {
      return await tools.compare({ toolRefs })
    } catch {
      return undefined
    }
  }))
  const labels = new Map<string, Readonly<{ label: string; provider: string }>>(comparisons.flatMap((comparison) => (
    comparison?.kind === 'ok'
      ? comparison.tools.map((tool) => [tool.toolRef, {
        label: tool.offering.label,
        provider: tool.business.name,
      }] as const)
      : []
  )))
  return {
    ...directory,
    details: directory.details.map((detail) => ({
      ...detail,
      activity: detail.activity.map((entry) => {
        const tool = tools.isToolRef(entry.toolRef)
          ? labels.get(entry.toolRef)
          : undefined
        return tool === undefined ? entry : { ...entry, tool }
      }),
    })),
  }
}

export function readAgentCredentialSources(
  keys: readonly AgentAccessKeyInventoryItem[],
  grants: readonly AgentAccessOwnerGrantReadback[] = [],
): readonly AgentCredentialSource[] {
  const grantsByCredential = new Map(grants.map((grant) => [grant.credentialId, grant]))
  const boundKeys = keys.flatMap((key) => {
    const grant = grantsByCredential.get(key.keyId)
    return grant === undefined ? [] : [{ key, grant }]
  })
  return boundKeys.map(({ key, grant }) => {
    const { principalId } = grant
    return {
      key,
      grant,
      principalId,
      activity: [],
      dataState: 'source' as const,
    }
  })
}
