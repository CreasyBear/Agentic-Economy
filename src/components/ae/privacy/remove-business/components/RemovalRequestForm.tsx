import { Link } from '@tanstack/react-router'
import { AeAlert as Alert } from '@/components/ae/shared/alert/AeAlert'
import { Button } from '@/components/arc/button/button'
import { Input } from '@/components/arc/input/input'
import { Select } from '@/components/ae/shared/base-ui/select/select'
import { Textarea } from '@/components/arc/textarea/textarea'
import '../CorrectionComposition.css'

import { removalReasonOptions, removalRequestCopy, type RemovalRequestFormProps } from '../remove-business.contracts'

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
    onSubmit,
    onSlugChange,
    onContactEmailChange,
    onReasonCodeChange,
    onEvidenceSummaryChange,
  } = props

  return (
    <form onSubmit={onSubmit} className="arc-market arc-correction-form" noValidate>
      {error !== undefined && !contactInvalid && !evidenceInvalid ? (
        <Alert tone="danger" role="alert" title="Request needs attention">
          {error}
          {outcomeUnknown ? <> <Link to="/support" className="arc-correction-support-link underline underline-offset-4">Open support</Link> with the Provider slug and your contact email.</> : null}
        </Alert>
      ) : null}
      {receipt === undefined ? null : (
        <Alert tone="success" role="status" title="Request recorded">
          <span>{receipt}</span>
          <span className="block">{removalRequestCopy.referenceSupport}</span>
        </Alert>
      )}
      <div className="arc-correction-fields">
        <Input
          id="slug"
          name="slug"
          label="Provider slug"
          description="Shown in the Provider profile URL."
          value={value.slug}
          disabled={pending}
          onChange={(event) => {
            onSlugChange(event.currentTarget.value)
          }}
        />
        <Input
          id="contactEmail"
          name="contactEmail"
          label="Your email"
          description="Used only to follow up."
          {...(contactInvalid ? { error: error ?? '' } : {})}
          type="email"
          autoComplete="email"
          aria-invalid={contactInvalid}
          ref={contactEmailRef}
          value={value.contactEmail}
          disabled={pending}
          onChange={(event) => {
            onContactEmailChange(event.currentTarget.value)
          }}
        />
        <input type="hidden" name="reasonCode" value={value.reasonCode} />
        <Select
          label="Reason"
          options={removalReasonOptions.map((option) => ({ value: option.value, label: option.label }))}
          id="reasonCode"
          placeholder="Choose one"
          value={value.reasonCode}
          disabled={pending}
          onValueChange={(nextValue) => {
            if (nextValue != null) {
              onReasonCodeChange(nextValue)
            }
          }}
        />
        <Textarea
          id="evidenceSummary"
          name="evidenceSummary"
          label="What should change?"
          description="A short note is enough."
          {...(evidenceInvalid ? { error: error ?? '' } : {})}
          aria-invalid={evidenceInvalid}
          ref={evidenceSummaryRef}
          value={value.evidenceSummary}
          disabled={pending}
          onChange={(event) => {
            onEvidenceSummaryChange(event.currentTarget.value)
          }}
        />
      </div>
      <Button type="submit" variant="primary" size="md" disabled={pending || outcomeUnknown} loading={pending} className="arc-correction-submit">
        {outcomeUnknown ? 'Outcome not confirmed' : removalRequestCopy.submit}
      </Button>
    </form>
  )
}
