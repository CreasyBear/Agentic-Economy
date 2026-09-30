import { listMessages, saveMessages } from '@convex-dev/agent'
import { components, internal } from '../../../_generated/api'
import type { ModelMessage } from 'ai'
import type { JSONValue, LanguageModelV4 } from '@ai-sdk/provider'
import type { Value } from 'convex/values'
import type { ActionCtx } from '../../../_generated/server'
import { CHAT_TOOL_NAME_MAP } from '@/modules/chat/tool-card'
import type { InteractiveBusinessAuthorityContext } from '@/modules/business/public'
import type { TrustedChatAuthority } from '@/modules/chat/agent-turn.contracts'
import { createChatAgent } from '../tools/agent'
import { streamImmediateCatalogue } from './immediateTurn'
import { quoteThenCallFromCard } from '../tools/purchase'
import { parseRunRequest } from '@/modules/chat/run-request'
import { CHAT_NO_RESULT_ANSWER, chatSearchResolution, prepareChatToolStep } from '../tools/step'
import { completedChatFacts } from './completedFacts'

const MAX_ABORT_TIMEOUT_MS = 2_147_483_647

function chatGenerationSignal(deadlineAt: number | undefined): AbortSignal | undefined {
  if (deadlineAt === undefined) return undefined
  if (!Number.isFinite(deadlineAt)) throw new RangeError('chat_generation_deadline_invalid')
  const remaining = deadlineAt - Date.now()
  if (remaining <= 0) return AbortSignal.abort(new Error('chat_generation_deadline_exceeded'))
  if (remaining > MAX_ABORT_TIMEOUT_MS) throw new RangeError('chat_generation_deadline_invalid')
  return AbortSignal.timeout(Math.ceil(remaining))
}


