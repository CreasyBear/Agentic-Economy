// Immediate chat turns persist the catalogue card before optional selection; this copies streamDurableChatResponse's fallback order.
import { listMessages, saveMessages, type Agent } from '@convex-dev/agent'
import type { JSONValue } from '@ai-sdk/provider'
import { components, internal } from '../../../_generated/api'
import type { ActionCtx } from '../../../_generated/server'
import type { ToolChoiceSearchOutput } from '@/modules/registry/tool-choice-contracts'
import { recommendTool } from './recommend'
import { catalogueFact, explanationUsable, immediateSearchToolName, retrieveImmediateTools } from '../tools/immediate'
import { chatModelCostHooks } from './modelCost'

type ImmediateTurnArgs = Readonly<{
  threadId: string
  ownerId: string
  promptMessageId: string
  searchTurn?: Readonly<{ turnRef: string; threadId: string; promptMessageId: string }>
}>
type CompletedStep = { toolResults: { toolName: string; output: unknown }[] }
type ImmediateTurnDeps = Readonly<{
  agent: Agent
  args: ImmediateTurnArgs
  promptText: string
  completedSteps: CompletedStep[]
  signal?: AbortSignal
}>

export async function streamImmediateCatalogue(ctx: ActionCtx, deps: ImmediateTurnDeps): Promise<boolean> {
  let catalogue: ToolChoiceSearchOutput | null
  try {
    catalogue = await retrieveImmediateTools(ctx, deps.promptText, deps.args.searchTurn, deps.args.ownerId)
  } catch {
    catalogue = null
  }
  if (catalogue === null) return false

  const toolName = immediateSearchToolName()
  deps.completedSteps.push({ toolResults: [{ toolName, output: catalogue }] })
  const saved = await saveMessages(ctx, components.agent, {
    threadId: deps.args.threadId,
    userId: deps.args.ownerId,
    promptMessageId: deps.args.promptMessageId,
    messages: [
      { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'immediate-search', toolName, input: { query: deps.promptText, limit: 8 } }] },
      { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'immediate-search', toolName, output: { type: 'json', value: catalogue as JSONValue } }] },
    ],
    agentName: 'Agentic Economy Operation Market',
  })
  const toolMessages = saved.messages.filter(message => message.threadId === deps.args.threadId
    && message.message?.role === 'tool'
    && Array.isArray(message.message.content)
    && message.message.content.some(part => part.type === 'tool-result' && part.toolCallId === 'immediate-search'))
  const tool = toolMessages.length === 1 ? toolMessages[0] : undefined
  const selection = await recommendTool({
    catalogue,
    promptText: deps.promptText,
    ownerId: deps.args.ownerId,
    threadId: deps.args.threadId,
    promptMessageId: deps.args.promptMessageId,
    ...(deps.args.searchTurn === undefined ? {} : { modelCostBinding: deps.args.searchTurn }),
    ...(deps.signal === undefined ? {} : { signal: deps.signal }),
  }, ctx)
  let recommendation = selection.recommendation
  if (recommendation !== null) {
    const selectedRecommendation = recommendation
    const message = tool?.message
    const matchingParts = message?.role !== 'tool' || !Array.isArray(message.content)
      ? []
      : message.content.filter(part => part.type === 'tool-result' && part.toolCallId === 'immediate-search')
    const result = matchingParts.length === 1 ? matchingParts[0] : undefined
    if (tool === undefined || message?.role !== 'tool' || result?.type !== 'tool-result' || result.output?.type !== 'json') {
      recommendation = null
    } else {
      const content = message.content.map(part => {
        if (part.type !== 'tool-result' || part.toolCallId !== 'immediate-search' || part.output?.type !== 'json') return part
        return {
          ...part,
          output: {
            ...part.output,
            value: { ...catalogue, recommendation: { toolRef: selectedRecommendation.toolRef, by: selectedRecommendation.by } } as JSONValue,
          },
        }
      })
      try {
        await deps.agent.updateMessage(ctx, {
          messageId: tool._id,
          patch: { message: { ...message, content }, status: 'success' },
        })
      } catch {
        recommendation = null
      }
    }
  }

  if (selection.decision !== null) {
    const { pickedToolRef, modelConfidence, ...decision } = selection.decision
    await ctx.runMutation(internal.capabilitySelectionDecisions.recordInternal, {
      ...decision,
      offered: decision.offered.map(item => ({ ...item })),
      fit: decision.fit.map(item => ({
        toolRef: item.toolRef,
        ...(item.noul === undefined ? {} : { noul: item.noul }),
      })),
      ...(pickedToolRef === undefined ? {} : { pickedToolRef }),
      ...(modelConfidence === undefined ? {} : { modelConfidence }),
      shown: recommendation !== null,
    }).catch(() => undefined)
  }

  if (deps.signal?.aborted) throw deps.signal.reason ?? new Error('chat_generation_deadline_exceeded')
  const saveFallback = async (messageId?: string): Promise<void> => {
    const history = messageId === undefined
      ? await listMessages(ctx, components.agent, {
        threadId: deps.args.threadId, paginationOpts: { cursor: null, numItems: 20 },
      })
      : undefined
    const prompt = history?.page.find(message => message._id === deps.args.promptMessageId)
    const existingId = messageId ?? history?.page.find(message =>
      message.order === prompt?.order && message.message?.role === 'assistant' && !message.tool)?._id
    if (existingId !== undefined) {
      await deps.agent.updateMessage(ctx, {
        messageId: existingId,
        patch: { message: { role: 'assistant', content: catalogueFact(catalogue) }, status: 'success' },
      })
      return
    }
    await saveMessages(ctx, components.agent, {
      threadId: deps.args.threadId,
      userId: deps.args.ownerId,
      promptMessageId: deps.args.promptMessageId,
      messages: [{ role: 'assistant', content: catalogueFact(catalogue) }],
      agentName: 'Agentic Economy Operation Market',
    })
  }

  try {
    const explanation = await deps.agent.streamText(ctx, {
      threadId: deps.args.threadId,
      userId: deps.args.ownerId,
    }, {
      promptMessageId: deps.args.promptMessageId,
      ...chatModelCostHooks(ctx, deps.args.searchTurn, 'immediate_explanation'),
      tools: {},
      timeout: { totalMs: 8_000 },
      maxRetries: 0,
      ...(deps.signal === undefined ? {} : { abortSignal: deps.signal }),
      instructions: `${deps.agent.options.instructions} Tool cards are already shown. Explain only those cards. Never invent an operation id.${recommendation === null ? '' : ` The app marked the Tool identified by reference ${JSON.stringify(recommendation.toolRef)} as the best match; name that Tool first and never name a different best Tool.`}`,
    }, {
      storageOptions: { saveMessages: 'promptAndOutput' },
      saveStreamDeltas: { chunking: 'word', throttleMs: 100 },
    })
    const text = (await explanation.text).trim()
    if (!explanationUsable(text, catalogue)) {
      const savedAssistant = explanation.savedMessages?.findLast(message =>
        message.message?.role === 'assistant' && !message.tool)
      if (savedAssistant === undefined) await saveFallback()
      else await saveFallback(savedAssistant._id)
    }
  } catch (cause) {
    if (deps.signal?.aborted) throw cause
    await saveFallback()
  }
  return true
}
