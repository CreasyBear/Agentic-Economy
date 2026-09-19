import { PauseIcon, PlayIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'

import type { SpendingPauseToggleProps } from '../spending-limits-form.contracts'

export function SpendingPauseToggle({
  isPaused,
  disabled,
  onTogglePause,
}: SpendingPauseToggleProps) {
  return (
    <Button
      type="button"
      variant={isPaused ? 'default' : 'outline'}
      size="sm"
      disabled={disabled}
      onClick={onTogglePause}
      className="min-h-touch gap-1.5"
    >
      {isPaused ? (
        <>
          <PlayIcon className="size-3.5" />
          Resume Agent
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
