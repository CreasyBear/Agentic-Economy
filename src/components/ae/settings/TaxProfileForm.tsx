import { Field as BaseField } from '@base-ui/react/field'
import { useState, type FormEvent, type ReactElement } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TACTILE } from '@/components/ae/settings/OwnerNotificationSettings'
import { toast } from '@/lib/ui/toast'
import { cn } from '@/lib/utils'
import { formatAbnDisplay, isValidAbn, normalizeAbn } from '@/modules/money/public'
import {
  TAX_PROFILE_SUBMIT_FAILURE_DIAGNOSTIC,
  TAX_PROFILE_VALIDATION_DIAGNOSTIC,
  type TaxProfileInitialData,
  type TaxProfileSubmitPayload,
} from '@/modules/money/tax-profile.view-model'

export type TaxProfileFormProps = Readonly<{
  initialData: TaxProfileInitialData
  onSubmit: (payload: TaxProfileSubmitPayload) => void | Promise<void>
  isSubmitting?: boolean
}>

export function TaxProfileForm({
  initialData,
  onSubmit,
  isSubmitting = false,
}: TaxProfileFormProps): ReactElement {
  const isAvailable = initialData.kind === 'available'

  const [legalName, setLegalName] = useState(isAvailable ? initialData.legalName : '')
  const [abn, setAbn] = useState(isAvailable ? formatAbnDisplay(initialData.abn) : '')
  const [addressLine1, setAddressLine1] = useState(isAvailable ? initialData.addressLine1 : '')
  const [addressLine2, setAddressLine2] = useState(isAvailable ? (initialData.addressLine2 ?? '') : '')
  const [locality, setLocality] = useState(isAvailable ? initialData.locality : '')
  const [region, setRegion] = useState(isAvailable ? (initialData.region ?? '') : '')
  const [postalCode, setPostalCode] = useState(isAvailable ? initialData.postalCode : '')
  const [internalSubmitting, setInternalSubmitting] = useState(false)
  const [submitDiagnostic, setSubmitDiagnostic] = useState<typeof TAX_PROFILE_SUBMIT_FAILURE_DIAGNOSTIC | null>(null)

  const normalizedAbn = normalizeAbn(abn)
  const isAbnDirty = abn.trim().length > 0
  const isAbnValid = isValidAbn(normalizedAbn)

  const isLegalNameValid = legalName.trim().length > 0
  const isAddressValid =
    addressLine1.trim().length > 0
    && locality.trim().length > 0
    && /^\d{4}$/u.test(postalCode.trim())

  const hasStarted =
    legalName.trim().length > 0
    || isAbnDirty
    || addressLine1.trim().length > 0
    || locality.trim().length > 0
    || postalCode.trim().length > 0

  const showValidationDiagnostic =
    hasStarted
    && !isSubmitting
    && !internalSubmitting
    && (!isLegalNameValid || !isAbnValid || !isAddressValid)

  const canSave =
    isLegalNameValid
    && isAbnValid
    && isAddressValid
    && !isSubmitting
    && !internalSubmitting

  const submitting = isSubmitting || internalSubmitting

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSave) return

    const payload: TaxProfileSubmitPayload = {
      abn: normalizedAbn,
      legalName: legalName.trim(),
      addressLine1: addressLine1.trim(),
      ...(addressLine2.trim().length > 0 ? { addressLine2: addressLine2.trim() } : {}),
      locality: locality.trim(),
      ...(region.trim().length > 0 ? { region: region.trim() } : {}),
      postalCode: postalCode.trim(),
      country: 'AU',
      expectedRevision: initialData.revision,
    }

    setInternalSubmitting(true)
    setSubmitDiagnostic(null)

    void Promise.resolve(onSubmit(payload))
      .then(() => {
        toast.success('Billing & tax profile updated')
      })
      .catch(() => {
        setSubmitDiagnostic(TAX_PROFILE_SUBMIT_FAILURE_DIAGNOSTIC)
        toast.error('Billing & tax profile was not saved')
      })
      .finally(() => {
        setInternalSubmitting(false)
      })
  }

  const activeDiagnostic = submitDiagnostic ?? (showValidationDiagnostic ? TAX_PROFILE_VALIDATION_DIAGNOSTIC : null)

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 max-w-lg">
      <BaseField.Root className="grid gap-1">
        <Label htmlFor="tax-profile-legal-name" className="text-xs text-foreground">
          Legal business name
        </Label>
        <Input
          id="tax-profile-legal-name"
          type="text"
          value={legalName}
          onChange={(event) => {
            setLegalName(event.target.value)
            setSubmitDiagnostic(null)
          }}
          placeholder="Acme Technologies Pty Ltd"
          className="text-xs"
        />
      </BaseField.Root>

      <BaseField.Root className="grid gap-1">
        <Label htmlFor="tax-profile-abn" className="text-xs text-foreground">
          ABN
        </Label>
        <Input
          id="tax-profile-abn"
          type="text"
          inputMode="numeric"
          value={abn}
          onChange={(event) => {
            setAbn(formatAbnDisplay(event.target.value))
            setSubmitDiagnostic(null)
          }}
          placeholder="51 824 753 556"
          className="font-mono text-xs tabular-nums"
        />
      </BaseField.Root>

      <BaseField.Root className="grid gap-1">
        <Label htmlFor="tax-profile-address" className="text-xs text-foreground">
          Address
        </Label>
        <Input
          id="tax-profile-address"
          type="text"
          value={addressLine1}
          onChange={(event) => {
            setAddressLine1(event.target.value)
            setSubmitDiagnostic(null)
          }}
          placeholder="1 Market Street"
          className="text-xs"
        />
      </BaseField.Root>

      <BaseField.Root className="grid gap-1">
        <Label htmlFor="tax-profile-address-2" className="text-xs text-foreground">
          Address line 2 (optional)
        </Label>
        <Input
          id="tax-profile-address-2"
          type="text"
          value={addressLine2}
          onChange={(event) => {
            setAddressLine2(event.target.value)
            setSubmitDiagnostic(null)
          }}
          placeholder="Suite 400"
          className="text-xs"
        />
      </BaseField.Root>

      <div className="grid grid-cols-2 gap-3">
        <BaseField.Root className="grid gap-1">
          <Label htmlFor="tax-profile-city" className="text-xs text-foreground">
            City/Locality
          </Label>
          <Input
            id="tax-profile-city"
            type="text"
            value={locality}
            onChange={(event) => {
              setLocality(event.target.value)
              setSubmitDiagnostic(null)
            }}
            placeholder="Sydney"
            className="text-xs"
          />
        </BaseField.Root>

        <BaseField.Root className="grid gap-1">
          <Label htmlFor="tax-profile-state" className="text-xs text-foreground">
            State/Region
          </Label>
          <Input
            id="tax-profile-state"
            type="text"
            value={region}
            onChange={(event) => {
              setRegion(event.target.value)
              setSubmitDiagnostic(null)
            }}
            placeholder="NSW"
            className="text-xs"
          />
        </BaseField.Root>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <BaseField.Root className="grid gap-1">
          <Label htmlFor="tax-profile-postal-code" className="text-xs text-foreground">
            Postal code
          </Label>
          <Input
            id="tax-profile-postal-code"
            type="text"
            value={postalCode}
            onChange={(event) => {
              setPostalCode(event.target.value)
              setSubmitDiagnostic(null)
            }}
            placeholder="2000"
            className="text-xs"
          />
        </BaseField.Root>

        <BaseField.Root className="grid gap-1">
          <Label htmlFor="tax-profile-country" className="text-xs text-foreground">
            Country
          </Label>
          <Input
            id="tax-profile-country"
            type="text"
            value="AU"
            readOnly
            className="bg-muted text-xs text-muted-foreground"
          />
        </BaseField.Root>
      </div>

      <div className="min-h-[2.5rem]" role="status" aria-live="polite">
        {activeDiagnostic ? (
          <div className="grid gap-1 text-sm text-muted-foreground">
            <p>
              <strong>What happened:</strong> {activeDiagnostic.whatHappened}
            </p>
            <p className="font-mono text-xs tabular-nums">
              <strong>Financial impact:</strong> {activeDiagnostic.financialImpact}
            </p>
            <p>
              <strong>Next step:</strong> {activeDiagnostic.nextStep}
            </p>
          </div>
        ) : null}
      </div>

      <div className="pt-2">
        <Button
          type="submit"
          disabled={!canSave}
          className={cn('min-h-touch text-xs', TACTILE)}
        >
          {submitting ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </form>
  )
}
