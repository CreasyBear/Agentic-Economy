import type { FormEvent, RefObject } from 'react'

import type { RemovalDisputeInput } from '@/modules/security/removal-dispute.functions'

export const removalReasonOptions = [
  { value: 'privacy_removal_requested', label: 'Remove Business' },
  { value: 'ownership_contested', label: 'Provider ownership issue' },
  { value: 'duplicate_or_impersonation', label: 'Duplicate or impersonation' },
  { value: 'unsafe_or_inaccurate', label: 'Incorrect Tool or Provider facts' },
] as const

export const removalRequestCopy = {
  submit: 'Submit request',
  referenceSupport: 'Quote this reference and status if you contact support.',
} as const

export type RemoveBusinessFormValue = RemovalDisputeInput

export type RemovalRequestFormProps = Readonly<{
  value: RemoveBusinessFormValue
  error?: string
  receipt?: string
  pending: boolean
  outcomeUnknown: boolean
  contactInvalid: boolean
  evidenceInvalid: boolean
  contactEmailRef: RefObject<HTMLInputElement | null>
  evidenceSummaryRef: RefObject<HTMLTextAreaElement | null>
  slugDescriptionId: string
  contactDescriptionId: string
  contactErrorId: string
  evidenceDescriptionId: string
  evidenceErrorId: string
  contactDescribedBy: string
  evidenceDescribedBy: string
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onSlugChange: (nextSlug: string) => void
  onContactEmailChange: (nextEmail: string) => void
  onReasonCodeChange: (nextReason: string) => void
  onEvidenceSummaryChange: (nextSummary: string) => void
}>
