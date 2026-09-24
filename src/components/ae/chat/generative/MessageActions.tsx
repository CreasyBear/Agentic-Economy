import { Copy, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { MessageActionsProps } from './generative.contracts'

export function MessageActions({ view, onCopy, onRetry }: MessageActionsProps) {
  if (!view.canCopy && !view.canRetry) return null
  return (
    <div role="group" aria-label="Answer actions" className="flex flex-wrap gap-2">
      {view.canCopy ? <Button type="button" variant="ghost" size="sm" className="min-h-10" onClick={onCopy}><Copy aria-hidden="true" data-icon="inline-start" />Copy</Button> : null}
      {view.canRetry ? <Button type="button" variant="ghost" size="sm" className="min-h-10" onClick={onRetry}><RotateCcw aria-hidden="true" data-icon="inline-start" />Retry answer</Button> : null}
    </div>
  )
}
