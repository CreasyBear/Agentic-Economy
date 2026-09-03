import { z } from 'zod'

import { jsonValueSchema } from '@/modules/capability-contract/public'
import type {
  OperationCompareResult,
  OperationDetailResult,
  OperationSearchResult,
  PublicOperationDescriptor,
} from '@/modules/capability-supply/public'
import {
  publicOperationAuthenticationSchema,
  publicOperationParameterSchema,
  publicOperationPaymentSchema,
} from '@/modules/capability-supply/operation-schemas'
import { exactAmountSchema, formatExactAmount } from '@/modules/money/public'
import {
  projectOperationHealth,
  type OperationHealthStatus,
} from '@/modules/capability-supply/operation-health'

export type { OperationHealthStatus } from '@/modules/capability-supply/operation-health'

export const operationHealthStatusSchema = z.enum([
  'operational',
  'degraded',
  'unverified',
])

export const operationCatalogFiltersSchema = z.strictObject({
  networkId: z.string().trim().min(1).max(200).optional(),
  location: z.string().trim().min(1).max(200).optional(),
  effects: z.array(z.enum(['data_release', 'financial_exposure', 'external_state_change'])).max(3).optional(),
  dataUse: z.array(z.enum(['public', 'personal', 'sensitive', 'credential'])).max(4).optional(),
  healthStatus: z.array(operationHealthStatusSchema).min(1).max(3).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  maximumPrice: exactAmountSchema.optional(),
})

export const operationListInputSchema = z.strictObject({
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().max(512).optional(),
  filters: operationCatalogFiltersSchema.optional(),
})
export const operationCatalogSearchInputSchema = z.strictObject({
  query: z.string().trim().min(1).max(256),
  limit: z.number().int().min(1).max(20).default(10),
  cursor: z.string().max(512).optional(),
  filters: operationCatalogFiltersSchema.optional(),
})
export const operationDescribeInputSchema = z.strictObject({
  operationRef: z.string().regex(/^operation:v1:[0-9a-f]{64}$/),
})
export const operationCatalogPaginationSchema = z.strictObject({
  limit: z.number().int().positive(),
  nextCursor: z.string().optional(),
  hasMore: z.boolean(),
})

export const compactOperationCandidateSchema = z.strictObject({
  operationRef: z.string(),
  capabilityId: z.string(),
  title: z.string(),
  description: z.string(),
  provider: z.strictObject({ name: z.string(), slug: z.string() }),
  priceLabel: z.string(),
  healthStatus: operationHealthStatusSchema,
  lastCheckedAt: z.number().optional(),
  lastHealthyAt: z.number().optional(),
})
export const publicOperationChoiceSchema = compactOperationCandidateSchema
export type PublicOperationChoice = z.infer<typeof publicOperationChoiceSchema>

const catalogUnavailableSchema = z.strictObject({
  kind: z.literal('unavailable'),
  schemaVersion: z.literal('registry-operations:v3'),
  reason: z.enum(['query_invalid', 'source_unavailable', 'source_capacity_exceeded']),
})
export const operationChoiceListOutputSchema = z.union([
  z.strictObject({
    kind: z.literal('ok'),
    schemaVersion: z.literal('registry-operations:v3'),
    count: z.number().int().nonnegative(),
    items: z.array(compactOperationCandidateSchema).max(100),
    pagination: operationCatalogPaginationSchema,
  }),
  catalogUnavailableSchema,
])
export const operationChoiceSearchOutputSchema = z.union([
  z.strictObject({
    kind: z.literal('ok'),
    schemaVersion: z.literal('registry-operations:v3'),
    query: z.string(),
    count: z.number().int().nonnegative(),
    items: z.array(compactOperationCandidateSchema).max(20),
    pagination: operationCatalogPaginationSchema,
  }),
  z.strictObject({
    kind: z.literal('no_candidates'),
    schemaVersion: z.literal('registry-operations:v3'),
    query: z.string(),
    count: z.literal(0),
    items: z.tuple([]),
    note: z.string(),
    pagination: operationCatalogPaginationSchema,
  }),
  catalogUnavailableSchema,
])

