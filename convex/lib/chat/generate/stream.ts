import type { LanguageModelV4 } from '@ai-sdk/provider'
import type { ActionCtx } from '../../../_generated/server'
import { CHAT_TOOL_NAME_MAP } from '@/modules/chat/tool-card'
import type { InteractiveBusinessAuthorityContext } from '@/modules/business/public'
import type { TrustedChatAuthority } from '@/modules/chat/agent-turn.contracts'
import { createChatAgent } from '../tools/agent'
import { CHAT_NO_RESULT_ANSWER, chatNoMatchSearchCount, prepareChatToolStep } from '../tools/step'

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
  let ownerApprovalPending = false
  const result = await agent.streamText(
    ctx,
    { threadId: args.threadId, userId: args.ownerId },
    {
      promptMessageId: args.promptMessageId,
      prepareStep: prepareChatToolStep,
      onStepEnd: (step) => {
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
  const steps = await result.steps
  if (steps.every(step => step.toolResults.length === 0) || chatNoMatchSearchCount(steps) > 0) {
    const assistant = result.savedMessages?.findLast(message => message.message?.role === 'assistant')
    if (assistant?.message === undefined) throw new Error('chat_generation_answer_missing')
    const content = assistant.message.content
    const toolCalls = Array.isArray(content) ? content.filter(part => part.type === 'tool-call') : []
    await agent.updateMessage(ctx, {
      messageId: assistant._id,
      patch: { message: { role: 'assistant', content: [...toolCalls, { type: 'text', text: CHAT_NO_RESULT_ANSWER }] }, status: 'success' },
    })
    return false
  }
  const last = steps.at(-1)
  if (!clarificationRequested && (last?.text.trim().length === 0 || last?.toolCalls.length
    || !/[.!?…)"']$/u.test(last?.text.trim() ?? '')
    || /\b(?:let me|i(?:'ll| will) (?:check|search|look)|next page)\b/iu.test(last?.text ?? ''))) {
    const final = await agent.streamText(ctx, { threadId: args.threadId, userId: args.ownerId }, {
      promptMessageId: args.promptMessageId,
      tools: {},
      instructions: `${agent.options.instructions} The tools are closed. Answer directly from completed tool results, not earlier narration. Open with a bold supported answer, use bullets for one Tool and a table only for two to four distinct Tools, name a material gap once, and finish with one "Next: ..." action. Do not promise another search.`,
    }, {
      storageOptions: { saveMessages: 'promptAndOutput' },
      saveStreamDeltas: { chunking: 'word', throttleMs: 100 },
    })
    await final.text
  }
  return clarificationRequested || ownerApprovalPending
}
