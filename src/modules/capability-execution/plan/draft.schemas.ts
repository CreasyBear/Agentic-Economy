import { z } from 'zod'
import { brandNonEmpty } from '@/modules/common/ids'
import { planJsonSchema } from './parse'

const nodeId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u).transform(value => brandNonEmpty(value, 'PlanNodeId'))
export const planSuggestInputSchema = z.strictObject({})
export const mercatorImportInputSchema = z.strictObject({
  flowPlan: z.strictObject({ nodes: z.array(z.strictObject({
    id: nodeId, serviceId: z.string().min(1).max(200), method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
    path: z.string().min(1).max(2048), input: z.record(z.string(), z.json()), dependsOn: z.array(nodeId).max(10),
  })).min(1).max(10) }),
  providerHostByServiceId: z.record(z.string().min(1).max(200), z.string().min(1).max(253)),
})
export const planDraftResultSchema = z.union([
  z.strictObject({ kind: z.literal('drafts'), plans: z.array(planJsonSchema).min(1).max(10), validation: z.literal('untyped_ref') }),
  z.strictObject({ kind: z.literal('refused'), code: z.string().min(1).max(100) }),
])
