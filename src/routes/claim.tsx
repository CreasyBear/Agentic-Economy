import { useState, type FormEvent } from 'react'
import { Outlet, createFileRoute, useLocation, useNavigate } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { ArrowRightIcon } from 'lucide-react'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Field } from '@astryxdesign/core/Field'
import { FormLayout } from '@astryxdesign/core/FormLayout'

import { AeClaimFormSection } from '@/components/ae/forms/AeClaimFormSection'
import { AeCheckboxField } from '@/components/ae/forms/AeCheckboxField'
import { AeFileUploadField } from '@/components/ae/forms/AeFileUploadField'
import { AeRadioCardGroup } from '@/components/ae/forms/AeRadioCardGroup'
import { AeRangeField } from '@/components/ae/forms/AeRangeField'
import { AeReviewBlock } from '@/components/ae/forms/AeReviewBlock'
import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { AeActionButton } from '@/components/ae/motion/AeActionButton'
import { submitOwnerClaimServer } from '@/modules/catalog/owner-claim.functions'
import { requireClaimOwnerSession } from '@/lib/server/claim-owner-session'
import { validatePublicOwnerClaimFlowInput } from '@/modules/catalog/public'
import type { PublicOwnerClaimField, PublicOwnerClaimFlowInput, PublicOwnerClaimValidationError } from '@/modules/catalog/public'
import { useClientMounted } from '@/hooks/use-client-mounted'

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

function readClaimInput(form: HTMLFormElement, fallback: PublicOwnerClaimFlowInput): PublicOwnerClaimFlowInput {
  const data = new FormData(form)
  const read = (field: TextClaimField) => {
    const control = form.elements.namedItem(field)
    if (
      control instanceof HTMLInputElement ||
      control instanceof HTMLTextAreaElement ||
      control instanceof HTMLSelectElement
    ) {
      return control.value
    }

    const value = data.get(field)
    return typeof value === 'string' ? value : fallback[field] ?? ''
  }
  const firstRequestModeValue = data.get('firstRequestMode')

  return {
    businessName: read('businessName'),
    category: read('category'),
    suburb: read('suburb'),
    stateTerritory: read('stateTerritory'),
    requestedSlug: read('requestedSlug'),
    ownerMessage: read('ownerMessage'),
    sourceLabel: read('sourceLabel'),
    serviceName: read('serviceName'),
    serviceCategory: read('serviceCategory'),
    serviceSummary: read('serviceSummary'),
    serviceArea: read('serviceArea'),
    hoursOrUnknown: read('hoursOrUnknown'),
    photoUrl: read('photoUrl'),
    responseTimeMinutes: read('responseTimeMinutes'),
    firstRequestMode: toFirstRequestMode(typeof firstRequestModeValue === 'string' ? firstRequestModeValue : fallback.firstRequestMode),
    publicDisclosure: read('publicDisclosure'),
    noContactReason: read('noContactReason'),
  }
}

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
] as const satisfies readonly FieldConfig[]

