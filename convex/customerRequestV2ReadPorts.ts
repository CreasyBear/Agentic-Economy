import {
  writableCustomerRequestV2Aggregate,
  type CustomerRequestV2Aggregate,
} from '@/modules/customer-request/compiler'
import {
  routePlanGenerationIsInternallyConsistent,
  routePlanGenerationMatchesAggregate,
  type CustomerRequestRoutePlanGeneration,
} from '@/modules/customer-request/route-plan-generation'
import {
  customerRequestV2AggregateValue,
  routePlanGenerationV2Value,
} from '@/modules/customer-request/runtime'
import {
  aggregateIsInternallyConsistent,
  type GenerationCommandRow,
  type GenerationRefreshResult,
  type RequestHeadSnapshot,
  type RoutePlanHeadSnapshot,
} from '@/modules/customer-request/v2-write'
import type {
  CustomerRequestV2ReadPorts,
} from '@/modules/customer-request/v2-read'
import type { Infer } from 'convex/values'

import type { Id } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'

type Aggregate = Infer<typeof customerRequestV2AggregateValue>
type RouteGeneration = Infer<typeof routePlanGenerationV2Value>
type Db = QueryCtx['db'] | MutationCtx['db']
type DbCtx = QueryCtx | MutationCtx

export function customerRequestV2ReadPorts(ctx: DbCtx): CustomerRequestV2ReadPorts {
  const db = ctx.db
  return {
    loadRequestHead: async (requestId) => {
      const head = await db.query('customerRequestV2Heads')
        .withIndex('by_requestId', (query) => query.eq('requestId', requestId)).unique()
      return head === null ? null : toRequestHead(head)
    },

    loadRoutePlanHead: async (requestId) => {
      const head = await db.query('customerRequestV2RoutePlanHeads')
        .withIndex('by_requestId', (query) => query.eq('requestId', requestId)).unique()
      return head === null ? null : toRoutePlanHead(head)
    },

    loadRevision: async (requestId, requestRevision) => {
      const revision = await db.query('customerRequestV2Revisions')
        .withIndex('by_requestId_and_requestRevision', (query) => (
          query.eq('requestId', requestId).eq('requestRevision', requestRevision)
        )).unique()
      if (revision === null) return null
      return {
        requestId: revision.requestId,
        requestRevision: revision.requestRevision,
        aggregate: domainAggregate(revision.aggregate),
      }
    },

    loadExactRoutePlanGeneration: async (requestId, generationRef) => {
      const result = await readExactRoutePlanGeneration(db, requestId, generationRef)
      if (result.kind === 'not_found') return result
      return {
        kind: 'found' as const,
        routeGeneration: domainRouteGeneration(result.routeGeneration),
      }
    },

    loadCurrentDecisionAggregate: async (routeHead, principalId) => {
      const decision = await readCurrentDecisionAggregate(db, routeHead, principalId)
      return {
        commandKey: decision.commandKey,
        aggregate: domainAggregate(decision.aggregate),
      }
    },

    loadGenerationCommand: async (commandKey) => {
      const command = await db.query('customerRequestV2RoutePlanGenerationCommands')
        .withIndex('by_commandKey', (query) => query.eq('commandKey', commandKey)).unique()
      return command === null ? null : toGenerationCommandRow(command)
    },

    readGenerationRefreshCommandResult: async (command) => (
      await readGenerationRefreshCommandResult(db, {
        requestId: command.requestId,
        resultKind: command.resultKind,
        ...(command.retryReason === undefined ? {} : { retryReason: command.retryReason }),
        ...(command.resultAggregate === undefined
          ? {}
          : { resultAggregate: writableCustomerRequestV2Aggregate(command.resultAggregate) }),
        ...(command.resultingGeneration === undefined
          ? {}
          : { resultingGeneration: command.resultingGeneration }),
        ...(command.resultingGenerationRef === undefined
          ? {}
          : { resultingGenerationRef: command.resultingGenerationRef }),
        ...(command.resultingGenerationDigest === undefined
          ? {}
          : { resultingGenerationDigest: command.resultingGenerationDigest }),
      })
    ),

  }
}

