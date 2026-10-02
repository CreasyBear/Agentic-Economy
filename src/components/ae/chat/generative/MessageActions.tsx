// Adapted from vercel/ai-chatbot, c2f8235e1f3ea903ad8b7f61447c4f74164b5c58, components/chat/message-actions.tsx (Apache-2.0).
import { Copy, Pencil } from 'lucide-react'
import { Button } from '@/components/arc/button/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { MessageActionsProps } from './generative.contracts'

export function MessageActions({ view, onCopy, onEditQuestion }: MessageActionsProps) {
  if (!view.canCopy && !view.canEditQuestion) return null
  return (
    <TooltipProvider>
      <div role="group" aria-label="Answer actions" className="flex gap-2">
        {view.canCopy ? (
          <Tooltip>
            <TooltipTrigger render={<Button type="button" variant="ghost" size="sm" className="size-11 text-muted-foreground hover:text-foreground" aria-label="Copy" onClick={onCopy}><Copy aria-hidden="true" /></Button>} />
            <TooltipContent>Copy</TooltipContent>
          </Tooltip>
        ) : null}
        {view.canEditQuestion ? (
          <Tooltip>
            <TooltipTrigger render={<Button type="button" variant="ghost" size="sm" className="size-11 text-muted-foreground hover:text-foreground" aria-label="Edit question" onClick={onEditQuestion}><Pencil aria-hidden="true" /></Button>} />
            <TooltipContent>Edit question</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
    </TooltipProvider>
  )
}
