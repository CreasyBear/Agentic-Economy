import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { defineAction } from '@/modules/common/action'
import {
  AGENT_TOOL_WRITE_SCOPES,
  declaredAgentToolWriteScope,
  listQuietAgentTools,
  publicQuietAgentWriteScopeForTool,
  sourceWriteDeclarationForTool,
  actionToHarnessTool,
} from '@/modules/harness/public'

describe('agent tool write scope', () => {
  it('keeps harness declaration and clearance map aligned for inquiry.submit', () => {
    expect(declaredAgentToolWriteScope('inquiry.submit')).toBe('public_inquiry')
    expect(AGENT_TOOL_WRITE_SCOPES['inquiry.submit']).toBe('public_inquiry')

    const action = defineAction({
      id: 'inquiry.submit',
      name: 'Submit inquiry',
      summary: 'Send a qualified inquiry.',
      boundaries: ['Does not book, charge, dispatch, or auto-fulfil.'],
      schema: z.object({ body: z.string().min(1) }),
      outputSchema: z.object({ kind: z.literal('ok') }),
      parameters: [],
      readOnly: false,
      surfaces: ['agentTools'],
      run: async () => ({ kind: 'ok' }),
    })
    const tool = actionToHarnessTool(action)
    expect(sourceWriteDeclarationForTool(tool)?.scope).toBe('public_inquiry')
    expect(publicQuietAgentWriteScopeForTool(tool)).toBe('public_inquiry')
  })

  it('does not expose businessAction.requestCapability on the quiet door write path', () => {
    expect(declaredAgentToolWriteScope('businessAction.requestCapability')).toBe(
      'business_action_request',
    )
    const action = defineAction({
      id: 'businessAction.requestCapability',
      name: 'Propose a business action',
      summary: 'Propose an owner-reviewed reserve request.',
      boundaries: ['Refuse instant booking, payment, dispatch, or autonomous execution requests.'],
      schema: z.object({ businessId: z.string().min(1) }),
      outputSchema: z.object({ kind: z.literal('ok') }),
      parameters: [],
      readOnly: false,
      surfaces: ['agentJson'],
      run: async () => ({ kind: 'ok' }),
    })
    const tool = actionToHarnessTool(action)
    expect(publicQuietAgentWriteScopeForTool(tool)).toBeUndefined()
  })
})

describe('listQuietAgentTools', () => {
  it('returns the pinned quiet-agent catalog without HTTP', () => {
    const { tools } = listQuietAgentTools()
    expect(tools.map((tool) => tool.id)).toEqual([
      'registry.search',
      'registry.detail',
      'inquiry.submit',
    ])
    for (const tool of tools) {
      expect(tool.summary.length).toBeGreaterThan(0)
      expect(tool.boundaries.length).toBeGreaterThan(0)
    }
  })
})