const firstRequestModeOptions = [
  {
    value: 'not_available_yet',
    label: 'First request not available yet',
    description: 'Use this when customers should view details but contact another way.',
  },
  {
    value: 'inquiry_available',
    label: 'Qualified inquiry is available',
    description: 'AE may send a first-contact message for owner review.',
  },
  {
    value: 'quote_request_available',
    label: 'Quote request instructions supplied',
    description: 'Show public instructions without implying booking or payment.',
  },
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
  const hydrated = useClientMounted()
  const [value, setValue] = useState<PublicOwnerClaimFlowInput>(emptyPublicOwnerClaimInput)
  const [errors, setErrors] = useState<readonly PublicOwnerClaimValidationError[]>([])
  const [message, setMessage] = useState<string | undefined>()
  const [pending, setPending] = useState(false)
  const [factsConfirmed, setFactsConfirmed] = useState(false)
  const errorByField = new Map(errors.map((error) => [error.field, error.message]))
  const firstRequestModeError = errorByField.get('firstRequestMode')
  const firstRequestModeInvalid = firstRequestModeError !== undefined

  if (location.pathname !== '/claim') {
    return <Outlet />
  }

  function updateTextField(field: TextClaimField, nextValue: string) {
    setValue((current) => ({ ...current, [field]: nextValue }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(undefined)
    const nextValue = readClaimInput(event.currentTarget, value)
    setValue(nextValue)
    const validation = validatePublicOwnerClaimFlowInput(nextValue)
    if (validation.kind === 'invalid') {
      setErrors(validation.errors)
      focusFirstError(validation.errors)
      return
    }

    setErrors([])
    setPending(true)
    try {
      const result = await submitClaim({ data: nextValue })
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
      {!hydrated ? (
        <div className="mx-auto w-full max-w-6xl px-4 pb-16 text-sm text-secondary md:px-6" aria-live="polite">
          Preparing claim form.
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="mx-auto grid w-full max-w-6xl gap-6 px-4 pb-16 md:px-6">
        {message === undefined ? null : (
          <Banner status="error" title="Publish did not complete" description={message} />
        )}
        <AeClaimFormSection title="Business identity" description="This is how customers recognize the business.">
          <FormLayout>{identityFields.map((field) => renderField(field, value, errorByField, updateTextField, pending))}</FormLayout>
        </AeClaimFormSection>
        <AeClaimFormSection title="Service details" description="Add one service people can understand quickly.">
          <FormLayout>
            {serviceFields.map((field) => renderField(field, value, errorByField, updateTextField, pending))}
            <ResponseTimeField
              value={value}
              errorByField={errorByField}
              disabled={pending}
              updateTextField={updateTextField}
            />
            <AeFileUploadField
              label="Supporting files"
              description="Preview evidence files while preparing the claim. Use the Photo URL field for the image that should publish."
              accept="image/*,.pdf"
            />
          </FormLayout>
        </AeClaimFormSection>
        <AeClaimFormSection title="First request" description="Say what this page can show today.">
          <FormLayout>
            <Field
              label="First request"
              inputID="firstRequestMode"
              description="Choose unavailable if you do not want a contact path on the page yet."
              descriptionID="firstRequestMode-description"
              {...(firstRequestModeInvalid ? { status: { type: 'error' as const, message: firstRequestModeError, messageID: 'firstRequestMode-error' } } : {})}
            >
              <AeRadioCardGroup
                name="firstRequestMode"
                value={value.firstRequestMode}
                options={firstRequestModeOptions}
                aria-describedby={firstRequestModeInvalid ? 'firstRequestMode-description firstRequestMode-error' : 'firstRequestMode-description'}
                aria-invalid={firstRequestModeInvalid}
                disabled={pending}
                onValueChange={(nextValue) => {
                  setValue((current) => ({
                    ...current,
                    firstRequestMode: toFirstRequestMode(nextValue),
                  }))
                }}
              />
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
              pending
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
              pending
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
              pending
            )}
          </FormLayout>
        </AeClaimFormSection>
        <AeReviewBlock value={value} />
        <AeCheckboxField
          id="claimFactsConfirmed"
          label="I confirm these public facts are supplied by the business and ready to publish."
          description="Agentic Economy publishes what you submit. Review the summary above before continuing."
          checked={factsConfirmed}
          disabled={pending}
          onCheckedChange={setFactsConfirmed}
        />
        <div className="flex flex-wrap items-center gap-3">
          <AeActionButton
            type="submit"
            state={pending ? 'loading' : 'idle'}
            leadingIcon={<ArrowRightIcon />}
            disabled={pending || !factsConfirmed}
          >
            Publish service page
          </AeActionButton>
          {previewButton(value.requestedSlug)}
        </div>
        </form>
      )}
    </AePublicShell>
  )
}

function ResponseTimeField({
  value,
  errorByField,
  updateTextField,
  disabled,
}: {
  value: PublicOwnerClaimFlowInput
  errorByField: ReadonlyMap<PublicOwnerClaimField, string>
  updateTextField: (field: TextClaimField, nextValue: string) => void
  disabled: boolean
}) {
  const field = 'responseTimeMinutes'
  const error = errorByField.get(field)

  return (
    <AeRangeField
      name={field}
      label="Typical response time"
      description="Optional public cue. Adjust it only if the business can stand behind it."
      value={value.responseTimeMinutes ?? ''}
      disabled={disabled}
      {...(error === undefined ? {} : { errorMessage: error })}
      onValueChange={(nextValue) => updateTextField(field, nextValue)}
    />
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
  const descriptionId = `${config.field}-description`
  const errorId = `${config.field}-error`
  const describedBy = [
    config.description === undefined ? undefined : descriptionId,
    invalid ? errorId : undefined,
  ].filter(Boolean).join(' ') || undefined
  const status = error === undefined ? undefined : { type: 'error' as const, message: error, messageID: errorId }

  const inputClassName = 'min-h-11 w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-primary outline-none transition focus:border-primary disabled:opacity-50'

  const fieldInput = config.control === 'textarea' ? (
    <textarea
      id={config.field}
      name={config.field}
      value={value[config.field] ?? ''}
      disabled={disabled}
      aria-describedby={describedBy}
      aria-invalid={invalid}
      className={`${inputClassName} min-h-28 resize-y`}
      onChange={(event) => {
        const nextValue = event.currentTarget.value
        updateTextField(config.field, nextValue)
      }}
    />
  ) : (
    <input
      id={config.field}
      name={config.field}
      value={value[config.field] ?? ''}
      disabled={disabled}
      aria-describedby={describedBy}
      aria-invalid={invalid}
      className={inputClassName}
      onChange={(event) => {
        const nextValue = event.currentTarget.value
        updateTextField(config.field, nextValue)
      }}
    />
  )

  if (status === undefined) {
    return (
      <Field key={config.field} label={config.label} inputID={config.field} description={config.description} descriptionID={descriptionId}>
        {fieldInput}
      </Field>
    )
  }

  return (
    <Field key={config.field} label={config.label} inputID={config.field} description={config.description} descriptionID={descriptionId} status={status}>
      {fieldInput}
    </Field>
  )
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
    return <Button label="Preview public page" type="button" variant="secondary" isDisabled />
  }

  return <Button label="Preview public page" variant="secondary" href={`/${slug}`} />
}