export async function readVerifiedCommandReplay(
  db: Db,
  command: Readonly<{
    requestId: string
    resultingRevision: number
    aggregateDigest: string
    expectedRouteGeneration?: number
    resultingRouteGenerationRef?: string
    noEffect?: boolean
  }>,
): Promise<Readonly<{ kind: 'current'; aggregate: Aggregate }>> {
  const revision = await db.query('customerRequestV2Revisions')
    .withIndex('by_requestId_and_requestRevision', (query) => (
      query.eq('requestId', command.requestId).eq('requestRevision', command.resultingRevision)
    )).unique()
  if (revision === null) throw new Error('customer_request_v2_command_integrity_failure')
  if (revision.aggregate.aggregateDigest !== command.aggregateDigest
    || !aggregateIsInternallyConsistent(
      domainAggregate(revision.aggregate),
      command.resultingRevision - 1,
    )) {
    throw new Error('customer_request_v2_command_integrity_failure')
  }
  if ((revision.aggregate.outcome === 'plan_ready')
    !== (command.resultingRouteGenerationRef !== undefined)) {
    throw new Error('customer_request_v2_command_generation_integrity_failure')
  }
  if (command.resultingRouteGenerationRef !== undefined) {
    if (command.expectedRouteGeneration === undefined) {
      throw new Error('customer_request_v2_command_generation_integrity_failure')
    }
    const generation = await readExactRoutePlanGeneration(
      db, command.requestId, command.resultingRouteGenerationRef,
    )
    if (generation.kind !== 'found'
      || generation.routeGeneration.requestRevision !== command.resultingRevision
      || !routePlanGenerationMatchesAggregate(
        domainRouteGeneration(generation.routeGeneration),
        domainAggregate(revision.aggregate),
        command.noEffect === true ? command.expectedRouteGeneration - 1 : command.expectedRouteGeneration,
      )) {
      throw new Error('customer_request_v2_command_generation_integrity_failure')
    }
  }
  return { kind: 'current', aggregate: revision.aggregate }
}

export async function readGenerationRefreshCommandResult(
  db: Db,
  command: Readonly<{
    requestId: string
    resultKind: 'unchanged' | 'superseded' | 'needs_information' | 'unsupported' | 'retryable'
    retryReason?: GenerationCommandRow['retryReason']
    resultAggregate?: Aggregate
    resultingGeneration?: number
    resultingGenerationRef?: string
    resultingGenerationDigest?: string
  }>,
): Promise<GenerationRefreshResult> {
  if (command.resultKind === 'retryable') {
    if (command.retryReason === undefined || command.resultingGeneration !== undefined
      || command.resultingGenerationRef !== undefined || command.resultingGenerationDigest !== undefined
      || command.resultAggregate !== undefined) {
      throw new Error('customer_request_v2_refresh_command_integrity_failure')
    }
    return { kind: 'retryable', reason: command.retryReason }
  }
  if (command.resultKind === 'needs_information' || command.resultKind === 'unsupported') {
    if (command.retryReason !== undefined || command.resultingGeneration !== undefined
      || command.resultingGenerationRef !== undefined
      || command.resultingGenerationDigest !== undefined || command.resultAggregate === undefined
      || command.resultAggregate.outcome !== command.resultKind
      || !aggregateIsInternallyConsistent(
        domainAggregate(command.resultAggregate),
        command.resultAggregate.snapshot.revision - 1,
      )) {
      throw new Error('customer_request_v2_refresh_command_integrity_failure')
    }
    return {
      kind: command.resultKind,
      aggregate: domainAggregate(command.resultAggregate),
    }
  }
  if (command.retryReason !== undefined || command.resultingGeneration === undefined
    || command.resultingGenerationRef === undefined
    || command.resultingGenerationDigest === undefined || command.resultAggregate !== undefined) {
    throw new Error('customer_request_v2_refresh_command_integrity_failure')
  }
  const generation = await readExactRoutePlanGeneration(db, command.requestId, command.resultingGenerationRef)
  if (generation.kind !== 'found'
    || generation.routeGeneration.generation !== command.resultingGeneration
    || generation.routeGeneration.generationDigest !== command.resultingGenerationDigest) {
    throw new Error('customer_request_v2_refresh_command_integrity_failure')
  }
  return {
    kind: command.resultKind,
    routeGeneration: domainRouteGeneration(generation.routeGeneration),
  }
}

