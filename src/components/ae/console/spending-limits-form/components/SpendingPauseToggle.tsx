import { PauseIcon, PlayIcon } from 'lucide-react'

import { Button } from '@/components/arc/button/button'

import type { SpendingPauseToggleProps } from '../spending-limits-form.contracts'

export function SpendingPauseToggle({
  isPaused,
  restoreAvailable,
  disabled,
  onTogglePause,
}: SpendingPauseToggleProps) {
  return (
    <Button
      type="button"
      variant={isPaused ? 'primary' : 'secondary'}
      size="md"
      disabled={disabled}
      onClick={onTogglePause}
      className="arc-spending-policy-pause"
    >
      {isPaused ? (
        <>
          <PlayIcon className="size-3.5" />
          {restoreAvailable ? 'Resume Agent' : 'Set limits to resume'}
        </>
      ) : (
        <>
          <PauseIcon className="size-3.5" />
          Pause Agent
        </>
      )}
    </Button>
  )
}
