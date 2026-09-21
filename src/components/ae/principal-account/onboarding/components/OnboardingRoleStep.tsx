import { Button } from '@/components/ui/button'
import { FieldDescription } from '@/components/ui/field'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import type { OnboardingRoleIntent } from '@/modules/principal-account/onboarding.contracts'

import type { OnboardingRoleStepProps } from '../onboarding.contracts'

const roleCardClassName =
  'min-h-touch cursor-pointer rounded-md border border-border bg-container p-4 hover:bg-muted/60 data-[selected=true]:border-foreground data-[selected=true]:bg-muted enabled:active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none motion-reduce:active:scale-100'

export function OnboardingRoleStep({
  roleIntent,
  continueDisabled,
  onRoleIntentChange,
  onContinue,
}: OnboardingRoleStepProps) {
  return (
    <div className="grid gap-section">
      <RadioGroup
        value={roleIntent ?? ''}
        onValueChange={(value) => onRoleIntentChange(value as OnboardingRoleIntent)}
        className="grid gap-3"
      >
        <Label className={roleCardClassName} data-selected={roleIntent === 'buyer'}>
          <div className="flex gap-3">
            <RadioGroupItem value="buyer" aria-label="Buyer / Agent Operator" className="mt-1" />
            <div className="grid flex-1 gap-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-foreground">Buyer / Agent Operator</span>
                <kbd className="text-xs text-muted-foreground font-mono">1</kbd>
              </div>
              <FieldDescription>
                Discover Tools, run Calls, and manage spending for your agents.
              </FieldDescription>
            </div>
          </div>
        </Label>
        <Label className={roleCardClassName} data-selected={roleIntent === 'supplier'}>
          <div className="flex gap-3">
            <RadioGroupItem value="supplier" aria-label="Tool Provider" className="mt-1" />
            <div className="grid flex-1 gap-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-foreground">Tool Provider</span>
                <kbd className="text-xs text-muted-foreground font-mono">2</kbd>
              </div>
              <FieldDescription>
                Publish Tools, connect sources, and manage Provider operations.
              </FieldDescription>
            </div>
          </div>
        </Label>
      </RadioGroup>
      <Button
        type="button"
        className="min-h-touch w-full"
        disabled={continueDisabled}
        onClick={onContinue}
      >
        Continue
      </Button>
    </div>
  )
}
