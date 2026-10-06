import { AeSupplierOnboardingWizard } from '@/components/ae/supply/supplier-onboarding-wizard/AeSupplierOnboardingWizard'
import { AeAlert } from '@/components/ae/shared/arc/alert/AeAlert'
import { Button } from '@/components/arc/button/button'
import type { WorkspaceInventoryGateProps } from '../provider-workspace.contracts'

export function WorkspaceInventoryGate(props: WorkspaceInventoryGateProps) {
  if (props.kind === 'not_found') {
    return (
      <div className="grid gap-6">
        <AeSupplierOnboardingWizard
          currentStep="profile"
          onSaveProfile={props.onSaveProfile}
        />
      </div>
    )
  }
  if (props.kind === 'conflict') {
    return (
      <AeAlert tone="danger" title="Provider identity needs attention">AE found conflicting provider ownership and will not select one automatically.</AeAlert>
    )
  }
  return (
    <AeAlert tone="danger" title="Tools could not be loaded" className="arc-market"><div className="flex flex-wrap items-center gap-3">
        <span>Nothing was charged.</span>
        <Button type="button" variant="secondary" size="md" disabled={props.refreshPending} onClick={props.onRefresh}>
          {props.refreshPending ? 'Trying again…' : 'Try again'}
        </Button>
      </div></AeAlert>
  )
}
