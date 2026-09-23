import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'

export function AePriceUpdateModalSkeleton() {
  return (
    <Dialog open>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Update Price & Publish New Revision</DialogTitle>
          <DialogDescription>
            <Skeleton className="h-4 w-full" />
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="min-h-[8.5rem] w-full rounded-lg" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-10 w-full" />
          <div className="min-h-[2.5rem]" />
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Skeleton className="min-h-touch h-10 w-24" />
          <Skeleton className="min-h-touch h-10 w-40" />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
