import { useEffect, type ReactNode, type Ref } from 'react'
import { AeInlineState } from '@/components/ae/feedback/AeInlineState'
import { AeFactList } from '@/components/ae/data/AeFactList'
import { AeSection } from '@/components/ae/layout/AeSection'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import type { ProviderConnectionOwnerProjection } from '@/modules/capability-supply/provider-connection'
import type { SupplyToolCandidate } from '@/modules/capability-supply/source-preview'
import { TextAreaField, TextField } from './SupplyFieldPrimitives'
import {
  SUPPLY_PUBLICATION_ERROR_ID,
  SUPPLY_PUBLICATION_FIELD_IDS,
  pricingInput,
  publicationPriceSummary,
  type AttestationKey,
  type SupplyPublicationInvalidField,
} from './supply-source-native-start-presentation'

export function SupplyPublicationFlow({
  reviewing,
  name,
  description,
  descriptionSuggestion,
  category,
  serviceArea,
  availability,
  selected,
  pricingKind,
  price,
  connectionRef,
  eligibleConnections,
  connecting,
  externalEffect,
  dataRelease,
  financialExposure,
  dataClassification,
  attestation,
  saving,
  disabled,
  invalidField,
  fieldError,
  headingRef,
  onNameChange,
  onDescriptionChange,
  onCategoryChange,
  onServiceAreaChange,
  onAvailabilityChange,
  onPricingKindChange,
  onPriceChange,
  onConnectionRefChange,
  onConnect,
  onExternalEffectChange,
  onDataReleaseChange,
  onFinancialExposureChange,
  onDataClassificationChange,
  onAttestationChange,
  onContinueToReview,
  onEditTerms,
  onSubmit,
  publishAuthorityRequired,
}: Readonly<{
  reviewing: boolean
  name: string
  description: string
  descriptionSuggestion?: ReactNode
  category: string
  serviceArea: string
  availability: string
  selected: SupplyToolCandidate
  pricingKind: 'free' | 'fixed_aud' | 'source_x402'
  price: string
  connectionRef: string
  eligibleConnections: readonly ProviderConnectionOwnerProjection[]
  connecting: boolean
  externalEffect: boolean
  dataRelease: boolean
  financialExposure: boolean
  dataClassification: 'public' | 'personal' | 'sensitive'
  attestation: Record<AttestationKey, boolean>
  saving: boolean
  disabled: boolean
  invalidField?: SupplyPublicationInvalidField
  fieldError?: string
  headingRef?: Ref<HTMLHeadingElement>
  onNameChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  onCategoryChange: (value: string) => void
  onServiceAreaChange: (value: string) => void
  onAvailabilityChange: (value: string) => void
  onPricingKindChange: (kind: 'free' | 'fixed_aud' | 'source_x402') => void
  onPriceChange: (value: string) => void
  onConnectionRefChange: (value: string) => void
  onConnect: () => void
  onExternalEffectChange: (value: boolean) => void
  onDataReleaseChange: (value: boolean) => void
  onFinancialExposureChange: (value: boolean) => void
  onDataClassificationChange: (value: 'public' | 'personal' | 'sensitive') => void
  onAttestationChange: (key: AttestationKey, checked: boolean) => void
  onContinueToReview: () => void
  onEditTerms: () => void
  onSubmit: () => void
  publishAuthorityRequired: boolean
}>) {
  useEffect(() => {
    if (invalidField === undefined || fieldError === undefined) return
    let focusId: string
    switch (invalidField) {
      case 'category':
        focusId = SUPPLY_PUBLICATION_FIELD_IDS.category
        break
      case 'price':
        focusId = pricingKind === 'fixed_aud'
          ? SUPPLY_PUBLICATION_FIELD_IDS.priceAud
          : SUPPLY_PUBLICATION_FIELD_IDS.priceGroup
        break
      case 'connection':
        focusId = SUPPLY_PUBLICATION_FIELD_IDS.connection
        break
      case 'attestation':
        focusId = publishAuthorityRequired ? SUPPLY_PUBLICATION_FIELD_IDS.attestation : 'supply-attest-accurate'
        break
      case 'candidate':
        return
      default: {
        const _exhaustive: never = invalidField
        void _exhaustive
        return
      }
    }
    document.getElementById(focusId)?.focus()
  }, [invalidField, fieldError, pricingKind, publishAuthorityRequired])

  const errorDescribedBy =
    invalidField !== undefined && fieldError !== undefined
      ? SUPPLY_PUBLICATION_ERROR_ID
      : undefined

  if (!reviewing) return (
    <AeSection title="Terms" description="Review facts derived from the source, then declare only the terms AE owns." {...(headingRef === undefined ? {} : { headingRef })}>
      <FieldGroup className="gap-5">
        <TextField id="supply-native-name" label="Tool name" value={name} disabled={disabled} onChange={onNameChange} description="Shown to agents in discovery." />
        <TextAreaField id="supply-native-description" label="Description" value={description} disabled={disabled} onChange={onDescriptionChange} description="What this Tool does and returns." />
        {descriptionSuggestion}
        <TextField
          id={SUPPLY_PUBLICATION_FIELD_IDS.category}
          label="Category"
          value={category}
          disabled={disabled}
          invalid={invalidField === 'category'}
          {...(errorDescribedBy === undefined ? {} : { describedBy: errorDescribedBy })}
          onChange={onCategoryChange}
          description="A familiar service category, such as Research or Data."
        />
        <TextField id="supply-native-service-area" label="Service area (optional)" value={serviceArea} disabled={disabled} onChange={onServiceAreaChange} description="Where this service is available, if relevant." />
        <TextField id="supply-native-availability" label="Availability (optional)" value={availability} disabled={disabled} onChange={onAvailabilityChange} description="Any operating-hours or availability constraint." />
        <PricingField
          kind={pricingKind}
          price={price}
          x402={selected.x402 !== undefined}
          disabled={disabled}
          invalid={invalidField === 'price'}
          {...(errorDescribedBy === undefined ? {} : { describedBy: errorDescribedBy })}
          onKindChange={onPricingKindChange}
          onPriceChange={onPriceChange}
        />
        {selected.authentication.kind === 'public' ? (
          <Alert><AlertTitle>Public source</AlertTitle><AlertDescription>AE will validate this source. Publication remains Under review until Provider authority is established.</AlertDescription></Alert>
        ) : (
          <ConnectionField
            value={connectionRef}
            options={eligibleConnections}
            connecting={connecting}
            disabled={disabled}
            invalid={invalidField === 'connection'}
            {...(errorDescribedBy === undefined ? {} : { describedBy: errorDescribedBy })}
            onChange={onConnectionRefChange}
            onConnect={onConnect}
          />
        )}
        <ConsequencesField externalEffect={externalEffect} dataRelease={dataRelease} financialExposure={financialExposure} dataClassification={dataClassification} disabled={disabled} onExternalEffectChange={onExternalEffectChange} onDataReleaseChange={onDataReleaseChange} onFinancialExposureChange={onFinancialExposureChange} onDataClassificationChange={onDataClassificationChange} />
        <Button type="button" className="min-h-touch justify-self-start" disabled={disabled} onClick={onContinueToReview}>
          Continue to review
        </Button>
      </FieldGroup>
    </AeSection>
  )

  const consequenceSummary = [
    ...(externalEffect ? ['changes an external system'] : []),
    ...(dataRelease ? [`sends ${dataClassification} input data to the Provider`] : []),
    ...(financialExposure ? ['can create financial exposure'] : []),
  ].join(' · ') || 'No declared external effect, data release, or financial exposure'
  const priceSummary = publicationPriceSummary(pricingInput(pricingKind, price))

  return (
    <AeSection title="Review" description="Confirm the exact Tool presentation and declared terms before validation starts." {...(headingRef === undefined ? {} : { headingRef })}>
      <div className="grid gap-related rounded-xl border border-border bg-card p-4" role="group" aria-label="Tool publication decision">
        <AeFactList facts={[
          { label: 'Tool', value: name },
          { label: 'Description', value: description },
          { label: 'Category', value: category },
          { label: 'Price', value: priceSummary, mono: pricingKind === 'fixed_aud' },
          { label: 'Source connection', value: selected.authentication.kind === 'public' ? 'Public source' : connectionRef === '' ? 'Not selected' : 'Connected source selected' },
          { label: 'Declared behavior', value: consequenceSummary },
        ]} />
        <Button type="button" variant="secondary" className="justify-self-start min-h-touch" disabled={disabled} onClick={onEditTerms}>Edit terms</Button>
        <div className="border-t border-border pt-related">
          <AttestationField
            values={attestation}
            requireAuthority={publishAuthorityRequired}
            disabled={disabled}
            invalid={invalidField === 'attestation'}
            {...(errorDescribedBy === undefined ? {} : { describedBy: errorDescribedBy })}
            onChange={onAttestationChange}
          />
        </div>
        <div role="status" aria-live="polite">{saving ? <AeInlineState state="saving" description="Submitting the exact source revision for validation." /> : null}</div>
        <Button type="button" className="min-h-touch justify-self-start" disabled={disabled} aria-busy={saving || undefined} onClick={onSubmit}>
          {saving ? 'Submitting…' : 'Submit for validation'}
        </Button>
      </div>
    </AeSection>
  )
}

