// Adapted from vercel/ai-chatbot, c2f8235e1f3ea903ad8b7f61447c4f74164b5c58, components/chat/message-actions.tsx (Apache-2.0).
import { Copy, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { MessageActionsProps } from './generative.contracts'

export function MessageActions({ view, onCopy, onRetry }: MessageActionsProps) {
  if (!view.canCopy && !view.canRetry) return null
  return (
    <TooltipProvider>
      <div role="group" aria-label="Answer actions" className="flex gap-1">
        {view.canCopy ? (
          <Tooltip>
            <TooltipTrigger render={<Button type="button" variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-foreground" aria-label="Copy" onClick={onCopy}><Copy aria-hidden="true" /></Button>} />
            <TooltipContent>Copy</TooltipContent>
          </Tooltip>
        ) : null}
        {view.canRetry ? (
          <Tooltip>
            <TooltipTrigger render={<Button type="button" variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-foreground" aria-label="Retry answer" onClick={onRetry}><RotateCcw aria-hidden="true" /></Button>} />
            <TooltipContent>Retry answer</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
    </TooltipProvider>
  )
}
