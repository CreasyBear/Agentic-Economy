import { AeChatPage } from '@/components/ae/layout/AeChatPage'
import { Skeleton } from '@/components/ui/skeleton'

export function ChatSkeleton() {
  return (
    <AeChatPage
      header={
        <header className="flex min-h-14 items-center gap-related border-b border-border px-gutter">
          <Skeleton className="min-h-touch min-w-touch shrink-0 rounded-md" />
          <div className="flex min-w-0 flex-1 flex-col gap-intra">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
          <Skeleton className="min-h-touch min-w-touch rounded-md" />
        </header>
      }
      dock={
        <div className="bg-background px-gutter pb-[max(var(--spacing-related),env(safe-area-inset-bottom))] pt-intra">
          <Skeleton className="mx-auto h-24 w-full max-w-3xl rounded-md" />
        </div>
      }
    >
      <div className="grid min-h-0 flex-1 content-start gap-intra p-gutter" aria-busy="true">
        <Skeleton className="h-16 w-full max-w-prose" />
        <Skeleton className="ml-auto h-16 w-full max-w-prose" />
      </div>
    </AeChatPage>
  )
}
