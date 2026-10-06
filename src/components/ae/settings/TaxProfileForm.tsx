import { useEffect, useRef, useState, type FormEvent, type ReactElement } from 'react'
import { AeNavigationSafetyBoundary } from '@/components/ae/layout/AeNavigationSafetyBoundary'
import { SettingsGroup, SettingsPage, SettingsRow } from '@/components/ae/settings/settings-shell/components/SettingsSections'
import { SettingsSaveBar } from '@/components/arc/blocks/settings-page/settings-page'
import './TaxProfileComposition.css'

import { AeAlert as Alert } from '@/components/ae/shared/arc/alert/AeAlert'
import { Button } from '@/components/arc/button/button'
import { Checkbox } from '@/components/arc/checkbox/checkbox'
import { Input } from '@/components/arc/input/input'
import { toast } from '@/lib/ui/toast'
import { formatAbnDisplay, isValidAbn, normalizeAbn } from '@/modules/money/public'
import {
  TAX_PROFILE_SUBMIT_FAILURE_DIAGNOSTIC,
  taxProfileValidationDiagnostic,
  type TaxProfileInitialData,
  type TaxProfileInvalidField,
  type TaxProfileSubmitPayload,
} from '@/modules/money/tax-profile.view-model'

export type TaxProfileFormProps = Readonly<{
  initialData: TaxProfileInitialData
  onSubmit: (payload: TaxProfileSubmitPayload) => void | Promise<void>
  isSubmitting?: boolean
}>

const TAX_PROFILE_DIAGNOSTIC_ID = 'tax-profile-diagnostic'

function taxProfileSnapshot(value: Readonly<{
  legalName: string
  abn: string
  gstRegistered: boolean
  addressLine1: string
  addressLine2: string
  locality: string
  region: string
  postalCode: string
}>): string {
  return JSON.stringify({
    legalName: value.legalName.trim(),
    abn: normalizeAbn(value.abn),
    gstRegistered: value.gstRegistered,
    addressLine1: value.addressLine1.trim(),
    addressLine2: value.addressLine2.trim(),
    locality: value.locality.trim(),
    region: value.region.trim(),
    postalCode: value.postalCode.trim(),
  })
}

function changedTaxProfileFieldCount(currentSnapshot: string, baselineSnapshot: string): number {
  const current = JSON.parse(currentSnapshot) as Record<string, string | boolean>
  const baseline = JSON.parse(baselineSnapshot) as Record<string, string | boolean>
  return Object.keys(current).reduce(
    (count, field) => count + (current[field] === baseline[field] ? 0 : 1),
    0,
  )
}

