import { useEffect, useState } from 'react'
import { ChevronDownIcon } from 'lucide-react'

import { AeThinkingRail } from '@/components/ae/artifacts/AeThinkingRail'
import { Shimmer } from '@/components/ai-elements/shimmer'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import type { ThinkingStep } from '@/modules/answer-thread/public'

import { isStructuredAnswerModeEnabled } from './AeStructuredAnswerChat'

export type AeAnswerThinkingTraceProps = {
  isStreaming: boolean
  label: string
  thinkingStep?: ThinkingStep
  steps?: readonly string[]
}

export function AeAnswerThinkingTrace({
  isStreaming,
  label,
  thinkingStep,
  steps = [],
}: AeAnswerThinkingTraceProps) {
  const structuredMode = isStructuredAnswerModeEnabled()

  if (structuredMode) {
    if (!isStreaming && steps.length === 0) {
      return null
    }
    return <AeAnswerReasoningCollapsible isStreaming={isStreaming} label={label} steps={steps} />
  }

  return (
    <AeThinkingRail
      label={label}
      visible={isStreaming}
      {...(thinkingStep === undefined ? {} : { step: thinkingStep })}
    />
  )
}

type AeAnswerReasoningCollapsibleProps = {
  isStreaming: boolean
  label: string
  steps?: readonly string[]
}

function AeAnswerReasoningCollapsible({ isStreaming, label, steps = [] }: AeAnswerReasoningCollapsibleProps) {
  const detail = steps.join('\n\n')
  const show = isStreaming || steps.length > 0
  const [open, setOpen] = useState(isStreaming)

  useEffect(() => {
    if (isStreaming) {
      setOpen(true)
    }
  }, [isStreaming])

  useEffect(() => {
    if (!isStreaming && open) {
      const timer = window.setTimeout(() => setOpen(false), 1000)
      return () => window.clearTimeout(timer)
    }
    return undefined
  }, [isStreaming, open])

  if (!show) {
    return null
  }

  return (
    <Collapsible className="ae-answer-reasoning" open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="ae-answer-reasoning__trigger flex w-full items-center gap-2">
        {isStreaming ? (
          <Shimmer as="span" className="ae-streaming-label">
            {label}
          </Shimmer>
        ) : (
          <span className="ae-answer-reasoning__done">{label}</span>
        )}
        <ChevronDownIcon
          className={cn('size-4 shrink-0 transition-transform', open ? 'rotate-180' : 'rotate-0')}
          aria-hidden="true"
        />
      </CollapsibleTrigger>
      {detail.length > 0 ? (
        <CollapsibleContent className="ae-answer-reasoning__content">
          <p>{detail}</p>
        </CollapsibleContent>
      ) : null}
    </Collapsible>
  )
}
