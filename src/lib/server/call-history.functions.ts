import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { callSourceQuery, sourceQuery } from '@/lib/server/convex-source'

const listOwnerCallsQuery = sourceQuery<{
  principalRef?: string
  paginationOpts: { numItems: number; cursor: string | null }
}, {
  page: Array<{
    callRef: string
    accountRef: string
    principalRef: string
    credentialRef: string
    operationRef: string
    providerRef: string
    operationLabel: string
    state: 'completed' | 'refused' | 'outcome_unknown'
    deliveryState: 'delivered' | 'not_delivered' | 'unknown'
    paymentState: 'settled' | 'released' | 'unknown' | 'not_applicable'
    providerObligationState?: 'accrued' | 'held' | 'settled' | 'reversed' | 'disputed'
    providerAmountUnits?: string
    audAmountUnits?: string
    receiptRef?: string
    recoveryRef?: string
    latencyMs: number
    createdAt: number
    updatedAt: number
  }>
  continueCursor: string
  isDone: boolean
}>('capabilityOperationCalls:listOwnerCalls')

const inputSchema = z.strictObject({
  cursor: z.string().max(2_000).nullable().optional(),
  principalRef: z.string().min(1).max(200).optional(),
})

export const readOwnerCallsServer = createServerFn({ method: 'GET' })
  .validator((data) => inputSchema.parse(data ?? {}))
  .handler(async ({ data }) => await callSourceQuery(listOwnerCallsQuery, {
    ...(data.principalRef === undefined ? {} : { principalRef: data.principalRef }),
    paginationOpts: { numItems: 50, cursor: data.cursor ?? null },
  }))
