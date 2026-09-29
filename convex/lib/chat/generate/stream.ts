import { listMessages, saveMessages } from '@convex-dev/agent'
import { components } from '../../../_generated/api'
import type { ModelMessage } from 'ai'
import type { JSONValue, LanguageModelV4 } from '@ai-sdk/provider'
import type { Value } from 'convex/values'
import type { ActionCtx } from '../../../_generated/server'
import { CHAT_TOOL_NAME_MAP } from '@/modules/chat/tool-card'
import type { InteractiveBusinessAuthorityContext } from '@/modules/business/public'
import type { TrustedChatAuthority } from '@/modules/chat/agent-turn.contracts'
import { createChatAgent } from '../tools/agent'
import { catalogueFact, explanationUsable, immediateSearchToolName, retrieveImmediateTools } from '../tools/immediate'
import { quoteThenCallFromCard } from '../tools/purchase'
import { parseOwnerQuoteRequest } from '../tools/quoteRequest'
import { CHAT_NO_RESULT_ANSWER, chatSearchResolution, prepareChatToolStep } from '../tools/step'
import { completedChatFacts } from './completedFacts'

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
  }>,
  languageModel: LanguageModelV4,
): Promise<boolean> {
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
    const answer = completedChatFacts(completedSteps)
    if (answer === null) throw new Error('chat_generation_answer_missing')
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
    const quoteRequest = parseOwnerQuoteRequest(promptText)
    if (quoteRequest !== null && args.trustedChatAuthority?.kind === 'agent_key') {
      let purchased: Awaited<ReturnType<typeof quoteThenCallFromCard>> = null
      try {
        purchased = await quoteThenCallFromCard(
          ctx, args.trustedChatAuthority, quoteRequest.toolRef, quoteRequest.input as Record<string, Value>,
        )
      } catch {
        await saveMessages(ctx, components.agent, {
          threadId: args.threadId, userId: args.ownerId, promptMessageId: args.promptMessageId,
          messages: [{ role: 'assistant', content: 'The Quote could not be completed. Open the Tool card and try the Quote again.' }],
          agentName: 'Agentic Economy Operation Market',
        })
        return false
      }
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
            input: index === 0 ? { toolRef: quoteRequest.toolRef, input: quoteRequest.input } : { quoteRef: purchased.quote.kind === 'committed' ? purchased.quote.quoteRef : '' },
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
    let catalogue: Awaited<ReturnType<typeof retrieveImmediateTools>> = null
    if (promptText.trim().length > 0) {
      try { catalogue = await retrieveImmediateTools(ctx, promptText, args.searchTurn) } catch { catalogue = null }
    }
    if (catalogue !== null) {
      const toolName = immediateSearchToolName()
      completedSteps.push({ toolResults: [{ toolName, output: catalogue }] })
      await saveMessages(ctx, components.agent, {
        threadId: args.threadId, userId: args.ownerId, promptMessageId: args.promptMessageId,
        messages: [
          { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'immediate-search', toolName, input: { query: promptText, limit: 8 } }] },
          { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'immediate-search', toolName, output: { type: 'json', value: catalogue as JSONValue } }] },
          { role: 'assistant', content: catalogueFact(catalogue) },
        ],
        agentName: 'Agentic Economy Operation Market',
      })
      try {
        const explanation = await agent.streamText(ctx, { threadId: args.threadId, userId: args.ownerId }, {
          promptMessageId: args.promptMessageId,
          tools: {},
          timeout: { totalMs: 8_000 },
          maxRetries: 0,
          instructions: `${agent.options.instructions} Tool cards are already shown. Explain only those cards. Never invent an operation id.`,
        }, {
          storageOptions: { saveMessages: 'promptAndOutput' },
          saveStreamDeltas: { chunking: 'word', throttleMs: 100 },
        })
        const text = (await explanation.text).trim()
        if (!explanationUsable(text, catalogue)) {
          const saved = explanation.savedMessages?.findLast(message => message.message?.role === 'assistant')
          const fact = catalogueFact(catalogue)
          if (saved === undefined) {
            await saveMessages(ctx, components.agent, {
              threadId: args.threadId, userId: args.ownerId, promptMessageId: args.promptMessageId,
              messages: [{ role: 'assistant', content: fact }],
              agentName: 'Agentic Economy Operation Market',
            })
          } else {
            await agent.updateMessage(ctx, {
              messageId: saved._id,
              patch: { message: { role: 'assistant', content: fact }, status: 'success' },
            })
          }
        }
      } catch {
        await saveMessages(ctx, components.agent, {
          threadId: args.threadId, userId: args.ownerId, promptMessageId: args.promptMessageId,
          messages: [{ role: 'assistant', content: catalogueFact(catalogue) }],
          agentName: 'Agentic Economy Operation Market',
        })
      }
      await preserveSearchCard()
      return false
    }
  }
  let initial
  try {
    initial = await runInitial()
  } catch (error) {
    if (completedChatFacts(completedSteps) === null) throw error
    return await finishFromFacts()
  }
  const { result, steps } = initial
  if (modelFailure !== undefined) {
    if (completedChatFacts(completedSteps) === null) throw modelFailure
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
        instructions: `${agent.options.instructions} The tools are closed. Answer directly from completed tool results, not earlier narration. Open with a bold supported answer, use bullets for one Tool and a table only for two to four distinct Tools, name a material gap once, and finish with one "Next: ..." action. Do not promise another search.`,
      }, {
        storageOptions: { saveMessages: 'promptAndOutput' },
        saveStreamDeltas: { chunking: 'word', throttleMs: 100 },
      })
      if ((await final.text).trim().length === 0) {
        const blank = final.savedMessages?.findLast(message => message.message?.role === 'assistant')
        if (blank !== undefined) await agent.deleteMessage(ctx, { messageId: blank._id })
        return await finishFromFacts()
      }
    } catch (error) {
      if (completedChatFacts(completedSteps) === null) throw error
      return await finishFromFacts()
    }
  }
  await preserveSearchCard()
  return clarificationRequested || ownerApprovalPending
}
