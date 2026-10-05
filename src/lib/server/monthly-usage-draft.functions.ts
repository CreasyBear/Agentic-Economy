import { z } from 'zod'
import { createServerFn } from '@tanstack/react-start'
import { monthlyDraftIntentSchema, readFrozenMonthlyDraft, MAX_MONTHLY_DRAFT_BYTES } from '@/modules/capability-execution/monthly-usage-draft'
import { monthlyDraftRefSearchSchema } from '@/lib/call-recovery/activity-return-scope'
import { callSourceAction, sourceAction, callSourceQuery, sourceQuery } from './convex-source'
const resultSchema = z.discriminatedUnion('kind', [
  z.strictObject({kind: z.literal('available'), draftRef: z.string(), snapshotJson: z.string().max(MAX_MONTHLY_DRAFT_BYTES), snapshotDigest: z.string(), issuedInvoice: z.literal(false), authoritativeForConsequences: z.literal(false)}),
  ...(['refused', 'unavailable', 'setup_required'] as const).map(kind => z.strictObject({kind: z.literal(kind), code: z.string()})),
])
export type MonthlyDraftResult = z.infer<typeof resultSchema>
const createDraft = sourceAction<z.infer<typeof monthlyDraftIntentSchema>, MonthlyDraftResult>('moneyMonthlyUsageDraft:createOwnerDraft')
export const createOwnerMonthlyUsageDraftServer = createServerFn({method: 'POST'})
  .validator(data => monthlyDraftIntentSchema.parse(data))
  .handler(async ({data}) => {
    const result = resultSchema.parse(await callSourceAction(createDraft, data))
    if (result.kind === 'available') readFrozenMonthlyDraft(result.snapshotJson, result.snapshotDigest)
    return result
  })

const readDraft = sourceQuery<{draftRef: string}, MonthlyDraftResult>('moneyMonthlyUsageDraft:readOwnerDraft')
export const readOwnerMonthlyUsageDraftServer = createServerFn({method: 'GET'})
  .validator(data => z.strictObject({draftRef: monthlyDraftRefSearchSchema.unwrap().unwrap()}).parse(data))
  .handler(async ({data}) => {
    const result = resultSchema.parse(await callSourceQuery(readDraft, data))
    if (result.kind === 'available') readFrozenMonthlyDraft(result.snapshotJson, result.snapshotDigest)
    return result
  })
