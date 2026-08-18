import { mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'

import { sourceWriteArgs } from './sourceWriteAdmission'

const studyMutationArgs = {
  studyId: v.string(),
  projectId: v.string(),
  treeId: v.optional(v.string()),
  nodeId: v.string(),
  ownerSessionId: v.optional(v.string()),
  generation: v.optional(v.number()),
  treeRevision: v.optional(v.number()),
  operationKey: v.string(),
  correlationId: v.string(),
  ...sourceWriteArgs,
}

const retired = { kind: 'refused' as const, reason: 'study_tables_unlisted' as const }

export const getById = queryGeneric({
  args: {
    studyId: v.string(),
    ownerSessionId: v.optional(v.string()),
  },
  handler: async () => ({ kind: 'not_found' as const }),
})

export const create = mutationGeneric({
  args: {
    ...studyMutationArgs,
    artifactJson: v.string(),
    journalEventJson: v.optional(v.string()),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  },
  handler: async () => retired,
})

export const recordResult = mutationGeneric({
  args: {
    ...studyMutationArgs,
    expectedRevision: v.number(),
    artifactJson: v.string(),
    journalEventsJson: v.optional(v.string()),
    at: v.optional(v.number()),
  },
  handler: async () => retired,
})

export const recordEvent = mutationGeneric({
  args: {
    ...studyMutationArgs,
    expectedRevision: v.number(),
    eventJson: v.string(),
    at: v.optional(v.number()),
  },
  handler: async () => retired,
})
