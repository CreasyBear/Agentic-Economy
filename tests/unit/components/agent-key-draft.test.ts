import { describe, expect, it } from 'vitest'

import {
  AGENT_KEY_DRAFT_DEFAULTS,
  agentKeyDraftFromSearch,
  agentKeySearchFromDraft,
  isAgentKeyDraftDirty,
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

  it('still rejects an unknown issue flag', () => {
    expect(() => validateAgentKeyIssueSearch({ issue: 'oauth' })).toThrow()
  })
})
