import { listMessages, saveMessages, toModelMessage } from '@convex-dev/agent'
import { components, internal } from '../../../_generated/api'
import type { ModelMessage } from 'ai'
import type { JSONValue, LanguageModelV4 } from '@ai-sdk/provider'
import type { Value } from 'convex/values'
import type { ActionCtx } from '../../../_generated/server'
import { projectCallMachineResult } from '@/modules/capability-execution/call-contracts'
import { CHAT_TOOL_NAME_MAP } from '@/modules/chat/tool-card'
import { CHAT_UNFINISHED_ANSWER, containsChatProtocolMarkup } from '@/modules/chat/search-presentation'
import type { InteractiveBusinessAuthorityContext } from '@/modules/business/public'
import type { TrustedChatAuthority } from '@/modules/chat/agent-turn.contracts'
import { createChatAgent } from '../tools/agent'
import { readChatSearchPage } from '../tools/search'
import { catalogueFact, immediateSearchToolName } from '../tools/immediate'
import { quoteThenCallFromCard } from '../tools/purchase'
import { parseRunRequest } from '@/modules/chat/run-request'
import { CHAT_NO_RESULT_ANSWER, chatSearchResolution, prepareChatToolStep, chatActionMessages, hasChatContext } from '../tools/step'
import { completedChatFacts } from './completedFacts'
import { chatModelCostHooks } from './modelCost'

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
  if (args.continuation !== undefined) {
    const page = await readChatSearchPage(ctx, args.continuation, args.searchTurn, abortSignal)
    const toolName = immediateSearchToolName()
    await saveMessages(ctx, components.agent, {
      threadId: args.threadId, userId: args.ownerId, promptMessageId: args.promptMessageId,
      messages: [
        { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'continuation-search', toolName, input: {} }] },
        { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'continuation-search', toolName,
          output: { type: 'json', value: page as JSONValue } }] },
        { role: 'assistant', content: catalogueFact(page) },
      ],
      agentName: 'Agentic Economy Tool Market',
    })
    return false
  }
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
    const searchName = CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.search']
    if (!completedMessages.some(message => message.role === 'assistant'
      && Array.isArray(message.content)
      && message.content.some(part => part.type === 'tool-call' && part.toolName === searchName))) return
    const history = await listMessages(ctx, components.agent, {
      threadId: args.threadId, paginationOpts: { cursor: null, numItems: 50 },
    })
    const prompt = history.page.find(row => row._id === args.promptMessageId)
    if (prompt === undefined) throw new Error('chat_generation_prompt_missing')
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
        const callPresent = history.page.some(row => row.order === prompt.order
          && row.message?.role === 'assistant' && Array.isArray(row.message.content)
          && row.message.content.some(part => part.type === 'tool-call'
            && part.toolCallId === call.toolCallId))
        const searchResult = history.page.find(row => row.order === prompt.order
          && row.message?.role === 'tool' && Array.isArray(row.message.content)
          && row.message.content.some(part => part.type === 'tool-result'
            && part.toolCallId === call.toolCallId))
        if (callPresent && searchResult !== undefined
          && (!requiresSignedCursor || JSON.stringify(searchResult.message?.content).includes('"sc1.'))) continue
        if (requiresSignedCursor && searchResult?.message?.role === 'tool'
          && !JSON.stringify(searchResult.message.content).includes('"sc1.')) {
          if (abortSignal?.aborted) throw abortSignal.reason ?? new Error('chat_generation_deadline_exceeded')
          const storedMessage = toModelMessage(searchResult.message)
          if (storedMessage.role !== 'tool') throw new Error('chat_generation_tool_result_invalid')
          await agent.updateMessage(ctx, {
            messageId: searchResult._id,
            patch: { message: { ...storedMessage, content: storedMessage.content.map(part =>
              part.type === 'tool-result' && part.toolCallId === call.toolCallId ? original : part) },
            status: 'success', error: '' },
          })
        }
        const missing: ModelMessage[] = []
        if (!callPresent) missing.push({ role: 'assistant', content: [call] })
        if (searchResult === undefined) missing.push({ role: 'tool', content: [original] })
        if (missing.length === 0) continue
        if (abortSignal?.aborted) throw abortSignal.reason ?? new Error('chat_generation_deadline_exceeded')
        await saveMessages(ctx, components.agent, {
          threadId: args.threadId, userId: args.ownerId, promptMessageId: args.promptMessageId,
          messages: missing,
          agentName: 'Agentic Economy Operation Market',
        })
      }
    }
  }
  const finishFromFacts = async (): Promise<boolean> => {
    if (abortSignal?.aborted) throw abortSignal.reason ?? new Error('chat_generation_deadline_exceeded')
    const answer = completedChatFacts(completedSteps) ?? CHAT_NO_RESULT_ANSWER
    await preserveSearchCard()
    // The SDK saves completed steps before our callback, but may mark them
    // failed after a later model error. Repair only this turn's completed parts.
    const completedIds = new Set(completedMessages.flatMap(message =>
      message.role === 'tool' ? message.content.flatMap(part =>
        part.type === 'tool-result' ? [part.toolCallId] : []) : []))
    if (completedIds.size > 0) {
      const history = await listMessages(ctx, components.agent, {
        threadId: args.threadId, paginationOpts: { cursor: null, numItems: 50 },
      })
      const prompt = history.page.find(row => row._id === args.promptMessageId)
      if (prompt === undefined) throw new Error('chat_generation_prompt_missing')
      const calls = new Set<string>()
      const results = new Set<string>()
      for (const row of history.page) {
        if (row.order !== prompt.order || row.message === undefined
          || !Array.isArray(row.message.content)) continue
        const parts = row.message.content.filter(part => part.type === 'tool-call' || part.type === 'tool-result')
        for (const part of parts) (part.type === 'tool-call' ? calls : results).add(part.toolCallId)
        if (row.status === 'success') continue
        if (parts.length === 0 || !parts.every(part => completedIds.has(part.toolCallId))) continue
        if (abortSignal?.aborted) throw abortSignal.reason ?? new Error('chat_generation_deadline_exceeded')
        await ctx.runMutation(components.agent.messages.updateMessage, {
          messageId: row._id, patch: { status: 'success', error: '' },
        })
      }
      const missing: ModelMessage[] = []
      for (const message of completedMessages) {
        if (message.role === 'assistant' && Array.isArray(message.content)) {
          const content = message.content.filter(part => {
            if (part.type !== 'tool-call' || calls.has(part.toolCallId)) return false
            calls.add(part.toolCallId)
            return true
          })
          if (content.length > 0) missing.push({ role: 'assistant', content })
        } else if (message.role === 'tool') {
          const content = message.content.filter(part => {
            if (part.type !== 'tool-result' || results.has(part.toolCallId)) return false
            results.add(part.toolCallId)
            return true
          })
          if (content.length > 0) missing.push({ role: 'tool', content })
        }
      }
      if (missing.length > 0) {
        if (abortSignal?.aborted) throw abortSignal.reason ?? new Error('chat_generation_deadline_exceeded')
        await saveMessages(ctx, components.agent, {
          threadId: args.threadId, userId: args.ownerId, promptMessageId: args.promptMessageId,
          messages: missing, agentName: 'Agentic Economy Operation Market',
        })
      }
    }
    if (abortSignal?.aborted) throw abortSignal.reason ?? new Error('chat_generation_deadline_exceeded')
    await saveMessages(ctx, components.agent, {
      threadId: args.threadId,
      userId: args.ownerId,
      promptMessageId: args.promptMessageId,
      messages: [{ role: 'assistant', content: answer }],
      agentName: 'Agentic Economy Operation Market',
    })
    return clarificationRequested || ownerApprovalPending
  }
  let hasPriorContext = false
  const runInitial = async () => {
    const modelCost = chatModelCostHooks(ctx, args.searchTurn, 'initial')
    const result = await agent.streamText(
      ctx,
      { threadId: args.threadId, userId: args.ownerId },
    {
      promptMessageId: args.promptMessageId,
      onStart: modelCost.onStart,
      prepareStep: async options => {
        await modelCost.prepareStep(options)
        if (options.stepNumber === 0) hasPriorContext = hasChatContext(options.messages)
        return prepareChatToolStep(options)
      },
      timeout: { stepMs: 15_000 },
      maxRetries: 0,
      ...(abortSignal === undefined ? {} : { abortSignal }),
      onError: event => { modelFailure = event.error },
      onStepEnd: async (step) => {
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
          && step.toolResults.some(result => typeof result.output === 'object' && result.output !== null
            && 'kind' in result.output && (
              (result.toolName === CHAT_TOOL_NAME_MAP.canonicalToProvider['tool.call'] && result.output.kind === 'refused' && 'code' in result.output && result.output.code === 'authority_required')
              || (result.toolName === CHAT_TOOL_NAME_MAP.canonicalToProvider['tool.plan.run'] && result.output.kind === 'awaiting_approval')
            ))) {
          ownerApprovalPending = true
        }
        await modelCost.onStepEnd(step)
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
    const prompt = history.page.find(row => row._id === args.promptMessageId)
    const promptText = prompt?.text ?? ''
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
        ...(purchased.call === undefined ? [] : [{ toolName: callName, output: projectCallMachineResult(purchased.call) }]),
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
  if (containsChatProtocolMarkup(await result.text)) {
    const answer = completedChatFacts(completedSteps)
    const assistant = result.savedMessages?.findLast(message => message.message?.role === 'assistant')
    if (assistant !== undefined) await agent.updateMessage(ctx, {
      messageId: assistant._id,
      patch: { message: { role: 'assistant', content: [
        ...(Array.isArray(assistant.message?.content) ? assistant.message.content.filter(part => part.type === 'tool-call') : []),
        { type: 'text', text: answer ?? CHAT_UNFINISHED_ANSWER },
      ] }, status: 'success' },
    })
    if (answer === null) throw new Error('chat_generation_invalid_answer')
    await preserveSearchCard()
    return clarificationRequested || ownerApprovalPending
  }
  const resolution = chatSearchResolution(steps)
  if (!hasPriorContext && steps.every(step => step.toolResults.length === 0) || resolution !== null) {
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
    try {
      const finalCost = chatModelCostHooks(ctx, args.searchTurn, 'final_answer')
      const final = await agent.streamText(ctx, { threadId: args.threadId, userId: args.ownerId }, {
        promptMessageId: args.promptMessageId,
        ...finalCost,
        prepareStep: async options => {
          await finalCost.prepareStep(options)
          return { messages: chatActionMessages(options.messages, completedSteps) }
        },
        tools: {},
        timeout: { totalMs: 12_000 },
        maxRetries: 0,
        ...(abortSignal === undefined ? {} : { abortSignal }),
        instructions: `${agent.options.instructions} The tools are closed. Answer directly from completed tool results, not earlier narration. Open with a bold supported answer. The cards already show the catalogue and comparison: do not repeat them as a list or table. For a detail question, give up to three requested facts and name a material gap once. Include a next step only when a current available action advances the request. Do not promise another search.`,
      }, {
        storageOptions: { saveMessages: 'promptAndOutput' },
        saveStreamDeltas: { chunking: 'word', throttleMs: 100 },
      })
      if (abortSignal?.aborted) throw abortSignal.reason ?? new Error('chat_generation_deadline_exceeded')
      const finalText = (await final.text).trim()
      if (containsChatProtocolMarkup(finalText)) {
        const answer = completedChatFacts(completedSteps)
        const assistant = final.savedMessages?.findLast(message => message.message?.role === 'assistant')
        if (assistant !== undefined) await agent.updateMessage(ctx, {
          messageId: assistant._id,
          patch: { message: { role: 'assistant', content: [
            ...(Array.isArray(assistant.message?.content) ? assistant.message.content.filter(part => part.type === 'tool-call') : []),
            { type: 'text', text: answer ?? CHAT_UNFINISHED_ANSWER },
          ] }, status: 'success' },
        })
        if (answer === null) throw new Error('chat_generation_invalid_answer')
      } else if (finalText.length === 0) {
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
