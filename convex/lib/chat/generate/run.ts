import { listMessages, saveMessages } from '@convex-dev/agent'
import { makeFunctionReference } from 'convex/server'
import { sanitizeTelemetryError } from '@/lib/observability/private-route-safety'
import { openRouterGatewayConfig, openRouterModel } from '@/modules/model-gateway/public'
import type { InteractiveBusinessAuthorityContext } from '@/modules/business/public'
import { accountRef, membershipRef, ownershipRef, principalRef } from '@/modules/principal-account/public'
import { components, internal } from '../../../_generated/api'
import type { ActionCtx } from '../../../_generated/server'
import { interactiveAuthorityContextValue } from '../../../interactiveAuthority'
import type { GenerateArgs } from './contracts'
import { factsFromSavedTurn } from './completedFacts'
import { CHAT_UNFINISHED_ANSWER, containsChatProtocolMarkup } from '@/modules/chat/search-presentation'
import { streamDurableChatResponse } from './stream'
import type { ChatTurnFailureReason } from '@/modules/actions/contract'

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

// Requires: current scheduled authority and an invocation model credential.
// Ensures: one configuration snapshot is used throughout this generation.
// Invariant: worker reuse cannot retain a removed key or change an in-flight model.
// On violation: existing durable failure handling settles the turn before model work.
export async function generateHandler(ctx: ActionCtx, args: GenerateArgs): Promise<null> {
  // Convex's Node executor replaces process.env per invocation; generated env
  // captures the old object at module load. Snapshot these values before any await.
  const { OPENROUTER_API_KEY, AE_LLM_MODEL, AE_SITE_URL } = process.env
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
    const searchTurn = args.turnRef === undefined ? undefined
      : { turnRef: args.turnRef, threadId: args.threadId, promptMessageId: args.promptMessageId }
    const continuation = searchTurn === undefined ? null
      : await ctx.runQuery(internal.chatTurns.readSearchPage, searchTurn)
    const apiKey = OPENROUTER_API_KEY?.trim()
    if (apiKey === undefined || apiKey.length === 0) {
      throw new Error('agent_unavailable')
    }
    const config = openRouterGatewayConfig({
      OPENROUTER_API_KEY: apiKey,
      ...(AE_LLM_MODEL === undefined ? {} : { AE_LLM_MODEL }),
      ...(AE_SITE_URL === undefined ? {} : { SITE_URL: AE_SITE_URL }),
    })
    const clarificationRequested = await streamDurableChatResponse(
      ctx,
      {
        threadId: args.threadId,
        promptMessageId: args.promptMessageId,
        ownerId: current.ownerId,
        ...(args.authority === undefined ? {} : { authority: interactiveAuthorityContextFromValue(args.authority) }),
        ...(current.trustedChatAuthority === undefined ? {} : { trustedChatAuthority: current.trustedChatAuthority }),
        ...(searchTurn === undefined ? {} : { searchTurn }),
        ...(continuation === null ? {} : { continuation }),
        ...(args.deadlineAt === undefined ? {} : { deadlineAt: args.deadlineAt }),
      },
      openRouterModel(config, config.model),
    )
    if (args.turnRef !== undefined) {
      const effects = await ctx.runQuery(turnEffectsRef, { turnRef: args.turnRef })
      if (effects.length > 0) {
        const history = await listMessages(ctx, components.agent, {
          threadId: args.threadId, paginationOpts: { cursor: null, numItems: 50 },
        })
        const prompt = history.page.find(row => row._id === args.promptMessageId)
        const answer = history.page.find(row => row.order === prompt?.order
          && row.message?.role === 'assistant' && row.status === 'success')
        const missing = effects.filter(ref => !answer?.text?.includes(ref))
        if (missing.length > 0) {
          await saveMessages(ctx, components.agent, {
            threadId: args.threadId,
            userId: current.ownerId,
            promptMessageId: args.promptMessageId,
            messages: [{
              role: 'assistant',
              content: `A Call may already have run. CallRef: ${missing.join(', ')}. Check its status before another request; payment may be outcome_unknown.`,
            }],
            agentName: 'Agentic Economy Operation Market',
          })
        }
      }
      await ctx.runMutation(internal.chatTurns.finishTurn, {
        turnRef: args.turnRef, promptMessageId: args.promptMessageId,
        state: clarificationRequested ? 'input-required' : 'completed',
      })
    }
    return null
  } catch (error) {
    console.error('[chat-durable] generation failed', sanitizeTelemetryError(error))
    if (args.turnRef !== undefined && args.deadlineAt !== undefined && Date.now() >= args.deadlineAt) {
      await ctx.runMutation(internal.chatTurns.finishTurn, {
        turnRef: args.turnRef, promptMessageId: args.promptMessageId, state: 'failed',
        failureReason: 'generation_timed_out', expectedDeadlineAt: args.deadlineAt,
      })
      return null
    }

    let effects: string[] = []
    let effectReadFailed = false
    if (args.turnRef !== undefined) {
      try {
        effects = await ctx.runQuery(turnEffectsRef, { turnRef: args.turnRef })
      } catch (readError) {
        effectReadFailed = true
        console.error('[chat-durable] unresolved Calls unavailable', sanitizeTelemetryError(readError))
      }
    }

    let alreadyAnswered = false
    let recovered: string | null = null
    if (ownerId !== undefined && effects.length === 0 && !effectReadFailed) {
      try {
        const history = await listMessages(ctx, components.agent, {
          threadId: args.threadId, paginationOpts: { cursor: null, numItems: 50 },
        })
        const prompt = history.page.find(row => row._id === args.promptMessageId)
        const turn = prompt === undefined ? [] : history.page.filter(row =>
          row.order === prompt.order && row._id !== prompt._id)
        alreadyAnswered = turn.some(row => {
          const message = row.message
          if (message?.role !== 'assistant' || row.status !== 'success') return false
          const text = typeof message.content === 'string' ? message.content
            : Array.isArray(message.content)
              ? message.content.flatMap(part => part.type === 'text' ? [part.text] : []).join('')
              : ''
          return text.trim().length > 0 && text !== CHAT_UNFINISHED_ANSWER && !containsChatProtocolMarkup(text)
            && !text.includes("couldn't finish the answer")
        })
        recovered = factsFromSavedTurn(turn.flatMap(row => row.message === undefined ? [] : [row.message]))
      } catch (readError) {
        console.error('[chat-durable] saved facts unavailable', sanitizeTelemetryError(readError))
      }
    }

    let recoveredAnswer = alreadyAnswered
    if (!alreadyAnswered && recovered !== null && ownerId !== undefined) {
      try {
        await saveMessages(ctx, components.agent, {
          threadId: args.threadId, userId: ownerId, promptMessageId: args.promptMessageId,
          messages: [{ role: 'assistant', content: recovered }],
          agentName: 'Agentic Economy Operation Market',
        })
        recoveredAnswer = true
      } catch (saveError) {
        console.error('[chat-durable] recovered answer could not be saved', sanitizeTelemetryError(saveError))
      }
    }
    const failureReason: ChatTurnFailureReason = effectReadFailed || effects.length > 0
      ? 'outcome_unknown' : 'generation_failed'
    if (args.turnRef !== undefined) {
      await ctx.runMutation(internal.chatTurns.finishTurn, {
        turnRef: args.turnRef, promptMessageId: args.promptMessageId,
        state: recoveredAnswer ? 'completed' : 'failed',
        ...(recoveredAnswer ? {} : { failureReason }),
      })
    }
    if (args.turnRef === undefined && !recoveredAnswer && ownerId !== undefined) {
      await saveMessages(ctx, components.agent, {
        threadId: args.threadId, userId: ownerId, promptMessageId: args.promptMessageId,
        messages: [{ role: 'assistant', content: CHAT_UNFINISHED_ANSWER }],
        agentName: 'Agentic Economy Operation Market', failPendingSteps: true,
      })
    }
    return null
  } finally {
    await ctx.runMutation(internal.chatMessages.clearActiveGeneration, {
      threadId: args.threadId,
      promptMessageId: args.promptMessageId,
    })
  }
}
