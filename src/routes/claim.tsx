import { useState, type FormEvent } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { createServerFn, useServerFn } from '@tanstack/react-start'
import { ArrowRightIcon } from 'lucide-react'
import { z } from 'zod'

import { AeClaimFormSection } from '@/components/ae/forms/AeClaimFormSection'
import { AeReviewBlock } from '@/components/ae/forms/AeReviewBlock'
import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import {
  publicOwnerDefaultClaimInput,
  submitPublicOwnerClaimFlow,
  validatePublicOwnerClaimFlowInput,
} from '@/modules/catalog/public'
import type { PublicOwnerClaimField, PublicOwnerClaimFlowInput, PublicOwnerClaimValidationError } from '@/modules/catalog/public'

type TextClaimField = Exclude<PublicOwnerClaimField, 'firstRequestMode'>

type FieldConfig = {
  field: TextClaimField
  label: string
  description: string
  control: 'input' | 'textarea'
}

const claimInputSchema = z.object({
  businessName: z.string(),
  category: z.string(),
  suburb: z.string(),
  stateTerritory: z.string(),
  requestedSlug: z.string(),
  ownerMessage: z.string(),
  sourceLabel: z.string(),
  serviceName: z.string(),
  serviceCategory: z.string(),
  serviceSummary: z.string(),
  serviceArea: z.string(),
  hoursOrUnknown: z.string(),
  firstRequestMode: z.enum(['inquiry_available', 'quote_request_available', 'not_available_yet']),
  publicDisclosure: z.string(),
  noContactReason: z.string(),
})

const submitClaimServer = createServerFn({ method: 'POST' })
  .validator((data) => claimInputSchema.parse(data))
  .handler(async ({ data }) => submitPublicOwnerClaimFlow(data))

const identityFields = [
  {
    field: 'businessName',
    label: 'Business name',
    description: 'Use the public name customers already know.',
    control: 'input',
  },
  {
    field: 'category',
    label: 'Business category',
    description: 'Example: Emergency plumbing.',
    control: 'input',
  },
  {
    field: 'suburb',
    label: 'Suburb',
    description: 'The primary local suburb.',
    control: 'input',
  },
  {
    field: 'stateTerritory',
    label: 'State or territory',
    description: 'Use the short Australian state label.',
    control: 'input',
  },
  {
    field: 'requestedSlug',
    label: 'Public page slug',
    description: 'Lowercase words separated by hyphens.',
    control: 'input',
  },
  {
    field: 'sourceLabel',
    label: 'Source label',
    description: 'Describe where these public facts came from.',
    control: 'input',
  },
] as const satisfies readonly FieldConfig[]

const serviceFields = [
  {
    field: 'serviceName',
    label: 'Service name',
    description: 'Name one service customers need to understand.',
    control: 'input',
  },
  {
    field: 'serviceCategory',
    label: 'Service category',
    description: 'Keep this close to the business category.',
    control: 'input',
  },
  {
    field: 'serviceSummary',
    label: 'Service summary',
    description: 'One safe, public sentence about the service.',
    control: 'textarea',
  },
  {
    field: 'serviceArea',
    label: 'Service area',
    description: 'Name the suburbs or local area covered.',
    control: 'input',
  },
  {
    field: 'hoursOrUnknown',
    label: 'Hours or unknown',
    description: 'Use owner-supplied hours or say hours are unknown.',
    control: 'input',
  },
] as const satisfies readonly FieldConfig[]

