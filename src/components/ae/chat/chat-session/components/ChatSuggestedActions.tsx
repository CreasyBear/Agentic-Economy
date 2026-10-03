import { ArcAiChatSuggestions } from '@/components/arc/blocks/ai-chat/ai-chat'
import { chatSuggestions } from '@/lib/public/chat-ia'

export type ChatSuggestedActionsProps = Readonly<{ onPick(prompt: string): void }>

export function ChatSuggestedActions({ onPick }: ChatSuggestedActionsProps) {
  return <ArcAiChatSuggestions suggestions={chatSuggestions} onPick={onPick} />
}
