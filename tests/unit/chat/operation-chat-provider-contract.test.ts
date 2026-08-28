import { generateText } from 'ai'
import { describe, expect, it } from 'vitest'

import {
  CHAT_TOOL_IDS,
  CHAT_TOOL_NAME_MAP,
  createChatAgent,
} from '../../../convex/chatTools'
import {
  openRouterGatewayConfig,
  openRouterModel,
} from '@/modules/model-gateway/public'
import {
  openRouterProseResponse,
  startOpenRouterContractServer,
} from '../../helpers/openrouter-contract-server'
import type { InteractiveBusinessAuthorityContext } from '@/modules/business/public'

const AUTHORITY = {
  principalRef: `prn_${'1'.repeat(32)}`,
  accountRef: `acc_${'2'.repeat(32)}`,
  revision: {
    binding: 1, credential: 1, principal: 1, account: 1, access: 1,
    currentOwnership: 1, currentOwnerPrincipal: 1, compatibilityUpdatedAt: 1,
  },
  provenance: {
    providerNamespace: 'clerk/user',
    bindingRef: `eib_${'3'.repeat(32)}`,
    credentialRef: `crd_${'4'.repeat(32)}`,
    credentialGeneration: 1,
    accessKind: 'ownership',
    accessRef: `own_${'5'.repeat(32)}`,
    currentOwnershipRef: `own_${'5'.repeat(32)}`,
    resolvedAt: 1,
  },
} as unknown as InteractiveBusinessAuthorityContext

describe('Operation chat OpenRouter contract', () => {
  it('sends exactly five provider-safe names that round-trip to canonical IDs', async () => {
    const server = await startOpenRouterContractServer([
      openRouterProseResponse({
        oneLine: 'Done.',
        summary: 'No tool was needed.',
        whatToDoNow: 'Ask about an Operation.',
      }),
    ])
    const restoreEnv = server.installEnv()

    try {
      const config = openRouterGatewayConfig()
      const model = openRouterModel(config, config.model)
      const agent = createChatAgent(model, AUTHORITY)
      const tools = agent.options.tools
      if (tools === undefined) throw new Error('Operation chat tools are unavailable')

      await generateText({
        model,
        prompt: 'Describe the available Operation tools.',
        tools,
      })

      const names = server.requests[0]?.tools?.map((tool) => tool.function.name)
      expect(names).toEqual(
        CHAT_TOOL_IDS.map((toolId) => CHAT_TOOL_NAME_MAP.canonicalToProvider[toolId]),
      )
      expect(names).toHaveLength(5)
      for (const name of names ?? []) {
        expect(name).not.toContain('.')
        expect(name).toMatch(/^[A-Za-z0-9_-]{1,128}$/)
        const canonical = CHAT_TOOL_NAME_MAP.providerToCanonical[name]
        expect(canonical).toBeDefined()
        expect(CHAT_TOOL_NAME_MAP.canonicalToProvider[canonical!]).toBe(name)
      }
    } finally {
      restoreEnv()
      await server.close()
    }
  })
})
