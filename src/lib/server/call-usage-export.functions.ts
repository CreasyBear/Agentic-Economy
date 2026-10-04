import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { callSourceMutation, callSourceQuery, sourceMutation, sourceQuery } from './convex-source'
import {
  callUsageExportInputSchema, callUsageExportRowSchema, createCallUsageExport,
  type CallUsageExportInput, type CallUsageExportRow,
} from '@/lib/export/call-usage-export'

const pageSchema = z.object({
  page: z.array(callUsageExportRowSchema), continueCursor: z.string(), isDone: z.boolean(),
  scannedCount: z.number().int().nonnegative().safe(),
  accountRef: z.string(),
})
const beginExport = sourceMutation<CallUsageExportInput & { exportRef: string }, {
  accountRef: string; snapshotAt: number
}>('capabilityCallProjections:beginOwnerCallExport')
const admissionSchema = z.strictObject({ accountRef: z.string().min(1), snapshotAt: z.number().int().nonnegative().safe() })
const readPage = sourceQuery<CallUsageExportInput & {
  exportRef: string
  snapshotAt: number
  paginationOpts: { numItems: number; cursor: string | null; maximumRowsRead: number; maximumBytesRead: number }
}, z.infer<typeof pageSchema>>('capabilityCallProjections:readOwnerCallExportPage')

/** Publish only a finished capture. A changed source, paging cycle, source outage
 * or explicit 10,000-scanned-row limit produces an error, never a partial download. */
export const exportOwnerCallUsageServer = createServerFn({ method: 'GET' })
  .validator((data) => callUsageExportInputSchema.parse(data))
  .handler(async ({ data }) => {
    const exportRef = `call-usage-export:${crypto.randomUUID()}`
    const admission = admissionSchema.parse(await callSourceMutation(beginExport, { ...data, exportRef }))
    const { snapshotAt } = admission
    const records: CallUsageExportRow[] = []
    let scannedCount = 0
    let cursor: string | null = null
    const cursors = new Set<string>()
    for (let pageNumber = 0; pageNumber < 500; pageNumber += 1) {
      const page = pageSchema.parse(await callSourceQuery(readPage, {
        ...data, snapshotAt, exportRef,
        paginationOpts: { numItems: 50, cursor, maximumRowsRead: 100, maximumBytesRead: 512 * 1024 },
      }))
      if (page.accountRef !== admission.accountRef || page.page.some((row) => row.accountRef !== admission.accountRef)) {
        throw new Error('call_export_scope_mismatch')
      }
      scannedCount += page.scannedCount
      if (scannedCount > 10_000 || records.length + page.page.length > 10_000) throw new Error('call_export_window_too_large')
      records.push(...page.page)
      if (page.isDone) return createCallUsageExport(data, records, snapshotAt, scannedCount, admission.accountRef, exportRef)
      if (!page.continueCursor || cursors.has(page.continueCursor)) throw new Error('call_export_cursor_invalid')
      cursors.add(page.continueCursor)
      cursor = page.continueCursor
    }
    throw new Error('call_export_window_too_large')
  })
