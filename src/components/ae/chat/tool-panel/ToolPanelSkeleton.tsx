// Invariant: loading rows preserve the form's inner rhythm without changing panel chrome, following the chat skeleton pattern.
import { Skeleton } from '@/components/ui/skeleton'
import { chatToolPanel } from '@/lib/public/chat-ia'

type ToolPanelSkeletonProps = Readonly<{ recommended: boolean }>

export function ToolPanelSkeleton({ recommended }: ToolPanelSkeletonProps) {
  return (
    <div role="status" className="grid min-w-0 gap-3">
      <div className="grid min-w-0 gap-3">
        <div className="grid min-w-0 gap-2">
          <p className="min-h-4 break-words text-sm leading-4 text-muted-foreground">{chatToolPanel.loading}</p>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-3 w-2/5" />
        </div>
        <div className="grid min-w-0 gap-2">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-3 w-1/2" />
        </div>
        <div className="grid min-w-0 gap-2">
          <Skeleton className="h-4 w-1/5" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-3 w-2/5" />
        </div>
      </div>
      <Skeleton className="h-4 w-3/5" />
      <Skeleton className="h-11 w-full rounded-md" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-4 w-2/3" />
      {recommended ? <Skeleton className="h-4 w-4/5" /> : null}
    </div>
  )
}
