import {
  writableCustomerRequestV2Aggregate,
  type CustomerRequestV2Aggregate,
} from '@/modules/customer-request/compiler'
import {
  type CustomerRequestRoutePlanGeneration,
} from '@/modules/customer-request/route-plan-generation'
import {
  customerRequestV2AggregateValue,
  routePlanGenerationV2Value,
} from '@/modules/customer-request/runtime'
import {
  type GenerationCommandRow,
  type GenerationRefreshResult,
  type RequestHeadSnapshot,
  type RoutePlanHeadSnapshot,
} from '@/modules/customer-request/v2-write'
import type {
  CustomerRequestV2ReadPorts,
} from '@/modules/customer-request/v2-read'
import type { Infer } from 'convex/values'

import type { MutationCtx, QueryCtx } from './_generated/server'
import { unlistedCustomerRequestTables } from './customerRequestUnlisted'

type Aggregate = Infer<typeof customerRequestV2AggregateValue>
type RouteGeneration = Infer<typeof routePlanGenerationV2Value>
type Db = QueryCtx['db'] | MutationCtx['db']
type DbCtx = QueryCtx | MutationCtx

void writableCustomerRequestV2Aggregate

export function customerRequestV2ReadPorts(_ctx: DbCtx): CustomerRequestV2ReadPorts {
  return {
    loadRequestHead: unlistedCustomerRequestTables,
    loadRoutePlanHead: unlistedCustomerRequestTables,
    loadRevision: unlistedCustomerRequestTables,
    loadExactRoutePlanGeneration: unlistedCustomerRequestTables,
    loadCurrentDecisionAggregate: unlistedCustomerRequestTables,
    loadGenerationCommand: unlistedCustomerRequestTables,
    readGenerationRefreshCommandResult: unlistedCustomerRequestTables,
  }
}

export async function readVerifiedCommandReplay(
  _db: Db,
  ..._rest: unknown[]
): Promise<never> {
  return unlistedCustomerRequestTables()
}

export async function readGenerationRefreshCommandResult(
  _db: Db,
  ..._rest: unknown[]
): Promise<GenerationRefreshResult> {
  return unlistedCustomerRequestTables()
}

export async function readCurrentDecisionAggregate(
  _db: Db,
  ..._rest: unknown[]
): Promise<Readonly<{ commandKey: string; aggregate: CustomerRequestV2Aggregate }>> {
  return unlistedCustomerRequestTables()
}

export async function readExactRoutePlanGeneration(
  _db: Db,
  ..._rest: unknown[]
) {
  return unlistedCustomerRequestTables()
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
  _id: string
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
  _id: string
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

export const asDomainAggregate = domainAggregate
