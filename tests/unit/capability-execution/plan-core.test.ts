import { describe, expect, it, vi } from 'vitest'
import { parsePlan } from '@/modules/capability-execution/plan/parse'
import { topologicalStages } from '@/modules/capability-execution/plan/graph'
import { checkPlanReferences } from '@/modules/capability-execution/plan/references'
import { resolvePlanInput } from '@/modules/capability-execution/plan/resolve'
import { mercatorFlowPlanToPlanJson } from '@/modules/capability-execution/plan/mercator'
import { parsePlanReadback, parsePlanRunReadback, projectPlanControls, projectPlanNext, planGetResultSchema } from '@/modules/capability-execution/plan/runtime.schemas'
import { projectMcpActionNext } from '@/modules/actions'
import type { PlanJson } from '@/modules/capability-execution/plan/contracts'

const toolRef = `operation:v1:${'a'.repeat(64)}`
const secondTool = `operation:v1:${'b'.repeat(64)}`
function plan(nodes: unknown[]): PlanJson {
  const parsed = parsePlan({ nodes })
  if ('kind' in parsed) throw new Error(parsed.code)
  return parsed
}
const root = { id: 'source', toolRef, input: {}, dependsOn: [] }
const child = { id: 'sink', toolRef: secondTool, input: { value: 'flow://source/output#/value' }, dependsOn: ['source'] }

describe('bounded Plan inputs and data flow', () => {
  it('orders an unordered DAG and refuses cycles, duplicate dependencies and undeclared data transfers', () => {
    expect(topologicalStages(plan([child, root]))).toEqual([['source'], ['sink']])
    expect(topologicalStages(plan([child, { ...root, dependsOn: ['sink'] }]))).toMatchObject({ code: 'cycle' })
    expect(topologicalStages(plan([root, { ...child, dependsOn: ['source', 'source'] }]))).toMatchObject({ code: 'duplicate_dependency' })
    expect(topologicalStages(plan([root, { ...child, dependsOn: [] }]))).toMatchObject({ code: 'ref_not_in_depends_on' })
  })

  it('refuses malformed pointers and oversized input before quoting', () => {
    expect(parsePlan({ nodes: [root, { ...child, input: { value: 'flow://source/output#/bad~2pointer' } }] })).toMatchObject({ code: 'bad_pointer' })
    expect(parsePlan({ nodes: [{ ...root, input: { value: 'x'.repeat(262_144) } }] })).toMatchObject({ code: 'plan_too_large' })
    expect(parsePlan({ nodes: [root, root] })).toMatchObject({ code: 'duplicate_node_id' })
  })

  it('rejects incompatible types while explicitly retaining uncertainty for absent output schemas', () => {
    const p = plan([root, child])
    const inputSchema = { type: 'object', properties: { value: { type: 'string' } }, required: ['value'] }
    expect(checkPlanReferences(p, { [toolRef]: { inputSchema: {}, outputSchema: { type: 'object', properties: { value: { type: 'number' } } } },
      [secondTool]: { inputSchema } })).toMatchObject({ code: 'ref_type_mismatch' })
    expect(checkPlanReferences(p, { [toolRef]: { inputSchema: {} }, [secondTool]: { inputSchema } })).toMatchObject([{ validation: 'untyped_ref' }])
  })

  it('treats Provider strings and objects as inert data and validates the resolved input', () => {
    const node = plan([root, child]).nodes[1]!
    expect(resolvePlanInput(node, { source: { value: 'flow://other/output#/secret' } }, { type: 'object' }))
      .toMatchObject({ kind: 'resolved', input: { value: 'flow://other/output#/secret' } })
    expect(resolvePlanInput(node, { source: { value: { $concat: ['untrusted', 'expression'] } } }, { type: 'object' }))
      .toMatchObject({ kind: 'resolved', input: { value: { $concat: ['untrusted', 'expression'] } } })
    expect(resolvePlanInput(node, { source: {} }, { type: 'object' })).toMatchObject({ kind: 'failed', code: 'ref_type_mismatch' })
    expect(resolvePlanInput(node, { source: { value: 1 } }, { type: 'object', properties: { value: { type: 'string' } } }))
      .toMatchObject({ kind: 'failed', code: 'input_invalid' })
  })

  it('projects arrays and concatenates data within the frozen cardinality bound', () => {
    const node = plan([root, { ...child, input: { values: { $map: { from: 'flow://source/output#/items', path: '/label' } },
      text: { $concat: ['Result: ', 'flow://source/output#/value'] } }, bounds: { '/values': { maxItems: 2 } } }]).nodes[1]!
    const output = { source: { items: [{ label: 'one' }, { label: 'two' }], value: 'ok' } }
    expect(resolvePlanInput(node, output, { type: 'object' })).toMatchObject({ kind: 'resolved', input: { values: ['one', 'two'], text: 'Result: ok' } })
    output.source.items.push({ label: 'three' })
    expect(resolvePlanInput(node, output, { type: 'object' })).toMatchObject({ kind: 'failed', code: 'input_exceeds_bound' })
  })

  it('imports only resolved admitted selectors and preserves expressions without purchasing', async () => {
    const id = plan([root]).nodes[0]!.id
    const flow = { nodes: [{ id, serviceId: 'remote-service', method: 'GET' as const, path: '/lookup', input: {}, dependsOn: [] }] }
    const resolve = vi.fn(async () => toolRef)
    expect(await mercatorFlowPlanToPlanJson(flow, {}, resolve)).toMatchObject({ code: 'tool_not_admitted' })
    expect(resolve).not.toHaveBeenCalled()
    expect(await mercatorFlowPlanToPlanJson(flow, { 'remote-service': 'provider.example' }, resolve)).toEqual(plan([root]))
    expect(resolve).toHaveBeenCalledWith({ providerHost: 'provider.example', method: 'GET', path: '/lookup' })
    expect(await mercatorFlowPlanToPlanJson(flow, { 'remote-service': 'provider.example' }, async () => undefined)).toMatchObject({ code: 'tool_not_admitted' })
  })
})

