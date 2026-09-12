import { AeInlineState } from '@/components/ae/feedback/AeInlineState'
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
import type { AttestationKey } from './supply-source-native-start-presentation'

export function SupplyPublicationSection({
  name,
  description,
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
  submitDisabled,
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
  onSubmit,
}: Readonly<{
  name: string
  description: string
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
  submitDisabled: boolean
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
  onSubmit: () => void
}>) {
  return (
    <AeSection title="Review and submit" description="Review facts derived from the source, then declare only the terms AE owns.">
      <FieldGroup className="gap-5">
        <TextField id="supply-native-name" label="Tool name" value={name} onChange={onNameChange} description="Shown to agents in discovery." />
        <TextAreaField id="supply-native-description" label="Description" value={description} onChange={onDescriptionChange} description="What this Tool does and returns." />
        <TextField id="supply-native-category" label="Category" value={category} onChange={onCategoryChange} description="A familiar service category, such as Research or Data." />
        <TextField id="supply-native-service-area" label="Service area (optional)" value={serviceArea} onChange={onServiceAreaChange} description="Where this service is available, if relevant." />
        <TextField id="supply-native-availability" label="Availability (optional)" value={availability} onChange={onAvailabilityChange} description="Any operating-hours or availability constraint." />
        <PricingField kind={pricingKind} price={price} x402={selected.x402 !== undefined} onKindChange={onPricingKindChange} onPriceChange={onPriceChange} />
        {selected.authentication.kind === 'public' ? (
          <Alert><AlertTitle>Public source</AlertTitle><AlertDescription>AE will validate this source. Publication remains Under review until Provider authority is established.</AlertDescription></Alert>
        ) : (
          <ConnectionField
            value={connectionRef}
            options={eligibleConnections}
            connecting={connecting}
            onChange={onConnectionRefChange}
            onConnect={onConnect}
          />
        )}
        <ConsequencesField externalEffect={externalEffect} dataRelease={dataRelease} financialExposure={financialExposure} dataClassification={dataClassification} onExternalEffectChange={onExternalEffectChange} onDataReleaseChange={onDataReleaseChange} onFinancialExposureChange={onFinancialExposureChange} onDataClassificationChange={onDataClassificationChange} />
        <AttestationField values={attestation} onChange={onAttestationChange} />
        <div role="status" aria-live="polite">{saving ? <AeInlineState state="saving" description="Submitting the exact source revision for validation." /> : null}</div>
        <Button type="button" className="min-h-touch justify-self-start" disabled={submitDisabled} aria-busy={saving || undefined} onClick={onSubmit}>
          {saving ? 'Submitting…' : 'Submit for validation'}
        </Button>
      </FieldGroup>
    </AeSection>
  )
}

function PricingField({ kind, price, x402, onKindChange, onPriceChange }: Readonly<{ kind: 'free' | 'fixed_aud' | 'source_x402'; price: string; x402: boolean; onKindChange: (kind: 'free' | 'fixed_aud' | 'source_x402') => void; onPriceChange: (value: string) => void }>) {
  return <Field><FieldLabel>Price</FieldLabel><RadioGroup value={kind} className="grid gap-2 sm:grid-cols-2" onValueChange={(next) => onKindChange(next as typeof kind)}>{x402 ? <Label className="min-h-touch rounded-md border border-border p-3"><RadioGroupItem value="source_x402" />Use source payment</Label> : <><Label className="min-h-touch rounded-md border border-border p-3"><RadioGroupItem value="free" />Free</Label><Label className="min-h-touch rounded-md border border-border p-3"><RadioGroupItem value="fixed_aud" />Fixed AUD price</Label></>}</RadioGroup>{kind === 'fixed_aud' ? <Input aria-label="AUD price" inputMode="decimal" value={price} onChange={(event) => onPriceChange(event.currentTarget.value)} /> : null}<FieldDescription>Exact buyer price is confirmed during inspection.</FieldDescription></Field>
}

