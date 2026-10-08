import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import type { ConvexSourceTransport } from '@/lib/server/convex-source'
import { readOwnerPlanPageThroughSource, listOwnerPlansThroughSource, decideOwnerPlanThroughSource, cancelOwnerPlanThroughSource } from '@/lib/server/plan-owner-source'
import { ownerPlanDecisionSchema } from './owner.contracts'

export const readOwnerPlanServer = createServerFn({ method: 'GET' })
  .validator((data) => z.strictObject({ planRef: z.string().min(1).max(300) }).parse(data))
  .handler(({ data }) => readOwnerPlanPageThroughSource(data.planRef))
/** Owner list seam for a composed protected read; authority remains in the backend. */
export function listOwnerPlansWithTransport(transport: ConvexSourceTransport) {
  return listOwnerPlansThroughSource(transport)
}
export const listOwnerPlansServer = createServerFn({ method: 'GET' }).handler(() => listOwnerPlansThroughSource())
export const decideOwnerPlanServer = createServerFn({ method: 'POST' })
  .validator((data) => ownerPlanDecisionSchema.parse(data))
  .handler(({ data, context }) => decideOwnerPlanThroughSource(data, context))

export const cancelOwnerPlanServer = createServerFn({ method: 'POST' })
  .validator((data) => z.strictObject({ planRef: z.string().min(1).max(300) }).parse(data))
  .handler(({ data, context }) => cancelOwnerPlanThroughSource(data.planRef, context))