export async function readCurrentDecisionAggregate(
  db: Db,
  head: Readonly<{
    requestId: string
    currentRequestRevision: number
    currentGeneration: number
    currentGenerationRef?: string
    currentDecisionCommandKey?: string
    currentDecisionCommandDigest?: string
  }>,
  principalId: string,
): Promise<Readonly<{ commandKey: string; aggregate: Aggregate }>> {
  const commandKey = head.currentDecisionCommandKey
  const commandDigest = head.currentDecisionCommandDigest
  if (commandKey === undefined
    || commandDigest === undefined
    || head.currentGenerationRef === undefined) {
    throw new Error('customer_request_v2_current_decision_integrity_failure')
  }
  const command = await db.query('customerRequestV2RoutePlanGenerationCommands')
    .withIndex('by_commandKey', (query) => query.eq('commandKey', commandKey)).unique()
  if (command === null
    || command.commandDigest !== commandDigest
    || command.principalId !== principalId
    || command.requestId !== head.requestId
    || command.expectedRequestRevision !== head.currentRequestRevision
    || command.expectedGeneration !== head.currentGeneration
    || command.expectedGenerationRef !== head.currentGenerationRef
    || (command.resultKind !== 'needs_information' && command.resultKind !== 'unsupported')) {
    throw new Error('customer_request_v2_current_decision_integrity_failure')
  }
  const result = await readGenerationRefreshCommandResult(db, command)
  if (result.kind !== 'needs_information' && result.kind !== 'unsupported') {
    throw new Error('customer_request_v2_current_decision_integrity_failure')
  }
  if (result.aggregate.snapshot.requestId !== head.requestId
    || result.aggregate.snapshot.revision !== head.currentRequestRevision
    || result.aggregate.snapshot.principalId !== principalId) {
    throw new Error('customer_request_v2_current_decision_integrity_failure')
  }
  return { commandKey: command.commandKey, aggregate: writableCustomerRequestV2Aggregate(result.aggregate) }
}

export async function readExactRoutePlanGeneration(
  db: Db,
  requestId: string,
  generationRef: string,
) {
  const row = await db.query('customerRequestV2RoutePlanGenerations')
    .withIndex('by_requestId_and_generationRef', (query) => (
      query.eq('requestId', requestId).eq('generationRef', generationRef)
    )).unique()
  if (row === null) return { kind: 'not_found' as const }
  if (row.requestId !== row.routeGeneration.requestId
    || row.requestRevision !== row.routeGeneration.requestRevision
    || row.generation !== row.routeGeneration.generation
    || row.generationRef !== row.routeGeneration.generationRef
    || row.generationDigest !== row.routeGeneration.generationDigest
    || !routePlanGenerationIsInternallyConsistent(
      domainRouteGeneration(row.routeGeneration),
      row.generation - 1,
    )) {
    throw new Error('customer_request_route_plan_generation_integrity_failure')
  }
  return { kind: 'found' as const, routeGeneration: row.routeGeneration }
}

