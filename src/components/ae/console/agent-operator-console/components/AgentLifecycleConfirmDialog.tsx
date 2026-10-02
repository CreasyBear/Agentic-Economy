import { AeConfirmDialog } from '@/components/ae/feedback/AeConfirmDialog'

import {
  lifecycleConfirmLabel,
  lifecycleDialogDescription,
  lifecycleDialogTitle,
} from '../agent-lifecycle-copy'
import type { AgentLifecycleConfirmDialogProps } from '../agent-operator-console.contracts'

export function AgentLifecycleConfirmDialog({
  lifecycleTarget,
  revokePending,
  revokeDiagnostic,
  revokeTriggerRef,
  onOpenChange,
  onConfirm,
}: AgentLifecycleConfirmDialogProps) {
  return (
    <AeConfirmDialog
      open={lifecycleTarget !== undefined}
      onOpenChange={onOpenChange}
      title={lifecycleDialogTitle(lifecycleTarget)}
      description={lifecycleDialogDescription(lifecycleTarget)}
      confirmLabel={lifecycleTarget === undefined
        ? 'Confirm'
        : lifecycleConfirmLabel(lifecycleTarget.kind)}
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
          })}
    />
  )
}
