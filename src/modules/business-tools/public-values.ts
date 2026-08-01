import { z } from 'zod'

/**
 * The URL-bound inquiry tool values are public runtime contract data. Keep them
 * separate from descriptor construction so discovery consumers do not import
 * the action registry.
 */
export const InquirySubmitToolId = 'inquiry.submit' as const

export const businessToolPrepareSchema = z.strictObject({
  body: z.string().min(1).max(2_000),
  contact: z.strictObject({
    name: z.string().max(200).optional(),
    email: z.string().max(254).optional(),
    phone: z.string().max(32).optional(),
  }),
})

export const businessToolInvokeSchema = businessToolPrepareSchema.extend({
  expectedDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  operationKey: z.string().trim().min(16).max(240).optional(),
})
