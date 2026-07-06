import { describe, expect, it } from 'vitest'

import { listActions, listAgentToolActions } from '@/modules/actions'
import { runAnswerToolCall } from '@/modules/answer-thread/internal/tool-runner'

describe('agentTools action surface', () => {
  it('exposes exactly the approved quiet agent tools', () => {
    expect(listAgentToolActions().map((action) => action.id).sort()).toEqual([
      'inquiry.submit',
      'registry.detail',
      'registry.search',
    ])
    expect(listActions().find((action) => action.id === 'registry.list')?.surfaces).not.toContain('agentTools')
  })

  it('keeps qualified inquiry submit as the only assistant-callable write', () => {
    const writes = listActions()
      .filter((action) => !action.readOnly && action.surfaces.includes('agentTools'))
      .map((action) => action.id)

    expect(writes).toEqual(['inquiry.submit'])
  })

  it('keeps the answer-thread runner read-only even though inquiry.submit is registered for agentTools', async () => {
    const result = await runAnswerToolCall({
      toolId: 'inquiry.submit',
      input: { body: 'please book this now' },
      turnId: 'turn-agent-tools-surface',
      seq: 1,
    })

    expect(result.record.status).toBe('refused')
    expect(JSON.parse(result.record.resultSummaryJson)).toMatchObject({
      errorCode: 'tool_not_known',
    })
  })
})
