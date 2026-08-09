/// <reference types="vite/client" />
import { register as registerWorkflow } from '@convex-dev/workflow/test'
import { register as registerWorkpool } from '@convex-dev/workpool/test'
import { type WorkflowStep } from '@convex-dev/workflow'
import { convexTest, type TestConvex } from 'convex-test'
import type { FunctionReturnType } from 'convex/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { internal } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')
type ProjectSpineBackend = TestConvex<typeof schema>
type ProjectSpineRead = NonNullable<
  FunctionReturnType<typeof internal.projectSpine.readProjectSpine>
>
type ProjectSpineEvent = ProjectSpineRead['events'][number]


function testBackend(): ProjectSpineBackend {
  const t = convexTest(schema, modules)
  registerWorkflow(t)
  registerWorkpool(t)
  return t
}

describe('project spine workflow spike', () => {
  afterEach(() => vi.useRealTimers())

  it('starts new projects on v2 while a v1 instance resumes beside it', async () => {
    vi.useFakeTimers()
    const t = testBackend()
    const old = await t.mutation(internal.projectSpine.startProjectV1, {
      projectId: 'cr:v1', now: 1_000,
    })
    const latest = await t.mutation(internal.projectSpine.startProject, {
      projectId: 'cr:v2', now: 1_000,
    })
    expect(old.definitionVersion).toBe('projectSpine_v1')
    expect(latest.definitionVersion).toBe('projectSpine_v2')

    await t.finishAllScheduledFunctions(vi.runAllTimers)
    const oldPaused = await t.query(internal.projectSpine.readProjectSpine, { projectId: 'cr:v1' })
    expect(oldPaused?.workflow?.status.type).toBe('inProgress')
    expect(oldPaused?.workflow?.steps.page.some((step: WorkflowStep) => step.name.includes('projectSpineDecision'))).toBe(true)

    await t.mutation(internal.projectSpine.sendDecision, {
      projectId: 'cr:v1', generation: 1, decisionId: 'decision:v1', decisionHash: 'sha256:v1', at: 2_000,
    })
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    const completed = await t.query(internal.projectSpine.readProjectSpine, { projectId: 'cr:v1' })
    expect(completed?.project).toMatchObject({
      projectId: 'cr:v1', generation: 1, definitionVersion: 'projectSpine_v1', status: 'completed', planRevision: 1,
    })
    expect(completed?.events.map(({ kind }: ProjectSpineEvent) => kind)).toEqual([
      'workflow_started', 'decision_received', 'chase_recorded', 'quote_refreshed',
    ])
  })

  it('refuses stale-generation events and workflow steps', async () => {
    vi.useFakeTimers()
    const t = testBackend()
    const old = await t.mutation(internal.projectSpine.startProject, { projectId: 'cr:stale', now: 1_000 })
    await t.mutation(internal.projectSpine.advanceGeneration, { projectId: 'cr:stale', now: 2_000 })
    // advanceGeneration cancels AND retires (cleanup) the superseded workflow:
    // its component journal is gone; the generation_advanced domain event is
    // the surviving record.
    await expect(t.query(internal.projectSpine.readWorkflowStatus, { workflowId: old.workflowId ?? '' }))
      .rejects.toThrow('Workflow not found')

    await expect(t.mutation(internal.projectSpine.sendDecision, {
      projectId: 'cr:stale', generation: 1, decisionId: 'old', decisionHash: 'sha256:old',
    })).rejects.toThrow('project_spine_generation_stale')
    await expect(t.mutation(internal.projectSpine.recordChase, {
      projectId: 'cr:stale', generation: 1, decisionId: 'old', decisionHash: 'sha256:old',
    })).rejects.toThrow('project_spine_generation_stale')
  })

  it('resumes from a fresh event after an arbitrary delay without polling', async () => {
    vi.useFakeTimers()
    const t = testBackend()
    await t.mutation(internal.projectSpine.startProject, { projectId: 'cr:delay', now: 1_000 })
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    const waiting = await t.query(internal.projectSpine.readProjectSpine, { projectId: 'cr:delay' })
    expect(waiting?.project.status).toBe('awaiting_decision')
    expect(waiting?.workflow?.status.type).toBe('inProgress')
    expect(waiting?.workflow?.steps.page.some((step: WorkflowStep) => step.name.includes('projectSpineDecision'))).toBe(true)

    vi.advanceTimersByTime(7 * 24 * 60 * 60 * 1_000)
    await t.mutation(internal.projectSpine.sendDecision, {
      projectId: 'cr:delay', generation: 1, decisionId: 'decision:days-later', decisionHash: 'sha256:days-later',
    })
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    const done = await t.query(internal.projectSpine.readProjectSpine, { projectId: 'cr:delay' })
    expect(done?.project.status).toBe('completed')
    expect(done?.events.some(({ kind }: ProjectSpineEvent) => kind === 'chase_recorded')).toBe(true)
  })

  it('refreshes quote freshness while continuity stays on the same generation', async () => {
    vi.useFakeTimers()
    const t = testBackend()
    await t.mutation(internal.projectSpine.startProject, { projectId: 'cr:quote', now: 1_000 })
    const before = await t.query(internal.projectSpine.readProjectSpine, { projectId: 'cr:quote' })
    await t.mutation(internal.projectSpine.sendDecision, {
      projectId: 'cr:quote', generation: 1, decisionId: 'decision:quote', decisionHash: 'sha256:quote', at: 2_000,
    })
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    const after = await t.query(internal.projectSpine.readProjectSpine, { projectId: 'cr:quote' })
    expect(after?.project).toMatchObject({ generation: before?.project.generation, planRevision: 1 })
    expect(after?.quote).toMatchObject({
      generation: 1,
      revision: 2,
      staleAfter: expect.any(Number),
      refreshedAt: expect.any(Number),
    })
    expect(after?.quote?.staleAfter).toBeGreaterThan(before?.quote?.staleAfter ?? 0)
    expect(after?.quote?.refreshedAt).toBeGreaterThan(before?.quote?.refreshedAt ?? 0)
  })
})

