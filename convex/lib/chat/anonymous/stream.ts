import type { LanguageModelV4 } from '@ai-sdk/provider'
import { createUIMessageStream, createUIMessageStreamResponse, stepCountIs, type ModelMessage, type UIMessageChunk } from 'ai'
import type { z } from 'zod'
import { CHAT_TOOL_NAME_MAP } from '@/modules/chat/tool-card'
import { toolChoiceDescribeOutputSchema, toolChoiceSearchOutputSchema, type ToolChoiceSearchOutput } from '@/modules/registry/tool-choice-contracts'
import { degradeBackend } from '@/lib/observability/degrade-backend'
import { recordAnonymousChat } from '@/lib/observability/journey'
import type { ActionCtx } from '../../../_generated/server'
import { createChatAgent } from '../tools/agent'
import { catalogueFact, explanationUsable, immediateSearchToolName, retrieveImmediateTools } from '../tools/immediate'
import { CHAT_NO_RESULT_ANSWER, chatSearchResolution, prepareChatToolStep } from '../tools/step'
import { completedChatFacts } from '../generate/completedFacts'
import type { AnonymousChatMessage, AnonymousSearchContinuation } from './contracts'


async function explainCatalogue(
  agent: ReturnType<typeof createChatAgent>,
  ctx: ActionCtx,
  scope: { userId: string },
  prompt: ModelMessage[],
  output: ToolChoiceSearchOutput,
  abortSignal?: AbortSignal,
): Promise<string> {
  const titles = output.kind === 'match' || output.kind === 'scoped'
    ? output.results.slice(0, 4).map(result => result.title) : []
  try {
    const explanation = await agent.streamText(ctx, scope, {
      messages: prompt,
      tools: {},
      stopWhen: stepCountIs(1),
      timeout: { totalMs: 8_000 },
      maxRetries: 0,
      instructions: `${agent.options.instructions} Tool cards are already shown. Explain only these titles: ${titles.join('; ') || 'none'}. Never name another Tool or invent an operation id.`,
      ...(abortSignal === undefined ? {} : { abortSignal }),
    })
    const text = (await explanation.text).trim()
    return explanationUsable(text, output) ? text : catalogueFact(output)
  } catch {
    return catalogueFact(output)
  }
}

type ChatCandidate =
  | Extract<ToolChoiceSearchOutput, { kind: 'match' }>['results'][number]
  | Extract<z.output<typeof toolChoiceDescribeOutputSchema>, { kind: 'found' }>['tool']

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
      const latestUser = [...messages].reverse().find(message => message.role === 'user')?.content ?? ''
      if (continuation === undefined && latestUser.trim().length > 0) {
        let catalogue: Awaited<ReturnType<typeof retrieveImmediateTools>> = null
        try {
          catalogue = await retrieveImmediateTools(ctx, latestUser)
        } catch (cause) {
          degradeBackend(cause, undefined, { site: 'chatImmediateSearch', reason: 'source_unavailable' })
        }
        if (catalogue !== null) {
          // This branch writes its own response instead of merging the model's
          // UI stream, so it also owns the single message start/finish pair.
          writer.write({ type: 'start' })
          const toolName = immediateSearchToolName()
          writer.write({ type: 'tool-input-start', toolCallId: 'immediate-search', toolName })
          writer.write({ type: 'tool-input-available', toolCallId: 'immediate-search', toolName, input: { query: latestUser, limit: 4 } })
          writer.write({ type: 'tool-output-available', toolCallId: 'immediate-search', output: catalogue })
          const fact = catalogueFact(catalogue)
          writer.write({ type: 'text-start', id: 'catalogue-facts' })
          writer.write({ type: 'text-delta', id: 'catalogue-facts', delta: fact })
          writer.write({ type: 'text-end', id: 'catalogue-facts' })
          const answer = await explainCatalogue(agent, ctx, scope, prompt, catalogue, abortSignal)
          if (answer !== fact) {
            writer.write({ type: 'text-start', id: 'catalogue-answer' })
            writer.write({ type: 'text-delta', id: 'catalogue-answer', delta: answer })
            writer.write({ type: 'text-end', id: 'catalogue-answer' })
          }
          writer.write({ type: 'finish' })
          answerOutcome = 'completed'
          return
        }
      }
      const result = await agent.streamText(ctx, scope, {
        messages: prompt,
        prepareStep: continuation === undefined ? prepareChatToolStep : ({ stepNumber }) =>
          stepNumber === 0
            ? { toolChoice: { type: 'tool' as const,
              toolName: CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.search'] } }
            : { toolChoice: 'none' as const },
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
        if (chunk.type === 'text-start' || chunk.type === 'text-delta' || chunk.type === 'text-end') {
          initialText.push(chunk)
        } else {
          writer.write(chunk)
        }
      }
      const steps = await result.steps
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
      if (steps.every(step => step.toolResults.length === 0) || resolution !== null) {
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
      const finish = clarification || (steps.every(step => step.toolCalls.length === 0)
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
        stopWhen: stepCountIs(1),
        timeout: { totalMs: 12_000 },
        maxRetries: 0,
        instructions: `${agent.options.instructions} The tools are closed. Answer directly from completed tool results, not earlier narration. Open with a bold supported answer, use bullets for one Tool and a table only for two to four distinct Tools, name a material gap once, and finish with one "Next: ..." action. This guest cannot obtain a Quote or Call, so never suggest those actions. Do not promise another search.`,
        ...(abortSignal === undefined ? {} : { abortSignal }),
      })
      const finalChunks: UIMessageChunk[] = []
      for await (const chunk of final.toUIMessageStream({ sendStart: false })) finalChunks.push(chunk)
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
      const candidates: ChatCandidate[] = []
      for (const step of steps) for (const result of step.toolResults) {
        const search = toolChoiceSearchOutputSchema.safeParse(result.output)
        if (search.success && search.data.kind === 'match') {
          candidates.push(...search.data.results)
          continue
        }
        const detail = toolChoiceDescribeOutputSchema.safeParse(result.output)
        if (detail.success && detail.data.kind === 'found') candidates.push(detail.data.tool)
      }
      const first = candidates[0]
      const second = candidates.find(candidate => candidate.toolRef !== first?.toolRef)
      const source = (candidate: ChatCandidate) => 'access' in candidate && candidate.access === 'external_listing'
        ? 'External listing; not callable through AE' : 'Admitted Tool; check current terms before use'
      const fallback = first === undefined
        ? CHAT_NO_RESULT_ANSWER
        : second === undefined
          ? `**${first.title} may fit this request.**\n\n${'summary' in first ? first.summary : first.description}\n\n${source(first)}.\n\nNext: Open its details to check the exact inputs and current terms.`
          : `**${first.title} and ${second.title} are worth inspecting.**\n\n| Tool | Source | What it does |\n| --- | --- | --- |\n| ${first.title} | ${source(first)} | ${'summary' in first ? first.summary : first.description} |\n| ${second.title} | ${source(second)} | ${'summary' in second ? second.summary : second.description} |\n\nNext: Compare their exact inputs and current terms.`
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
