import { useEffect, useState, type FormEvent } from 'react'
import { Outlet, createFileRoute, useLocation, useNavigate } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { ArrowRightIcon } from 'lucide-react'

import { emitFunnelEvent, emitFunnelEventOnce } from '@/lib/observability/funnel-client'
import { AeClaimFormSection } from '@/components/ae/forms/AeClaimFormSection'
import { AeCheckboxField } from '@/components/ae/forms/AeCheckboxField'
import { AeSelectField } from '@/components/ae/forms/AeSelectField'
import { AeReviewBlock } from '@/components/ae/forms/AeReviewBlock'
import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, getFieldAccessibility } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { submitOwnerClaimServer } from '@/modules/catalog/owner-claim.functions'
import { requireClaimOwnerSession } from '@/lib/server/claim-owner-session'
import { validatePublicOwnerClaimFlowInput } from '@/modules/catalog/public'
import type { PublicOwnerClaimField, PublicOwnerClaimFlowInput, PublicOwnerClaimValidationError } from '@/modules/catalog/public'

type TextClaimField = Exclude<PublicOwnerClaimField, 'firstRequestMode'>

type FieldConfig = {
  field: TextClaimField
  label: string
  description: string
  control: 'input' | 'textarea'
}


const emptyPublicOwnerClaimInput = {
  businessName: '',
  category: '',
  suburb: '',
  stateTerritory: '',
  requestedSlug: '',
  ownerMessage: '',
  sourceLabel: '',
  serviceName: '',
  serviceCategory: '',
  serviceSummary: '',
  serviceArea: '',
  hoursOrUnknown: '',
  photoUrl: '',
  responseTimeMinutes: '',
  firstRequestMode: 'not_available_yet',
  publicDisclosure: '',
  noContactReason: '',
} satisfies PublicOwnerClaimFlowInput

const submitClaimServer = submitOwnerClaimServer

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
    label: 'Fact note',
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
    description: 'One clear public sentence about the service.',
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
    label: 'Hours (or say if not sure)',
    description: 'Use owner-supplied hours or say if you are not sure.',
    control: 'input',
  },
  {
    field: 'photoUrl',
    label: 'Photo URL (optional)',
    description: 'Link to one real work, vehicle, or team photo you can publish.',
    control: 'input',
  },
  {
    field: 'responseTimeMinutes',
    label: 'Typical response time in minutes (optional)',
    description: 'Example: 22 for “Responds ~22m”. Leave blank if not sure.',
    control: 'input',
  },
] as const satisfies readonly FieldConfig[]

const firstRequestModeOptions = [
  { value: 'not_available_yet', label: 'First request not available yet' },
  { value: 'inquiry_available', label: 'Public first-request instructions supplied' },
  { value: 'quote_request_available', label: 'Public quote request instructions supplied' },
] as const

