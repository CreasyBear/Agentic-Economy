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

export async function streamDurableChatResponse(
  ctx: ActionCtx,
  args: Readonly<{
    threadId: string
    ownerId: string
    promptMessageId: string
  }>,
  languageModel: LanguageModelV4,
): Promise<void> {
  const agent = createChatAgent(languageModel)
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
    ownerId: v.string(),
    promptMessageId: v.string(),
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
      await streamDurableChatResponse(
        ctx,
        args,
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
