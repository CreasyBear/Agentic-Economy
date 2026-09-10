import { register as registerWorkflow } from '@convex-dev/workflow/test'
import { convexTest } from 'convex-test'
import { defineSchema, defineTable, makeFunctionReference } from 'convex/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { v } from 'convex/values'

const schema = defineSchema({
  workflowProofEntries: defineTable({
    caseRef: v.string(),
    step: v.string(),
    executions: v.number(),
    ready: v.boolean(),
  }).index('by_caseRef_and_step', ['caseRef', 'step']),
})

const modules = {
  './workflowProof.ts': () => import('../../fixtures/convex-workflow-proof'),
  './_generated/api.js': async () => ({}),
}

const begin = makeFunctionReference<'mutation', { caseRef: string; kind: 'restart' | 'waiting' }, string>('workflowProof:begin')
const permit = makeFunctionReference<'mutation', { caseRef: string }, null>('workflowProof:permit')
const retry = makeFunctionReference<'mutation', { workflowId: string }, null>('workflowProof:retry')
const resume = makeFunctionReference<'mutation', { workflowId: string }, null>('workflowProof:resume')
const stop = makeFunctionReference<'mutation', { workflowId: string }, null>('workflowProof:stop')
const inspect = makeFunctionReference<'query', { workflowId: string; caseRef: string }, {
  status: { type: string }
  entries: Array<{ step: string; executions: number }>
}>('workflowProof:inspect')

function backend() {
  const value = convexTest(schema, modules)
  registerWorkflow(value)
  return value
}

async function settle(value: ReturnType<typeof backend>) {
  await value.finishAllScheduledFunctions(vi.runAllTimers)
}

describe('official workflow component proof', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('resumes a durable event wait without replaying an exact mutation step', async () => {
    const value = backend()
    const workflowId = await value.mutation(begin, { caseRef: 'case:resume', kind: 'waiting' })
    await settle(value)
    expect((await value.query(inspect, { workflowId, caseRef: 'case:resume' })).status.type).toBe('inProgress')

    await value.mutation(resume, { workflowId })
    await settle(value)
    const result = await value.query(inspect, { workflowId, caseRef: 'case:resume' })
    expect(result.status.type).toBe('completed')
    expect(result.entries.find((entry) => entry.step === 'freeze')?.executions).toBe(1)
    expect(result.entries.find((entry) => entry.step === 'complete')?.executions).toBe(1)
  })

  it('restarts a failed readback without replaying the completed freeze step', async () => {
    const value = backend()
    const caseRef = 'case:restart'
    const workflowId = await value.mutation(begin, { caseRef, kind: 'restart' })
    await settle(value)
    expect((await value.query(inspect, { workflowId, caseRef })).status.type).toBe('failed')

    await value.mutation(permit, { caseRef })
    await value.mutation(retry, { workflowId })
    await settle(value)
    const result = await value.query(inspect, { workflowId, caseRef })
    expect(result.status.type).toBe('completed')
    expect(result.entries.find((entry) => entry.step === 'freeze')?.executions).toBe(1)
  })

  it('cancels a waiting workflow before the next authority step', async () => {
    const value = backend()
    const caseRef = 'case:cancel'
    const workflowId = await value.mutation(begin, { caseRef, kind: 'waiting' })
    await settle(value)
    await value.mutation(stop, { workflowId })
    await settle(value)
    const result = await value.query(inspect, { workflowId, caseRef })
    expect(result.status.type).toBe('canceled')
    expect(result.entries.some((entry) => entry.step === 'complete')).toBe(false)
  })
})
