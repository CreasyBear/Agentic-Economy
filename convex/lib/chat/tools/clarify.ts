import { createTool, type ToolCtx } from '@convex-dev/agent'
import { z } from 'zod'
import { chatClarifyInputSchema } from '@/modules/chat/agent-turn.contracts'
import { CHAT_TOOL_NAME_MAP } from '@/modules/chat/tool-card'
import { contractFor, descriptionFor, type ReserveChatTool } from './contracts'

export function createClarifyTools(reserve: ReserveChatTool) {
  return {
    [CHAT_TOOL_NAME_MAP.canonicalToProvider['chat.clarify']]: createTool({
      description: descriptionFor(contractFor('chat.clarify')),
      inputSchema: chatClarifyInputSchema,
      execute: async (_ctx: ToolCtx, input: z.infer<typeof chatClarifyInputSchema>) => {
        const denied = reserve('chat.clarify')
        if (denied !== null) return denied
        return { question: input.question, status: 'awaiting_answer' as const }
      },
    }),
  }
}
