import { z } from 'zod'

import type { PublicOperationDescriptor } from '@/modules/capability-supply/public'
import {
  publicOperationAuthenticationSchema,
  publicOperationAvailabilitySchema,
  publicOperationNavigationSchema,
  publicOperationParameterSchema,
  publicOperationPriceSchema,
  operationComparisonFactSchema,
  operationSearchFiltersSchema,
  operationSearchPaginationSchema,
  operationSearchRankingSchema,
} from '@/modules/capability-supply/operation-schemas'
import type { OperationCompareResult, OperationSearchResult } from '@/modules/capability-supply/public'

export const publicOperationChoiceSchema = z.strictObject({
  operationRef: z.string(),
  capabilityId: z.string(),
  title: z.string(),
  summary: z.string(),
  supplier: z.strictObject({ name: z.string(), slug: z.string() }),
  price: publicOperationPriceSchema,
  authentication: publicOperationAuthenticationSchema,
  availability: publicOperationAvailabilitySchema,
  parameters: z.array(publicOperationParameterSchema).optional(),
  navigation: z.array(publicOperationNavigationSchema),
})

export type PublicOperationChoice = z.infer<typeof publicOperationChoiceSchema>

function projectChoiceNavigation(
  navigation: PublicOperationDescriptor['navigation'],
) {
  return navigation.map(({ inputSchema: _inputSchema, surfaces, ...relation }) => ({
    ...relation,
    ...(surfaces === undefined ? {} : { surfaces: [...surfaces] }),
  }))
}

export function projectOperationChoice(operation: PublicOperationDescriptor): PublicOperationChoice {
  return publicOperationChoiceSchema.parse({
    operationRef: operation.operationRef,
    capabilityId: operation.contract.capabilityId,
    title: operation.offering.label,
    summary: operation.summary,
    supplier: { name: operation.business.name, slug: operation.business.slug },
    price: operation.commercial.price,
    authentication: operation.authentication,
    availability: operation.availability,
    ...(operation.parameters === undefined ? {} : { parameters: operation.parameters }),
    navigation: projectChoiceNavigation(operation.navigation),
  })
}

export const operationChoiceSearchOutputSchema = z.union([
  z.strictObject({
    kind: z.literal('ok'),
    schemaVersion: z.literal('registry-operations:v1'),
    query: z.string(),
    items: z.array(publicOperationChoiceSchema),
    matchedCount: z.number().int().nonnegative(),
    ranking: z.array(operationSearchRankingSchema),
    pagination: operationSearchPaginationSchema,
    navigation: z.array(publicOperationNavigationSchema),
  }),
  z.strictObject({ kind: z.literal('no_candidates'), schemaVersion: z.literal('registry-operations:v1'), query: z.string(), appliedFilters: operationSearchFiltersSchema, matchedCount: z.number().int().nonnegative(), ranking: z.array(operationSearchRankingSchema), navigation: z.array(publicOperationNavigationSchema) }),
  z.strictObject({ kind: z.literal('unavailable'), schemaVersion: z.literal('registry-operations:v1'), reason: z.enum(['query_invalid', 'source_unavailable', 'source_capacity_exceeded']), navigation: z.array(publicOperationNavigationSchema) }),
])

export const operationChoiceCompareOutputSchema = z.union([
  z.strictObject({
    kind: z.literal('ok'),
    schemaVersion: z.literal('registry-operations:v1'),
    operations: z.array(publicOperationChoiceSchema),
    facts: z.array(operationComparisonFactSchema),
    navigation: z.array(publicOperationNavigationSchema),
  }),
  z.strictObject({ kind: z.literal('unavailable'), schemaVersion: z.literal('registry-operations:v1'), reason: z.enum(['query_invalid', 'operation_not_found', 'operation_unavailable']), navigation: z.array(publicOperationNavigationSchema) }),
])

export function projectOperationSearchChoices(result: OperationSearchResult) {
  const projected = result.kind === 'ok'
    ? {
        ...result,
        items: result.items.map(projectOperationChoice),
        navigation: projectChoiceNavigation(result.navigation),
      }
    : { ...result, navigation: projectChoiceNavigation(result.navigation) }
  return operationChoiceSearchOutputSchema.parse(projected)
}

export function projectOperationCompareChoices(result: OperationCompareResult) {
  const projected = result.kind === 'ok'
    ? {
        ...result,
        operations: result.operations.map(projectOperationChoice),
        navigation: projectChoiceNavigation(result.navigation),
      }
    : { ...result, navigation: projectChoiceNavigation(result.navigation) }
  return operationChoiceCompareOutputSchema.parse(projected)
}
