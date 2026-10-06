import { ArrowRightIcon } from 'lucide-react'
import { useEffect } from 'react'

import { Button } from '@/components/arc/button/button'
import { AeAlert } from '@/components/ae/shared/arc/alert/AeAlert'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'

import type { ProviderIdentityFieldsProps } from '../supplier-onboarding-wizard.contracts'
import '../ProviderIdentityComposition.css'

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
    <form onSubmit={(e) => void onSubmit(e)} className="arc-market arc-provider-identity-form">
      <AeAlert role="alert" tone="info" title="Step 1: Business Profile & Tax Facts" className="arc-provider-identity-notice"><div className="arc-provider-identity-notice-description">
          Define your public supplier brand and verify your Australian tax registration for invoice compliance.
        </div></AeAlert>

      <FieldGroup className="arc-provider-identity-fields">
        <Field className="arc-provider-identity-field" data-invalid={invalidField === 'name' || undefined}>
          <FieldLabel htmlFor="supplier-name" className="arc-provider-identity-label">
            Provider or brand name
          </FieldLabel>
          <input
            data-slot="input"
            className="arc-provider-identity-input"
            id="supplier-name"
            value={name}
            disabled={pending}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="e.g. Acme AI Systems"
            aria-invalid={invalidField === 'name' || undefined}
            aria-describedby={invalidField === 'name' ? errorDescribedBy : undefined}
          />
          <FieldDescription className="arc-provider-identity-description">
            The public name displayed on Tool cards and invoices.
          </FieldDescription>
        </Field>

        <Field className="arc-provider-identity-field" data-invalid={invalidField === 'website' || undefined}>
          <FieldLabel htmlFor="supplier-website" className="arc-provider-identity-label">
            Provider Website (HTTPS)
          </FieldLabel>
          <input
            data-slot="input"
            className="arc-provider-identity-input arc-provider-identity-mono"
            id="supplier-website"
            type="url"
            value={website}
            disabled={pending}
            onChange={(e) => onWebsiteChange(e.target.value)}
            placeholder="https://api.acme.example.com"
            aria-invalid={invalidField === 'website' || undefined}
            aria-describedby={invalidField === 'website' ? errorDescribedBy : undefined}
          />
          <FieldDescription className="arc-provider-identity-description">
            The secure endpoint origin that controls your capability supply.
          </FieldDescription>
        </Field>

        <Field className="arc-provider-identity-field" data-invalid={invalidField === 'abn' || undefined}>
          <FieldLabel htmlFor="supplier-abn" className="arc-provider-identity-label">
            Australian Business Number (ABN)
          </FieldLabel>
          <input
            data-slot="input"
            className="arc-provider-identity-input arc-provider-identity-abn"
            id="supplier-abn"
            value={abn}
            disabled={pending}
            onChange={(e) => onAbnChange(e.target.value)}
            placeholder="51 824 753 556"
            aria-invalid={invalidField === 'abn' || undefined}
            aria-describedby={invalidField === 'abn' ? errorDescribedBy : undefined}
          />
          <FieldDescription className="arc-provider-identity-description">
            Your 11-digit ABN for GST attribution and Australian Tax Invoice issuance.
          </FieldDescription>
        </Field>
      </FieldGroup>

      <div className="arc-provider-identity-footer">
        <Button
          variant="primary"
          size="md"
          type="submit"
          disabled={pending}
          className="arc-provider-identity-submit"
        >
          <span>{pending ? 'Saving profile...' : 'Continue to Add Tool'}</span>
          <ArrowRightIcon className="size-4" />
        </Button>
      </div>
    </form>
  )
}
