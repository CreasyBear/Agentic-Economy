import { CheckIcon, CopyIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/arc/button/button'
import { useClipboardCopy } from '@/hooks/use-clipboard-copy'
import './CodeFenceComposition.css'

export type ChatCodeFenceProps = Readonly<{
  code: string
  children: ReactNode
}>

export function ChatCodeFence({ code, children }: ChatCodeFenceProps) {
  const { status, isCopied, copy } = useClipboardCopy(code)
  const label = isCopied ? 'Copied' : status === 'failed' ? 'Copy failed' : 'Copy code'
  return (
    <div className="arc-market arc-chat arc-code-fence">
      {code.length === 0 ? null : (
        <div className="arc-code-fence-toolbar">
          <Button
            type="button"
            variant="ghost"
            size="md"
            className="arc-code-fence-copy"
            aria-label={label}
            onClick={() => { void copy() }}
          >
            {isCopied
              ? <CheckIcon className="arc-code-fence-icon" aria-hidden="true" />
              : <CopyIcon className="arc-code-fence-icon" aria-hidden="true" />}
            <span>{label}</span>
          </Button>
        </div>
      )}
      <pre className="arc-code-fence-code">{children}</pre>
    </div>
  )
}