function PricingField({ kind, price, x402, disabled, invalid = false, describedBy, onKindChange, onPriceChange }: Readonly<{ kind: 'free' | 'fixed_aud' | 'source_x402'; price: string; x402: boolean; disabled: boolean; invalid?: boolean; describedBy?: string; onKindChange: (kind: 'free' | 'fixed_aud' | 'source_x402') => void; onPriceChange: (value: string) => void }>) {
  return (
    <Field data-invalid={invalid || undefined}>
      <FieldLabel id="supply-native-price-label">Price</FieldLabel>
      <RadioGroup
        id={SUPPLY_PUBLICATION_FIELD_IDS.priceGroup}
        tabIndex={-1}
        aria-labelledby="supply-native-price-label"
        aria-invalid={invalid || undefined}
        aria-describedby={invalid && describedBy !== undefined ? describedBy : undefined}
        value={kind}
        disabled={disabled}
        className="grid gap-2 sm:grid-cols-2"
        onValueChange={(next) => onKindChange(next as typeof kind)}
      >
        {x402 ? (
          <Label className="min-h-touch rounded-md border border-border p-3"><RadioGroupItem value="source_x402" />Use source payment</Label>
        ) : (
          <>
            <Label className="min-h-touch rounded-md border border-border p-3"><RadioGroupItem value="free" />Free</Label>
            <Label className="min-h-touch rounded-md border border-border p-3"><RadioGroupItem value="fixed_aud" />Fixed AUD price</Label>
          </>
        )}
      </RadioGroup>
      {kind === 'fixed_aud' ? (
        <Input
          id={SUPPLY_PUBLICATION_FIELD_IDS.priceAud}
          aria-label="AUD price"
          aria-invalid={invalid || undefined}
          aria-describedby={invalid && describedBy !== undefined ? describedBy : undefined}
          inputMode="decimal"
          value={price}
          disabled={disabled}
          onChange={(event) => onPriceChange(event.currentTarget.value)}
        />
      ) : null}
      <FieldDescription>Exact buyer price is confirmed during inspection.</FieldDescription>
    </Field>
  )
}

