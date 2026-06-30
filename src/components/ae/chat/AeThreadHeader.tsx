import { CopyIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { copyThreadLink } from './copy-thread-link'

export type AeThreadHeaderProps = {
  title: string
  threadId: string
}

export function AeThreadHeader({ title, threadId }: AeThreadHeaderProps) {
  return (
    <header className="ae-thread-header">
      <h1 className="ae-thread-header__title">{title}</h1>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="ae-thread-header__copy"
        onClick={() => void copyThreadLink(threadId)}
      >
        <CopyIcon data-icon="inline-start" />
        Copy link
      </Button>
    </header>
  )
}
