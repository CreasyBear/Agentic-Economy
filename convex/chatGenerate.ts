"use node"

import type { LanguageModelV4 } from '@ai-sdk/provider'
import { v } from 'convex/values'

import {
  openRouterGatewayConfig,
  openRouterModel,
} from '@/modules/model-gateway/public'

import { internal } from './_generated/api'
import { env, internalAction } from './_generated/server'
import type { ActionCtx } from './_generated/server'
import { createChatAgent } from './chatTools'
import { interactiveAuthorityContextValue } from './interactiveAuthority'
import type { InteractiveBusinessAuthorityContext } from '../src/modules/business/public'

export async function streamDurableChatResponse(
  ctx: ActionCtx,
  args: Readonly<{
    threadId: string
    ownerId: string
    promptMessageId: string
    authority?: InteractiveBusinessAuthorityContext
  }>,
  languageModel: LanguageModelV4,
): Promise<void> {
  const agent = createChatAgent(languageModel, args.authority)
  await agent.streamText(
    ctx,
    { threadId: args.threadId, userId: args.ownerId },
    { promptMessageId: args.promptMessageId },
    {
      storageOptions: { saveMessages: 'promptAndOutput' },
      saveStreamDeltas: {
        chunking: 'word',
        throttleMs: 100,
      },
    },
  )
}

export const generate = internalAction({
  args: {
    threadId: v.string(),
    promptMessageId: v.string(),
    authority: interactiveAuthorityContextValue,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      const apiKey = env.OPENROUTER_API_KEY?.trim()
      if (apiKey === undefined || apiKey.length === 0) {
        throw new Error('agent_unavailable')
      }
      const config = openRouterGatewayConfig({
        OPENROUTER_API_KEY: apiKey,
        ...(env.AE_LLM_MODEL === undefined ? {} : { AE_LLM_MODEL: env.AE_LLM_MODEL }),
        ...(env.AE_SITE_URL === undefined ? {} : { SITE_URL: env.AE_SITE_URL }),
      })
      const current = await ctx.runQuery(internal.chatMessages.authorizeScheduledGeneration, {
        threadId: args.threadId,
        promptMessageId: args.promptMessageId,
        authority: args.authority,
      })
      if (current === null) throw new Error('chat_generation_authority_invalid')
      await streamDurableChatResponse(
        ctx,
        {
          ...args,
          ownerId: current.ownerId,
          authority: args.authority as unknown as InteractiveBusinessAuthorityContext,
        },
        openRouterModel(config, config.model),
      )
      return null
    } finally {
      await ctx.runMutation(internal.chatMessages.clearActiveGeneration, {
        threadId: args.threadId,
        promptMessageId: args.promptMessageId,
      })
    }
  },
})