export function TaxProfileForm({
  initialData,
  onSubmit,
  isSubmitting = false,
}: TaxProfileFormProps): ReactElement {
  const isAvailable = initialData.kind === 'available'

  const [legalName, setLegalName] = useState(isAvailable ? initialData.legalName : '')
  const [abn, setAbn] = useState(isAvailable ? formatAbnDisplay(initialData.abn) : '')
  const [gstRegistered, setGstRegistered] = useState(isAvailable ? (initialData.gstRegistered ?? true) : true)
  const [addressLine1, setAddressLine1] = useState(isAvailable ? initialData.addressLine1 : '')
  const [addressLine2, setAddressLine2] = useState(isAvailable ? (initialData.addressLine2 ?? '') : '')
  const [locality, setLocality] = useState(isAvailable ? initialData.locality : '')
  const [region, setRegion] = useState(isAvailable ? (initialData.region ?? '') : '')
  const [postalCode, setPostalCode] = useState(isAvailable ? initialData.postalCode : '')
  const [internalSubmitting, setInternalSubmitting] = useState(false)
  const [submitDiagnostic, setSubmitDiagnostic] = useState<typeof TAX_PROFILE_SUBMIT_FAILURE_DIAGNOSTIC | null>(null)
  const [invalidField, setInvalidField] = useState<TaxProfileInvalidField | null>(null)
  const [saveOutcome, setSaveOutcome] = useState<'idle' | 'saved' | 'failed'>('idle')
  const [confirmedSnapshot, setConfirmedSnapshot] = useState<string | null>(null)
  const saveRef = useRef<HTMLButtonElement>(null)

  const legalNameRef = useRef<HTMLInputElement>(null)
  const abnRef = useRef<HTMLInputElement>(null)
  const addressRef = useRef<HTMLInputElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)

  const initialSnapshot = taxProfileSnapshot({
    legalName: isAvailable ? initialData.legalName : '',
    abn: isAvailable ? initialData.abn : '',
    gstRegistered: isAvailable ? (initialData.gstRegistered ?? true) : true,
    addressLine1: isAvailable ? initialData.addressLine1 : '',
    addressLine2: isAvailable ? (initialData.addressLine2 ?? '') : '',
    locality: isAvailable ? initialData.locality : '',
    region: isAvailable ? (initialData.region ?? '') : '',
    postalCode: isAvailable ? initialData.postalCode : '',
  })
  useEffect(() => {
    setConfirmedSnapshot(null)
  }, [initialSnapshot])

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

  const submitting = isSubmitting || internalSubmitting

  const firstInvalidField: TaxProfileInvalidField | null = !isLegalNameValid
    ? 'legalName'
    : !isAbnValid
      ? 'abn'
      : !isAddressValid
        ? 'address'
        : null
  const showValidationDiagnostic = !submitting && (invalidField !== null || (hasStarted && firstInvalidField !== null))
  const validationField = invalidField ?? (hasStarted ? firstInvalidField : null)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting) return

    if (!isLegalNameValid) {
      setInvalidField('legalName')
      setSubmitDiagnostic(null)
      legalNameRef.current?.focus()
      return
    }
    if (!isAbnValid) {
      setInvalidField('abn')
      setSubmitDiagnostic(null)
      abnRef.current?.focus()
      return
    }
    if (!isAddressValid) {
      setInvalidField('address')
      setSubmitDiagnostic(null)
      addressRef.current?.focus()
      return
    }

    setInvalidField(null)

    const payload: TaxProfileSubmitPayload = {
      abn: normalizedAbn,
      gstRegistered,
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

    void Promise.resolve()
      .then(() => onSubmit(payload))
      .then(() => {
        setConfirmedSnapshot(taxProfileSnapshot({
          legalName, abn, gstRegistered, addressLine1, addressLine2, locality, region, postalCode,
        }))
        setSaveOutcome('saved')
        toast.success('Billing & tax profile updated')
      })
      .catch(() => {
        setSaveOutcome('failed')
        setSubmitDiagnostic(TAX_PROFILE_SUBMIT_FAILURE_DIAGNOSTIC)
        toast.error('Billing & tax profile was not saved')
      })
      .finally(() => {
        setInternalSubmitting(false)
      })
  }

  const activeDiagnostic = submitDiagnostic ?? (
    showValidationDiagnostic && validationField !== null ? taxProfileValidationDiagnostic(validationField) : null
  )
  const describedBy = showValidationDiagnostic ? TAX_PROFILE_DIAGNOSTIC_ID : undefined

  const currentSnapshot = taxProfileSnapshot({
    legalName, abn, gstRegistered, addressLine1, addressLine2, locality, region, postalCode,
  })
  const baseline = confirmedSnapshot ?? initialSnapshot
  const changedFieldCount = changedTaxProfileFieldCount(currentSnapshot, baseline)
  const dirty = changedFieldCount > 0
  const saveBarState = submitting ? 'saving' : dirty ? 'edit' : saveOutcome === 'saved' ? 'saved' : null

  return (
    <AeNavigationSafetyBoundary
      state={{ dirty, pending: submitting, saveOutcome }}
      title="Leave without saving tax details?"
      pendingTitle="Tax details are still saving"
      description="The tax details you typed will be discarded."
      pendingDescription="Wait until the save finishes. Nothing has been confirmed yet."
      saveActionRef={saveRef}
      headingRef={headingRef}
    >
    <form onSubmit={handleSubmit} className="arc-market arc-tax-profile">
      <SettingsPage title="Tax" description="Keep your Australian business and billing details current." headingRef={headingRef}>
        <SettingsGroup title="Business details" description="These details identify your legal entity for tax purposes.">
          <SettingsRow label="Legal business name" description="The registered name used on billing documents.">
            <Input ref={legalNameRef} id="tax-profile-legal-name" label="Legal business name"
              aria-label="Legal business name" type="text" autoComplete="organization" spellCheck={false} value={legalName}
              aria-invalid={invalidField === 'legalName' || undefined}
              aria-describedby={invalidField === 'legalName' ? describedBy : undefined}
              onChange={(event) => {
                setLegalName(event.target.value)
                setSubmitDiagnostic(null)
                if (invalidField === 'legalName') setInvalidField(null)
              }} className="arc-tax-input" />
          </SettingsRow>
          <SettingsRow label="ABN" description="Your 11-digit Australian Business Number.">
            <Input ref={abnRef} id="tax-profile-abn" label="ABN" aria-label="ABN"
              type="text" inputMode="numeric" value={abn} placeholder="51 824 753 556"
              className="arc-tax-input arc-tax-abn"
              aria-invalid={invalidField === 'abn' || undefined}
              aria-describedby={invalidField === 'abn' ? describedBy : undefined}
              onChange={(event) => {
                setAbn(formatAbnDisplay(event.target.value))
                setSubmitDiagnostic(null)
                if (invalidField === 'abn') setInvalidField(null)
              }} />
          </SettingsRow>
          <SettingsRow label="GST registration" description="Controls whether tax invoices can be issued for this business.">
            <Checkbox label={gstRegistered ? 'Registered' : 'Not registered'} aria-label="GST registered"
              checked={gstRegistered} onCheckedChange={(checked) => setGstRegistered(checked === true)} />
          </SettingsRow>
        </SettingsGroup>
        <SettingsGroup title="Billing address" description="The Australian address used on billing documents.">
          <SettingsRow label="Address" description="Street address of the legal entity.">
            <Input ref={addressRef} id="tax-profile-address" label="Address"
              aria-label="Address" autoComplete="address-line1" value={addressLine1} className="arc-tax-input"
              aria-invalid={invalidField === 'address' || undefined}
              aria-describedby={invalidField === 'address' ? describedBy : undefined}
              onChange={(event) => {
                setAddressLine1(event.target.value)
                setSubmitDiagnostic(null)
                if (invalidField === 'address') setInvalidField(null)
              }} />
          </SettingsRow>
          <SettingsRow label="Address line 2" description="Optional suite, unit, or level.">
            <Input id="tax-profile-address-2" label="Address line 2 (optional)"
              aria-label="Address line 2 (optional)" autoComplete="address-line2" value={addressLine2}
              className="arc-tax-input"
              onChange={(event) => { setAddressLine2(event.target.value); setSubmitDiagnostic(null) }} />
          </SettingsRow>
          <SettingsRow label="City/Locality" description="Your billing locality.">
            <Input id="tax-profile-city" label="City/Locality" aria-label="City/Locality"
              autoComplete="address-level2" value={locality} className="arc-tax-input"
              onChange={(event) => {
                setLocality(event.target.value)
                setSubmitDiagnostic(null)
                if (invalidField === 'address') setInvalidField(null)
              }} />
          </SettingsRow>
          <SettingsRow label="State/Region" description="Australian state or territory.">
            <Input id="tax-profile-state" label="State/Region" aria-label="State/Region"
              autoComplete="address-level1" value={region} className="arc-tax-input"
              onChange={(event) => { setRegion(event.target.value); setSubmitDiagnostic(null) }} />
          </SettingsRow>
          <SettingsRow label="Postal code" description="Four-digit Australian postcode.">
            <Input id="tax-profile-postal-code" label="Postal code" aria-label="Postal code"
              autoComplete="postal-code" inputMode="numeric" value={postalCode} className="arc-tax-input"
              aria-invalid={invalidField === 'address' || undefined}
              aria-describedby={invalidField === 'address' ? describedBy : undefined}
              onChange={(event) => {
                setPostalCode(event.target.value)
                setSubmitDiagnostic(null)
                if (invalidField === 'address') setInvalidField(null)
              }} />
          </SettingsRow>
          <SettingsRow label="Country" description="This tax profile is currently Australian.">
            <Input id="tax-profile-country" label="Country" aria-label="Country" value="AU"
              readOnly className="arc-tax-input arc-tax-country" />
          </SettingsRow>
        </SettingsGroup>
        <div id={TAX_PROFILE_DIAGNOSTIC_ID} role="status" aria-live="polite">
          {activeDiagnostic ? <Alert tone="warning" role="presentation"
            title={`What happened: ${activeDiagnostic.whatHappened}`}>
            <p className="font-mono text-xs tabular-nums"><strong>Financial impact:</strong> {activeDiagnostic.financialImpact}</p>
            <p><strong>Next step:</strong> {activeDiagnostic.nextStep}</p>
          </Alert> : null}
        </div>
      </SettingsPage>
      <SettingsSaveBar
        state={saveBarState}
        count={changedFieldCount}
        savedLabel="Tax details saved"
        focusReturnRef={headingRef}
        placement="sticky"
      >
        <Button variant="primary" size="md" ref={saveRef} type="submit" disabled={submitting} aria-busy={submitting || undefined} className="arc-tax-save">
          {submitting ? 'Saving…' : 'Save'}
        </Button>
      </SettingsSaveBar>
    </form>
    </AeNavigationSafetyBoundary>
  )
}
