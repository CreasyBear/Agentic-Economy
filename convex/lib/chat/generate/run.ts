import { saveMessages } from '@convex-dev/agent'
import { makeFunctionReference } from 'convex/server'
import { sanitizeTelemetryError } from '@/lib/observability/private-route-safety'
import { openRouterGatewayConfig, openRouterModel } from '@/modules/model-gateway/public'
import type { InteractiveBusinessAuthorityContext } from '@/modules/business/public'
import { accountRef, membershipRef, ownershipRef, principalRef } from '@/modules/principal-account/public'
import { components, internal } from '../../../_generated/api'
import { env, type ActionCtx } from '../../../_generated/server'
import { interactiveAuthorityContextValue } from '../../../interactiveAuthority'
import type { GenerateArgs } from './contracts'
import { streamDurableChatResponse } from './stream'

const DURABLE_CHAT_FAILURE_MESSAGE =
  "I couldn't finish the answer. Edit your question to try again."
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

export async function generateHandler(ctx: ActionCtx, args: GenerateArgs): Promise<null> {
  let ownerId: string | undefined
  try {
    const authority = args.authority
    const current = authority !== undefined
      ? await ctx.runQuery(internal.chatMessages.authorizeScheduledGeneration, {
          threadId: args.threadId,
          promptMessageId: args.promptMessageId,
          authority,
        }).then((value) => value === null ? null : { ownerId: value.ownerId, trustedChatAuthority: undefined })
      : args.turnRef === undefined ? null : await ctx.runQuery(internal.chatTurns.authorizeKeyGeneration, {
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
        const recoveryMessage = effects.length === 0
          ? DURABLE_CHAT_FAILURE_MESSAGE
          : `I couldn't finish the answer. A Call may already have run. CallRef: ${effects.join(', ')}. Check each Call's status before sending another request; payment may be outcome_unknown.`
        await saveMessages(ctx, components.agent, {
          threadId: args.threadId,
          userId: ownerId,
          promptMessageId: args.promptMessageId,
          messages: [{ role: 'assistant', content: recoveryMessage }],
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
}
