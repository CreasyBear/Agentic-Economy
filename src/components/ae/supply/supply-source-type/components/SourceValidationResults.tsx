import { CheckCircle2Icon } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import '../../SupplyPublicationComposition.css'
import { inspectHttpsUrl } from '../../supply-source-native-start-presentation'
import {
  SUPPLY_SOURCE_TYPE_COPY,
  type HttpsUrlPreflightBadgeProps,
  type PreflightRule4AlertProps,
  type PreflightSlotProps,
  type UrlFieldWithPreflightProps,
} from '../supply-source-type.contracts'

export function UrlFieldWithPreflight({
  id,
  label,
  value,
  description,
  placeholder,
  disabled,
  discoverDiagnostic,
  example,
  onChange,
}: UrlFieldWithPreflightProps) {
  const preflight = inspectHttpsUrl(value)
  return (
    <Field className="arc-market arc-publication-field">
      <FieldLabel htmlFor={id}>{label} <span aria-hidden="true" className="arc-source-required-hint">{SUPPLY_SOURCE_TYPE_COPY.required}</span></FieldLabel>
      <input className="arc-publication-input" id={id} aria-label={label} type="url" required placeholder={placeholder} value={value} disabled={disabled} onChange={(event) => onChange(event.currentTarget.value)} />
      <FieldDescription>{description}</FieldDescription>
      <PreflightSlot>
        {discoverDiagnostic !== undefined ? (
          <PreflightRule4Alert diagnostic={discoverDiagnostic} />
        ) : (
          <HttpsUrlPreflightBadge status={preflight} example={example} />
        )}
      </PreflightSlot>
    </Field>
  )
}

function PreflightSlot({ children }: PreflightSlotProps) {
  return (
    <div className="arc-source-preflight" aria-live="polite">
      {children}
    </div>
  )
}

function HttpsUrlPreflightBadge({ status, example }: HttpsUrlPreflightBadgeProps & Readonly<{ example: string }>) {
  if (status === 'empty') return null
  if (status === 'insecure') {
    return <span className="arc-source-preflight-result" data-tone="warning">{SUPPLY_SOURCE_TYPE_COPY.httpsPreflight.insecure}</span>
  }
  if (status === 'invalid') {
    return <span className="arc-source-preflight-result" data-tone="warning">{SUPPLY_SOURCE_TYPE_COPY.httpsPreflight.invalid(example)}</span>
  }
  return (
    <span className="arc-source-preflight-result" data-tone="success">
      <CheckCircle2Icon className="size-4" aria-hidden="true" />
      {SUPPLY_SOURCE_TYPE_COPY.httpsPreflight.valid}
    </span>
  )
}

function PreflightRule4Alert({ diagnostic }: PreflightRule4AlertProps) {
  return (
    <Alert variant="destructive" className="w-full">
      <AlertTitle>{diagnostic.whatHappened}</AlertTitle>
      <AlertDescription className="grid gap-0.5">
        <span className="tabular-nums">{diagnostic.financialImpact}</span>
        <span>{diagnostic.nextStep}</span>
      </AlertDescription>
    </Alert>
  )
}
