import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import {
  callPublicSourceMutation,
  callSourceQuery,
  createConvexServerFunctionAssertion,
  sourceMutation,
  sourceQuery,
  type ConvexServerFunctionAssertion,
} from '@/lib/server/convex-source'

import {
  CLERK_SECURITY_OBSERVE_OPERATION,
  CLERK_SECURITY_OBSERVE_SCOPE,
  type AccountSecurityHistoryItem,
  type AccountSecurityHistoryResult,
  type ClerkSecurityObservation,
  type ClerkSecurityObservationResult,
} from './account-security'

type RecordObservationArgs = ClerkSecurityObservation & Readonly<{
  serviceAuth: ConvexServerFunctionAssertion
}>

type NativeHistoryPage = Readonly<{
  page: readonly AccountSecurityHistoryItem[]
  isDone: boolean
  continueCursor: string
}>

const recordObservationMutation = sourceMutation<RecordObservationArgs, ClerkSecurityObservationResult>(
  'securityAccountHistory:recordClerkSecurityEventForServer',
)
const listHistoryQuery = sourceQuery<
  { paginationOpts: { numItems: number; cursor: string | null } },
  NativeHistoryPage
>('securityAccountHistory:listCurrentOwnerSecurityHistory')

const historyInput = z.strictObject({
  cursor: z.string().max(4_096).nullable().optional(),
})

export async function recordClerkSecurityObservationThroughSource(
  command: ClerkSecurityObservation,
): Promise<ClerkSecurityObservationResult> {
  const serviceAuth = await createConvexServerFunctionAssertion({
    operation: CLERK_SECURITY_OBSERVE_OPERATION,
    scope: CLERK_SECURITY_OBSERVE_SCOPE,
    command,
  })
  return await callPublicSourceMutation(recordObservationMutation, { ...command, serviceAuth })
}

export async function readAccountSecurityHistoryThroughSource(
  cursor: string | null = null,
): Promise<AccountSecurityHistoryResult> {
  try {
    const page = await callSourceQuery(listHistoryQuery, {
      paginationOpts: { numItems: 25, cursor },
    })
    return {
      kind: 'available',
      page: {
        items: page.page,
        continueCursor: page.continueCursor,
        isDone: page.isDone,
      },
    }
  } catch {
    return { kind: 'unavailable', reason: 'source_unavailable' }
  }
}

export const readAccountSecurityHistoryServer = createServerFn({ method: 'GET' })
  .validator((input) => historyInput.parse(input ?? {}))
  .handler(async ({ data }): Promise<AccountSecurityHistoryResult> => {
    return await readAccountSecurityHistoryThroughSource(data.cursor ?? null)
  })
