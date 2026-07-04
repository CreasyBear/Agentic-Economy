import { describe, expect, it } from 'vitest'

import { runAnswerToolUseAgent } from '@/modules/answer/public'
import {
  openRouterToolThenProseResponses,
  startOpenRouterContractServer,
} from '../../helpers/openrouter-contract-server'

describe('tool-use agent inquiry deep links', () => {
  it('surfaces inquiryUrl from the explicit local registry source when the published service supports human inquiry', async () => {
    const server = await startOpenRouterContractServer(openRouterToolThenProseResponses({
      toolCalls: [{ toolId: 'registry.detail', input: { slug: 'plumbing-demo' } }],
      prose: {
        oneLine: 'One listed business matches this need.',
        summary:
          'The listing publishes inquiry options. The business handles timing, price, and availability. Agentic Economy does not book or take payment on this page.',
        whatToDoNow: 'Open the provider page and send an inquiry when published. Agentic Economy does not book or take payment on this page.',
      },
    }))
    const restoreOpenRouter = server.installEnv()
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'
    try {
      const result = await runAnswerToolUseAgent({ query: 'plumbing' })
      const provider = result.providers.find((candidate) => candidate.slug === 'plumbing-demo')
      expect(provider?.inquiryUrl).toBe('/plumbing-demo/inquiry')
      expect(provider?.nextStepLabel).toBe('Send inquiry')
    } finally {
      restoreOpenRouter()
      await server.close()
      if (previousLocalRegistry === undefined) {
        delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
      } else {
        process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previousLocalRegistry
      }
    }
  })
})
