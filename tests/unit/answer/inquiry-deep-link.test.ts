import { describe, expect, it } from 'vitest'

import { runAnswerToolUseAgent } from '@/modules/answer/public'
import {
  openRouterToolThenProseResponses,
  startOpenRouterContractServer,
} from '../../helpers/openrouter-contract-server'

/**
 * `joondalup-rapid-plumbing` is the one local fixture with
 * `inquiryAdmission: 'admitted'`. It also publishes a phone number, so it is
 * the case that proves both facts survive the Offering projection: the legacy
 * adapter used to collapse phone and AE inquiry into a single access path and
 * silently dropped the inquiry deep link.
 */
describe('tool-use agent inquiry deep links', () => {
  it('surfaces inquiryUrl for an admitted business that also publishes a phone number', async () => {
    const server = await startOpenRouterContractServer(openRouterToolThenProseResponses({
      toolCalls: [{ toolId: 'registry.detail', input: { slug: 'joondalup-rapid-plumbing' } }],
      prose: {
        oneLine: 'One listed business matches this need.',
        summary:
          'The listing publishes inquiry options. Scope, price, and current availability still need confirmation.',
        whatToDoNow: 'Contact the business and ask whether it handles the work, what it costs, and when it is available.',
      },
    }))
    const restoreOpenRouter = server.installEnv()
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    const previousConvexUrl = process.env.CONVEX_URL
    const previousPublicConvexUrl = process.env.VITE_CONVEX_URL
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'
    delete process.env.CONVEX_URL
    delete process.env.VITE_CONVEX_URL
    try {
      const result = await runAnswerToolUseAgent({ query: 'plumbing' })
      const provider = result.providers.find((candidate) => candidate.slug === 'joondalup-rapid-plumbing')
      expect(provider?.inquiryUrl).toBe('/joondalup-rapid-plumbing/inquiry')
      expect(provider?.nextStepLabel).toBe('Send inquiry')
      expect(provider?.publishedPhone).toBe('0412 345 678')
    } finally {
      restoreOpenRouter()
      await server.close()
      if (previousLocalRegistry === undefined) {
        delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
      } else {
        process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previousLocalRegistry
      }
      if (previousConvexUrl === undefined) {
        delete process.env.CONVEX_URL
      } else {
        process.env.CONVEX_URL = previousConvexUrl
      }
      if (previousPublicConvexUrl === undefined) {
        delete process.env.VITE_CONVEX_URL
      } else {
        process.env.VITE_CONVEX_URL = previousPublicConvexUrl
      }
    }
  })
})
