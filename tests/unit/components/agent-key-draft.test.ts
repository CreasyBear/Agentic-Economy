import { describe, expect, it, vi } from 'vitest'

import {
  AGENT_KEY_DRAFT_DEFAULTS,
  agentKeyDraftFromSearch,
  agentKeySearchFromDraft,
  isAgentKeyDraftDirty,
  navigateAgentKeyIssueSearch,
  validateAgentKeyIssueSearch,
} from '@/components/ae/console/connect-agent-wizard/agent-key-draft'

describe('agent key draft search', () => {
  it('round-trips a typed name and drops an invalid amount without throwing', () => {
    const search = validateAgentKeyIssueSearch({
      issue: 'manual',
      name: 'Research bot',
      authority: 'approval_required',
      perCall: '1.50',
      daily: 'nope',
      monthly: '40.00',
      secret: 'sek_should_not_survive',
    })
    expect(search).toEqual({
      issue: 'manual',
      name: 'Research bot',
      authority: 'approval_required',
      perCall: '1.50',
      monthly: '40.00',
    })
    expect(JSON.stringify(search)).not.toContain('sek_')
    const draft = agentKeyDraftFromSearch(search, 'production')
    expect(draft.name).toBe('Research bot')
    expect(draft.dailyAmount).toBe(AGENT_KEY_DRAFT_DEFAULTS.dailyAmount)
    expect(isAgentKeyDraftDirty(draft)).toBe(true)
    expect(agentKeySearchFromDraft(true, draft)).toMatchObject({ issue: 'manual', name: 'Research bot' })
  })

  it('keeps a closed wizard free of draft fields and an untouched wizard clean', () => {
    expect(agentKeySearchFromDraft(false, { ...AGENT_KEY_DRAFT_DEFAULTS, environment: 'production', name: 'Ada' })).toEqual({})
    expect(isAgentKeyDraftDirty(agentKeyDraftFromSearch({}, 'production'))).toBe(false)
    expect(validateAgentKeyIssueSearch({})).toEqual({})
  })

  it.each(['production', 'sandbox'] as const)('keeps %s fixed when a URL requests the opposite environment', (environment) => {
    const search = validateAgentKeyIssueSearch({ issue: 'manual', env: environment === 'production' ? 'sandbox' : 'production' })
    expect(search).not.toHaveProperty('env')
    const draft = agentKeyDraftFromSearch(search, environment)
    expect(draft.environment).toBe(environment)
    expect(agentKeySearchFromDraft(true, draft)).not.toHaveProperty('env')
    expect(isAgentKeyDraftDirty(draft)).toBe(false)
  })

  it('retains only a valid selected Tool through draft edits and closing', () => {
    const resumeTool = `operation:v1:${'a'.repeat(64)}`
    expect(validateAgentKeyIssueSearch({ issue: 'manual', resumeTool, token: 'sek_private' })).toEqual({ issue: 'manual', resumeTool })
    expect(validateAgentKeyIssueSearch({ resumeTool: '//evil.example', input: 'private task' })).toEqual({})
    const navigate = vi.fn().mockResolvedValue(undefined)
    const draft = agentKeyDraftFromSearch({ name: 'Ada' }, 'sandbox')
    navigateAgentKeyIssueSearch(navigate, true, draft, true, { resumeTool })
    expect(navigate).toHaveBeenLastCalledWith(expect.objectContaining({ search: expect.objectContaining({ issue: 'manual', name: 'Ada', resumeTool }) }))
    navigateAgentKeyIssueSearch(navigate, false, draft, true, { resumeTool })
    expect(navigate).toHaveBeenLastCalledWith(expect.objectContaining({ search: { resumeTool } }))
  })

  it('still rejects an unknown issue flag' , () => {
    expect(() => validateAgentKeyIssueSearch({ issue: 'oauth' })).toThrow()
  })
})
