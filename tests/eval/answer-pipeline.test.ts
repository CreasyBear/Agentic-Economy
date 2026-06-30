import { afterEach, describe, expect, it } from 'vitest'

import {
  assembleAnswerEvidence,
  runAnswerToolUseAgent,
  runAnswerGate,
  setAnswerToolUseAgentForTests,
} from '@/modules/answer/public'
import { createDefaultRegistrySourceState } from '@/modules/registry/public'
import { withRegistrySourcePortForTest } from '../helpers/source-ports'

const QUERY = 'emergency plumber parramatta'

afterEach(() => {
  setAnswerToolUseAgentForTests(undefined)
})

describe('answer pipeline eval', () => {
  it('returns grounded evidence for the default registry fixture', async () => {
    const state = createDefaultRegistrySourceState()
    await withRegistrySourcePortForTest(state, async () => {
      const evidence = await assembleAnswerEvidence({ query: QUERY, limit: 10 })
      expect(evidence).toBeDefined()
      expect(evidence?.providers.map((provider) => provider.slug)).toEqual(['parramatta-emergency-plumbing'])
    })
  })

  it('passes runAnswerGate for tool-use agent output grounded on tool-result slugs', async () => {
    const state = createDefaultRegistrySourceState()
    await withRegistrySourcePortForTest(state, async () => {
      const reset = setAnswerToolUseAgentForTests(async () => ({
        toolCalls: [{ toolId: 'registry.search', input: { query: 'parramatta' } }],
        prose: {
          oneLine: 'One listed business matches this need.',
          summary:
            'The listing publishes emergency pipe repair. Agentic Economy does not book or take payment on this page.',
          whatToDoNow: 'Open the provider page and send an inquiry when published.',
        },
      }))

      try {
        const result = await runAnswerToolUseAgent({ query: QUERY })
        const gate = runAnswerGate({
          snapshot: result.snapshot,
          allowedSlugs: result.allowedSlugs,
        })
        expect(gate.ok).toBe(true)
      } finally {
        reset()
      }
    })
  })
})