export function toGenerationCommandRow(row: Readonly<{
  commandKey: string
  commandDigest: string
  principalId: string
  requestId: string
  expectedRequestRevision: number
  expectedGeneration: number
  expectedGenerationRef: string
  expectedDecisionCommandKey?: string
  resultKind: GenerationCommandRow['resultKind']
  retryReason?: GenerationCommandRow['retryReason']
  resultAggregate?: Aggregate
  resultingGeneration?: number
  resultingGenerationRef?: string
  resultingGenerationDigest?: string
  committedAt: number
}>): GenerationCommandRow {
  return {
    commandKey: row.commandKey,
    commandDigest: row.commandDigest,
    principalId: row.principalId,
    requestId: row.requestId,
    expectedRequestRevision: row.expectedRequestRevision,
    expectedGeneration: row.expectedGeneration,
    expectedGenerationRef: row.expectedGenerationRef,
    ...(row.expectedDecisionCommandKey === undefined
      ? {}
      : { expectedDecisionCommandKey: row.expectedDecisionCommandKey }),
    resultKind: row.resultKind,
    ...(row.retryReason === undefined ? {} : { retryReason: row.retryReason }),
    ...(row.resultAggregate === undefined
      ? {}
      : { resultAggregate: domainAggregate(row.resultAggregate) }),
    ...(row.resultingGeneration === undefined
      ? {}
      : { resultingGeneration: row.resultingGeneration }),
    ...(row.resultingGenerationRef === undefined
      ? {}
      : { resultingGenerationRef: row.resultingGenerationRef }),
    ...(row.resultingGenerationDigest === undefined
      ? {}
      : { resultingGenerationDigest: row.resultingGenerationDigest }),
    committedAt: row.committedAt,
  }
}

export function toRequestHead(head: Readonly<{
  _id: Id<'customerRequestV2Heads'>
  requestId: string
  principalId: string
  delegatedAgentId: string
  currentRevision: number
  currentAggregateDigest: string
}>): RequestHeadSnapshot {
  return {
    id: head._id,
    requestId: head.requestId,
    principalId: head.principalId,
    delegatedAgentId: head.delegatedAgentId,
    currentRevision: head.currentRevision,
    currentAggregateDigest: head.currentAggregateDigest,
  }
}

export function toRoutePlanHead(head: Readonly<{
  _id: Id<'customerRequestV2RoutePlanHeads'>
  requestId: string
  currentGeneration: number
  currentRequestRevision: number
  currentGenerationRef?: string
  currentGenerationDigest?: string
  currentDecisionCommandKey?: string
  currentDecisionCommandDigest?: string
}>): RoutePlanHeadSnapshot {
  return {
    id: head._id,
    requestId: head.requestId,
    currentGeneration: head.currentGeneration,
    currentRequestRevision: head.currentRequestRevision,
    ...(head.currentGenerationRef === undefined
      ? {}
      : { currentGenerationRef: head.currentGenerationRef }),
    ...(head.currentGenerationDigest === undefined
      ? {}
      : { currentGenerationDigest: head.currentGenerationDigest }),
    ...(head.currentDecisionCommandKey === undefined
      ? {}
      : { currentDecisionCommandKey: head.currentDecisionCommandKey }),
    ...(head.currentDecisionCommandDigest === undefined
      ? {}
      : { currentDecisionCommandDigest: head.currentDecisionCommandDigest }),
  }
}

export function domainRouteGeneration(value: RouteGeneration): CustomerRequestRoutePlanGeneration
export function domainRouteGeneration(value: undefined): undefined
export function domainRouteGeneration(value: unknown): CustomerRequestRoutePlanGeneration | undefined
export function domainRouteGeneration(value: unknown): CustomerRequestRoutePlanGeneration | undefined {
  return value as CustomerRequestRoutePlanGeneration | undefined
}

export function domainAggregate(value: unknown): CustomerRequestV2Aggregate {
  return value as CustomerRequestV2Aggregate
}

/** Alias for WritePorts composition; the thinness contract reserves the `domainAggregate` name for this module. */
export const asDomainAggregate = domainAggregate