export const Route = createFileRoute('/claim')({
  head: () => ({
    meta: [
      { title: 'Claim your service page | Agentic Economy' },
      { name: 'description', content: 'Submit business identity and service facts for a truthful public service page.' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: ClaimRoute,
})

function ClaimRoute() {
  const navigate = useNavigate()
  const submitClaim = useServerFn(submitClaimServer)
  const [value, setValue] = useState<PublicOwnerClaimFlowInput>(publicOwnerDefaultClaimInput)
  const [errors, setErrors] = useState<readonly PublicOwnerClaimValidationError[]>([])
  const [message, setMessage] = useState<string | undefined>()
  const [pending, setPending] = useState(false)
  const errorByField = new Map(errors.map((error) => [error.field, error.message]))

  function updateTextField(field: TextClaimField, nextValue: string) {
    setValue((current) => ({ ...current, [field]: nextValue }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(undefined)
    const validation = validatePublicOwnerClaimFlowInput(value)
    if (validation.kind === 'invalid') {
      setErrors(validation.errors)
      focusFirstError(validation.errors)
      return
    }

    setErrors([])
    setPending(true)
    try {
      const result = await submitClaim({ data: value })
      if (result.kind === 'ok') {
        await navigate({ to: '/claim/success' })
        return
      }

      setMessage(result.reason)
      setErrors(result.errors ?? [])
      focusFirstError(result.errors ?? [])
    } finally {
      setPending(false)
    }
  }

  return (
    <AePublicShell>
      <AePageHeader
        eyebrow="Owner claim"
        title="Tell us what your service can safely publish"
        description="Add business identity, service facts, first-request posture, and a review summary. ABN is not required for this first service page."
      />
      <form onSubmit={handleSubmit} noValidate className="mx-auto grid w-full max-w-6xl gap-6 px-4 pb-16 md:px-6">
        {message === undefined ? null : (
          <Alert variant="destructive">
            <AlertTitle>Publish did not complete</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}
        <AeClaimFormSection title="Business identity" description="These fields become the public object identity.">
          <FieldGroup>{identityFields.map((field) => renderField(field, value, errorByField, updateTextField))}</FieldGroup>
        </AeClaimFormSection>
        <AeClaimFormSection title="Service facts" description="Publish at least one service with source-owned public facts.">
          <FieldGroup>{serviceFields.map((field) => renderField(field, value, errorByField, updateTextField))}</FieldGroup>
        </AeClaimFormSection>
        <AeClaimFormSection title="First request posture" description="Say what the public page can safely show now.">
          <FieldGroup>
            <Field data-invalid={errorByField.has('firstRequestMode') ? true : undefined}>
              <FieldLabel htmlFor="firstRequestMode">First request state</FieldLabel>
              <NativeSelect
                id="firstRequestMode"
                name="firstRequestMode"
                value={value.firstRequestMode}
                aria-invalid={errorByField.has('firstRequestMode') || undefined}
                onChange={(event) => setValue((current) => ({ ...current, firstRequestMode: toFirstRequestMode(event.currentTarget.value) }))}
              >
                <option value="not_available_yet">First request not available yet</option>
                <option value="inquiry_available">Public first-request instructions supplied</option>
                <option value="quote_request_available">Public quote request instructions supplied</option>
              </NativeSelect>
              <FieldDescription>Unavailable states are valid when a public contact path is not supplied.</FieldDescription>
              {fieldError('firstRequestMode', errorByField)}
            </Field>
            {renderField(
              {
                field: 'publicDisclosure',
                label: 'Public first-request note',
                description: 'This note appears on the public service page.',
                control: 'textarea',
              },
              value,
              errorByField,
              updateTextField
            )}
            {renderField(
              {
                field: 'noContactReason',
                label: 'Unavailable reason',
                description: 'Required when the first request is not available yet.',
                control: 'textarea',
              },
              value,
              errorByField,
              updateTextField
            )}
            {renderField(
              {
                field: 'ownerMessage',
                label: 'Owner message',
                description: 'Optional public-safe context. Raw contact details are not needed here.',
                control: 'textarea',
              },
              value,
              errorByField,
              updateTextField
            )}
          </FieldGroup>
        </AeClaimFormSection>
        <AeReviewBlock value={value} />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? <Spinner data-icon="inline-start" /> : <ArrowRightIcon data-icon="inline-start" />}
            Publish service page
          </Button>
          <Button asChild variant="outline">
            <a href="/parramatta-emergency-plumbing">Preview public page</a>
          </Button>
        </div>
      </form>
    </AePublicShell>
  )
}

function renderField(
  config: FieldConfig,
  value: PublicOwnerClaimFlowInput,
  errorByField: ReadonlyMap<PublicOwnerClaimField, string>,
  updateTextField: (field: TextClaimField, nextValue: string) => void
) {
  const error = errorByField.get(config.field)
  const invalid = error !== undefined
  const inputId = config.field

  return (
    <Field key={config.field} data-invalid={invalid ? true : undefined}>
      <FieldLabel htmlFor={inputId}>{config.label}</FieldLabel>
      {config.control === 'textarea' ? (
        <Textarea
          id={inputId}
          name={config.field}
          value={value[config.field]}
          aria-invalid={invalid || undefined}
          onChange={(event) => updateTextField(config.field, event.currentTarget.value)}
        />
      ) : (
        <Input
          id={inputId}
          name={config.field}
          value={value[config.field]}
          aria-invalid={invalid || undefined}
          onChange={(event) => updateTextField(config.field, event.currentTarget.value)}
        />
      )}
      <FieldDescription>{config.description}</FieldDescription>
      {fieldError(config.field, errorByField)}
    </Field>
  )
}

function fieldError(field: PublicOwnerClaimField, errorByField: ReadonlyMap<PublicOwnerClaimField, string>) {
  const error = errorByField.get(field)
  return error === undefined ? null : <FieldError>{error}</FieldError>
}

function focusFirstError(errors: readonly PublicOwnerClaimValidationError[]) {
  const first = errors.at(0)
  if (first === undefined) {
    return
  }

  requestAnimationFrame(() => {
    document.querySelector<HTMLElement>(`[name="${first.field}"]`)?.focus()
  })
}

function toFirstRequestMode(value: string): PublicOwnerClaimFlowInput['firstRequestMode'] {
  if (value === 'inquiry_available' || value === 'quote_request_available') {
    return value
  }

  return 'not_available_yet'
}
