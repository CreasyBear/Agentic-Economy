import { Button } from '@/components/ui/button'
import { FieldDescription, FieldError } from '@/components/ui/field'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import type { OnboardingRoleIntent } from '@/modules/principal-account/onboarding.contracts'

import {
  ONBOARDING_ROLE_COPY,
  ONBOARDING_ROLE_REQUIRED,
  type OnboardingRoleStepProps,
} from '../onboarding.contracts'

const BUYER_DESCRIPTION_ID = 'onboarding-role-buyer-description'
const SUPPLIER_DESCRIPTION_ID = 'onboarding-role-supplier-description'
const ROLE_ERROR_ID = 'onboarding-role-error'

const roleCardClassName =
  'min-h-touch cursor-pointer rounded-md border border-border bg-container p-4 hover:bg-muted/60 data-[selected=true]:border-foreground data-[selected=true]:bg-muted enabled:active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none motion-reduce:active:scale-100'

export function OnboardingRoleStep({
  roleIntent,
  roleInvalid,
  buyerRadioRef,
  supplierRadioRef,
  onRoleIntentChange,
  onContinue,
}: OnboardingRoleStepProps) {
  return (
    <div className="grid gap-section">
      <RadioGroup
        value={roleIntent ?? ''}
        onValueChange={(value) => onRoleIntentChange(value as OnboardingRoleIntent)}
        className="grid gap-3"
        aria-invalid={roleInvalid || undefined}
        aria-describedby={roleInvalid ? ROLE_ERROR_ID : undefined}
      >
        <Label className={roleCardClassName} data-selected={roleIntent === 'buyer'}>
          <div className="flex gap-3">
            <RadioGroupItem
              ref={buyerRadioRef}
              value="buyer"
              aria-label={ONBOARDING_ROLE_COPY.buyer.label}
              aria-describedby={BUYER_DESCRIPTION_ID}
              className="mt-1"
            />
            <div className="grid flex-1 gap-1">
              <span className="font-medium text-foreground">
                {ONBOARDING_ROLE_COPY.buyer.label}
              </span>
              <FieldDescription id={BUYER_DESCRIPTION_ID}>
                {ONBOARDING_ROLE_COPY.buyer.description}
              </FieldDescription>
            </div>
          </div>
        </Label>
        <Label className={roleCardClassName} data-selected={roleIntent === 'supplier'}>
          <div className="flex gap-3">
            <RadioGroupItem
              ref={supplierRadioRef}
              value="supplier"
              aria-label={ONBOARDING_ROLE_COPY.supplier.label}
              aria-describedby={SUPPLIER_DESCRIPTION_ID}
              className="mt-1"
            />
            <div className="grid flex-1 gap-1">
              <span className="font-medium text-foreground">
                {ONBOARDING_ROLE_COPY.supplier.label}
              </span>
              <FieldDescription id={SUPPLIER_DESCRIPTION_ID}>
                {ONBOARDING_ROLE_COPY.supplier.description}
              </FieldDescription>
            </div>
          </div>
        </Label>
      </RadioGroup>
      {roleInvalid ? (
        <FieldError id={ROLE_ERROR_ID}>{ONBOARDING_ROLE_REQUIRED}</FieldError>
      ) : null}
      <Button type="button" className="min-h-touch w-full" onClick={onContinue}>
        Continue
      </Button>
    </div>
  )
}
