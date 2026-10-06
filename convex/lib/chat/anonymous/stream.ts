import type { LanguageModelV4 } from '@ai-sdk/provider'
import { createUIMessageStream, createUIMessageStreamResponse, stepCountIs, type ModelMessage, type UIMessageChunk } from 'ai'
import { CHAT_TOOL_NAME_MAP } from '@/modules/chat/tool-card'
import { recordAnonymousChat } from '@/lib/observability/journey'
import type { ActionCtx } from '../../../_generated/server'
import { createChatAgent } from '../tools/agent'
import { readChatSearchPage } from '../tools/search'
import { catalogueFact, immediateSearchToolName } from '../tools/immediate'
import { CHAT_NO_RESULT_ANSWER, chatSearchResolution, prepareChatToolStep, chatActionMessages, hasChatContext } from '../tools/step'
import { completedChatFacts } from '../generate/completedFacts'
import type { AnonymousChatMessage, AnonymousSearchContinuation } from './contracts'


export async function streamAnonymousChatResponse(
  ctx: ActionCtx,
  messages: readonly AnonymousChatMessage[],
  languageModel: LanguageModelV4,
  abortSignal?: AbortSignal,
  continuation?: AnonymousSearchContinuation,
): Promise<Response> {
  const agent = createChatAgent(languageModel, undefined, continuation)
  const scope = { userId: 'anonymous-ephemeral' }
  const prompt = messages.map((message) => ({ ...message })) as ModelMessage[]
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const completedSteps: { toolResults: { toolName: string; output: unknown }[] }[] = []
      let modelFailure: unknown
      let answerOutcome: 'completed' | 'input_required' | 'failed' | undefined
      try {
      if (continuation !== undefined) {
        const page = await readChatSearchPage(ctx, continuation, undefined, abortSignal)
        const toolName = immediateSearchToolName()
        writer.write({ type: 'start' })
        writer.write({ type: 'tool-input-start', toolCallId: 'continuation-search', toolName })
        writer.write({ type: 'tool-input-available', toolCallId: 'continuation-search', toolName, input: {} })
        writer.write({ type: 'tool-output-available', toolCallId: 'continuation-search', output: page })
        writer.write({ type: 'text-start', id: 'catalogue-page' })
        writer.write({ type: 'text-delta', id: 'catalogue-page', delta: catalogueFact(page) })
        writer.write({ type: 'text-end', id: 'catalogue-page' })
        writer.write({ type: 'finish' })
        answerOutcome = 'completed'
        return
      }
      const result = await agent.streamText(ctx, scope, {
        messages: prompt,
        prepareStep: prepareChatToolStep,
        timeout: { stepMs: 15_000 },
        maxRetries: 0,
        onStepEnd: step => {
          completedSteps.push({ toolResults: step.toolResults.map(result => ({
            toolName: result.toolName, output: result.output,
          })) })
        },
        onError: event => { modelFailure = event.error },
        ...(abortSignal === undefined ? {} : { abortSignal }),
      })
      const initialText: UIMessageChunk[] = []
      for await (const chunk of result.toUIMessageStream({ sendFinish: false })) {
        if (chunk.type === 'start-step') initialText.length = 0
        if (chunk.type === 'text-start' || chunk.type === 'text-delta' || chunk.type === 'text-end') {
          initialText.push(chunk)
        } else {
          writer.write(chunk)
        }
      }
      const steps = await result.steps
      if (abortSignal?.aborted) throw abortSignal.reason ?? new Error('chat_generation_cancelled')
      if (modelFailure !== undefined) {
        const answer = completedChatFacts(completedSteps)
        if (answer === null) throw modelFailure
        writer.write({ type: 'text-start', id: 'completed-tool-facts' })
        writer.write({ type: 'text-delta', id: 'completed-tool-facts', delta: answer })
        writer.write({ type: 'text-end', id: 'completed-tool-facts' })
        writer.write({ type: 'finish' })
        answerOutcome = 'completed'
        return
      }
      const resolution = chatSearchResolution(steps)
      if (!hasChatContext(prompt) && steps.every(step => step.toolResults.length === 0) || resolution !== null) {
        writer.write({ type: 'text-start', id: 'no-tool-result' })
        writer.write({ type: 'text-delta', id: 'no-tool-result', delta: resolution ?? CHAT_NO_RESULT_ANSWER })
        writer.write({ type: 'text-end', id: 'no-tool-result' })
        writer.write({ type: 'finish' })
        answerOutcome = 'completed'
        return
      }
      const last = steps.at(-1)
      const clarification = steps.some(step => step.toolCalls.some(call =>
        call.toolName === CHAT_TOOL_NAME_MAP.canonicalToProvider['chat.clarify']))
      const finish = clarification || ((last?.toolCalls.length ?? 0) === 0
        && Boolean(last?.text.trim()) && /[.!?…)"']$/u.test(last?.text.trim() ?? '')
        && !/\b(?:let me|i(?:'ll| will) (?:check|search|look)|next page)\b/iu.test(last?.text ?? ''))
      if (finish) {
        if (!clarification) for (const chunk of initialText) writer.write(chunk)
        writer.write({ type: 'finish' })
        answerOutcome = clarification ? 'input_required' : 'completed'
        return
      }
      const final = await agent.streamText(ctx, scope, {
        messages: [...prompt, ...await result.responseMessages],
        tools: {},
        prepareStep: options => ({ messages: chatActionMessages(options.messages, completedSteps) }),
        stopWhen: stepCountIs(1),
        timeout: { totalMs: 12_000 },
        maxRetries: 0,
        instructions: `${agent.options.instructions} The tools are closed. Answer directly from completed tool results, not earlier narration. Open with a bold supported answer. The cards already show the catalogue and comparison: do not repeat them as a list or table. For a detail question, give up to three requested facts, name a material gap once, and finish with one "Next: ..." action. This guest cannot obtain a Quote or Call, so never suggest those actions. Do not promise another search.`,
        ...(abortSignal === undefined ? {} : { abortSignal }),
      })
      const finalChunks: UIMessageChunk[] = []
      for await (const chunk of final.toUIMessageStream({ sendStart: false })) finalChunks.push(chunk)
      if (abortSignal?.aborted) throw abortSignal.reason ?? new Error('chat_generation_cancelled')
      const answer = (await final.text).trim()
      if (answer.length >= 35 && !/[｜▁]|<\|(?:begin|end)|\b(?:let me|i(?:'ll| will) (?:check|search|look))\b/iu.test(answer)) {
        for (const chunk of finalChunks) {
          writer.write(
            (chunk.type === 'text-start' || chunk.type === 'text-delta' || chunk.type === 'text-end')
              ? { ...chunk, id: `final-${chunk.id}` }
              : chunk,
          )
        }
        answerOutcome = 'completed'
        return
      }
      const fallback = completedChatFacts(steps) ?? CHAT_NO_RESULT_ANSWER
      writer.write({ type: 'text-start', id: 'final-fallback' })
      writer.write({ type: 'text-delta', id: 'final-fallback', delta: fallback })
      writer.write({ type: 'text-end', id: 'final-fallback' })
      writer.write({ type: 'finish' })
      answerOutcome = 'completed'
      } catch (error) {
        if (abortSignal?.aborted) throw error
        const answer = completedChatFacts(completedSteps)
        if (answer !== null) {
          writer.write({ type: 'text-start', id: 'completed-tool-facts' })
          writer.write({ type: 'text-delta', id: 'completed-tool-facts', delta: answer })
          writer.write({ type: 'text-end', id: 'completed-tool-facts' })
          writer.write({ type: 'finish' })
          answerOutcome = 'completed'
          return
        }
        writer.write({ type: 'data-chat-failure', data: { reason: 'generation_failed' } })
        writer.write({ type: 'finish' })
        answerOutcome = 'failed'
      } finally {
        if (!(abortSignal?.aborted === true && answerOutcome === undefined)) {
          recordAnonymousChat(answerOutcome ?? 'failed')
        }
      }
    },
  })
  return createUIMessageStreamResponse({ stream })
}
