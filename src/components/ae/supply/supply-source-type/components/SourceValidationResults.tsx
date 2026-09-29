import { CheckCircle2Icon } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
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
    <Field>
      <FieldLabel htmlFor={id}>{label} <span aria-hidden="true" className="text-xs font-normal text-muted-foreground">{SUPPLY_SOURCE_TYPE_COPY.required}</span></FieldLabel>
      <Input id={id} aria-label={label} type="url" required placeholder={placeholder} value={value} disabled={disabled} onChange={(event) => onChange(event.currentTarget.value)} />
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
    <div className="flex min-h-[2.5rem] items-center" aria-live="polite">
      {children}
    </div>
  )
}

function HttpsUrlPreflightBadge({ status, example }: HttpsUrlPreflightBadgeProps & Readonly<{ example: string }>) {
  if (status === 'empty') return null
  if (status === 'insecure') {
    return <Badge variant="warning">{SUPPLY_SOURCE_TYPE_COPY.httpsPreflight.insecure}</Badge>
  }
  if (status === 'invalid') {
    return <Badge variant="warning">{SUPPLY_SOURCE_TYPE_COPY.httpsPreflight.invalid(example)}</Badge>
  }
  return (
    <Badge variant="success" className="gap-1.5">
      <CheckCircle2Icon className="size-3" />
      {SUPPLY_SOURCE_TYPE_COPY.httpsPreflight.valid}
    </Badge>
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
