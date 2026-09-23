import { AeConfirmDialog, TACTILE } from '@/components/ae/feedback/AeConfirmDialog'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'

import {
  lifecycleConfirmLabel,
  lifecycleDialogDescription,
  lifecycleDialogTitle,
  revocationModeOptions,
} from '../agent-lifecycle-copy'
import type { AgentLifecycleConfirmDialogProps, RevocationMode } from '../agent-operator-console.contracts'

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
              <RadioGroup
                value={revocationMode}
                onValueChange={(val) => onRevocationModeChange(val as RevocationMode)}
                className="grid gap-2"
                aria-label="Revocation mode"
              >
                {revocationModeOptions.map((option) => {
                  const selected = revocationMode === option.id
                  const optionId = `revoke-mode-${option.id}`
                  return (
                    <Label
                      key={option.id}
                      htmlFor={optionId}
                      className={cn(
                        'cursor-pointer rounded-md border p-3 text-left text-sm',
                        selected ? 'border-foreground bg-muted' : 'border-border bg-background',
                        TACTILE,
                      )}
                    >
                      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3">
                        <RadioGroupItem value={option.id} id={optionId} className="mt-0.5" />
                        <div className="grid gap-0.5">
                          <p className="font-medium text-foreground">{option.title}</p>
                          <p className="text-xs text-muted-foreground">{option.detail}</p>
                        </div>
                      </div>
                    </Label>
                  )
                })}
              </RadioGroup>
            ),
          })}
    />
  )
}
