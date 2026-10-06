import { describe, expect, it, vi } from 'vitest'
import { parsePlan } from '@/modules/capability-execution/plan/parse'
import { topologicalStages } from '@/modules/capability-execution/plan/graph'
import { checkPlanReferences } from '@/modules/capability-execution/plan/references'
import { resolvePlanInput } from '@/modules/capability-execution/plan/resolve'
import { mercatorFlowPlanToPlanJson } from '@/modules/capability-execution/plan/mercator'
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
