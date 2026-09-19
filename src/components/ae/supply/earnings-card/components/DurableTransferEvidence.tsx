import { Button } from '@/components/ui/button'
import { AeFactList } from '@/components/ae/data/AeFactList'

import type { DurableTransferEvidenceProps } from '../earnings-card.contracts'

export type DurableTransferEvidenceComponentProps = DurableTransferEvidenceProps

export function DurableTransferEvidence({
  facts,
  recoveryGuidance,
  canReadRecordedTransfer,
  refreshBusy,
  actionsDisabled,
  onRefresh,
}: DurableTransferEvidenceComponentProps) {
  return (
    <details className="grid gap-2">
      <summary className="flex min-h-touch cursor-pointer items-center text-sm font-medium text-foreground">
        Durable transfer evidence
      </summary>
      <AeFactList facts={[...facts]} />
      {recoveryGuidance === undefined ? null : (
        <p className="m-0 text-sm text-muted-foreground">
          {recoveryGuidance}
        </p>
      )}
      {canReadRecordedTransfer ? (
        <Button
          type="button"
          variant="secondary"
          className="min-h-touch w-fit"
          disabled={actionsDisabled}
          onClick={() => void onRefresh()}
        >
          {refreshBusy
            ? 'Refreshing recorded status…'
            : 'Refresh recorded status'}
        </Button>
      ) : null}
    </details>
  )
}
