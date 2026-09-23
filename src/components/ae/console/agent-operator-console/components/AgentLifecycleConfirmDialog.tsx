import { AeConfirmDialog, TACTILE } from '@/components/ae/feedback/AeConfirmDialog'
import { cn } from '@/lib/utils'

import {
  lifecycleConfirmLabel,
  lifecycleDialogDescription,
  lifecycleDialogTitle,
  revocationModeOptions,
} from '../agent-lifecycle-copy'
import type { AgentLifecycleConfirmDialogProps } from '../agent-operator-console.contracts'

export function AgentLifecycleConfirmDialog({
  lifecycleTarget,
  revocationMode,
  revokePending,
  revokeDiagnostic,
  revokeTriggerRef,
  onOpenChange,
  onConfirm,
  onRevocationModeChange,
}: AgentLifecycleConfirmDialogProps) {
  return (
    <AeConfirmDialog
      open={lifecycleTarget !== undefined}
      onOpenChange={onOpenChange}
      title={lifecycleDialogTitle(lifecycleTarget)}
      description={lifecycleDialogDescription(lifecycleTarget)}
      confirmLabel={lifecycleTarget === undefined
        ? 'Confirm'
        : lifecycleConfirmLabel(lifecycleTarget.kind, revocationMode)}
      confirmVariant="destructive"
      pending={revokePending}
      onConfirm={onConfirm}
      returnFocusRef={revokeTriggerRef}
      {...(lifecycleTarget === undefined
        ? {}
        : {
            financialImpact: (
              <>
                <span className="font-mono tabular-nums">A$0.00</span>
                {' unreleased holds remain protected — in-flight calls finish or release immediately'}
              </>
            ),
            diagnostic: revokeDiagnostic,
            children: (
              <div className="grid gap-2" role="group" aria-label="Revocation mode">
                {revocationModeOptions.map((option) => {
                  const selected = revocationMode === option.id
                  return (
                    <div
                      key={option.id}
                      role="button"
                      tabIndex={-1}
                      aria-pressed={selected}
                      className={cn(
                        'cursor-pointer rounded-md border p-3 text-left text-sm',
                        selected ? 'border-foreground bg-muted' : 'border-border bg-background',
                        TACTILE,
                      )}
                      onClick={() => onRevocationModeChange(option.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          onRevocationModeChange(option.id)
                        }
                      }}
                    >
                      <p className="font-medium text-foreground">{option.title}</p>
                      <p className="text-xs text-muted-foreground">{option.detail}</p>
                    </div>
                  )
                })}
              </div>
            ),
          })}
    />
  )
}
