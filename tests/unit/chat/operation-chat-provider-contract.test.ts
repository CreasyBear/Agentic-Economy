import { generateText, stepCountIs, type ToolSet } from 'ai'
import { describe, expect, it, vi } from 'vitest'
import type { ToolCtx } from '@convex-dev/agent'

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
  openRouterToolCallResponse,
  startOpenRouterContractServer,
} from '../../helpers/openrouter-contract-server'
import type { InteractiveBusinessAuthorityContext } from '@/modules/business/public'

const OPERATION_REF = `operation:v1:${'a'.repeat(64)}`

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

  it('feeds the literal completed Operation result into the model continuation step', async () => {
    const invokeToolName = CHAT_TOOL_NAME_MAP.canonicalToProvider['operation.invoke']
    const freshValue = 'fresh-provider-value-7f9c'
    const completed = {
      kind: 'completed' as const,
      invocationRef: 'invocation:provider-contract:1',
      operationRef: OPERATION_REF,
      output: { providerFreshValue: freshValue },
      evidenceHash: 'evidence:provider-contract:1',
      usage: {
        usageRef: 'usage:provider-contract:1',
        observedAt: 1,
        chargeState: 'paid' as const,
        amount: { currency: 'USD', units: '125', exponent: 2 },
        priceDigest: 'price:provider-contract:1',
      },
    }
    const server = await startOpenRouterContractServer([
      openRouterToolCallResponse(invokeToolName, {
        operationRef: OPERATION_REF,
        input: { company: 'Acme' },
      }),
      openRouterProseResponse({
        oneLine: `Continued with ${freshValue}.`,
        summary: 'The returned provider value is available for the caller-owned task.',
        whatToDoNow: 'Use the value in the next task step.',
      }),
    ])
    const restoreEnv = server.installEnv()

    try {
      const config = openRouterGatewayConfig()
      const model = openRouterModel(config, config.model)
      const agent = createChatAgent(model, AUTHORITY)
      const runAction = vi.fn(async () => completed)
      const ctx = { runAction, runQuery: vi.fn() } as unknown as ToolCtx
      const tools = Object.fromEntries(Object.entries(agent.options.tools ?? {}).map(
        ([name, tool]) => [name, { ...tool, ctx }],
      )) as ToolSet

      const result = await generateText({
        model,
        prompt: 'Find and use the company enrichment contribution.',
        tools,
        stopWhen: stepCountIs(2),
      })

      expect(runAction).toHaveBeenCalledTimes(1)
      expect(server.requests).toHaveLength(2)
      expect(JSON.stringify(server.requests[1]?.messages)).toContain(freshValue)
      expect(result.text).toContain(freshValue)
    } finally {
      restoreEnv()
      await server.close()
    }
  })
})
