// Adapted from vercel/ai-chatbot, c2f8235e1f3ea903ad8b7f61447c4f74164b5c58, components/chat/greeting.tsx (Apache-2.0).
import { chatEmpty } from '@/lib/public/chat-ia'

export function ChatGreeting() {
  return (
    <div className="flex w-full flex-col items-center px-4" key="overview">
      <h2 className="text-center font-semibold text-2xl tracking-tight text-foreground text-balance md:text-3xl">
        {chatEmpty.title}
      </h2>
      <p className="mt-3 w-full text-center text-muted-foreground text-sm text-balance md:text-wrap">
        {chatEmpty.description}
      </p>
    </div>
  )
}
