import { DefaultChatTransport, readUIMessageStream, type UIMessage } from 'ai'

import type { RegistryNextAction } from '@/modules/registry/tool-choice-contracts'

import {
  anonymousRequestSize,
  fetchAnonymousChat,
  projectAnonymousTranscript,
  type TranscriptMessage,
} from '../presentation'
import { messageId, toTransportMessages } from './anonymous-session'

type SearchContinuation = Extract<RegistryNextAction, { action: 'next-page' }>['args']

export async function sendAnonymousChatTurn(input: Readonly<{
  nextPrompt: string
  anonymousMessages: readonly TranscriptMessage[]
  continuation?: SearchContinuation
  abortPrevious: () => void
  adoptController: (controller: AbortController) => void
  setAnonymousMessages: (messages: TranscriptMessage[]) => void
  maxMessages: number
  maxBytes: number
}>): Promise<void> {
  const userMessage: TranscriptMessage = {
    id: messageId('anonymous-user'),
    role: 'user',
    parts: [{ type: 'text', text: input.nextPrompt }],
  }
  const requestMessages = [...input.anonymousMessages, userMessage]
  if (input.anonymousMessages.length + 2 > input.maxMessages) throw new Error('anonymous_message_limit')
  if (anonymousRequestSize(requestMessages) > input.maxBytes) throw new Error('anonymous_size_limit')
  const continuation = input.continuation
  const transport = new DefaultChatTransport<UIMessage>({
    api: '/api/chat/anonymous',
    fetch: fetchAnonymousChat,
    prepareSendMessagesRequest: ({ messages }) => ({
      body: {
        messages: projectAnonymousTranscript(messages.map((message) => ({
          id: message.id,
          role: message.role === 'assistant' ? 'assistant' : 'user',
          parts: message.parts,
        }))),
        ...(continuation === undefined ? {} : { continuation: { kind: 'search_next_page' as const, ...continuation } }),
      },
    }),
  })
  input.setAnonymousMessages(requestMessages)
  const controller = new AbortController()
  input.abortPrevious()
  input.adoptController(controller)
  let assistant: UIMessage | undefined
  const assistantMessageId = messageId('anonymous-assistant')
  try {
    const stream = await transport.sendMessages({
      trigger: 'submit-message',
      chatId: 'anonymous-browser',
      messageId: undefined,
      messages: toTransportMessages(requestMessages),
      abortSignal: controller.signal,
    })
    for await (const message of readUIMessageStream({ stream, terminateOnError: true })) {
      assistant = message
      input.setAnonymousMessages([...requestMessages, { id: assistantMessageId, role: 'assistant', parts: message.parts }])
    }
    if (assistant === undefined) throw new Error('chat_unavailable')
  } catch (caught) {
    const aborted = caught instanceof Error && caught.name === 'AbortError'
    if (!aborted && assistant === undefined) input.setAnonymousMessages([...input.anonymousMessages])
    if (!aborted && assistant !== undefined) throw new Error('chat_stream_failed', { cause: caught })
    throw caught
  }
}
