import {
  CircleAlertIcon,
  GitCompareArrowsIcon,
  RefreshCcwIcon,
  ShieldCheckIcon,
  SlidersHorizontalIcon,
} from 'lucide-react'

import type { AnswerArtifact } from '@/modules/answer/public'
import type { FollowUpIntent } from '@/modules/answer-thread/public'
import { buildTurnContextLine } from './turn-context'

export type AeTurnContextLineProps = {
  intent: FollowUpIntent
  seq: number
  artifacts: readonly AnswerArtifact[]
}

export function AeTurnContextLine({ intent, seq, artifacts }: AeTurnContextLineProps) {
  const line = buildTurnContextLine({ intent, seq, artifacts })

  if (line === undefined) {
    return null
  }

  const Icon = iconForIntent(intent)

  return (
    <div
      className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2 border-l-2 border-border-strong py-1 pl-3 text-xs leading-snug text-muted-foreground"
      data-intent={intent}
      aria-label="Turn context"
    >
      <Icon className="mt-px size-3.5 text-muted-foreground" aria-hidden="true" />
      <span dir="auto" style={{ unicodeBidi: 'isolate' }}>{line}</span>
    </div>
  )
}

function iconForIntent(intent: FollowUpIntent) {
  switch (intent) {
    case 'filter_known':
      return SlidersHorizontalIcon
    case 'compare_known':
      return GitCompareArrowsIcon
    case 'explain_boundary':
      return ShieldCheckIcon
    case 'unsupported':
      return CircleAlertIcon
    case 'refine_search':
      return RefreshCcwIcon
  }
}
