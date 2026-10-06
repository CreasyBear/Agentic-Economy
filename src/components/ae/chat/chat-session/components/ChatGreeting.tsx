import { ArcAiChatGreeting } from '@/components/ae/shared/arc-pro/ai-chat/ai-chat'
import { chatEmpty } from '@/lib/public/chat-ia'

export function ChatGreeting() {
  return <ArcAiChatGreeting title={chatEmpty.title} description={chatEmpty.description} />
}
