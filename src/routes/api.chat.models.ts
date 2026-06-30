import { createFileRoute } from '@tanstack/react-router'

import {
  getAnswerModelSelectorData,
  readAnswerLlmConfig,
  type AnswerModelSelectorData,
} from '@/modules/answer/public'

export const Route = createFileRoute('/api/chat/models')({
  server: {
    handlers: {
      GET: () => handleChatModelsRequest(),
    },
  },
})

export async function handleChatModelsRequest(): Promise<Response> {
  const llm = readAnswerLlmConfig()
  if (llm === undefined) {
    const payload: AnswerModelSelectorData = {
      enabled: false,
      modelsByProvider: {},
      selectedModelId: '',
      hasAvailableModels: false,
    }
    return jsonResponse(payload)
  }

  const payload = await getAnswerModelSelectorData(llm)
  return jsonResponse(payload)
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, max-age=60',
    },
  })
}
