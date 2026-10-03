import { ArcAiChatGreeting } from '@/components/arc/blocks/ai-chat/ai-chat'
import { chatEmpty } from '@/lib/public/chat-ia'

export function ChatGreeting() {
  return <ArcAiChatGreeting title={chatEmpty.title} description={chatEmpty.description} />
}
