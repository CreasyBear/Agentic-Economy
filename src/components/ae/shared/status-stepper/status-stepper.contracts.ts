export type AeStatusStepperStatus = 'complete' | 'current' | 'upcoming' | 'error'

export type AeStatusStepperStep = Readonly<{
  id: string
  label: string
  description?: string
  error?: string
  status?: AeStatusStepperStatus
  statusLabel?: string
}>

export type AeStatusStepperProps = Readonly<{
  steps: readonly AeStatusStepperStep[]
  current: number
  onStepSelect?: (index: number) => void
  canSelectStep?: (index: number) => boolean
  label?: string
  completeLabel?: string
  announceLabel?: string
  className?: string
}>
