import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { chatEmpty } from '@/lib/public/chat-ia'

export function ChatGreeting() {
  return <Empty className="flex-none gap-0 p-0">
    <EmptyHeader className="max-w-none gap-3">
      <EmptyTitle className="text-2xl font-medium tracking-tight sm:text-3xl"><h2>{chatEmpty.title}</h2></EmptyTitle>
      <EmptyDescription className="max-w-md text-sm">{chatEmpty.description}</EmptyDescription>
    </EmptyHeader>
  </Empty>
}
