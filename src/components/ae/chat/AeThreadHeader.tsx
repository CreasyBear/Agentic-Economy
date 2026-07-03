import { CopyIcon } from 'lucide-react'

import { Button } from '@astryxdesign/core/Button'
import { copyThreadLink } from './copy-thread-link'

export type AeThreadHeaderProps = {
  title: string
  threadId: string
}

export function AeThreadHeader({ title, threadId }: AeThreadHeaderProps) {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border bg-body px-4 py-3 md:px-6">
      <h1 className="truncate font-heading text-lg text-primary">{title}</h1>
      <Button
        label="Copy link"
        type="button"
        variant="ghost"
        size="sm"
        icon={<CopyIcon aria-hidden="true" />}
        onClick={() => void copyThreadLink(threadId)}
      />
    </header>
  )
}
