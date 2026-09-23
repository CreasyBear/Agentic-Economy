import { AeSupplierOnboardingWizard } from '@/components/ae/supply/supplier-onboarding-wizard/AeSupplierOnboardingWizard'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
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
      <Alert variant="destructive">
        <AlertTitle>Provider identity needs attention</AlertTitle>
        <AlertDescription>AE found conflicting provider ownership and will not select one automatically.</AlertDescription>
      </Alert>
    )
  }
  return (
    <Alert variant="destructive">
      <AlertTitle>Tools could not be loaded</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center gap-3">
        <span>Nothing was charged.</span>
        <Button type="button" variant="secondary" disabled={props.refreshPending} onClick={props.onRefresh}>
          {props.refreshPending ? 'Trying again…' : 'Try again'}
        </Button>
      </AlertDescription>
    </Alert>
  )
}
