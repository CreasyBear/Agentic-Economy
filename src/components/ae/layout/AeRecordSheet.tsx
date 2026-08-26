import type { ReactNode } from 'react'

import { AeFactList, type AeFact } from '@/components/ae/data/AeFactList'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

type AeRecordSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  facts?: readonly AeFact[]
  action?: ReactNode
  children?: ReactNode
}

export function AeRecordSheet({
  open,
  onOpenChange,
  title,
  description,
  facts,
  action,
  children,
}: AeRecordSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="border-b border-border">
          <SheetTitle className="text-base font-medium tracking-tight">{title}</SheetTitle>
          {description === undefined ? null : (
            <SheetDescription>{description}</SheetDescription>
          )}
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {facts === undefined || facts.length === 0 ? null : (
            <AeFactList facts={facts} />
          )}
          {children}
        </div>
        {action === undefined ? null : (
          <SheetFooter className="border-t border-border">
            {action}
            <Button type="button" variant="ghost" className="min-h-11" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  )
}
