import { AeAlert } from '@/components/ae/shared/alert/AeAlert'

import type { HandoffStatusPanelProps } from '../connection-handoff.contracts'
import { ReturnToAddTool } from './ReturnToAddTool'
import '../ConnectionHandoffComposition.css'

export function HandoffStatusPanel({ title, description, returnSearch }: HandoffStatusPanelProps) {
  return (
    <AeAlert role="alert" tone="info" title={title} className="arc-market arc-connection-handoff-status">
        <p>{description}</p>
        <ReturnToAddTool returnSearch={returnSearch} />
      </AeAlert>
  )
}
