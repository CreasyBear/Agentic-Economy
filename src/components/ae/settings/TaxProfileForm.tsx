import { useState, type FormEvent, type ReactElement } from 'react'

import { isValidAbn, normalizeAbn } from '@/modules/money/public'

export type TaxProfileInitialData =
  | Readonly<{ kind: 'missing'; revision: 0 }>
  | Readonly<{
      kind: 'available'
      abn: string
      legalName: string
      addressLine1: string
      addressLine2?: string
      locality: string
      region?: string
      postalCode: string
      country: 'AU'
      revision: number
    }>

export type TaxProfileSubmitPayload = Readonly<{
  abn: string
  legalName: string
  addressLine1: string
  addressLine2?: string
  locality: string
  region?: string
  postalCode: string
  country: 'AU'
  expectedRevision: number
}>

export type TaxProfileFormProps = Readonly<{
  initialData: TaxProfileInitialData
  onSubmit: (payload: TaxProfileSubmitPayload) => void
  isSubmitting?: boolean
}>

function formatAbnDisplay(digits: string): string {
  const clean = digits.replace(/\D/gu, '')
  if (clean.length <= 2) return clean
  if (clean.length <= 5) return `${clean.slice(0, 2)} ${clean.slice(2)}`
  if (clean.length <= 8) return `${clean.slice(0, 2)} ${clean.slice(2, 5)} ${clean.slice(5)}`
  return `${clean.slice(0, 2)} ${clean.slice(2, 5)} ${clean.slice(5, 8)} ${clean.slice(8, 11)}`
}

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

  const normalizedAbn = normalizeAbn(abn)
  const isAbnDirty = abn.trim().length > 0
  const isAbnValid = isValidAbn(normalizedAbn)
  const isAbnInvalid = isAbnDirty && !isAbnValid

  const isLegalNameValid = legalName.trim().length > 0
  const isAddressValid =
    addressLine1.trim().length > 0
    && locality.trim().length > 0
    && /^\d{4}$/u.test(postalCode.trim())

  const canSave =
    isLegalNameValid
    && isAbnValid
    && isAddressValid
    && !isSubmitting

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSave) return

    onSubmit({
      abn: normalizedAbn,
      legalName: legalName.trim(),
      addressLine1: addressLine1.trim(),
      ...(addressLine2.trim().length > 0 ? { addressLine2: addressLine2.trim() } : {}),
      locality: locality.trim(),
      ...(region.trim().length > 0 ? { region: region.trim() } : {}),
      postalCode: postalCode.trim(),
      country: 'AU',
      expectedRevision: initialData.revision,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 max-w-lg">
      <div className="grid gap-1">
        <label htmlFor="tax-profile-legal-name" className="block text-xs font-medium text-foreground">
          Legal business name
        </label>
        <input
          id="tax-profile-legal-name"
          type="text"
          value={legalName}
          onChange={(event) => setLegalName(event.target.value)}
          placeholder="Acme Technologies Pty Ltd"
          className="w-full border border-border bg-container px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div className="grid gap-1">
        <label htmlFor="tax-profile-abn" className="block text-xs font-medium text-foreground">
          ABN
        </label>
        <input
          id="tax-profile-abn"
          type="text"
          value={abn}
          onChange={(event) => setAbn(event.target.value)}
          placeholder="51 824 753 556"
          className="w-full border border-border bg-container px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        {isAbnInvalid ? (
          <p className="text-xs text-destructive">Invalid ABN checksum</p>
        ) : null}
      </div>

      <div className="grid gap-1">
        <label htmlFor="tax-profile-address" className="block text-xs font-medium text-foreground">
          Address
        </label>
        <input
          id="tax-profile-address"
          type="text"
          value={addressLine1}
          onChange={(event) => setAddressLine1(event.target.value)}
          placeholder="1 Market Street"
          className="w-full border border-border bg-container px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div className="grid gap-1">
        <label htmlFor="tax-profile-address-2" className="block text-xs font-medium text-foreground">
          Address line 2 (optional)
        </label>
        <input
          id="tax-profile-address-2"
          type="text"
          value={addressLine2}
          onChange={(event) => setAddressLine2(event.target.value)}
          placeholder="Suite 400"
          className="w-full border border-border bg-container px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1">
          <label htmlFor="tax-profile-city" className="block text-xs font-medium text-foreground">
            City/Locality
          </label>
          <input
            id="tax-profile-city"
            type="text"
            value={locality}
            onChange={(event) => setLocality(event.target.value)}
            placeholder="Sydney"
            className="w-full border border-border bg-container px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div className="grid gap-1">
          <label htmlFor="tax-profile-state" className="block text-xs font-medium text-foreground">
            State/Region
          </label>
          <input
            id="tax-profile-state"
            type="text"
            value={region}
            onChange={(event) => setRegion(event.target.value)}
            placeholder="NSW"
            className="w-full border border-border bg-container px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1">
          <label htmlFor="tax-profile-postal-code" className="block text-xs font-medium text-foreground">
            Postal code
          </label>
          <input
            id="tax-profile-postal-code"
            type="text"
            value={postalCode}
            onChange={(event) => setPostalCode(event.target.value)}
            placeholder="2000"
            className="w-full border border-border bg-container px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div className="grid gap-1">
          <label htmlFor="tax-profile-country" className="block text-xs font-medium text-foreground">
            Country
          </label>
          <input
            id="tax-profile-country"
            type="text"
            value="AU"
            readOnly
            className="w-full border border-border bg-muted px-3 py-1.5 text-xs text-muted-foreground focus:outline-none"
          />
        </div>
      </div>

      <div className="pt-2">
        <button
          type="submit"
          disabled={!canSave}
          className="border border-border bg-foreground px-4 py-1.5 text-xs font-medium text-background hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? 'Saving...' : 'Save'}
        </button>
      </div>
    </form>
  )
}
