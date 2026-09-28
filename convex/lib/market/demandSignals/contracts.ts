import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { v } from 'convex/values'
import { toolCatalogFiltersValidator } from '@/modules/market-demand/request-identity'

import { agentAccessPrincipalValue } from '../../../agentAccessPrincipals'
import { sourceWriteArgs } from '../../security/sourceWrite/contracts'

const scopeFields = {
  source: v.optional(v.union(v.literal('current'), v.literal('coinbase'))),
  filters: v.optional(toolCatalogFiltersValidator),
} as const

const demandSignalValue = v.object({
  requestRef: v.string(),
  query: v.string(),
  ...scopeFields,
  createdAt: v.number(),
  updatedAt: v.number(),
})

const requestFields = {
  agentPrincipal: agentAccessPrincipalValue,
  operationKey: v.string(),
  correlationId: v.string(),
  ...sourceWriteArgs,
} as const

export const recordArgsValue = v.object({
  query: v.string(),
  idempotencyKey: v.string(),
  ...scopeFields,
  ...requestFields,
})

export const recordResultValue = v.union(
  v.object({
    kind: v.union(v.literal('recorded'), v.literal('replayed')),
    requestRef: v.string(),
    query: v.string(),
    createdAt: v.number(),
  }),
  v.object({
    kind: v.literal('refused'),
    code: v.union(
      v.literal('unauthenticated'),
      v.literal('invalid_request'),
      v.literal('idempotency_conflict'),
    ),
  }),
)

export const listArgsValue = v.object({
  paginationOpts: paginationOptsValidator,
  ...requestFields,
})

export const listResultValue = v.union(
  v.object({ kind: v.literal('available'), requests: paginationResultValidator(demandSignalValue) }),
  v.object({ kind: v.literal('error'), code: v.union(v.literal('unauthenticated'), v.literal('source_unavailable')) }),
)

export const readArgsValue = v.object({
  requestRef: v.string(),
  ...requestFields,
})

export const readResultValue = v.union(
  v.object({ kind: v.literal('found'), request: demandSignalValue }),
  v.object({ kind: v.literal('withdrawn') }),
  v.object({ kind: v.literal('not_found') }),
  v.object({ kind: v.literal('error'), code: v.literal('unauthenticated') }),
)

export const withdrawResultValue = v.union(
  v.object({ kind: v.literal('withdrawn'), requestRef: v.string() }),
  v.object({ kind: v.literal('not_found') }),
  v.object({ kind: v.literal('error'), code: v.literal('unauthenticated') }),
)

export const ownerRecordArgsValue = v.object({
  query: v.string(),
  idempotencyKey: v.string(),
  ...scopeFields,
  operationKey: v.string(),
  correlationId: v.string(),
  ...sourceWriteArgs,
})
export const ownerWithdrawArgsValue = v.object({
  requestRef: v.string(),
  operationKey: v.string(),
  correlationId: v.string(),
  ...sourceWriteArgs,
})
export const ownerListArgsValue = v.object({ paginationOpts: paginationOptsValidator })
export const ownerReadArgsValue = v.object({ requestRef: v.string() })
export const ownerReplayArgsValue = v.object({ query: v.string(), idempotencyKey: v.string(), ...scopeFields })
export const ownerReplayResultValue = v.union(
  v.object({ kind: v.literal('replayed'), requestRef: v.string(), query: v.string(), createdAt: v.number() }),
  v.object({ kind: v.literal('not_found') }),
  v.object({ kind: v.literal('refused'), code: v.union(
    v.literal('unauthenticated'), v.literal('invalid_request'), v.literal('idempotency_conflict'),
  ) }),
)
export const ownerFindActiveArgsValue = v.object({ query: v.string(), ...scopeFields })
export const ownerFindActiveResultValue = v.union(
  v.object({ kind: v.literal('found'), request: demandSignalValue }),
  v.object({ kind: v.literal('not_found') }),
  v.object({ kind: v.literal('error'), code: v.union(v.literal('unauthenticated'), v.literal('invalid_request')) }),
)
