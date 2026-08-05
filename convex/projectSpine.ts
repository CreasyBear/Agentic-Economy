import {
  WorkflowManager,
  defineEvent,
  type WorkflowId,
  type WorkflowStatus,
  type WorkflowStep,
} from '@convex-dev/workflow'
import type { PaginationResult } from 'convex/server'
import { components, internal } from './_generated/api'
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server'
import type { Doc } from './_generated/dataModel'
import { v } from 'convex/values'

import {
  PROJECT_SPINE_DEFINITION_V1,
  PROJECT_SPINE_DEFINITION_V2,
  PROJECT_SPINE_LATEST_DEFINITION,
  type ProjectSpineDefinitionVersion,
} from '../src/modules/project-spine/public'

const CHASE_DELAY_MS = 10
const QUOTE_LIFETIME_MS = 60_000
const MAX_PROJECT_SPINE_EVENTS = 128

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

type WorkflowRead = {
  status: WorkflowStatus
  steps: PaginationResult<WorkflowStep>
}

type ProjectSpineRead = {
  project: Doc<'projectSpine'>
  events: Array<Doc<'projectSpineEvents'>>
  quote: Doc<'projectSpineQuotes'> | null
  workflow: WorkflowRead | null
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

export const projectSpine_v1 = spineWorkflow
  .define({
    args: { projectId: v.string(), generation: v.number() },
  })
  .handler(async (step, args): Promise<void> => {
    const decision = await step.awaitEvent(decisionEvent)
    await step.sleep(CHASE_DELAY_MS)
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
    await step.sleep(CHASE_DELAY_MS)
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

/**
 * Spike-scoped internal control surface: identity/session authorization binds
 * in the frontier-#1 exit contract; until then no public caller may start,
 * advance, or read a project spine (PremortemEngLibs finding 1).
 */
export const startProject = internalMutation({
  args: {
    projectId: v.string(),
    charterRef: v.optional(v.string()),
    now: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ProjectSpineStartResult> => await createProject(
    ctx,
    args.projectId,
    args.charterRef,
    args.now ?? Date.now(),
    PROJECT_SPINE_LATEST_DEFINITION,
  ),
})

/** Used only to model a project that was started before projectSpine_v2 shipped. */
export const startProjectV1 = internalMutation({
  args: {
    projectId: v.string(),
    charterRef: v.optional(v.string()),
    now: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ProjectSpineStartResult> => await createProject(
    ctx,
    args.projectId,
    args.charterRef,
    args.now ?? Date.now(),
    PROJECT_SPINE_DEFINITION_V1,
  ),
})

export const advanceGeneration = internalMutation({
  args: { projectId: v.string(), now: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{
    projectId: string
    generation: number
    definitionVersion: ProjectSpineDefinitionVersion
    workflowId: WorkflowId
    planRevision: number
  }> => {
    const current = await getCurrentProject(ctx, args.projectId)
    if (current === null) throw new Error('project_spine_not_found')
    const now = args.now ?? Date.now()
    const generation = current.generation + 1
    await spineWorkflow.cancel(ctx, current.workflowId as WorkflowId)
    // Retire the canceled component journal; retention policy documented in the
    // spike report (PremortemEngLibs finding 4).
    await spineWorkflow.cleanup(ctx, current.workflowId as WorkflowId)
    const workflowId: WorkflowId = await spineWorkflow.start(
      ctx,
      internal.projectSpine.projectSpine_v2,
      { projectId: args.projectId, generation },
      { startAsync: true },
    )
    const quote = await ctx.db
      .query('projectSpineQuotes')
      .withIndex('by_projectId_and_quoteId', (q) => q.eq('projectId', args.projectId).eq('quoteId', `quote:${args.projectId}`))
      .unique()
    const nextRevision = (quote?.revision ?? 0) + 1
    const nextPlanRevision = current.planRevision + 1
    await ctx.db.patch(current._id, {
      generation,
      status: 'awaiting_decision',
      workflowId,
      definitionVersion: PROJECT_SPINE_LATEST_DEFINITION,
      planRevision: nextPlanRevision,
      updatedAt: now,
    })
    if (quote === null) {
      await ctx.db.insert('projectSpineQuotes', {
        projectId: args.projectId,
        generation,
        quoteId: `quote:${args.projectId}`,
        revision: nextRevision,
        staleAfter: now + QUOTE_LIFETIME_MS,
        refreshedAt: now,
      })
    } else {
      await ctx.db.patch(quote._id, {
        generation,
        revision: nextRevision,
        staleAfter: now + QUOTE_LIFETIME_MS,
        refreshedAt: now,
      })
    }
    await appendEvent(ctx, {
      projectId: args.projectId,
      generation,
      kind: 'generation_advanced',
      operationKey: `project:${args.projectId}:generation:${generation}`,
      payloadHash: `generation:${generation}`,
      at: now,
    })
    return {
      projectId: args.projectId,
      generation,
      definitionVersion: PROJECT_SPINE_LATEST_DEFINITION,
      workflowId,
      planRevision: nextPlanRevision,
    }
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
  handler: async (ctx, args) => {
    const project = await requireCurrentGeneration(ctx, args.projectId, args.generation)
    if (project.workflowId === undefined) throw new Error('project_spine_workflow_missing')
    const at = args.at ?? Date.now()
    await appendEvent(ctx, {
      projectId: args.projectId,
      generation: args.generation,
      kind: 'decision_received',
      operationKey: `project:${args.projectId}:generation:${args.generation}:decision:${args.decisionId}`,
      payloadHash: args.decisionHash,
      at,
    })
    await spineWorkflow.sendEvent(ctx, {
      ...decisionEvent,
      workflowId: project.workflowId as WorkflowId,
      value: {
        generation: args.generation,
        decisionId: args.decisionId,
        decisionHash: args.decisionHash,
      },
    })
    await ctx.db.patch(project._id, { status: 'decision_received', updatedAt: at })
    return { projectId: args.projectId, generation: args.generation }
  },
})

export const recordWorkflowEntry = internalMutation({
  args: { projectId: v.string(), generation: v.number() },
  handler: async (ctx, args) => {
    const project = await requireCurrentGeneration(ctx, args.projectId, args.generation)
    const at = Date.now()
    await appendEvent(ctx, {
      projectId: args.projectId,
      generation: args.generation,
      kind: 'workflow_entry',
      operationKey: `project:${args.projectId}:generation:${args.generation}:workflow-entry`,
      payloadHash: `definition:${project.definitionVersion}`,
      at,
    })
    await ctx.db.patch(project._id, { updatedAt: at })
    return null
  },
})

export const recordChase = internalMutation({
  args: {
    projectId: v.string(),
    generation: v.number(),
    decisionId: v.string(),
    decisionHash: v.string(),
  },
  handler: async (ctx, args) => {
    const project = await requireCurrentGeneration(ctx, args.projectId, args.generation)
    const at = Date.now()
    const operationKey = `project:${args.projectId}:generation:${args.generation}:chase`
    const existing = await ctx.db
      .query('projectSpineEvents')
      .withIndex('by_operationKey', (q) => q.eq('operationKey', operationKey))
      .first()
    if (existing !== null) return { projectId: args.projectId, generation: args.generation, planRevision: project.planRevision }

    const nextPlanRevision = project.planRevision + 1
    const quote = await ctx.db
      .query('projectSpineQuotes')
      .withIndex('by_projectId_and_quoteId', (q) => q.eq('projectId', args.projectId).eq('quoteId', `quote:${args.projectId}`))
      .unique()
    const quoteRevision = (quote?.revision ?? 0) + 1
    if (quote === null) {
      await ctx.db.insert('projectSpineQuotes', {
        projectId: args.projectId,
        generation: args.generation,
        quoteId: `quote:${args.projectId}`,
        revision: quoteRevision,
        staleAfter: at + QUOTE_LIFETIME_MS,
        refreshedAt: at,
      })
    } else {
      await ctx.db.patch(quote._id, {
        generation: args.generation,
        revision: quoteRevision,
        staleAfter: at + QUOTE_LIFETIME_MS,
        refreshedAt: at,
      })
    }
    await appendEvent(ctx, {
      projectId: args.projectId,
      generation: args.generation,
      kind: 'chase_recorded',
      operationKey,
      payloadHash: `${args.decisionId}:${args.decisionHash}`,
      at,
    })
    await appendEvent(ctx, {
      projectId: args.projectId,
      generation: args.generation,
      kind: 'quote_refreshed',
      operationKey: `${operationKey}:quote`,
      payloadHash: `quote:${args.projectId}:${quoteRevision}`,
      at,
    })
    await ctx.db.patch(project._id, {
      status: 'completed',
      planRevision: nextPlanRevision,
      updatedAt: at,
    })
    return { projectId: args.projectId, generation: args.generation, planRevision: nextPlanRevision }
  },
})

export const readProjectSpine = internalQuery({
  args: { projectId: v.string() },
  handler: async (ctx, args): Promise<ProjectSpineRead | null> => {
    const project = await getCurrentProject(ctx, args.projectId)
    if (project === null) return null
    const [events, quote] = await Promise.all([
      ctx.db
        .query('projectSpineEvents')
        .withIndex('by_projectId_and_seq', (q) => q.eq('projectId', args.projectId))
        .order('asc')
        .take(MAX_PROJECT_SPINE_EVENTS),
      ctx.db
        .query('projectSpineQuotes')
        .withIndex('by_projectId_and_quoteId', (q) => q.eq('projectId', args.projectId).eq('quoteId', `quote:${args.projectId}`))
        .unique(),
    ])
    const workflow: WorkflowRead | null = project.workflowId === undefined
      ? null
      : {
          status: await spineWorkflow.status(ctx, project.workflowId as WorkflowId),
          steps: await spineWorkflow.listSteps(ctx, project.workflowId as WorkflowId, {
            paginationOpts: { cursor: null, numItems: 20 },
          }),
        }
    return { project, events, quote, workflow }
  },
})

export const readWorkflowStatus = internalQuery({
  args: { workflowId: v.string() },
  handler: async (ctx, args): Promise<WorkflowStatus> => await spineWorkflow.status(ctx, args.workflowId as WorkflowId),
})

async function createProject(
  ctx: MutationCtx,
  projectId: string,
  charterRef: string | undefined,
  now: number,
  definitionVersion: ProjectSpineDefinitionVersion,
): Promise<ProjectSpineStartResult> {
  const existing = await getCurrentProject(ctx, projectId)
  if (existing !== null) return existing
  const generation = 1
  const quoteId = `quote:${projectId}`
  const projectDbId = await ctx.db.insert('projectSpine', {
    projectId,
    generation,
    ...(charterRef === undefined ? {} : { charterRef }),
    status: 'awaiting_decision',
    definitionVersion,
    planRevision: 0,
    createdAt: now,
    updatedAt: now,
  })
  await ctx.db.insert('projectSpineQuotes', {
    projectId,
    generation,
    quoteId,
    revision: 1,
    staleAfter: now + QUOTE_LIFETIME_MS,
    refreshedAt: now,
  })
  await appendEvent(ctx, {
    projectId,
    generation,
    kind: 'workflow_started',
    operationKey: `project:${projectId}:generation:${generation}:started`,
    payloadHash: `definition:${definitionVersion}`,
    at: now,
  })
  const workflow = definitionVersion === PROJECT_SPINE_DEFINITION_V1
    ? await spineWorkflow.start(ctx, internal.projectSpine.projectSpine_v1, { projectId, generation }, { startAsync: true })
    : await spineWorkflow.start(ctx, internal.projectSpine.projectSpine_v2, { projectId, generation }, { startAsync: true })
  await ctx.db.patch(projectDbId, { workflowId: workflow, updatedAt: now })
  return {
    projectId,
    generation,
    status: 'awaiting_decision' as const,
    workflowId: workflow,
    definitionVersion,
    planRevision: 0,
    createdAt: now,
    updatedAt: now,
  }
}

async function getCurrentProject(
  ctx: MutationCtx | QueryCtx,
  projectId: string,
): Promise<Doc<'projectSpine'> | null> {
  return await ctx.db
    .query('projectSpine')
    .withIndex('by_projectId', (q) => q.eq('projectId', projectId))
    .unique()
}

async function requireCurrentGeneration(ctx: MutationCtx, projectId: string, generation: number) {
  if (!Number.isInteger(generation) || generation < 1) throw new Error('project_spine_generation_invalid')
  const current = await getCurrentProject(ctx, projectId)
  if (current === null) throw new Error('project_spine_not_found')
  if (generation < current.generation) throw new Error('project_spine_generation_stale')
  if (generation > current.generation) throw new Error('project_spine_generation_mismatch')
  return current
}

async function appendEvent(
  ctx: MutationCtx,
  args: {
    projectId: string
    generation: number
    kind: 'workflow_started' | 'workflow_entry' | 'decision_received' | 'chase_recorded' | 'quote_refreshed' | 'generation_advanced'
    operationKey: string
    payloadHash: string
    at: number
  },
) {
  const existing = await ctx.db
    .query('projectSpineEvents')
    .withIndex('by_operationKey', (q) => q.eq('operationKey', args.operationKey))
    .first()
  if (existing !== null) return existing
  const previous = await ctx.db
    .query('projectSpineEvents')
    .withIndex('by_projectId_and_seq', (q) => q.eq('projectId', args.projectId))
    .order('desc')
    .first()
  const seq = (previous?.seq ?? 0) + 1
  // Reads stay bounded (take(MAX_PROJECT_SPINE_EVENTS)); durable writes are
  // NOT capped — a hard ceiling would strand months-long projects after ~25
  // generations (PremortemEngLibs finding 3).
  const id = await ctx.db.insert('projectSpineEvents', { ...args, seq })
  return await ctx.db.get(id)
}