function ConnectionField({ value, options, connecting, disabled, invalid = false, describedBy, onChange, onConnect }: Readonly<{ value: string; options: readonly ProviderConnectionOwnerProjection[]; connecting: boolean; disabled: boolean; invalid?: boolean; describedBy?: string; onChange: (value: string) => void; onConnect: () => void }>) {
  return (
    <Field data-invalid={invalid || undefined}>
      <FieldLabel id="supply-native-connection-label">Source connection</FieldLabel>
      {options.length === 0 ? (
        <Alert>
          <AlertTitle>Connect this source</AlertTitle>
          <AlertDescription>
            <p>This Tool requires the source’s standard authentication. Your selected Tool is saved.</p>
            <Button
              id={SUPPLY_PUBLICATION_FIELD_IDS.connection}
              type="button"
              variant="secondary"
              className="mt-4 min-h-touch"
              disabled={connecting || disabled}
              aria-invalid={invalid || undefined}
              aria-describedby={invalid && describedBy !== undefined ? describedBy : undefined}
              onClick={onConnect}
            >
              {connecting ? 'Opening connection…' : 'Connect service'}
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <RadioGroup
          id={SUPPLY_PUBLICATION_FIELD_IDS.connection}
          tabIndex={-1}
          aria-labelledby="supply-native-connection-label"
          aria-invalid={invalid || undefined}
          aria-describedby={invalid && describedBy !== undefined ? describedBy : undefined}
          value={value}
          disabled={disabled}
          onValueChange={(val) => onChange(String(val))}
        >
          {options.map((option) => (
            <Label key={option.connectionRef} className="min-h-touch rounded-md border border-border p-3">
              <RadioGroupItem value={option.connectionRef} />
              {option.adapterId} · connected
            </Label>
          ))}
        </RadioGroup>
      )}
      <FieldDescription>The connection is durable and separately revocable.</FieldDescription>
    </Field>
  )
}

