import { Button } from '@/components/ui/button'
import { PROVIDER_OBJECT_COPY, type ProviderDisputeActionProps } from '../provider-object.contracts'

export function ProviderDisputeAction({ dispute, onClose }: ProviderDisputeActionProps) {
  if ((dispute.status !== 'opened' && dispute.status !== 'contested') || onClose === undefined) return null
  return (
    <Button type="button" variant="outline" className="min-h-touch" onClick={() => onClose(dispute)}>
      {PROVIDER_OBJECT_COPY.closeDispute}
    </Button>
  )
}