const operationDescriptionSchema = z.strictObject({
  operationRef: z.string(),
  capabilityId: z.string(),
  title: z.string(),
  description: z.string(),
  provider: z.strictObject({ name: z.string(), slug: z.string() }),
  priceLabel: z.string(),
  healthStatus: operationHealthStatusSchema,
  lastCheckedAt: z.number().optional(),
  lastHealthyAt: z.number().optional(),
  inputJsonSchema: z.record(z.string(), jsonValueSchema),
  outputJsonSchema: z.record(z.string(), jsonValueSchema),
  materialTerms: z.array(z.strictObject({ label: z.string(), value: z.string() })),
  dataUse: z.array(z.strictObject({
    effectId: z.string(),
    inputPointer: z.string(),
    classification: z.enum(['public', 'personal', 'sensitive', 'credential']),
    phase: z.enum(['preparation', 'execution']),
    recipient: z.enum(['candidate_binding', 'selected_binding', 'named_recipient']),
    purposes: z.array(z.string()),
  })),
  effects: z.array(z.strictObject({
    effectId: z.string(),
    class: z.enum(['data_release', 'financial_exposure', 'external_state_change']),
    authority: z.enum(['none', 'explicit', 'mandate_or_explicit']),
    reversibility: z.enum(['not_applicable', 'reversible', 'conditional', 'irreversible']),
  })),
  evidence: z.array(z.strictObject({
    evidenceId: z.string(),
    outputPointer: z.string(),
    purpose: z.enum(['comparison', 'completion', 'recovery']),
  })),
  authentication: publicOperationAuthenticationSchema,
  payment: publicOperationPaymentSchema.optional(),
  parameters: z.array(publicOperationParameterSchema).optional(),
})
export const operationChoiceDescribeOutputSchema = z.union([
  z.strictObject({
    kind: z.literal('found'),
    schemaVersion: z.literal('registry-operations:v2'),
    operation: operationDescriptionSchema,
  }),
  z.strictObject({
    kind: z.literal('not_found'),
    schemaVersion: z.literal('registry-operations:v2'),
    operationRef: z.string(),
  }),
  z.strictObject({
    kind: z.literal('unavailable'),
    schemaVersion: z.literal('registry-operations:v2'),
    operationRef: z.string(),
    reason: z.string(),
  }),
])
export const operationChoiceCompareOutputSchema = z.union([
  z.strictObject({
    kind: z.literal('ok'),
    schemaVersion: z.literal('registry-operations:v2'),
    operations: z.array(compactOperationCandidateSchema).min(1).max(4),
  }),
  z.strictObject({
    kind: z.literal('unavailable'),
    schemaVersion: z.literal('registry-operations:v2'),
    reason: z.enum(['query_invalid', 'operation_not_found', 'operation_unavailable']),
  }),
])

function priceLabel(operation: PublicOperationDescriptor): string {
  const price = operation.commercial.price
  if (price.kind === 'on_request') return 'Price confirmed at inspection'
  if (price.kind === 'fixed') {
    const amount = formatExactAmount(price.amount)
    return amount === undefined ? 'Price confirmed at inspection' : `${price.amount.currency} ${amount}`
  }
  const minimum = formatExactAmount(price.minimum)
  const maximum = formatExactAmount(price.maximum)
  return minimum === undefined || maximum === undefined || price.minimum.currency !== price.maximum.currency
    ? 'Price confirmed at inspection'
    : `${price.minimum.currency} ${minimum}\u2013${maximum}`
}

function projectCompactOperation(operation: PublicOperationDescriptor) {
  return compactOperationCandidateSchema.parse({
    operationRef: operation.operationRef,
    capabilityId: operation.contract.capabilityId,
    title: operation.offering.label,
    description: operation.summary,
    provider: { name: operation.business.name, slug: operation.business.slug },
    priceLabel: priceLabel(operation),
    ...projectOperationHealth(operation.availability, Date.now()),
  })
}