function ConsequencesField({ externalEffect, dataRelease, financialExposure, dataClassification, disabled, onExternalEffectChange, onDataReleaseChange, onFinancialExposureChange, onDataClassificationChange }: Readonly<{ externalEffect: boolean; dataRelease: boolean; financialExposure: boolean; dataClassification: 'public' | 'personal' | 'sensitive'; disabled: boolean; onExternalEffectChange: (value: boolean) => void; onDataReleaseChange: (value: boolean) => void; onFinancialExposureChange: (value: boolean) => void; onDataClassificationChange: (value: 'public' | 'personal' | 'sensitive') => void }>) {
  return (
    <Field>
      <FieldLabel>What can this Tool do?</FieldLabel>
      <div className="grid gap-3">
        <CheckRow id="supply-effect-external" label="Change an external system" checked={externalEffect} disabled={disabled} onChange={onExternalEffectChange} />
        <CheckRow id="supply-effect-data" label="Send input data to the Provider" checked={dataRelease} disabled={disabled} onChange={onDataReleaseChange} />
        <CheckRow id="supply-effect-financial" label="Create financial exposure" checked={financialExposure} disabled={disabled} onChange={onFinancialExposureChange} />
      </div>
      {dataRelease ? (
        <>
          <FieldLabel id="supply-native-data-classification-label" className="mt-3">Data classification</FieldLabel>
          <RadioGroup
            aria-labelledby="supply-native-data-classification-label"
            value={dataClassification}
            disabled={disabled}
            className="mt-3 grid gap-2 sm:grid-cols-3"
            onValueChange={(next) => onDataClassificationChange(next as typeof dataClassification)}
          >
            {(['public', 'personal', 'sensitive'] as const).map((classification) => (
              <Label key={classification} className="min-h-touch rounded-md border border-border p-3">
                <RadioGroupItem value={classification} />
                {classification[0]?.toUpperCase()}{classification.slice(1)} data
              </Label>
            ))}
          </RadioGroup>
        </>
      ) : null}
      <FieldDescription>AE uses these declarations for agent approval and evidence requirements.</FieldDescription>
    </Field>
  )
}

function AttestationField({ values, requireAuthority, disabled, invalid = false, describedBy, onChange }: Readonly<{ values: Record<AttestationKey, boolean>; requireAuthority: boolean; disabled: boolean; invalid?: boolean; describedBy?: string; onChange: (key: AttestationKey, checked: boolean) => void }>) {
  return (
    <fieldset
      className="grid gap-3"
      data-invalid={invalid || undefined}
      aria-invalid={invalid || undefined}
      aria-describedby={invalid && describedBy !== undefined ? describedBy : undefined}
    >
      <legend className="text-sm font-medium">Publication statements</legend>
      {requireAuthority ? (
        <CheckRow id={SUPPLY_PUBLICATION_FIELD_IDS.attestation} label="I am authorised to publish this service" checked={values.authorisedToPublish} disabled={disabled} onChange={(checked) => onChange('authorisedToPublish', checked)} />
      ) : (
        <p className="text-sm text-muted-foreground">Publication stays under review until Provider authority is established. Validation does not need that claim.</p>
      )}
      <CheckRow id="supply-attest-accurate" label="The information is accurate" checked={values.informationAccurate} disabled={disabled} onChange={(checked) => onChange('informationAccurate', checked)} />
      <CheckRow id="supply-attest-validation" label="Publish after validation succeeds" checked={values.publishAfterSuccessfulValidation} disabled={disabled} onChange={(checked) => onChange('publishAfterSuccessfulValidation', checked)} />
    </fieldset>
  )
}

function CheckRow({ id, label, checked, disabled = false, onChange }: Readonly<{ id: string; label: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }>) {
  return <Label htmlFor={id} className="min-h-touch rounded-md border border-border p-3"><Checkbox id={id} checked={checked} disabled={disabled} onCheckedChange={(value) => onChange(value === true)} />{label}</Label>
}
