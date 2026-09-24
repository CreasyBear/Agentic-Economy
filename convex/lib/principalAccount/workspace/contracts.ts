import { v } from 'convex/values'

export const mfaReverificationRefusalValue = v.object({
  kind: v.literal('refused'),
  code: v.literal('mfa_reverification_required'),
})
