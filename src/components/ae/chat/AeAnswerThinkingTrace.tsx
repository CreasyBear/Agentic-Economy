import { AeThinkingRail } from '@/components/ae/artifacts/AeThinkingRail'
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '@/components/ai-elements/reasoning'
import { Shimmer } from '@/components/ai-elements/shimmer'
import type { AnswerWorkStep } from '@/modules/answer/public'
import type { ThinkingStep } from '@/modules/answer-thread/public'

import { AeResearchProcess } from './AeResearchProcess'
import { isStructuredAnswerModeEnabled } from './AeStructuredAnswerChat'

export type AeAnswerThinkingTraceProps = {
  isStreaming: boolean
  label: string
  thinkingStep?: ThinkingStep
  steps?: readonly string[]
  workLog?: readonly AnswerWorkStep[]
}

export function AeAnswerThinkingTrace({
  isStreaming,
  label,
  thinkingStep,
  steps = [],
  workLog = [],
}: AeAnswerThinkingTraceProps) {
  const structuredMode = isStructuredAnswerModeEnabled()

  if (workLog.length > 0) {
    return <AeResearchProcess isStreaming={isStreaming} steps={workLog} />
  }

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

  if (!show) {
    return null
  }

  return (
    <Reasoning className="ae-answer-reasoning" isStreaming={isStreaming}>
      <ReasoningTrigger
        className="ae-answer-reasoning__trigger"
        getLabel={() =>
          isStreaming ? (
            <Shimmer as="span" className="ae-streaming-label">
              {label}
            </Shimmer>
          ) : (
            <span className="ae-answer-reasoning__done">{label}</span>
          )
        }
      />
      {detail.length > 0 ? (
        <ReasoningContent className="ae-answer-reasoning__content">
          <p>{detail}</p>
        </ReasoningContent>
      ) : null}
    </Reasoning>
  )
}
