import { ArrowRightIcon } from 'lucide-react'
import { useEffect } from 'react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

import {
  ABN_INPUT_CLASS,
  TACTILE,
} from '../supplier-onboarding-wizard.contracts'
import type { ProviderIdentityFieldsProps } from '../supplier-onboarding-wizard.contracts'

/** Shared Rule 4 diagnostic region in AeSupplierOnboardingWizard. */
export const SUPPLIER_IDENTITY_ERROR_ID = 'supplier-identity-error'

const FIELD_IDS = {
  name: 'supplier-name',
  website: 'supplier-website',
  abn: 'supplier-abn',
} as const

export function ProviderIdentityFields({
  name,
  website,
  abn,
  pending,
  invalidField,
  fieldError,
  onNameChange,
  onWebsiteChange,
  onAbnChange,
  onSubmit,
}: ProviderIdentityFieldsProps) {
  useEffect(() => {
    if (invalidField === undefined || fieldError === undefined) return
    document.getElementById(FIELD_IDS[invalidField])?.focus()
  }, [invalidField, fieldError])

  const errorDescribedBy =
    invalidField !== undefined && fieldError !== undefined
      ? SUPPLIER_IDENTITY_ERROR_ID
      : undefined

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4">
      <Alert className="border-border bg-muted/40 py-2.5">
        <AlertTitle className="text-xs font-semibold">Step 1: Business Profile & Tax Facts</AlertTitle>
        <AlertDescription className="text-xs text-muted-foreground">
          Define your public supplier brand and verify your Australian tax registration for invoice compliance.
        </AlertDescription>
      </Alert>

      <FieldGroup className="grid gap-3">
        <Field data-invalid={invalidField === 'name' || undefined}>
          <FieldLabel htmlFor="supplier-name" className="text-xs">
            Provider or brand name
          </FieldLabel>
          <Input
            id="supplier-name"
            value={name}
            disabled={pending}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="e.g. Acme AI Systems"
            aria-invalid={invalidField === 'name' || undefined}
            aria-describedby={invalidField === 'name' ? errorDescribedBy : undefined}
          />
          <FieldDescription className="text-[11px]">
            The public name displayed on Tool cards and invoices.
          </FieldDescription>
        </Field>

        <Field data-invalid={invalidField === 'website' || undefined}>
          <FieldLabel htmlFor="supplier-website" className="text-xs">
            Provider Website (HTTPS)
          </FieldLabel>
          <Input
            id="supplier-website"
            type="url"
            value={website}
            disabled={pending}
            onChange={(e) => onWebsiteChange(e.target.value)}
            placeholder="https://api.acme.example.com"
            className="font-mono"
            aria-invalid={invalidField === 'website' || undefined}
            aria-describedby={invalidField === 'website' ? errorDescribedBy : undefined}
          />
          <FieldDescription className="text-[11px]">
            The secure endpoint origin that controls your capability supply.
          </FieldDescription>
        </Field>

        <Field data-invalid={invalidField === 'abn' || undefined}>
          <FieldLabel htmlFor="supplier-abn" className="text-xs">
            Australian Business Number (ABN)
          </FieldLabel>
          <Input
            id="supplier-abn"
            value={abn}
            disabled={pending}
            onChange={(e) => onAbnChange(e.target.value)}
            placeholder="51 824 753 556"
            className={ABN_INPUT_CLASS}
            aria-invalid={invalidField === 'abn' || undefined}
            aria-describedby={invalidField === 'abn' ? errorDescribedBy : undefined}
          />
          <FieldDescription className="text-[11px]">
            Your 11-digit ABN for GST attribution and Australian Tax Invoice issuance.
          </FieldDescription>
        </Field>
      </FieldGroup>

      <div className="flex justify-end pt-2">
        <Button
          type="submit"
          disabled={pending}
          className={`gap-2 min-h-touch ${TACTILE}`}
        >
          <span>{pending ? 'Saving profile...' : 'Continue to Add Tool'}</span>
          <ArrowRightIcon className="size-4" />
        </Button>
      </div>
    </form>
  )
}
