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
      env: 'production',
      authority: 'approval_required',
      perCall: '1.50',
      daily: 'nope',
      monthly: '40.00',
      secret: 'sek_should_not_survive',
    })
    expect(search).toEqual({
      issue: 'manual',
      name: 'Research bot',
      env: 'production',
      authority: 'approval_required',
      perCall: '1.50',
      monthly: '40.00',
    })
    expect(JSON.stringify(search)).not.toContain('sek_')
    const draft = agentKeyDraftFromSearch(search)
    expect(draft.name).toBe('Research bot')
    expect(draft.dailyAmount).toBe(AGENT_KEY_DRAFT_DEFAULTS.dailyAmount)
    expect(isAgentKeyDraftDirty(draft)).toBe(true)
    expect(agentKeySearchFromDraft(true, draft)).toMatchObject({ issue: 'manual', name: 'Research bot' })
  })

  it('keeps a closed wizard free of draft fields and an untouched wizard clean', () => {
    expect(agentKeySearchFromDraft(false, { ...AGENT_KEY_DRAFT_DEFAULTS, name: 'Ada' })).toEqual({})
    expect(isAgentKeyDraftDirty(AGENT_KEY_DRAFT_DEFAULTS)).toBe(false)
    expect(validateAgentKeyIssueSearch({})).toEqual({})
  })

  it('still rejects an unknown issue flag', () => {
    expect(() => validateAgentKeyIssueSearch({ issue: 'oauth' })).toThrow()
  })
})
