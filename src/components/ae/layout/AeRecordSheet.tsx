import type { ReactNode } from 'react'

import { Button as ArcButton } from '@/components/arc/button/button'
import { Drawer, DrawerContent } from '@/components/arc/drawer/Drawer'
import { AeFactList, type AeFact } from '@/components/ae/data/AeFactList'

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
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        side="right"
        title={title}
        {...(description === undefined ? {} : { description })}
      >
        {facts === undefined || facts.length === 0 ? null : (
          <AeFactList facts={facts} />
        )}
        {children}
        {action === undefined ? null : (
          <footer
            className="sticky bottom-0 mt-6 flex flex-col gap-2 border-t border-border pt-4"
            style={{ background: 'var(--surface-raised)' }}
          >
            {action}
            <ArcButton
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Close
            </ArcButton>
          </footer>
        )}
      </DrawerContent>
    </Drawer>
  )
}
