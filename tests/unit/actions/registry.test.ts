import { describe, expect, it } from 'vitest'

import {
  describeActionForAgent,
  findAction,
  listActions,
  listAgentToolActions,
} from '@/modules/actions'

describe('action registry', () => {
  it('registers only the public inquiry action', () => {
    const ids = listActions().map((action) => action.id)
    expect(ids).toContain('inquiry.submit')
    expect(ids).not.toContain('inquiry.readOwnerInbox')
    expect(ids).not.toContain('inquiry.readOwnerThread')
    expect(ids).not.toContain('inquiry.reply')
    expect(ids).not.toContain('inquiry.markRead')
    expect(ids).not.toContain('inquiry.close')
  })

  it('registers the registry read actions', () => {
    const ids = listActions().map((action) => action.id)
    expect(ids).toContain('registry.list')
    expect(ids).toContain('registry.search')
    expect(ids).toContain('registry.detail')
  })

  it('exposes only qualified inquiry submit plus registry search/detail as quiet agent tools', () => {
    const exposed = listAgentToolActions().map((action) => action.id)
    expect(exposed).toEqual(['inquiry.submit', 'registry.search', 'registry.detail'])
  })

  it('carries output validation schemas on every action', () => {
    for (const action of listActions()) {
      expect(action.outputSchema).toBeDefined()
    }
  })

  it('exposes schema metadata on agent-facing descriptors', () => {
    const search = describeActionForAgent(findAction('registry.search')!)
    expect(search.hasOutputSchema).toBe(true)
    expect(search.inputJsonSchema?.type).toBe('object')
    expect(search.outputJsonSchema?.type).toBe('object')

    const detail = describeActionForAgent(findAction('registry.detail')!)
    expect(detail.hasOutputSchema).toBe(true)
    expect(detail.outputJsonSchema).toBeDefined()

    const submit = describeActionForAgent(findAction('inquiry.submit')!)
    expect(submit.hasOutputSchema).toBe(true)
    expect(submit.outputJsonSchema).toBeDefined()
  })

  it('marks the registry actions as read-only with honest boundaries', () => {
    const list = findAction('registry.list')
    expect(list).toBeDefined()
    expect(list?.readOnly).toBe(true)
    expect(list?.surfaces).toContain('agentJson')
    expect(list?.surfaces).not.toContain('agentTools')

    const search = findAction('registry.search')
    expect(search).toBeDefined()
    expect(search?.readOnly).toBe(true)
    expect(search?.surfaces).toContain('agentTools')
    expect(search?.boundaries.join(' ')).toMatch(/book|charge|dispatch|inquiry/i)
    expect(search?.parameters.map((p) => p.name)).toContain('query')

    const detail = findAction('registry.detail')
    expect(detail).toBeDefined()
    expect(detail?.readOnly).toBe(true)
    expect(detail?.surfaces).toContain('agentTools')
    expect(detail?.parameters.map((p) => p.name)).toContain('slug')
  })

  it('keeps the registry action descriptors free of internal architecture vocabulary', () => {
    const search = describeActionForAgent(findAction('registry.search')!)
    const detail = describeActionForAgent(findAction('registry.detail')!)
    const joined = JSON.stringify([search, detail])
    expect(joined).not.toMatch(/MCP|OpenAPI|callable|autonomous|agent-native|DTO|fixture/i)
  })

  it('marks inquiry.submit as a non-read-only, admission-gated write', () => {
    const action = findAction('inquiry.submit')
    expect(action).toBeDefined()
    expect(action?.readOnly).toBe(false)
    expect(action?.surfaces).toContain('agentTools')
  })

  it('carries boundary-honest descriptors on the agent-facing tool', () => {
    const action = findAction('inquiry.submit')
    const descriptor = describeActionForAgent(action!)
    expect(descriptor.boundaries.length).toBeGreaterThan(0)
    expect(descriptor.summary).toMatch(/inquiry/i)
    expect(descriptor.parameters.map((p) => p.name)).toContain('target.businessId')
    expect(descriptor.parameters.map((p) => p.name)).toContain('body')
  })

  it('refuses booking/payment/dispatch in the boundaries', () => {
    const descriptor = describeActionForAgent(findAction('inquiry.submit')!)
    const joined = descriptor.boundaries.join(' ')
    expect(joined).toMatch(/book/)
    expect(joined).toMatch(/charge|pay/)
    expect(joined).toMatch(/dispatch/)
  })

  it('keeps owner-only operations outside the public action registry', () => {
    expect(findAction('inquiry.readOwnerInbox')).toBeUndefined()
    expect(findAction('inquiry.readOwnerThread')).toBeUndefined()
    expect(findAction('inquiry.reply')).toBeUndefined()
    expect(findAction('inquiry.markRead')).toBeUndefined()
    expect(findAction('inquiry.close')).toBeUndefined()
  })
})
