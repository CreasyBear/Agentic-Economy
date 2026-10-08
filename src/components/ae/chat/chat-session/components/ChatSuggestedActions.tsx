import { ReuiChatStarters } from '@/components/ae/shared/reui-pro/ai-chat/welcome'
import { chatSuggestions } from '@/lib/public/chat-ia'

export type ChatSuggestedActionsProps = Readonly<{ onPick(prompt: string): void }>

export function ChatSuggestedActions({ onPick }: ChatSuggestedActionsProps) {
  return <ReuiChatStarters suggestions={chatSuggestions} onPick={onPick} />
}