export async function streamDurableChatResponse(
  ctx: ActionCtx,
  args: Readonly<{
    threadId: string
    ownerId: string
    promptMessageId: string
    authority?: InteractiveBusinessAuthorityContext
    trustedChatAuthority?: TrustedChatAuthority
    searchTurn?: Readonly<{ turnRef: string; threadId: string; promptMessageId: string }>
    continuation?: Readonly<{ query: string; cursor: string; inputJson: string }>
    deadlineAt?: number
  }>,
  languageModel: LanguageModelV4,
): Promise<boolean> {
  const abortSignal = chatGenerationSignal(args.deadlineAt)
  const searchOutputs = new Map<string, unknown>()
  const agent = createChatAgent(
    languageModel, args.continuation === undefined ? args.trustedChatAuthority : undefined,
    args.continuation, args.searchTurn, (callId, output) => searchOutputs.set(callId, output),
  )
  let clarificationRequested = false
  let ownerApprovalPending = false
  const completedSteps: { toolResults: { toolName: string; output: unknown }[] }[] = []
  const completedMessages: ModelMessage[] = []
  let modelFailure: unknown
  const preserveSearchCard = async (): Promise<void> => {
    if (args.searchTurn === undefined) return
    const searchName = CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.search']
    if (!completedMessages.some(message => message.role === 'assistant'
      && Array.isArray(message.content)
      && message.content.some(part => part.type === 'tool-call' && part.toolName === searchName))) return
    const history = await listMessages(ctx, components.agent, {
      threadId: args.threadId, paginationOpts: { cursor: null, numItems: 50 },
    })
    const prompt = history.page.find(row => row._id === args.promptMessageId)
    for (let index = 0; index < completedMessages.length; index++) {
      const assistantCall = completedMessages[index]
      const toolResult = completedMessages[index + 1]
      if (assistantCall?.role !== 'assistant' || !Array.isArray(assistantCall.content)
        || toolResult?.role !== 'tool') continue
      for (const call of assistantCall.content) {
        if (call.type !== 'tool-call' || call.toolName !== searchName) continue
        const original = toolResult.content.find(part => part.type === 'tool-result'
          && part.toolCallId === call.toolCallId)
        if (original?.type !== 'tool-result') continue
        const requiresSignedCursor = JSON.stringify(original.output).includes('"sc1.')
        const callPresent = history.page.some(row => row.order === prompt?.order
          && row.message?.role === 'assistant' && Array.isArray(row.message.content)
          && row.message.content.some(part => part.type === 'tool-call'
            && part.toolCallId === call.toolCallId))
        const searchResult = history.page.find(row => row.order === prompt?.order
          && row.message?.role === 'tool' && Array.isArray(row.message.content)
          && row.message.content.some(part => part.type === 'tool-result'
            && part.toolCallId === call.toolCallId))
        if (callPresent && searchResult !== undefined
          && (!requiresSignedCursor || JSON.stringify(searchResult.message?.content).includes('"sc1.'))) continue
        if (callPresent && searchResult?.message?.role === 'tool') {
          await agent.updateMessage(ctx, {
            messageId: searchResult._id,
            patch: { message: toolResult, status: 'success' },
          })
          continue
        }
        await saveMessages(ctx, components.agent, {
          threadId: args.threadId, userId: args.ownerId, promptMessageId: args.promptMessageId,
          messages: [{ role: 'assistant', content: [call] }, { role: 'tool', content: [original] }],
          agentName: 'Agentic Economy Operation Market',
        })
      }
    }
  }
  const finishFromFacts = async (): Promise<boolean> => {
    if (abortSignal?.aborted) throw abortSignal.reason ?? new Error('chat_generation_deadline_exceeded')
    const answer = completedChatFacts(completedSteps) ?? CHAT_NO_RESULT_ANSWER
    await saveMessages(ctx, components.agent, {
      threadId: args.threadId,
      userId: args.ownerId,
      promptMessageId: args.promptMessageId,
      messages: [...completedMessages, { role: 'assistant', content: answer }],
      agentName: 'Agentic Economy Operation Market',
    })
    return clarificationRequested || ownerApprovalPending
  }
  const runInitial = async () => {
    const result = await agent.streamText(
      ctx,
      { threadId: args.threadId, userId: args.ownerId },
    {
      promptMessageId: args.promptMessageId,
      prepareStep: args.continuation === undefined ? prepareChatToolStep : ({ stepNumber }) =>
        stepNumber === 0
          ? { toolChoice: { type: 'tool' as const,
            toolName: CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.search'] } }
          : { toolChoice: 'none' as const },
      timeout: { stepMs: 15_000 },
      maxRetries: 0,
      ...(abortSignal === undefined ? {} : { abortSignal }),
      onError: event => { modelFailure = event.error },
      onStepEnd: (step) => {
        completedSteps.push({ toolResults: step.toolResults.map(result => ({
          toolName: result.toolName,
          output: searchOutputs.has(result.toolCallId)
            ? searchOutputs.get(result.toolCallId) : result.output,
        })) })
        const calls = step.toolCalls.filter(call =>
          step.toolResults.some(result => result.toolCallId === call.toolCallId))
        if (calls.length > 0) {
          completedMessages.push({
            role: 'assistant',
            content: calls.map(call => ({
              type: 'tool-call', toolCallId: call.toolCallId,
              toolName: call.toolName, input: call.input,
            })),
          })
          completedMessages.push({
            role: 'tool',
            content: step.toolResults.filter(result =>
              calls.some(call => call.toolCallId === result.toolCallId)).map(result => {
              const output = searchOutputs.get(result.toolCallId) ?? result.output
              return {
                type: 'tool-result', toolCallId: result.toolCallId,
                toolName: result.toolName,
                output: typeof output === 'string'
                  ? { type: 'text' as const, value: output }
                  : { type: 'json' as const, value: output as JSONValue },
              }
            }),
          })
        }
        if (step.toolResults.some(result =>
          result.toolName === CHAT_TOOL_NAME_MAP.canonicalToProvider['chat.clarify']
          && typeof result.output === 'object' && result.output !== null
          && 'status' in result.output && result.output.status === 'awaiting_answer')) {
          clarificationRequested = true
        }
        if (args.trustedChatAuthority?.applicationRef === 'ae-owner-chat'
          && step.toolResults.some(result => result.toolName === CHAT_TOOL_NAME_MAP.canonicalToProvider['tool.call']
            && typeof result.output === 'object' && result.output !== null
            && 'kind' in result.output && result.output.kind === 'needs_authority')) {
          ownerApprovalPending = true
        }
      },
    },
    {
      storageOptions: { saveMessages: 'promptAndOutput' },
      saveStreamDeltas: { chunking: 'word', throttleMs: 100 },
    },
    )
    return { result, steps: await result.steps }
  }
  if (args.continuation === undefined) {
    const history = await listMessages(ctx, components.agent, {
      threadId: args.threadId, paginationOpts: { cursor: null, numItems: 20 },
    })
    const promptText = history.page.find(row => row._id === args.promptMessageId)?.text ?? ''
    const runRequest = parseRunRequest(promptText)
    if (runRequest !== null && args.trustedChatAuthority?.kind === 'agent_key') {
      if (abortSignal?.aborted) throw abortSignal.reason ?? new Error('chat_generation_deadline_exceeded')
      await ctx.runMutation(internal.capabilitySelectionDecisions.markRunInternal, {
        threadId: args.threadId,
        promptMessageId: args.promptMessageId,
        toolRef: runRequest.toolRef,
      }).catch(() => undefined)
      if (abortSignal?.aborted) throw abortSignal.reason ?? new Error('chat_generation_deadline_exceeded')
      let purchased: Awaited<ReturnType<typeof quoteThenCallFromCard>> = null
      try {
        purchased = await quoteThenCallFromCard(
          ctx, args.trustedChatAuthority, runRequest.toolRef, runRequest.input as Record<string, Value>,
        )
      } catch (cause) {
        if (abortSignal?.aborted) throw cause
        await saveMessages(ctx, components.agent, {
          threadId: args.threadId, userId: args.ownerId, promptMessageId: args.promptMessageId,
          messages: [{ role: 'assistant', content: 'The Quote could not be completed. Open the Tool card and try the Quote again.' }],
          agentName: 'Agentic Economy Operation Market',
        })
        return false
      }
      if (abortSignal?.aborted) throw abortSignal.reason ?? new Error('chat_generation_deadline_exceeded')
      const quoteName = CHAT_TOOL_NAME_MAP.canonicalToProvider['tool.quote']
      const callName = CHAT_TOOL_NAME_MAP.canonicalToProvider['tool.call']
      if (purchased === null) {
        await saveMessages(ctx, components.agent, {
          threadId: args.threadId, userId: args.ownerId, promptMessageId: args.promptMessageId,
          messages: [{ role: 'assistant', content: 'That Tool is not available to Quote from this chat.' }],
          agentName: 'Agentic Economy Operation Market',
        })
        return false
      }
      const toolResults = [
        { toolName: quoteName, output: purchased.quote },
        ...(purchased.call === undefined ? [] : [{ toolName: callName, output: purchased.call }]),
      ]
      completedSteps.push({ toolResults })
      await saveMessages(ctx, components.agent, {
        threadId: args.threadId, userId: args.ownerId, promptMessageId: args.promptMessageId,
        messages: [
          { role: 'assistant', content: toolResults.map((result, index) => ({
            type: 'tool-call' as const, toolCallId: `card-purchase-${index}`, toolName: result.toolName,
            input: index === 0 ? { toolRef: runRequest.toolRef, input: runRequest.input } : { quoteRef: purchased.quote.kind === 'committed' ? purchased.quote.quoteRef : '' },
          })) },
          { role: 'tool', content: toolResults.map((result, index) => ({
            type: 'tool-result' as const, toolCallId: `card-purchase-${index}`, toolName: result.toolName,
            output: { type: 'json' as const, value: result.output as JSONValue },
          })) },
          { role: 'assistant', content: completedChatFacts(completedSteps) ?? 'Review the Quote before approving the Call.' },
        ],
        agentName: 'Agentic Economy Operation Market',
      })
      return purchased.call?.kind === 'needs_authority'
    }
    // A Run from a card needs the purchase tools, so it skips the tool-less immediate search.
    if (promptText.trim().length > 0 && await streamImmediateCatalogue(ctx, {
      agent,
      args,
      promptText,
      completedSteps,
      ...(abortSignal === undefined ? {} : { signal: abortSignal }),
    })) {
      await preserveSearchCard()
      return false
    }
  }
  let initial
  try {
    initial = await runInitial()
  } catch (error) {
    if (abortSignal?.aborted || completedChatFacts(completedSteps) === null) throw error
    return await finishFromFacts()
  }
  if (abortSignal?.aborted) throw abortSignal.reason ?? new Error('chat_generation_deadline_exceeded')
  const { result, steps } = initial
  if (modelFailure !== undefined) {
    if (abortSignal?.aborted || completedChatFacts(completedSteps) === null) throw modelFailure
    return await finishFromFacts()
  }
  const resolution = chatSearchResolution(steps)
  if (steps.every(step => step.toolResults.length === 0) || resolution !== null) {
    const assistant = result.savedMessages?.findLast(message => message.message?.role === 'assistant')
    if (assistant?.message === undefined) throw new Error('chat_generation_answer_missing')
    const content = assistant.message.content
    const toolCalls = Array.isArray(content) ? content.filter(part => part.type === 'tool-call') : []
    await agent.updateMessage(ctx, {
      messageId: assistant._id,
      patch: { message: { role: 'assistant', content: [...toolCalls, { type: 'text', text: resolution ?? CHAT_NO_RESULT_ANSWER }] }, status: 'success' },
    })
    if (abortSignal?.aborted) throw abortSignal.reason ?? new Error('chat_generation_deadline_exceeded')
    await preserveSearchCard()
    return false
  }
  const last = steps.at(-1)
  if (!clarificationRequested && (last?.text.trim().length === 0 || last?.toolCalls.length
    || !/[.!?…)"']$/u.test(last?.text.trim() ?? '')
    || /\b(?:let me|i(?:'ll| will) (?:check|search|look)|next page)\b/iu.test(last?.text ?? ''))) {
    // A blank tool-free completion is not an answer. Continue the same saved
    // prompt once, with tools closed, so no Tool or Call can execute twice.
    try {
      const final = await agent.streamText(ctx, { threadId: args.threadId, userId: args.ownerId }, {
        promptMessageId: args.promptMessageId,
        tools: {},
        timeout: { totalMs: 12_000 },
        maxRetries: 0,
        ...(abortSignal === undefined ? {} : { abortSignal }),
        instructions: `${agent.options.instructions} The tools are closed. Answer directly from completed tool results, not earlier narration. Open with a bold supported answer, use bullets for one Tool and a table only for two to four distinct Tools, name a material gap once, and finish with one "Next: ..." action. Do not promise another search.`,
      }, {
        storageOptions: { saveMessages: 'promptAndOutput' },
        saveStreamDeltas: { chunking: 'word', throttleMs: 100 },
      })
      if (abortSignal?.aborted) throw abortSignal.reason ?? new Error('chat_generation_deadline_exceeded')
      if ((await final.text).trim().length === 0) {
        const blank = final.savedMessages?.findLast(message => message.message?.role === 'assistant')
        if (blank !== undefined) await agent.deleteMessage(ctx, { messageId: blank._id })
        return await finishFromFacts()
      }
    } catch (error) {
      if (abortSignal?.aborted || completedChatFacts(completedSteps) === null) throw error
      return await finishFromFacts()
    }
  }
  await preserveSearchCard()
  if (abortSignal?.aborted) throw abortSignal.reason ?? new Error('chat_generation_deadline_exceeded')
  return clarificationRequested || ownerApprovalPending
}
