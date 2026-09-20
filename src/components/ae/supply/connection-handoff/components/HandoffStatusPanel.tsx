import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

import type { HandoffStatusPanelProps } from '../connection-handoff.contracts'
import { ReturnToAddTool } from './ReturnToAddTool'

export function HandoffStatusPanel({ title, description, returnSearch }: HandoffStatusPanelProps) {
  return (
    <Alert>
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p>{description}</p>
        <ReturnToAddTool returnSearch={returnSearch} />
      </AlertDescription>
    </Alert>
  )
}