const callRef = `operation-invocation:v1:${'c'.repeat(64)}`
const readback = {
  kind: 'available', planRef: 'plan:v1:recovery', planDigest: 'digest', state: 'running',
  approvedTotalAudUnits: '1000000', currency: 'AUD', exponent: 6, expiresAt: 100, runDeadlineAt: 200,
  maximumConcurrentNodes: 1, stages: [['source']], nodes: [], dataFlows: [],
  hold: { status: 'reserved', settledAudUnits: '0', releasedAudUnits: '0', heldAudUnits: '1000000' },
}
function progress(overrides: Record<string, unknown> = {}) {
  const parsed = planGetResultSchema.parse({ ...readback, ...overrides })
  if (parsed.kind !== 'available') throw new Error('expected_plan_progress')
  return parsed
}

describe('Plan recovery projections', () => {
  it('publishes the same primary continuation through source readbacks without changing run identity', () => {
    const next = [{ action: 'tool.plan.get', args: { planRef: readback.planRef }, authority: 'same_principal' }]
    const running = { kind: 'running', planRef: readback.planRef, state: 'running' }
    expect(parsePlanRunReadback(running)).toEqual({ ...running, next })
    expect(parsePlanReadback(readback)).toMatchObject({ next })
    expect(parsePlanRunReadback({ ...running, kind: 'replayed', state: 'cancelled' })).toMatchObject({ next: [] })
    expect(parsePlanRunReadback({ kind: 'refused', code: 'plan_access_denied' })).toEqual({ kind: 'refused', code: 'plan_access_denied' })
  })

  it('returns one validated read after run or cancellation and stops at terminal states', () => {
    const next = [{ action: 'tool.plan.get', args: { planRef: readback.planRef }, authority: 'same_principal' }]
    expect(projectMcpActionNext('tool.plan.run', { kind: 'running', planRef: readback.planRef, state: 'running' }, 'https://ae.test')).toEqual(next)
    expect(projectMcpActionNext('tool.plan.cancel', { kind: 'replayed', planRef: readback.planRef, state: 'reconciliation_required' }, 'https://ae.test')).toEqual(next)
    for (const state of ['succeeded', 'partially_succeeded', 'failed', 'cancelled', 'expired']) {
      expect(projectPlanNext(progress({ state }))).toEqual([])
      expect(projectPlanControls(progress({ state }))).toEqual({})
    }
    expect(projectPlanNext(progress({ state: 'quoted' }))).toEqual([])
    expect(projectMcpActionNext('tool.plan.run', { kind: 'running', planRef: readback.planRef, state: 'invented' }, 'https://ae.test')).toEqual([])
  })

  it('keeps uncertain recovery pinned to an admitted Call without constructing evidence or a new purchase', () => {
    const nodes = [{ nodeId: 'source', toolRef, providerHost: 'provider.test', dependsOn: [], ceilingAudUnits: '1000000', state: 'admitted', callRef }]
    const uncertain = progress({ state: 'reconciliation_required', nodes })
    expect(projectPlanNext(uncertain)).toEqual([{ action: 'call.status', args: { callRef }, authority: 'same_principal' }])
    expect(projectMcpActionNext('tool.plan.get', { ...uncertain, next: [{ action: 'call', args: {} }] }, 'https://ae.test')).toEqual([])
    expect(projectPlanNext(progress({ state: 'reconciliation_required', nodes: [{ ...nodes[0], callRef: 'invalid' }] })))
      .toEqual([{ action: 'tool.plan.get', args: { planRef: readback.planRef }, authority: 'same_principal' }])
  })

  it('exposes cancellation until termination and owner attention only through existing destinations', () => {
    const awaiting = parsePlanReadback({ ...readback, state: 'awaiting_approval' })
    expect(awaiting).toMatchObject({ cancellation: { action: 'tool.plan.cancel', args: { planRef: readback.planRef }, authority: 'same_principal' },
      ownerHandoff: { kind: 'attention_required', reason: 'owner_approval_required', planRef: readback.planRef, path: '/plans/plan%3Av1%3Arecovery' } })
    expect(projectPlanControls(progress({ state: 'reconciliation_required', terminationIntent: 'cancelled' }))).toEqual({})
    expect(projectPlanControls(progress({ state: 'reconciliation_required', failureCode: 'workflow_failed' })))
      .toMatchObject({ ownerHandoff: { reason: 'plan_recovery_required', path: '/support' } })
    expect(projectPlanControls(progress({ state: 'reconciliation_required' }))).not.toHaveProperty('ownerHandoff')
  })
})
