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

  it('exposes only the public inquiry submit action to agents', () => {
    const exposed = listAgentToolActions().map((action) => action.id)
    expect(exposed).toEqual(['inquiry.submit'])
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
