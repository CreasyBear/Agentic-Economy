// Invariant: loading rows preserve the form's inner rhythm without changing panel chrome, following the chat skeleton pattern.
import { Skeleton } from '@/components/arc/skeleton/skeleton'
import { chatToolPanel } from '@/lib/public/chat-ia'

type ToolPanelSkeletonProps = Readonly<{ recommended: boolean }>

export function ToolPanelSkeleton({ recommended }: ToolPanelSkeletonProps) {
  return (
    <div role="status" aria-label={chatToolPanel.loading} className="arc-tool-review-skeleton grid min-w-0 gap-3">
      <div className="grid min-w-0 gap-3">
        <div className="grid min-w-0 gap-2">
          <p className="min-h-4 break-words text-sm leading-4 text-muted-foreground">{chatToolPanel.loading}</p>
          <div aria-hidden="true" className="h-11 w-full"><Skeleton lines={2} /></div>
          <div aria-hidden="true" className="h-3 w-2/5 overflow-hidden"><Skeleton lines={1} /></div>
        </div>
        <div className="grid min-w-0 gap-2">
          <div aria-hidden="true" className="h-4 w-1/3 overflow-hidden"><Skeleton lines={1} /></div>
          <div aria-hidden="true" className="h-11 w-full"><Skeleton lines={2} /></div>
          <div aria-hidden="true" className="h-3 w-1/2 overflow-hidden"><Skeleton lines={1} /></div>
        </div>
        <div className="grid min-w-0 gap-2">
          <div aria-hidden="true" className="h-4 w-1/5 overflow-hidden"><Skeleton lines={1} /></div>
          <div aria-hidden="true" className="h-11 w-full"><Skeleton lines={2} /></div>
          <div aria-hidden="true" className="h-3 w-2/5 overflow-hidden"><Skeleton lines={1} /></div>
        </div>
      </div>
      <div aria-hidden="true" className="h-4 w-3/5 overflow-hidden"><Skeleton lines={1} /></div>
      <div aria-hidden="true" className="h-11 w-full rounded-sm"><Skeleton lines={2} /></div>
      <div aria-hidden="true" className="h-4 w-5/6 overflow-hidden"><Skeleton lines={1} /></div>
      <div aria-hidden="true" className="h-4 w-2/3 overflow-hidden"><Skeleton lines={1} /></div>
      {recommended ? <div aria-hidden="true" className="h-4 w-4/5 overflow-hidden"><Skeleton lines={1} /></div> : null}
    </div>
  )
}
