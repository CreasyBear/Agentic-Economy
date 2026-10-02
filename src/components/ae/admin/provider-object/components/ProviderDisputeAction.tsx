import { Button } from '@/components/arc/button/button'
import { PROVIDER_OBJECT_COPY, type ProviderDisputeActionProps } from '../provider-object.contracts'

export function ProviderDisputeAction({ dispute, onClose }: ProviderDisputeActionProps) {
  if ((dispute.status !== 'opened' && dispute.status !== 'contested') || onClose === undefined) return null
  return (
    <Button type="button" variant="secondary" size="md" className="arc-market" onClick={() => onClose(dispute)}>
      {PROVIDER_OBJECT_COPY.closeDispute}
    </Button>
  )
}
