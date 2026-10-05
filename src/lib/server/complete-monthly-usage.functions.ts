import { z } from 'zod'
import { createServerFn } from '@tanstack/react-start'
import { monthlyDraftIntentSchema } from '@/modules/capability-execution/monthly-usage-draft'
import { monthlyCloseResultSchema,monthlyPartsPageSchema,readMonthlyCloseSnapshot } from '@/lib/export/monthly-usage-close'
import { callSourceMutation,callSourceQuery,sourceMutation,sourceQuery } from './convex-source'
const ref=z.strictObject({draftRef:z.string().regex(/^monthly-usage-close:[a-f0-9]{64}$/u)})
const page=ref.extend({cursor:z.string().max(20000).nullable()})
const policy=z.strictObject({automaticMonthly:z.boolean(),revision:z.number().int().nonnegative().safe(),ownerConsentCurrent:z.boolean(),schedulerActive:z.literal(false)})
const intent=z.strictObject({automaticMonthly:z.boolean(),expectedRevision:z.number().int().nonnegative().safe(),idempotencyRef:z.string().regex(/^usage-reporting:[a-f0-9-]{36}$/u)})
const request=sourceMutation<z.infer<typeof monthlyDraftIntentSchema>,z.infer<typeof monthlyCloseResultSchema>>('moneyMonthlyUsageDraft:requestCompleteMonth')
const read=sourceQuery<z.infer<typeof ref>,z.infer<typeof monthlyCloseResultSchema>>('moneyMonthlyUsageDraft:readCompleteMonth')
const documents=sourceQuery<{draftRef:string;paginationOpts:{numItems:number;cursor:string|null}},z.infer<typeof monthlyPartsPageSchema>>('moneyMonthlyUsageDraft:readMonthlyDocumentParts')
const financial=sourceQuery<{draftRef:string;paginationOpts:{numItems:number;cursor:string|null}},z.infer<typeof monthlyPartsPageSchema>>('moneyMonthlyUsageDraft:readMonthlyFinancialParts')
const readPolicy=sourceQuery<Record<string,never>,z.infer<typeof policy>>('moneyMonthlyUsageDraft:readReportingPolicy')
const configure=sourceMutation<z.infer<typeof intent>,{kind:'updated'|'replayed';revision:number}>('moneyMonthlyUsageDraft:configureReporting')
function verified(result:unknown){const parsed=monthlyCloseResultSchema.parse(result);if(parsed.kind==='available'&&parsed.close.state==='complete')readMonthlyCloseSnapshot(parsed.close);return parsed}
export const requestCompleteMonthlyUsageServer=createServerFn({method:'POST'}).validator(data=>monthlyDraftIntentSchema.parse(data)).handler(async({data})=>verified(await callSourceMutation(request,data)))
export const readCompleteMonthlyUsageServer=createServerFn({method:'GET'}).validator(data=>ref.parse(data)).handler(async({data})=>verified(await callSourceQuery(read,data)))
export const readMonthlyRelatedDocumentsServer=createServerFn({method:'GET'}).validator(data=>page.parse(data)).handler(async({data})=>monthlyPartsPageSchema.parse(await callSourceQuery(documents,{draftRef:data.draftRef,paginationOpts:{numItems:2,cursor:data.cursor}})))
export const readMonthlyFinancialPartsServer=createServerFn({method:'GET'}).validator(data=>page.parse(data)).handler(async({data})=>monthlyPartsPageSchema.parse(await callSourceQuery(financial,{draftRef:data.draftRef,paginationOpts:{numItems:2,cursor:data.cursor}})))
export const readUsageReportingPolicyServer=createServerFn({method:'GET'}).handler(async()=>policy.parse(await callSourceQuery(readPolicy,{})))
export const configureUsageReportingServer=createServerFn({method:'POST'}).validator(data=>intent.parse(data)).handler(async({data})=>z.strictObject({kind:z.enum(['updated','replayed']),revision:z.number().int().positive().safe()}).parse(await callSourceMutation(configure,data)))
