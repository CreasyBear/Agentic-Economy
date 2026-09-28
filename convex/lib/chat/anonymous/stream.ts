import type { LanguageModelV4 } from '@ai-sdk/provider'
import { createUIMessageStream, createUIMessageStreamResponse, stepCountIs, type ModelMessage, type UIMessageChunk } from 'ai'
import type { z } from 'zod'
import { CHAT_TOOL_NAME_MAP } from '@/modules/chat/tool-card'
import { toolChoiceDescribeOutputSchema, toolChoiceSearchOutputSchema, type ToolChoiceSearchOutput } from '@/modules/registry/tool-choice-contracts'
import type { ActionCtx } from '../../../_generated/server'
import { createChatAgent } from '../tools/agent'
import { CHAT_NO_RESULT_ANSWER, chatSearchResolution, prepareChatToolStep } from '../tools/step'
import { completedChatFacts } from '../generate/completedFacts'
import type { AnonymousChatMessage, AnonymousSearchContinuation } from './contracts'

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
      try {
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
        return
      }
      const resolution = chatSearchResolution(steps)
      if (steps.every(step => step.toolResults.length === 0) || resolution !== null) {
        writer.write({ type: 'text-start', id: 'no-tool-result' })
        writer.write({ type: 'text-delta', id: 'no-tool-result', delta: resolution ?? CHAT_NO_RESULT_ANSWER })
        writer.write({ type: 'text-end', id: 'no-tool-result' })
        writer.write({ type: 'finish' })
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
      } catch (error) {
        if (abortSignal?.aborted) throw error
        const answer = completedChatFacts(completedSteps)
        if (answer === null) throw error
        writer.write({ type: 'text-start', id: 'completed-tool-facts' })
        writer.write({ type: 'text-delta', id: 'completed-tool-facts', delta: answer })
        writer.write({ type: 'text-end', id: 'completed-tool-facts' })
        writer.write({ type: 'finish' })
      }
    },
  })
  return createUIMessageStreamResponse({ stream })
}
