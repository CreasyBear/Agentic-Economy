import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { callSourceQuery,sourceQuery } from './convex-source'
const input=z.strictObject({cursor:z.string().max(20000).nullable()})
const output=z.object({page:z.array(z.strictObject({deliveryRef:z.string(),eventKind:z.string(),state:z.string(),reason:z.string().nullable(),createdAt:z.number(),updatedAt:z.number()})),isDone:z.boolean(),continueCursor:z.string()})
const read=sourceQuery<{paginationOpts:{numItems:number;cursor:string|null}},z.infer<typeof output>>('notifications:readUsageAlertHistory')
export const readUsageAlertHistoryServer=createServerFn({method:'GET'}).validator(data=>input.parse(data)).handler(async({data})=>output.parse(await callSourceQuery(read,{paginationOpts:{numItems:10,cursor:data.cursor}})))