function admittedHealth(filters: unknown): Set<OperationHealthStatus> {
  const parsed = operationCatalogFiltersSchema.safeParse(filters)
  return new Set(parsed.success && parsed.data.healthStatus !== undefined
    ? parsed.data.healthStatus
    : ['operational'])
}

function visibleOperations(operations: readonly PublicOperationDescriptor[], filters: unknown) {
  const admitted = admittedHealth(filters)
  return operations.map(projectCompactOperation).filter((operation) => admitted.has(operation.healthStatus))
}

export function projectOperationListChoices(result: OperationSearchResult, filters?: unknown) {
  if (result.kind === 'unavailable') {
    return operationChoiceListOutputSchema.parse({
      kind: 'unavailable', schemaVersion: 'registry-operations:v3', reason: result.reason,
    })
  }
  const items = result.kind === 'ok' ? visibleOperations(result.items, filters) : []
  return operationChoiceListOutputSchema.parse({
    kind: 'ok',
    schemaVersion: 'registry-operations:v3',
    count: items.length,
    items,
    pagination: result.kind === 'ok' ? result.pagination : { limit: 50, hasMore: false },
  })
}

export function projectOperationSearchChoices(result: OperationSearchResult, filters?: unknown) {
  if (result.kind === 'unavailable') {
    return operationChoiceSearchOutputSchema.parse({
      kind: 'unavailable', schemaVersion: 'registry-operations:v3', reason: result.reason,
    })
  }
  const items = result.kind === 'ok' ? visibleOperations(result.items, filters) : []
  if (result.kind === 'no_candidates' || items.length === 0) {
    return operationChoiceSearchOutputSchema.parse({
      kind: 'no_candidates',
      schemaVersion: 'registry-operations:v3',
      query: result.query,
      count: 0,
      items: [],
      note: 'No operational Operations matched this search.',
      pagination: result.kind === 'ok' ? result.pagination : { limit: 10, hasMore: false },
    })
  }
  return operationChoiceSearchOutputSchema.parse({
    kind: 'ok',
    schemaVersion: 'registry-operations:v3',
    query: result.query,
    count: items.length,
    items,
    pagination: result.pagination,
  })
}

export function projectOperationDescription(result: OperationDetailResult) {
  if (result.kind !== 'found') {
    return operationChoiceDescribeOutputSchema.parse({
      kind: result.kind,
      schemaVersion: 'registry-operations:v2',
      operationRef: result.operationRef,
      ...(result.kind === 'unavailable' ? { reason: result.reason } : {}),
    })
  }
  const operation = result.operation
  return operationChoiceDescribeOutputSchema.parse({
    kind: 'found',
    schemaVersion: 'registry-operations:v2',
    operation: {
      operationRef: operation.operationRef,
      capabilityId: operation.contract.capabilityId,
      title: operation.offering.label,
      description: operation.summary,
      provider: { name: operation.business.name, slug: operation.business.slug },
      priceLabel: priceLabel(operation),
      ...projectOperationHealth(operation.availability, Date.now()),
      inputJsonSchema: operation.contract.inputJsonSchema,
      outputJsonSchema: operation.contract.outputJsonSchema,
      materialTerms: operation.commercial.materialTerms,
      dataUse: operation.dataUse,
      effects: operation.effects,
      evidence: operation.evidence,
      authentication: operation.authentication,
      ...(operation.payment === undefined ? {} : { payment: operation.payment }),
      ...(operation.parameters === undefined ? {} : { parameters: operation.parameters }),
    },
  })
}

export function projectOperationCompareChoices(result: OperationCompareResult) {
  return operationChoiceCompareOutputSchema.parse(result.kind === 'ok'
    ? {
        kind: 'ok',
        schemaVersion: 'registry-operations:v2',
        operations: result.operations.map(projectCompactOperation),
      }
    : { kind: 'unavailable', schemaVersion: 'registry-operations:v2', reason: result.reason })
}
