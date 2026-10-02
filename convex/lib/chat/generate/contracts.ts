import { v, type Infer } from 'convex/values'
import { interactiveAuthorityContextValue } from '../../../interactiveAuthority'

export const generateArgs = v.object({
  threadId: v.string(),
  promptMessageId: v.string(),
  authority: v.optional(interactiveAuthorityContextValue),
  turnRef: v.optional(v.string()),
  deadlineAt: v.optional(v.number()),
})
export const generateResult = v.null()
export type GenerateArgs = Infer<typeof generateArgs>
