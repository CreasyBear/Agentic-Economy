import { auth } from '@clerk/tanstack-react-start/server'
import { createServerFn } from '@tanstack/react-start'
import { callSourceAction, callSourceQuery, sourceAction, sourceQuery } from '@/lib/server/convex-source'
import { paidCallReportInputSchema, paidCallReportViewSchema, type PaidCallReportView } from './paid-call-report'

const read = sourceQuery<{ callRef: string }, PaidCallReportView>('capabilityCallReports:readOwner')
const report = sourceAction<{ callRef: string }, PaidCallReportView>('capabilityCallReports:reportOwner')

async function authenticated(): Promise<boolean> {
  const identity = await auth()
  return identity.isAuthenticated && identity.userId !== null
}
const ownerRequired = (callRef: string): PaidCallReportView => ({ kind: 'refused', callRef, code: 'owner_required', retryable: false })

export const readOwnerPaidCallReportServer = createServerFn({ method: 'GET' })
  .validator(data => paidCallReportInputSchema.parse(data))
  .handler(async ({ data }): Promise<PaidCallReportView> => {
    if (!await authenticated()) return ownerRequired(data.callRef)
    return paidCallReportViewSchema.parse(await callSourceQuery(read, data))
  })

export const reportOwnerPaidCallServer = createServerFn({ method: 'POST' })
  .validator(data => paidCallReportInputSchema.parse(data))
  .handler(async ({ data }): Promise<PaidCallReportView> => {
    if (!await authenticated()) return ownerRequired(data.callRef)
    return paidCallReportViewSchema.parse(await callSourceAction(report, data))
  })
