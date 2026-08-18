import { WorkflowManager, defineEvent, type WorkflowId, type WorkflowStatus } from '@convex-dev/workflow'
import { components, internal } from './_generated/api'
import { internalMutation, internalQuery } from './_generated/server'
import { v } from 'convex/values'

import type { ProjectSpineDefinitionVersion } from '../src/modules/project-spine/public'

type ProjectSpineStartResult = {
  projectId: string
  generation: number
  status: 'awaiting_decision' | 'decision_received' | 'chasing' | 'completed' | 'failed'
  workflowId?: string
  definitionVersion: ProjectSpineDefinitionVersion
  planRevision: number
  createdAt: number
  updatedAt: number
}

const decisionEvent = defineEvent({
  name: 'projectSpineDecision',
  validator: v.object({
    generation: v.number(),
    decisionId: v.string(),
    decisionHash: v.string(),
  }),
})
const spineWorkflow = new WorkflowManager(components.workflow)

/** Definitions remain so a hosted drain can finish; they no longer persist spine tables. */
export const projectSpine_v1 = spineWorkflow
  .define({
    args: { projectId: v.string(), generation: v.number() },
  })
  .handler(async (step, args): Promise<void> => {
    const decision = await step.awaitEvent(decisionEvent)
    await step.runMutation(
      internal.projectSpine.recordChase,
      {
        projectId: args.projectId,
        generation: args.generation,
        decisionId: decision.decisionId,
        decisionHash: decision.decisionHash,
      },
      { name: 'recordProjectSpineChase' },
    )
  })

export const projectSpine_v2 = spineWorkflow
  .define({
    args: { projectId: v.string(), generation: v.number() },
  })
  .handler(async (step, args): Promise<void> => {
    await step.runMutation(
      internal.projectSpine.recordWorkflowEntry,
      { projectId: args.projectId, generation: args.generation },
      { name: 'recordProjectSpineV2Entry' },
    )
    const decision = await step.awaitEvent(decisionEvent)
    await step.runMutation(
      internal.projectSpine.recordChase,
      {
        projectId: args.projectId,
        generation: args.generation,
        decisionId: decision.decisionId,
        decisionHash: decision.decisionHash,
      },
      { name: 'recordProjectSpineChase' },
    )
  })

export const startProject = internalMutation({
  args: {
    projectId: v.string(),
    charterRef: v.optional(v.string()),
    now: v.optional(v.number()),
  },
  handler: async (): Promise<ProjectSpineStartResult> => {
    throw new Error('project_spine_tables_unlisted')
  },
})

export const startProjectV1 = internalMutation({
  args: {
    projectId: v.string(),
    charterRef: v.optional(v.string()),
    now: v.optional(v.number()),
  },
  handler: async (): Promise<ProjectSpineStartResult> => {
    throw new Error('project_spine_tables_unlisted')
  },
})

export const advanceGeneration = internalMutation({
  args: { projectId: v.string(), now: v.optional(v.number()) },
  handler: async (): Promise<{
    projectId: string
    generation: number
    definitionVersion: ProjectSpineDefinitionVersion
    workflowId: WorkflowId
    planRevision: number
  }> => {
    throw new Error('project_spine_tables_unlisted')
  },
})

export const sendDecision = internalMutation({
  args: {
    projectId: v.string(),
    generation: v.number(),
    decisionId: v.string(),
    decisionHash: v.string(),
    at: v.optional(v.number()),
  },
  handler: async () => {
    throw new Error('project_spine_tables_unlisted')
  },
})

export const recordWorkflowEntry = internalMutation({
  args: { projectId: v.string(), generation: v.number() },
  handler: async () => null,
})

export const recordChase = internalMutation({
  args: {
    projectId: v.string(),
    generation: v.number(),
    decisionId: v.string(),
    decisionHash: v.string(),
  },
  handler: async (_ctx, args) => ({
    projectId: args.projectId,
    generation: args.generation,
    planRevision: 0,
  }),
})

export const readProjectSpine = internalQuery({
  args: { projectId: v.string() },
  handler: async () => null,
})

export const readWorkflowStatus = internalQuery({
  args: { workflowId: v.string() },
  handler: async (ctx, args): Promise<WorkflowStatus> =>
    await spineWorkflow.status(ctx, args.workflowId as WorkflowId),
})
