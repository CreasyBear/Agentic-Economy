import { paginationResultValidator } from 'convex/server'
import { v } from 'convex/values'

const chatToolId = v.union(
  v.literal('registry.tools.list'),
  v.literal('registry.tools.search'),
  v.literal('registry.tools.describe'),
  v.literal('registry.tools.compare'),
  v.literal('tool.quote'),
  v.literal('tool.call'),
)

const publicTextPart = v.object({
  type: v.literal('text'),
  text: v.string(),
})

const publicChoiceRow = v.object({
  toolRef: v.string(),
  title: v.string(),
  provider: v.optional(v.string()),
  price: v.optional(v.string()),
  readiness: v.optional(v.string()),
  access: v.optional(v.string()),
})

const publicFact = v.object({
  label: v.string(),
  value: v.string(),
})

const publicCardChrome = {
  type: v.literal('tool-card'),
  toolId: chatToolId,
  title: v.string(),
}

const publicToolCardPart = v.union(
  v.object({
    ...publicCardChrome,
    kind: v.literal('status'),
    state: v.union(v.literal('refused'), v.literal('error')),
    summary: v.string(),
  }),
  v.object({
    ...publicCardChrome,
    kind: v.literal('choices'),
    state: v.literal('complete'),
    toolRefs: v.array(v.string()),
    choices: v.array(publicChoiceRow),
    count: v.optional(v.number()),
    contrasts: v.optional(v.array(publicFact)),
  }),
  v.object({
    ...publicCardChrome,
    kind: v.literal('inspect'),
    state: v.literal('complete'),
    toolRefs: v.array(v.string()),
    facts: v.array(publicFact),
  }),
  v.object({
    ...publicCardChrome,
    kind: v.literal('execute'),
    state: v.union(
      v.literal('completed'),
      v.literal('pending'),
      v.literal('needs_authority'),
      v.literal('reconciliation_required'),
      v.literal('refused'),
    ),
    toolRefs: v.array(v.string()),
    name: v.optional(v.string()),
    callRef: v.optional(v.string()),
    outputPreview: v.optional(v.string()),
    outputTruncated: v.optional(v.boolean()),
    facts: v.array(publicFact),
    receiptRef: v.optional(v.string()),
    evidenceHash: v.optional(v.string()),
    summary: v.string(),
    nextAction: v.optional(v.string()),
    retryable: v.optional(v.boolean()),
  }),
)

export const publicSharedMessage = v.object({
  id: v.string(),
  role: v.union(v.literal('user'), v.literal('assistant')),
  parts: v.array(v.union(publicTextPart, publicToolCardPart)),
})

export const listSharedMessagesResult = paginationResultValidator(publicSharedMessage).extend({ title: v.string() })

export type PublicToolCard = typeof publicToolCardPart.type
export type PublicSharedPart = typeof publicTextPart.type | PublicToolCard
export type PublicSharedMessage = typeof publicSharedMessage.type
