"use node"

import { saveMessages } from '@convex-dev/agent'
import type { LanguageModelV4 } from '@ai-sdk/provider'
import { makeFunctionReference } from 'convex/server'
import { v } from 'convex/values'

import { sanitizeTelemetryError } from '@/lib/observability/private-route-safety'
import {
  openRouterGatewayConfig,
  openRouterModel,
} from '@/modules/model-gateway/public'

import { components, internal } from './_generated/api'
import { env, internalAction } from './_generated/server'
import type { ActionCtx } from './_generated/server'
import { CHAT_TOOL_NAME_MAP, createChatAgent, prepareChatStep } from './chatTools'
import { interactiveAuthorityContextValue } from './interactiveAuthority'
import type { InteractiveBusinessAuthorityContext } from '../src/modules/business/public'
import type { TrustedChatAuthority } from '../src/modules/chat/agent-turn.contracts'
import {
  accountRef,
  membershipRef,
  ownershipRef,
  principalRef,
} from '../src/modules/principal-account/public'

const DURABLE_CHAT_FAILURE_MESSAGE =
  'Chat stopped before a final response was recorded. Review any call card or receipt already shown before sending this request again.'
const turnEffectsRef = makeFunctionReference<'query', { turnRef: string }, string[]>(
  'chatCall:readTurnEffects',
)

function interactiveAuthorityContextFromValue(
  input: typeof interactiveAuthorityContextValue.type,
): InteractiveBusinessAuthorityContext {
  const accessRef = input.provenance.accessKind === 'ownership'
    ? ownershipRef(input.provenance.accessRef)
    : membershipRef(input.provenance.accessRef)
  return Object.freeze({
    principalRef: principalRef(input.principalRef),
    accountRef: accountRef(input.accountRef),
    revision: Object.freeze({ ...input.revision }),
    provenance: Object.freeze({
      ...input.provenance,
      accessRef,
      currentOwnershipRef: ownershipRef(input.provenance.currentOwnershipRef),
    }),
  })
}

export async function streamDurableChatResponse(
  ctx: ActionCtx,
  args: Readonly<{
    threadId: string
    ownerId: string
    promptMessageId: string
    authority?: InteractiveBusinessAuthorityContext
    trustedChatAuthority?: TrustedChatAuthority
  }>,
  languageModel: LanguageModelV4,
): Promise<boolean> {
  const agent = createChatAgent(languageModel, args.trustedChatAuthority)
  let clarificationRequested = false
  await agent.streamText(
    ctx,
    { threadId: args.threadId, userId: args.ownerId },
    {
      promptMessageId: args.promptMessageId,
      prepareStep: prepareChatStep,
      onStepEnd: (step) => {
        if (step.toolResults.some(result =>
          result.toolName === CHAT_TOOL_NAME_MAP.canonicalToProvider['chat.clarify']
          && typeof result.output === 'object' && result.output !== null
          && 'status' in result.output && result.output.status === 'awaiting_answer')) {
          clarificationRequested = true
        }
      },
    },
    {
      storageOptions: { saveMessages: 'promptAndOutput' },
      saveStreamDeltas: {
        chunking: 'word',
        throttleMs: 100,
      },
    },
  )
  return clarificationRequested
}

export const generate = internalAction({
  args: {
    threadId: v.string(),
    promptMessageId: v.string(),
    authority: v.optional(interactiveAuthorityContextValue),
    turnRef: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    let ownerId: string | undefined
    try {
      if (args.authority === undefined && args.turnRef === undefined) {
        throw new Error('chat_generation_authority_invalid')
      }
      const authority = args.authority
      const current = authority !== undefined
        ? await ctx.runQuery(internal.chatMessages.authorizeScheduledGeneration, {
            threadId: args.threadId,
            promptMessageId: args.promptMessageId,
            authority,
          }).then((value) => value === null ? null : { ownerId: value.ownerId, trustedChatAuthority: undefined })
        : await ctx.runQuery(internal.chatTurns.authorizeKeyGeneration, {
            turnRef: args.turnRef,
            threadId: args.threadId,
            promptMessageId: args.promptMessageId,
          }).then((value) => value === null ? null : { ownerId: value.ownerId, trustedChatAuthority: value.authority })
      if (current === null) throw new Error('chat_generation_authority_invalid')
      ownerId = current.ownerId
      if (args.turnRef !== undefined && !await ctx.runMutation(internal.chatTurns.finishTurn, {
        turnRef: args.turnRef, promptMessageId: args.promptMessageId, state: 'working',
      })) return null
      const apiKey = env.OPENROUTER_API_KEY?.trim()
      if (apiKey === undefined || apiKey.length === 0) {
        throw new Error('agent_unavailable')
      }
      const config = openRouterGatewayConfig({
        OPENROUTER_API_KEY: apiKey,
        ...(env.AE_LLM_MODEL === undefined ? {} : { AE_LLM_MODEL: env.AE_LLM_MODEL }),
        ...(env.AE_SITE_URL === undefined ? {} : { SITE_URL: env.AE_SITE_URL }),
      })
      const clarificationRequested = await streamDurableChatResponse(
        ctx,
        {
          threadId: args.threadId,
          promptMessageId: args.promptMessageId,
          ownerId: current.ownerId,
          ...(args.authority === undefined ? {} : { authority: interactiveAuthorityContextFromValue(args.authority) }),
          ...(current.trustedChatAuthority === undefined ? {} : { trustedChatAuthority: current.trustedChatAuthority }),
        },
        openRouterModel(config, config.model),
      )
      if (args.turnRef !== undefined) {
        await ctx.runMutation(internal.chatTurns.finishTurn, {
          turnRef: args.turnRef, promptMessageId: args.promptMessageId,
          state: clarificationRequested ? 'input-required' : 'completed',
        })
      }
      return null
    } catch (error) {
      if (ownerId !== undefined) {
        try {
          const effects = args.turnRef === undefined ? [] : await ctx.runQuery(turnEffectsRef, {
            turnRef: args.turnRef,
          })
          const continuation = effects.length === 0
            ? ''
            : ` CallRef: ${effects.join(', ')}. Check each Call's status; payment may be outcome_unknown.`
          await saveMessages(ctx, components.agent, {
            threadId: args.threadId,
            userId: ownerId,
            promptMessageId: args.promptMessageId,
            messages: [{ role: 'assistant', content: `${DURABLE_CHAT_FAILURE_MESSAGE}${continuation}` }],
            agentName: 'Agentic Economy Operation Market',
            failPendingSteps: true,
          })
        } catch (saveError) {
          console.error(
            '[chat-durable] recovery message failed',
            sanitizeTelemetryError(saveError),
          )
        }
      }
      if (args.turnRef !== undefined) {
        await ctx.runMutation(internal.chatTurns.finishTurn, {
          turnRef: args.turnRef, promptMessageId: args.promptMessageId, state: 'failed',
        })
      }
      throw error
    } finally {
      await ctx.runMutation(internal.chatMessages.clearActiveGeneration, {
        threadId: args.threadId,
        promptMessageId: args.promptMessageId,
      })
    }
  },
})
