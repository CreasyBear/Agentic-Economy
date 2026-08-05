import { AeClaimFormSection } from '@/components/ae/forms/AeClaimFormSection'
import { AeFileUploadField } from '@/components/ae/forms/AeFileUploadField'
import { AeRadioCardGroup } from '@/components/ae/forms/AeRadioCardGroup'
import { AeRangeField } from '@/components/ae/forms/AeRangeField'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { TextClaimField } from '@/modules/catalog/claim-draft'
import type { PublicOwnerClaimField, PublicOwnerClaimFlowInput } from '@/modules/catalog/public'

type FieldConfig = {
  field: TextClaimField
  label: string
  description: string
  control: 'input' | 'tel' | 'textarea'
  /** Native browser autofill token. Mobile keyboards and password managers use
   *  this; omitting it makes an owner retype details their device already has. */
  autoComplete?: string
}

const identityFields = [
  {
    field: 'businessName',
    label: 'Business name',
    description: 'Use the public name customers already know.',
    control: 'input',
    autoComplete: 'organization',
  },
  {
    field: 'category',
    label: 'Trade or service type',
    description: 'Example: Emergency plumbing.',
    control: 'input',
  },
  {
    field: 'suburb',
    label: 'Suburb',
    description: 'The primary local suburb.',
    control: 'input',
    autoComplete: 'address-level2',
  },
  {
    field: 'stateTerritory',
    label: 'State or territory',
    description: 'Use the short Australian state label.',
    control: 'input',
    autoComplete: 'address-level1',
  },
  {
    field: 'requestedSlug',
    label: 'Public page address',
    description: 'Lowercase words separated by hyphens.',
    control: 'input',
  },
  {
    field: 'publishedPhone',
    label: 'Public phone (optional)',
    description: 'Published only when you enter it here. Use an Australian phone number.',
    control: 'tel',
  },
  {
    field: 'sourceLabel',
    label: 'Where these facts came from',
    description: 'Name the website, sign, or person that supplied these details.',
    control: 'input',
  },
] as const satisfies readonly FieldConfig[]

const serviceFields = [
  {
    field: 'serviceName',
    label: 'Service name',
    description: 'Name the job customers ask for, such as emergency pipe repair.',
    control: 'input',
  },
  {
    field: 'serviceCategory',
    label: 'Service type',
    description: 'Use the same trade or service type as above.',
    control: 'input',
  },
  {
    field: 'serviceSummary',
    label: 'Service summary',
    description: 'Say what the customer gets and when the service helps them.',
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
    description: 'Write the hours customers can expect, or say if you are not sure.',
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
    label: 'No contact route yet',
    description: 'Use this when people should read your details but cannot contact you yet.',
  },
  {
    value: 'inquiry_available',
    label: 'People can ask a question',
    description: 'Let people send a first message for you to review.',
  },
  {
    value: 'quote_request_available',
    label: 'People can ask for a quote',
    description: 'Show how to request a quote. You confirm the price and timing.',
  },
] as const