function ConnectionField({ value, options, connecting, onChange, onConnect }: Readonly<{ value: string; options: readonly ProviderConnectionOwnerProjection[]; connecting: boolean; onChange: (value: string) => void; onConnect: () => void }>) {
  return <Field><FieldLabel>Source connection</FieldLabel>{options.length === 0 ? <Alert><AlertTitle>Connect this source</AlertTitle><AlertDescription><p>This Tool requires the source’s standard authentication. Your selected Tool is saved.</p><Button type="button" variant="secondary" className="mt-4 min-h-touch" disabled={connecting} onClick={onConnect}>{connecting ? 'Opening connection…' : 'Connect service'}</Button></AlertDescription></Alert> : <RadioGroup value={value} onValueChange={onChange}>{options.map((option) => <Label key={option.connectionRef} className="min-h-touch rounded-md border border-border p-3"><RadioGroupItem value={option.connectionRef} />{option.adapterId} · connected</Label>)}</RadioGroup>}<FieldDescription>The connection is durable and separately revocable.</FieldDescription></Field>
}

function ConsequencesField({ externalEffect, dataRelease, financialExposure, dataClassification, onExternalEffectChange, onDataReleaseChange, onFinancialExposureChange, onDataClassificationChange }: Readonly<{ externalEffect: boolean; dataRelease: boolean; financialExposure: boolean; dataClassification: 'public' | 'personal' | 'sensitive'; onExternalEffectChange: (value: boolean) => void; onDataReleaseChange: (value: boolean) => void; onFinancialExposureChange: (value: boolean) => void; onDataClassificationChange: (value: 'public' | 'personal' | 'sensitive') => void }>) {
  return <Field><FieldLabel>What can this Tool do?</FieldLabel><div className="grid gap-3"><CheckRow id="supply-effect-external" label="Change an external system" checked={externalEffect} onChange={onExternalEffectChange} /><CheckRow id="supply-effect-data" label="Send input data to the Provider" checked={dataRelease} onChange={onDataReleaseChange} /><CheckRow id="supply-effect-financial" label="Create financial exposure" checked={financialExposure} onChange={onFinancialExposureChange} /></div>{dataRelease ? <RadioGroup value={dataClassification} className="mt-3 grid gap-2 sm:grid-cols-3" onValueChange={(next) => onDataClassificationChange(next as typeof dataClassification)}>{(['public', 'personal', 'sensitive'] as const).map((classification) => <Label key={classification} className="min-h-touch rounded-md border border-border p-3"><RadioGroupItem value={classification} />{classification[0]?.toUpperCase()}{classification.slice(1)} data</Label>)}</RadioGroup> : null}<FieldDescription>AE uses these declarations for agent approval and evidence requirements.</FieldDescription></Field>
}

function AttestationField({ values, onChange }: Readonly<{ values: Record<AttestationKey, boolean>; onChange: (key: AttestationKey, checked: boolean) => void }>) {
  return <fieldset className="grid gap-3"><legend className="text-sm font-medium">Publication statements</legend><CheckRow id="supply-attest-authorised" label="I am authorised to publish this service" checked={values.authorisedToPublish} onChange={(checked) => onChange('authorisedToPublish', checked)} /><CheckRow id="supply-attest-accurate" label="The information is accurate" checked={values.informationAccurate} onChange={(checked) => onChange('informationAccurate', checked)} /><CheckRow id="supply-attest-validation" label="Publish after validation succeeds" checked={values.publishAfterSuccessfulValidation} onChange={(checked) => onChange('publishAfterSuccessfulValidation', checked)} /></fieldset>
}

function CheckRow({ id, label, checked, onChange }: Readonly<{ id: string; label: string; checked: boolean; onChange: (checked: boolean) => void }>) {
  return <Label htmlFor={id} className="min-h-touch rounded-md border border-border p-3"><Checkbox id={id} checked={checked} onCheckedChange={(value) => onChange(value === true)} />{label}</Label>
}
