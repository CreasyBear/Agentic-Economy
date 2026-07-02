import { describe, expect, it } from 'vitest'

import {
  describeActionForAgent,
  findAction,
  listActions,
  listAgentToolActions,
} from '@/modules/actions'

describe('action registry', () => {
  it('registers the inquiry module actions', () => {
    const ids = listActions().map((action) => action.id)
    expect(ids).toContain('inquiry.submit')
    expect(ids).toContain('inquiry.readOwnerInbox')
    expect(ids).toContain('inquiry.readOwnerThread')
    expect(ids).toContain('inquiry.reply')
    expect(ids).toContain('inquiry.markRead')
    expect(ids).toContain('inquiry.close')
  })

  it('registers the registry read actions', () => {
    const ids = listActions().map((action) => action.id)
    expect(ids).toContain('registry.search')
    expect(ids).toContain('registry.detail')
  })

  it('exposes the public inquiry submit action and read-only registry actions to agents', () => {
    const exposed = listAgentToolActions().map((action) => action.id)
    expect(exposed).toContain('inquiry.submit')
    expect(exposed).toContain('registry.search')
    expect(exposed).toContain('registry.detail')
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

  it('keeps owner-only actions off the agent-tools surface', () => {
    const reply = findAction('inquiry.reply')
    expect(reply?.surfaces).not.toContain('agentTools')
    expect(reply?.surfaces).toContain('ui')
  })
})
