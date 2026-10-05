import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { callSourceMutation, callSourceQuery, sourceMutation, sourceQuery } from './convex-source'
import { callUsageExportInputSchema } from '@/lib/export/call-usage-export'
import { readUsageReportSchema, usageReportPartsPageSchema, listUsageReportsPageSchema } from '@/lib/export/durable-usage-report'
const requestSchema=callUsageExportInputSchema.safeExtend({reportRef:z.string().regex(/^call-usage-export:[a-f0-9-]{36}$/u)})
const refSchema=z.strictObject({reportRef:z.string().regex(/^call-usage-export:[a-f0-9-]{36}$/u)})
const pageSchema=refSchema.extend({cursor:z.string().max(20000).nullable()})
const listSchema=z.strictObject({cursor:z.string().max(20000).nullable()})
const request=sourceMutation<z.infer<typeof requestSchema>,{kind:'created'|'replayed';reportRef:string}>('capabilityCallProjections:requestOwnerUsageReport')
const read=sourceQuery<z.infer<typeof refSchema>,z.infer<typeof readUsageReportSchema>>('capabilityCallProjections:readOwnerUsageReport')
const parts=sourceQuery<{reportRef:string;paginationOpts:{numItems:number;cursor:string|null}},z.infer<typeof usageReportPartsPageSchema>>('capabilityCallProjections:readOwnerUsageReportParts')
const list=sourceQuery<{paginationOpts:{numItems:number;cursor:string|null}},z.infer<typeof listUsageReportsPageSchema>>('capabilityCallProjections:listOwnerUsageReports')
export const requestOwnerUsageReportServer=createServerFn({method:'POST'}).validator(data=>requestSchema.parse(data)).handler(async({data})=>z.strictObject({kind:z.enum(['created','replayed']),reportRef:z.string()}).parse(await callSourceMutation(request,data)))
export const readOwnerUsageReportServer=createServerFn({method:'GET'}).validator(data=>refSchema.parse(data)).handler(async({data})=>readUsageReportSchema.parse(await callSourceQuery(read,data)))
export const readOwnerUsageReportPartsServer=createServerFn({method:'GET'}).validator(data=>pageSchema.parse(data)).handler(async({data})=>usageReportPartsPageSchema.parse(await callSourceQuery(parts,{reportRef:data.reportRef,paginationOpts:{numItems:2,cursor:data.cursor}})))
export const listOwnerUsageReportsServer=createServerFn({method:'GET'}).validator(data=>listSchema.parse(data)).handler(async({data})=>listUsageReportsPageSchema.parse(await callSourceQuery(list,{paginationOpts:{numItems:10,cursor:data.cursor}})))
