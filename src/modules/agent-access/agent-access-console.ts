import { createAuthenticatedSourceTransport, sourceQuery } from '@/lib/server/convex-source'
import { createConvexMoneyQueryPort, MoneyQueryError } from '@/lib/server/money-query'
import { listCreditActivity, readCreditAccount, readKeyUsage, type MoneyQueryPort } from '@/modules/money/public'
import { listAgentAccessKeysServer } from '@/modules/agent-access/agent-access.functions'
import type { AgentAccessKeyInventoryItem } from '@/modules/agent-access/agent-access'
import type { AgentAccessOwnerGrantReadback } from '@/modules/agent-access/policy'
import type { AgentOperatorKeyReadback } from '@/modules/agent-access/agent-operator-view-model'

export type AgentAccessConsoleReadback = readonly AgentOperatorKeyReadback[]
const listOwnerGrantReadbacksQuery = sourceQuery<Record<string, never>, readonly AgentAccessOwnerGrantReadback[]>(
  'agentAccessPolicy:listOwnerGrantReadbacks',
)


export async function loadAgentAccessConsoleReadback(
  operations: AgentAccessOperationActivityPort,
): Promise<AgentAccessConsoleReadback> {
  const [keys, source] = await Promise.all([
    listAgentAccessKeysServer(),
    createAuthenticatedSourceTransport(),
  ])
  const grants = await source.query(listOwnerGrantReadbacksQuery, {})
  const readback = await readAgentAccessMoneyReadback(keys, createConvexMoneyQueryPort(), grants)
  return await enrichAgentAccessActivity(readback, operations)
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

export async function enrichAgentAccessActivity(
  readbacks: AgentAccessConsoleReadback,
  operations: AgentAccessOperationActivityPort,
): Promise<AgentAccessConsoleReadback> {
  const recentActivity = readbacks
    .flatMap(({ activity }) => activity)
    .toSorted((left, right) => right.observedAt - left.observedAt)
  const operationRefs = [...new Set(recentActivity.reduce<string[]>((refs, { operationKey }) => {
    if (operations.isOperationRef(operationKey)) refs.push(operationKey)
    return refs
  }, []))]
    .slice(0, 40)
  if (operationRefs.length === 0) return readbacks

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
  return readbacks.map((readback) => ({
    ...readback,
    activity: readback.activity.map((entry) => {
      const operation = operations.isOperationRef(entry.operationKey)
        ? labels.get(entry.operationKey)
        : undefined
      return operation === undefined ? entry : { ...entry, operation }
    }),
  }))
}

export async function readAgentAccessMoneyReadback(
  keys: readonly AgentAccessKeyInventoryItem[],
  port: MoneyQueryPort,
  grants: readonly AgentAccessOwnerGrantReadback[] = [],
): Promise<AgentAccessConsoleReadback> {
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