export const Route = createFileRoute('/claim')({
  beforeLoad: async () => await requireClaimOwnerSession(),
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
  const location = useLocation()
  const navigate = useNavigate()
  const submitClaim = useServerFn(submitClaimServer)
  const [hydrated, setHydrated] = useState(false)
  const [value, setValue] = useState<PublicOwnerClaimFlowInput>(emptyPublicOwnerClaimInput)
  const [errors, setErrors] = useState<readonly PublicOwnerClaimValidationError[]>([])
  const [message, setMessage] = useState<string | undefined>()
  const [pending, setPending] = useState(false)
  const [factsConfirmed, setFactsConfirmed] = useState(false)
  const errorByField = new Map(errors.map((error) => [error.field, error.message]))
  const firstRequestModeInvalid = errorByField.has('firstRequestMode')
  const firstRequestModeField = getFieldAccessibility({
    id: 'firstRequestMode',
    invalid: firstRequestModeInvalid,
    hasDescription: true,
    hasError: firstRequestModeInvalid,
  })

  useEffect(() => {
    setHydrated(true)
  }, [])

  if (location.pathname !== '/claim') {
    return <Outlet />
  }

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
        await navigate({ to: '/claim/success', search: { slug: result.catalog.slug } })
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
        title="Tell us what your service page should say"
        description="Add business identity, service details, first-request status, and a public note. ABN is not required for this first page."
      />
      <form onSubmit={handleSubmit} noValidate className="ae-public-page mx-auto grid w-full max-w-6xl gap-6 px-4 pb-16 md:px-6">
        {message === undefined ? null : (
          <Alert variant="destructive">
            <AlertTitle>Publish did not complete</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}
        <AeClaimFormSection title="Business identity" description="This is how customers recognize the business.">
          <FieldGroup>{identityFields.map((field) => renderField(field, value, errorByField, updateTextField, !hydrated || pending))}</FieldGroup>
        </AeClaimFormSection>
        <AeClaimFormSection title="Service details" description="Add one service people can understand quickly.">
          <FieldGroup>{serviceFields.map((field) => renderField(field, value, errorByField, updateTextField, !hydrated || pending))}</FieldGroup>
        </AeClaimFormSection>
        <AeClaimFormSection title="First request" description="Say what this page can show today.">
          <FieldGroup>
            <Field {...firstRequestModeField.fieldProps}>
              <FieldLabel htmlFor={firstRequestModeField.controlProps.id}>First request</FieldLabel>
              <AeSelectField
                id={firstRequestModeField.controlProps.id}
                name="firstRequestMode"
                value={value.firstRequestMode}
                options={firstRequestModeOptions}
                invalid={firstRequestModeInvalid}
                {...(firstRequestModeField.controlProps['aria-describedby'] === undefined
                  ? {}
                  : { describedBy: firstRequestModeField.controlProps['aria-describedby'] })}
                disabled={!hydrated || pending}
                onValueChange={(nextValue) => {
                  setValue((current) => ({
                    ...current,
                    firstRequestMode: toFirstRequestMode(nextValue),
                  }))
                }}
              />
              <FieldDescription {...firstRequestModeField.descriptionProps}>Choose unavailable if you do not want a contact path on the page yet.</FieldDescription>
              {fieldError('firstRequestMode', errorByField, firstRequestModeField.errorProps.id)}
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
              updateTextField,
              !hydrated || pending
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
              updateTextField,
              !hydrated || pending
            )}
            {renderField(
              {
                field: 'ownerMessage',
                label: 'Owner message',
                description: 'Optional context. Avoid private contact details here.',
                control: 'textarea',
              },
              value,
              errorByField,
              updateTextField,
              !hydrated || pending
            )}
          </FieldGroup>
        </AeClaimFormSection>
        <AeReviewBlock value={value} />
        <AeCheckboxField
          id="claimFactsConfirmed"
          label="I confirm these public facts are supplied by the business and ready to publish."
          description="Agentic Economy publishes what you submit. Review the summary above before continuing."
          checked={factsConfirmed}
          disabled={!hydrated || pending}
          onCheckedChange={setFactsConfirmed}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="landingPrimary" disabled={pending || !hydrated || !factsConfirmed}>
            {pending ? <Spinner data-icon="inline-start" /> : <ArrowRightIcon data-icon="inline-start" />}
            Publish service page
          </Button>
          {previewButton(value.requestedSlug)}
        </div>
      </form>
    </AePublicShell>
  )
}

function renderField(
  config: FieldConfig,
  value: PublicOwnerClaimFlowInput,
  errorByField: ReadonlyMap<PublicOwnerClaimField, string>,
  updateTextField: (field: TextClaimField, nextValue: string) => void,
  disabled: boolean
) {
  const error = errorByField.get(config.field)
  const invalid = error !== undefined
  const inputId = config.field
  const fieldA11y = getFieldAccessibility({ id: inputId, invalid, hasDescription: true, hasError: invalid })

  return (
    <Field key={config.field} {...fieldA11y.fieldProps}>
      <FieldLabel htmlFor={fieldA11y.controlProps.id}>{config.label}</FieldLabel>
      {config.control === 'textarea' ? (
        <Textarea
          {...fieldA11y.controlProps}
          name={config.field}
          value={value[config.field]}
          disabled={disabled}
          onChange={(event) => updateTextField(config.field, event.currentTarget.value)}
        />
      ) : (
        <Input
          {...fieldA11y.controlProps}
          name={config.field}
          value={value[config.field]}
          disabled={disabled}
          onChange={(event) => updateTextField(config.field, event.currentTarget.value)}
        />
      )}
      <FieldDescription {...fieldA11y.descriptionProps}>{config.description}</FieldDescription>
      {fieldError(config.field, errorByField, fieldA11y.errorProps.id)}
    </Field>
  )
}

function fieldError(field: PublicOwnerClaimField, errorByField: ReadonlyMap<PublicOwnerClaimField, string>, errorId?: string) {
  const error = errorByField.get(field)
  return error === undefined ? null : <FieldError id={errorId}>{error}</FieldError>
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

function previewButton(requestedSlug: string) {
  const slug = requestedSlug.trim()
  if (slug.length === 0) {
    return (
      <Button type="button" variant="outline" disabled>
        Preview public page
      </Button>
    )
  }

  return (
    <Button asChild variant="outline">
      <a href={`/${slug}`}>Preview public page</a>
    </Button>
  )
}
