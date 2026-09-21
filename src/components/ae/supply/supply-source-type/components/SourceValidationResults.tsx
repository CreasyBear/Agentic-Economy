import { CheckCircle2Icon } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { inspectHttpsUrl, inspectJsonPayload } from '../../supply-source-native-start-presentation'
import type {
  HttpsUrlPreflightBadgeProps,
  JsonFileFieldProps,
  JsonPreflightBadgeProps,
  PreflightRule4AlertProps,
  PreflightSlotProps,
  UrlFieldWithPreflightProps,
} from '../supply-source-type.contracts'

export function UrlFieldWithPreflight({
  id,
  label,
  value,
  description,
  discoverDiagnostic,
  onChange,
}: UrlFieldWithPreflightProps) {
  const preflight = inspectHttpsUrl(value)
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} type="url" value={value} onChange={(event) => onChange(event.currentTarget.value)} />
      <FieldDescription>{description}</FieldDescription>
      <PreflightSlot>
        {discoverDiagnostic !== undefined ? (
          <PreflightRule4Alert diagnostic={discoverDiagnostic} />
        ) : (
          <HttpsUrlPreflightBadge status={preflight} />
        )}
      </PreflightSlot>
    </Field>
  )
}

export function JsonFileField({
  id,
  label,
  loaded,
  jsonValue,
  requiredKeys,
  discoverDiagnostic,
  onChange,
  onError,
}: JsonFileFieldProps) {
  const preflight = inspectJsonPayload(jsonValue, requiredKeys)
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type="file"
        accept=".json,application/json"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          if (file === undefined) return
          if (file.size > 262_144) {
            onError(`${label} must be 256 KB or smaller.`)
            return
          }
          void file.text().then(onChange).catch(() => onError(`${label} could not be read.`))
        }}
      />
      <FieldDescription>{loaded ? `${label} loaded. Choose another file to replace it.` : `Choose the official Agent Plugins 1.0 ${label} file.`}</FieldDescription>
      <PreflightSlot>
        {discoverDiagnostic !== undefined ? (
          <PreflightRule4Alert diagnostic={discoverDiagnostic} />
        ) : (
          <JsonPreflightBadge status={preflight} />
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

function HttpsUrlPreflightBadge({ status }: HttpsUrlPreflightBadgeProps) {
  if (status === 'empty') return null
  if (status === 'insecure') {
    return <Badge variant="warning">Insecure HTTP URL detected. Agentic Economy requires secure HTTPS endpoints.</Badge>
  }
  if (status === 'invalid') {
    return <Badge variant="warning">Enter a valid HTTPS URL (e.g. https://api.example.com/openapi.json).</Badge>
  }
  return (
    <Badge variant="success" className="gap-1.5">
      <CheckCircle2Icon className="size-3" />
      Valid HTTPS endpoint format
    </Badge>
  )
}

function JsonPreflightBadge({ status }: JsonPreflightBadgeProps) {
  if (status === 'empty') return null
  if (status === 'invalid' || status === 'not_object') {
    return <Badge variant="warning">JSON syntax is invalid.</Badge>
  }
  if (status === 'missing_fields') {
    return <Badge variant="warning">JSON is missing required fields.</Badge>
  }
  return (
    <Badge variant="success" className="gap-1.5">
      <CheckCircle2Icon className="size-3" />
      Valid JSON payload
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
