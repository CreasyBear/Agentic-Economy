import { z } from 'zod'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import { PublicToolRegistrySchemaVersion } from '@/modules/capability-supply/tool-schemas'
import { decodeOpaqueCursor, encodeOpaqueCursor, InvalidOpaqueCursorError } from '../opaque-cursor'
import { toolChoiceSearchOutputSchema, type SearchEnvelope, type SupplyProjectionFreshness } from '../tool-choice-contracts'
import type { RegistryRetryArgs } from '../next-action'
import type { RegistryToolAssessment } from '../tool-reranker'

// The list and search cursors share an opaque envelope; search additionally
// binds pagination to its query, filters, limit, and current directory generation.
export function marketToolsCursorScope(freshness: SupplyProjectionFreshness): string {
  return freshness.completedAt === undefined ? 'current' : String(freshness.completedAt)
}

export function decodeMarketToolsCursor(cursor: string | undefined, scope: string): string | undefined {
  if (cursor === undefined) return undefined
  const decoded = decodeOpaqueCursor(cursor, { kind: 'market-tools', scope })
  if (decoded === undefined) throw new InvalidOpaqueCursorError()
  return decoded
}

export function opaquePagination<P extends Readonly<{ nextCursor?: string | undefined; limit: number; hasMore: boolean }>>(
  pagination: P,
  scope: string,
): P {
  return pagination.nextCursor === undefined
    ? pagination
    : { ...pagination, nextCursor: encodeOpaqueCursor({ kind: 'market-tools', scope, cursor: pagination.nextCursor }) }
}

const searchCursorSchema = z.strictObject({
  phase: z.enum(['current', 'coinbase']),
  offset: z.number().int().nonnegative(),
  currentCursor: z.string().optional(),
  directoryCursor: z.string().optional(),
})
type SearchCursor = z.infer<typeof searchCursorSchema>

export function scopedSearchCursor(input: {
  query: string
  source?: string | undefined
  filters?: unknown
  limit: number
}, freshness: SupplyProjectionFreshness, generation: string): string {
  return `${marketToolsCursorScope(freshness)}:${generation}:${canonicalDigest({
    query: input.query, source: input.source ?? 'all', filters: input.filters ?? {}, limit: input.limit,
  })}`
}

export function readSearchCursor(cursor: string | undefined, scope: string): SearchCursor {
  if (cursor === undefined) return { phase: 'current', offset: 0 }
  const decoded = decodeMarketToolsCursor(cursor, scope)
  let value: unknown
  try { value = JSON.parse(decoded ?? '') } catch (cause) {
    throw Object.assign(new InvalidOpaqueCursorError(), { cause })
  }
  const parsed = searchCursorSchema.safeParse(value)
  if (!parsed.success) throw new InvalidOpaqueCursorError()
  return parsed.data
}

function nextSearchCursor(scope: string, state: SearchCursor): string {
  return encodeOpaqueCursor({ kind: 'market-tools', scope, cursor: JSON.stringify(state) })
}

export function currentSearchContinuation(
  assessment: RegistryToolAssessment,
  completePool: boolean,
  cursor: SearchCursor,
  pageSize: number,
): SearchCursor | undefined {
  if (assessment.result.kind !== 'ok') return undefined
  if (!completePool) {
    return assessment.result.pagination.hasMore && assessment.result.pagination.nextCursor !== undefined
      ? { phase: 'current', offset: 0, currentCursor: assessment.result.pagination.nextCursor }
      : undefined
  }
  return assessment.verdict === 'matched' && cursor.offset + pageSize < assessment.result.items.length
    ? { phase: 'current', offset: cursor.offset + pageSize }
    : undefined
}

export function searchPagination(limit: number, scope: string, continuation: SearchCursor | undefined) {
  return {
    limit,
    ...(continuation === undefined ? {} : { nextCursor: nextSearchCursor(scope, continuation) }),
    hasMore: continuation !== undefined,
  }
}

// A page must be measured after projection: its next actions, metadata, and
// opaque cursor are included in the actual 16 KiB public response budget.
export function searchPageBudget(
  output: SearchEnvelope,
  pageSize: number,
  admittedCount: number,
  externalCount: number,
  externalLimit: number | undefined,
): { kind: 'fit' } | { kind: 'shrink_external'; limit: number } | { kind: 'shrink_current'; pageSize: number } | { kind: 'unavailable' } {
  if (new TextEncoder().encode(JSON.stringify(output)).length <= 16 * 1024) return { kind: 'fit' }
  if (externalCount > 0) {
    const limit = Math.max(0, Math.min(pageSize - admittedCount, externalLimit ?? pageSize) - 1)
    if (limit > 0 || admittedCount > 0) return { kind: 'shrink_external', limit }
  } else if (admittedCount > 1) {
    return { kind: 'shrink_current', pageSize: pageSize - 1 }
  }
  return { kind: 'unavailable' }
}

export function capacityExceededSearch(input: RegistryRetryArgs, assessed: SearchEnvelope['assessed'], freshness: SupplyProjectionFreshness): SearchEnvelope {
  const { query, source, filters, cursor, limit = 8 } = input
  return toolChoiceSearchOutputSchema.parse({
    schemaVersion: PublicToolRegistrySchemaVersion, kind: 'unavailable', query,
    reason: 'capacity_exceeded', results: [], partialResults: true,
    assessed, pagination: { limit, hasMore: false },
    next: [{ action: 'registry.tools.search', args: { query, limit, ...(source === undefined ? {} : { source }), ...(filters === undefined ? {} : { filters }), ...(cursor === undefined ? {} : { cursor }) }, authority: 'public' }],
    freshness,
  })
}