export function ClaimFormSections({
  value,
  errorByField,
  updateTextField,
  disabled,
  onFirstRequestModeChange,
}: {
  value: PublicOwnerClaimFlowInput
  errorByField: ReadonlyMap<PublicOwnerClaimField, string>
  updateTextField: (field: TextClaimField, nextValue: string) => void
  disabled: boolean
  onFirstRequestModeChange: (value: string) => void
}) {
  const firstRequestModeError = errorByField.get('firstRequestMode')
  const firstRequestModeInvalid = firstRequestModeError !== undefined

  return (
    <>
      <AeClaimFormSection title="Business identity" description="Enter the name, trade, and place customers use to find you.">
        <FieldGroup className="grid gap-4">
          {identityFields.map((field) => (
            <ClaimTextField
              key={field.field}
              config={field}
              value={value}
              errorByField={errorByField}
              updateTextField={updateTextField}
              disabled={disabled}
            />
          ))}
        </FieldGroup>
      </AeClaimFormSection>
      <AeClaimFormSection title="Service details" description="Name one job customers ask you to do, such as emergency pipe repair.">
        <FieldGroup className="grid gap-4">
          {serviceFields.map((field) => (
            <ClaimTextField
              key={field.field}
              config={field}
              value={value}
              errorByField={errorByField}
              updateTextField={updateTextField}
              disabled={disabled}
            />
          ))}
          <ResponseTimeField
            value={value}
            errorByField={errorByField}
            disabled={disabled}
            updateTextField={updateTextField}
          />
          <AeFileUploadField
            label="Supporting files"
            description="Preview files while preparing the claim. Use the Photo URL field for the image that should publish."
            accept="image/*,.pdf"
          />
        </FieldGroup>
      </AeClaimFormSection>
      <AeClaimFormSection title="First customer request" description="Tell people whether they can call, ask a question, or ask for a quote today.">
        <FieldGroup className="grid gap-4">
          <FieldSet {...(firstRequestModeInvalid ? { 'data-invalid': true } : {})}>
            <FieldLegend>First customer request</FieldLegend>
            <FieldDescription id="firstRequestMode-description">Choose no contact route if people should only read your details for now.</FieldDescription>
            <AeRadioCardGroup
              name="firstRequestMode"
              value={value.firstRequestMode}
              options={firstRequestModeOptions}
              aria-describedby={firstRequestModeInvalid ? 'firstRequestMode-description firstRequestMode-error' : 'firstRequestMode-description'}
              aria-invalid={firstRequestModeInvalid}
              disabled={disabled}
              onValueChange={onFirstRequestModeChange}
            />
            {firstRequestModeError === undefined ? null : <FieldError id="firstRequestMode-error">{firstRequestModeError}</FieldError>}
          </FieldSet>
          <ClaimTextField
            config={{
              field: 'publicDisclosure',
              label: 'What people should know before asking',
              description: 'This note appears on the public service page.',
              control: 'textarea',
            }}
            value={value}
            errorByField={errorByField}
            updateTextField={updateTextField}
            disabled={disabled}
          />
          <ClaimTextField
            config={{
              field: 'noContactReason',
              label: 'Why people cannot contact you yet',
              description: 'Required when no contact route is published.',
              control: 'textarea',
            }}
            value={value}
            errorByField={errorByField}
            updateTextField={updateTextField}
            disabled={disabled}
          />
          <ClaimTextField
            config={{
              field: 'ownerMessage',
              label: 'Message from the business',
              description: 'Add context customers need. Do not put private contact details here.',
              control: 'textarea',
            }}
            value={value}
            errorByField={errorByField}
            updateTextField={updateTextField}
            disabled={disabled}
          />
        </FieldGroup>
      </AeClaimFormSection>
    </>
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

function ClaimTextField({
  config,
  value,
  errorByField,
  updateTextField,
  disabled,
}: {
  config: FieldConfig
  value: PublicOwnerClaimFlowInput
  errorByField: ReadonlyMap<PublicOwnerClaimField, string>
  updateTextField: (field: TextClaimField, nextValue: string) => void
  disabled: boolean
}) {
  const error = errorByField.get(config.field)
  const invalid = error !== undefined
  const descriptionId = `${config.field}-description`
  const errorId = `${config.field}-error`
  const describedBy = invalid ? `${descriptionId} ${errorId}` : descriptionId

  const fieldInput = config.control === 'textarea' ? (
    <Textarea
      id={config.field}
      name={config.field}
      value={value[config.field] ?? ''}
      disabled={disabled}
      aria-describedby={describedBy}
      aria-invalid={invalid}
      className="min-h-28 resize-y"
      onChange={(event) => updateTextField(config.field, event.currentTarget.value)}
    />
  ) : (
    <Input
      id={config.field}
      name={config.field}
      type={config.control === 'tel' ? 'tel' : 'text'}
      {...(config.control === 'tel'
        ? { inputMode: 'tel' as const, autoComplete: 'tel' }
        : config.autoComplete === undefined ? {} : { autoComplete: config.autoComplete })}
      value={value[config.field] ?? ''}
      disabled={disabled}
      aria-describedby={describedBy}
      aria-invalid={invalid}
      className="min-h-11"
      onChange={(event) => updateTextField(config.field, event.currentTarget.value)}
    />
  )

  return (
    <Field {...(invalid ? { 'data-invalid': true } : {})} {...(disabled ? { 'data-disabled': true } : {})}>
      <FieldLabel htmlFor={config.field}>{config.label}</FieldLabel>
      <FieldDescription id={descriptionId}>{config.description}</FieldDescription>
      {fieldInput}
      {error === undefined ? null : <FieldError id={errorId}>{error}</FieldError>}
    </Field>
  )
}
