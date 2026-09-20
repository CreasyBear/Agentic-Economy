import type { FormEvent, RefObject } from 'react'
import type { LucideIcon } from 'lucide-react'
import { CopyXIcon, FileWarningIcon, StoreIcon } from 'lucide-react'

import type { RemovalDisputeInput } from '@/modules/security/removal-dispute.functions'

export const removalReasonOptions = [
  { value: 'privacy_removal_requested', label: 'Remove Provider profile' },
  { value: 'ownership_contested', label: 'Provider ownership issue' },
  { value: 'duplicate_or_impersonation', label: 'Duplicate or impersonation' },
  { value: 'unsafe_or_inaccurate', label: 'Incorrect Tool or Provider facts' },
] as const

export const correctionPaths = [
  {
    icon: FileWarningIcon,
    label: 'Details',
    title: 'Fix published facts',
    body: 'Wrong Tool, price, readiness, access, or Provider information.',
  },
  {
    icon: StoreIcon,
    label: 'Owner',
    title: 'Resolve Provider ownership',
    body: 'The profile is yours, contested, or attached to the wrong Provider.',
  },
  {
    icon: CopyXIcon,
    label: 'Remove',
    title: 'Remove or merge',
    body: 'Duplicate, impersonation, or a Provider profile that should come down.',
  },
] as const satisfies ReadonlyArray<{
  icon: LucideIcon
  label: string
  title: string
  body: string
}>

export type RemoveBusinessFormValue = RemovalDisputeInput

export type CorrectionPathCardsProps = Readonly<{
  paths: typeof correctionPaths
}>

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
