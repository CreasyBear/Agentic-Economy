// Licensed Arc Pro ai-chat empty-stage composition, retrieved 1 October 2026.
import { chatEmpty } from '@/lib/public/chat-ia'
import '@/components/arc/chat/ChatComposer.css'

export function ChatGreeting() {
  return <div className="arc-market arc-chat arc-chat-greeting" key="overview"><h2>{chatEmpty.title}</h2><p>{chatEmpty.description}</p></div>
}
