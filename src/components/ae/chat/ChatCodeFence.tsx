import { CheckIcon, CopyIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { useClipboardCopy } from '@/hooks/use-clipboard-copy'

export type ChatCodeFenceProps = Readonly<{
  code: string
  children: ReactNode
}>

export function ChatCodeFence({ code, children }: ChatCodeFenceProps) {
  const { status, isCopied, copy } = useClipboardCopy(code)
  const label = isCopied ? 'Copied' : status === 'failed' ? 'Copy failed' : 'Copy code'
  return (
    <div className="relative">
      {code.length === 0 ? null : (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="absolute top-1 right-1"
          aria-label={label}
          onClick={() => { void copy() }}
        >
          {isCopied
            ? <CheckIcon aria-hidden="true" />
            : <CopyIcon aria-hidden="true" />}
        </Button>
      )}
      <pre className="pe-8">{children}</pre>
    </div>
  )
}
