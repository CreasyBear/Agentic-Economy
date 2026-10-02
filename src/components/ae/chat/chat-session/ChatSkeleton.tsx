import { AeChatPage } from '@/components/ae/layout/AeChatPage'
import { Skeleton } from '@/components/ui/skeleton'

export function ChatSkeleton() {
  return (
    <AeChatPage
      header={
        <header className="arc-chat-skeleton-header">
          <Skeleton className="min-h-touch min-w-touch shrink-0 rounded-md" />
          <div className="arc-chat-skeleton-title">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
          <Skeleton className="min-h-touch min-w-touch rounded-md" />
        </header>
      }
      dock={
        <div className="arc-chat-skeleton-dock">
          <Skeleton className="h-24 rounded-md" />
        </div>
      }
    >
      <div className="arc-chat-skeleton-content" aria-busy="true">
        <Skeleton className="h-16 w-full max-w-prose" />
        <Skeleton className="ml-auto h-16 w-full max-w-prose" />
      </div>
    </AeChatPage>
  )
}
