import { useRef, useState, type FormEvent, type RefObject } from 'react'
import { useServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { toast } from '@/lib/ui/toast'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import { useClientMounted } from '@/hooks/use-client-mounted'
import {
  openRemovalServer,
  type RemovalDisputeInput,
} from '@/modules/security/removal-dispute.functions'

import type { RemovalRequestFormProps, RemoveBusinessFormValue } from './remove-business.contracts'

export type UseRemoveBusinessPageResult = Readonly<{
  hydrated: boolean
  form: RemovalRequestFormProps
}>

export function useRemoveBusinessPage(): UseRemoveBusinessPageResult {
  const openRemoval = useServerFn(openRemovalServer)
  const hydrated = useClientMounted()
  const [value, setValue] = useState<RemoveBusinessFormValue>({
    slug: '',
    contactEmail: '',
    reasonCode: 'privacy_removal_requested',
    evidenceSummary: '',
  })
  const [error, setError] = useState<string | undefined>()
  const [receipt, setReceipt] = useState<string | undefined>()
  const [pending, setPending] = useState(false)
  const [outcomeUnknown, setOutcomeUnknown] = useState(false)
  const contactInvalid = error?.includes('contact') === true
  const evidenceInvalid = error === 'What should change? is required.'
  const contactEmailRef = useRef<HTMLInputElement>(null)
  const evidenceSummaryRef = useRef<HTMLTextAreaElement>(null)
  const slugDescriptionId = 'slug-description'
  const contactDescriptionId = 'contactEmail-description'
  const contactErrorId = 'contactEmail-error'
  const evidenceDescriptionId = 'evidenceSummary-description'
  const evidenceErrorId = 'evidenceSummary-error'
  const contactDescribedBy = contactInvalid ? `${contactDescriptionId} ${contactErrorId}` : contactDescriptionId
  const evidenceDescribedBy = evidenceInvalid ? `${evidenceDescriptionId} ${evidenceErrorId}` : evidenceDescriptionId

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (outcomeUnknown) return
    setError(undefined)
    setReceipt(undefined)

    const nextValue = readRemovalInput(event.currentTarget, value)
    setValue(nextValue)

    if (nextValue.contactEmail.trim().length === 0) {
      setError('A contact email is required.')
      focusField(contactEmailRef)
      return
    }

    if (!z.email().safeParse(nextValue.contactEmail.trim()).success) {
      setError('Enter a valid contact email.')
      focusField(contactEmailRef)
      return
    }

    if (nextValue.evidenceSummary.trim().length === 0) {
      setError('What should change? is required.')
      focusField(evidenceSummaryRef)
      return
    }

    setPending(true)
    try {
      const result = await openRemoval({ data: nextValue })
      if (result.kind === 'ok') {
        const message = `Request ${result.receipt.status}. Reference ${result.receipt.disputeId}.`
        setReceipt(message)
        toast.success('Request recorded', { description: message })
        return
      }

      if (result.retryable) {
        setOutcomeUnknown(true)
        setError('The request outcome could not be confirmed. Contact support before submitting another request.')
        return
      }
      setError(result.reason)
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      setOutcomeUnknown(true)
      setError('The request outcome could not be confirmed. Contact support before submitting another request.')
    } finally {
      setPending(false)
    }
  }

  return {
    hydrated,
    form: {
      value,
      ...(error !== undefined ? { error } : {}),
      ...(receipt !== undefined ? { receipt } : {}),
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
      onSubmit: handleSubmit,
      onSlugChange: (nextSlug) => {
        setValue((current) => ({ ...current, slug: nextSlug }))
      },
      onContactEmailChange: (nextEmail) => {
        setValue((current) => ({ ...current, contactEmail: nextEmail }))
      },
      onReasonCodeChange: (nextReason) => {
        setValue((current) => ({ ...current, reasonCode: toRemovalReason(nextReason) }))
      },
      onEvidenceSummaryChange: (nextSummary) => {
        setValue((current) => ({ ...current, evidenceSummary: nextSummary }))
      },
    },
  }
}

function readRemovalInput(form: HTMLFormElement, fallback: RemovalDisputeInput): RemovalDisputeInput {
  const data = new FormData(form)
  const read = (field: keyof Pick<RemovalDisputeInput, 'slug' | 'contactEmail' | 'evidenceSummary'>) => {
    const value = data.get(field)
    return typeof value === 'string' ? value : ''
  }
  const reasonCodeValue = data.get('reasonCode')

  return {
    slug: read('slug'),
    contactEmail: read('contactEmail'),
    reasonCode: toRemovalReason(typeof reasonCodeValue === 'string' ? reasonCodeValue : fallback.reasonCode),
    evidenceSummary: read('evidenceSummary'),
  }
}

function focusField(ref: RefObject<HTMLElement | null>) {
  window.setTimeout(() => {
    ref.current?.focus()
  }, 0)
}

function toRemovalReason(value: string): RemovalDisputeInput['reasonCode'] {
  if (value === 'ownership_contested' || value === 'duplicate_or_impersonation' || value === 'unsafe_or_inaccurate') {
    return value
  }

  return 'privacy_removal_requested'
}
