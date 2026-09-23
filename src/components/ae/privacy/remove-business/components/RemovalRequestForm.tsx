import { Link } from '@tanstack/react-router'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'

import { removalReasonOptions, type RemovalRequestFormProps } from '../remove-business.contracts'

export function RemovalRequestForm(props: RemovalRequestFormProps) {
  const {
    value,
    error,
    receipt,
    pending,
    outcomeUnknown,
    contactInvalid,
    evidenceInvalid,
    contactEmailRef,
    evidenceSummaryRef,
    slugDescriptionId,
    contactDescriptionId,
    contactErrorId,
    evidenceDescriptionId,
    evidenceErrorId,
    contactDescribedBy,
    evidenceDescribedBy,
    onSubmit,
    onSlugChange,
    onContactEmailChange,
    onReasonCodeChange,
    onEvidenceSummaryChange,
  } = props

  return (
    <form onSubmit={onSubmit} className="mx-auto grid w-full max-w-3xl gap-section" noValidate>
      {error === undefined ? null : (
        <Alert variant="destructive">
          <AlertTitle>Request needs attention</AlertTitle>
          <AlertDescription>
            {error}
            {outcomeUnknown ? <> <Link to="/support" className="underline underline-offset-4">Open support</Link> with the Provider slug and your contact email.</> : null}
          </AlertDescription>
        </Alert>
      )}
      {receipt === undefined ? null : (
        <Alert>
          <AlertTitle>Request recorded</AlertTitle>
          <AlertDescription>{receipt}</AlertDescription>
        </Alert>
      )}
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="slug">Provider slug</FieldLabel>
          <Input
            id="slug"
            name="slug"
            value={value.slug}
            disabled={pending}
            aria-describedby={slugDescriptionId}
            className="min-h-touch"
            onChange={(event) => {
              onSlugChange(event.currentTarget.value)
            }}
          />
          <FieldDescription id={slugDescriptionId}>Shown in the Provider profile URL.</FieldDescription>
        </Field>
        <Field {...(contactInvalid ? { 'data-invalid': true } : {})}>
          <FieldLabel htmlFor="contactEmail">Your email</FieldLabel>
          <Input
            id="contactEmail"
            name="contactEmail"
            type="email"
            aria-describedby={contactDescribedBy}
            aria-invalid={contactInvalid}
            ref={contactEmailRef}
            value={value.contactEmail}
            disabled={pending}
            className="min-h-touch"
            onChange={(event) => {
              onContactEmailChange(event.currentTarget.value)
            }}
          />
          <FieldDescription id={contactDescriptionId}>Used only to follow up.</FieldDescription>
          {contactInvalid ? (
            <FieldError id={contactErrorId}>{error ?? ''}</FieldError>
          ) : null}
        </Field>
        <Field>
          <FieldLabel htmlFor="reasonCode">Reason</FieldLabel>
          <input type="hidden" name="reasonCode" value={value.reasonCode} />
          <Select
            value={value.reasonCode}
            disabled={pending}
            onValueChange={(nextValue) => {
              if (nextValue != null) {
                onReasonCodeChange(nextValue)
              }
            }}
          >
            <SelectTrigger id="reasonCode" className="min-h-touch w-full">
              <SelectValue placeholder="Choose one" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {removalReasonOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field {...(evidenceInvalid ? { 'data-invalid': true } : {})}>
          <FieldLabel htmlFor="evidenceSummary">What should change?</FieldLabel>
          <Textarea
            id="evidenceSummary"
            name="evidenceSummary"
            aria-describedby={evidenceDescribedBy}
            aria-invalid={evidenceInvalid}
            ref={evidenceSummaryRef}
            value={value.evidenceSummary}
            disabled={pending}
            className="min-h-28 resize-y"
            onChange={(event) => {
              onEvidenceSummaryChange(event.currentTarget.value)
            }}
          />
          <FieldDescription id={evidenceDescriptionId}>A short note is enough.</FieldDescription>
          {evidenceInvalid ? (
            <FieldError id={evidenceErrorId}>{error ?? ''}</FieldError>
          ) : null}
        </Field>
      </FieldGroup>
      <Button type="submit" disabled={pending || outcomeUnknown} className="min-h-touch justify-self-start">
        {pending ? <Spinner /> : null}
        {outcomeUnknown ? 'Outcome not confirmed' : 'Send request'}
      </Button>
    </form>
  )
}
