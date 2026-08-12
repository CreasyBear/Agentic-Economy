import { AeClaimFormSection } from '@/components/ae/forms/AeClaimFormSection'
import { AeFileUploadField } from '@/components/ae/forms/AeFileUploadField'
import { AeRangeField } from '@/components/ae/forms/AeRangeField'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'
import type { BusinessContextTextField, TextClaimField } from '@/modules/catalog/claim-draft'
import { readClaimTextField } from '@/modules/catalog/claim-draft'
import type { PublicOwnerClaimField, PublicOwnerClaimFlowInput } from '@/modules/catalog/public'
import type { BusinessContext } from '@/modules/business/public'

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

const providerIdentityFields = [
  {
    field: 'businessName',
    label: 'Provider or business name',
    description: 'Use the public name customers and integrators recognise.',
    control: 'input',
    autoComplete: 'organization',
  },
  {
    field: 'category',
    label: 'Service category',
    description: 'Example: Data enrichment API or MCP service.',
    control: 'input',
  },
  {
    field: 'requestedSlug',
    label: 'Public page address',
    description: 'Lowercase words separated by hyphens.',
    control: 'input',
  },
  {
    field: 'providerWebsite',
    label: 'Provider website',
    description: 'Canonical HTTPS website for this provider.',
    control: 'input',
    autoComplete: 'url',
  },
  {
    field: 'providerIdentifier',
    label: 'Stable provider identifier',
    description: 'A stable public identifier such as a registered provider or organisation ID.',
    control: 'input',
  },
  {
    field: 'sourceLabel',
    label: 'Identity source',
    description: 'Name the public source that supports this provider identity.',
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

const businessContextKindOptions = [
  {
    value: 'local_human',
    label: 'List a human service',
    description: 'Publish a local business page with service area, contact, and request details.',
  },
  {
    value: 'programmable_provider',
    label: 'Connect an API or agent service',
    description: 'Create your provider identity first. You will add an Offering and publish it next.',
  },
] as const

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
  onBusinessContextKindChange,
  onFirstRequestModeChange,
}: {
  value: PublicOwnerClaimFlowInput
  errorByField: ReadonlyMap<PublicOwnerClaimField, string>
  updateTextField: (field: TextClaimField, nextValue: string) => void
  disabled: boolean
  onBusinessContextKindChange: (value: BusinessContext['kind']) => void
  onFirstRequestModeChange: (value: string) => void
}) {
  const businessContextError = errorByField.get('businessContext')
  const businessContextInvalid = businessContextError !== undefined
  const firstRequestModeError = errorByField.get('firstRequestMode')
  const firstRequestModeInvalid = firstRequestModeError !== undefined

  return (
    <>
      <AeClaimFormSection title="What are you listing?" description="Choose the identity path that matches what you provide.">
        <FieldSet {...(businessContextInvalid ? { 'data-invalid': true } : {})}>
          <FieldLegend>Service type</FieldLegend>
          <FieldDescription id="businessContextKind-description">Local human services keep their location facts. Programmable providers use a website and stable identifier instead.</FieldDescription>
          <FieldGroup className="grid gap-2" {...(businessContextInvalid ? { 'data-invalid': true } : {})}>
            <RadioGroup
              name="businessContextKind"
              value={value.businessContext.kind}
              disabled={disabled}
              aria-describedby={businessContextInvalid ? 'businessContextKind-description businessContextKind-error' : 'businessContextKind-description'}
              aria-invalid={businessContextInvalid || undefined}
              aria-disabled={disabled || undefined}
              className="grid gap-2"
              onValueChange={(nextValue) => onBusinessContextKindChange(nextValue as BusinessContext['kind'])}
            >
              {businessContextKindOptions.map((option) => {
                const selected = option.value === value.businessContext.kind
                return (
                  <Field key={option.value} orientation="horizontal" className="gap-0" {...(businessContextInvalid ? { 'data-invalid': true } : {})} {...(disabled ? { 'data-disabled': true } : {})}>
                    <FieldLabel
                      htmlFor={option.value}
                      className={cn(
                        'flex min-h-11 w-full cursor-pointer items-start gap-3 rounded-md border border-border bg-card p-3 text-left text-sm motion-safe:transition motion-safe:duration-150 hover:bg-muted hover:shadow-low',
                        selected && 'border-primary bg-muted shadow-low',
                        disabled && 'cursor-not-allowed opacity-50',
                      )}
                    >
                      <RadioGroupItem
                        id={option.value}
                        value={option.value}
                        aria-describedby={businessContextInvalid ? 'businessContextKind-description businessContextKind-error' : 'businessContextKind-description'}
                        aria-invalid={businessContextInvalid || undefined}
                        className="mt-1"
                      />
                      <span className="grid gap-1">
                        <span className="font-medium text-foreground">{option.label}</span>
                        <span className="text-muted-foreground">{option.description}</span>
                      </span>
                    </FieldLabel>
                  </Field>
                )
              })}
            </RadioGroup>
          </FieldGroup>
          {businessContextError === undefined ? null : <FieldError id="businessContextKind-error">{businessContextError}</FieldError>}
        </FieldSet>
      </AeClaimFormSection>
      {value.businessContext.kind === 'programmable_provider' ? (
        <>
          <AeClaimFormSection title="Provider identity" description="Claim the provider identity now. No suburb, state, phone, or human-service facts are required.">
            <FieldGroup className="grid gap-4">
              {providerIdentityFields.map((field) => (
                <ClaimTextField
                  key={field.field}
                  config={field}
                  value={value}
                  errorByField={errorByField}
                  updateTextField={updateTextField}
                  disabled={disabled}
                />
              ))}
              <ClaimTextField
                config={{
                  field: 'ownerMessage',
                  label: 'Provider note (optional)',
                  description: 'Add context for your identity review. Do not put credentials here.',
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
      ) : (
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
                <FieldGroup className="grid gap-2" {...(firstRequestModeInvalid ? { 'data-invalid': true } : {})}>
                  <RadioGroup
                    name="firstRequestMode"
                    value={value.firstRequestMode}
                    disabled={disabled}
                    aria-describedby={firstRequestModeInvalid ? 'firstRequestMode-description firstRequestMode-error' : 'firstRequestMode-description'}
                    aria-invalid={firstRequestModeInvalid || undefined}
                    aria-disabled={disabled || undefined}
                    className="grid gap-2"
                    onValueChange={onFirstRequestModeChange}
                  >
                    {firstRequestModeOptions.map((option) => {
                      const selected = option.value === value.firstRequestMode
                      return (
                        <Field key={option.value} orientation="horizontal" className="gap-0" {...(firstRequestModeInvalid ? { 'data-invalid': true } : {})} {...(disabled ? { 'data-disabled': true } : {})}>
                          <FieldLabel
                            htmlFor={option.value}
                            className={cn(
                              'flex min-h-11 w-full cursor-pointer items-start gap-3 rounded-md border border-border bg-card p-3 text-left text-sm motion-safe:transition motion-safe:duration-150 hover:bg-muted hover:shadow-low',
                              selected && 'border-primary bg-muted shadow-low',
                              disabled && 'cursor-not-allowed opacity-50',
                            )}
                          >
                            <RadioGroupItem
                              id={option.value}
                              value={option.value}
                              aria-describedby={firstRequestModeInvalid ? 'firstRequestMode-description firstRequestMode-error' : 'firstRequestMode-description'}
                              aria-invalid={firstRequestModeInvalid || undefined}
                              className="mt-1"
                            />
                            <span className="grid gap-1">
                              <span className="font-medium text-foreground">{option.label}</span>
                              <span className="text-muted-foreground">{option.description}</span>
                            </span>
                          </FieldLabel>
                        </Field>
                      )
                    })}
                  </RadioGroup>
                </FieldGroup>
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
      )}
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
  const error = isBusinessContextTextField(config.field)
    ? errorByField.get('businessContext')
    : errorByField.get(config.field)
  const invalid = error !== undefined
  const descriptionId = `${config.field}-description`
  const errorId = `${config.field}-error`
  const describedBy = invalid ? `${descriptionId} ${errorId}` : descriptionId

  const fieldInput = config.control === 'textarea' ? (
    <Textarea
      id={config.field}
      name={config.field}
      value={readClaimTextField(value, config.field)}
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
      value={readClaimTextField(value, config.field)}
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

function isBusinessContextTextField(field: TextClaimField): field is BusinessContextTextField {
  return field === 'providerWebsite'
    || field === 'providerIdentifier'
    || field === 'suburb'
    || field === 'stateTerritory'
    || field === 'publishedPhone'
}
