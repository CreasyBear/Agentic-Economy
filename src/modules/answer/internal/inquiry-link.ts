import { sanitizeInquiryDraft } from '@/modules/inquiries/inquiry-prefill'

/**
 * The one answer-side builder for links into a listing's inquiry form.
 *
 * Answer surfaces (selected-provider confirmation, provider cards) all route to
 * `/${slug}/inquiry` through this builder so the wiring is not duplicated. It
 * threads the answer origin (`from=thread&id=`) so the form can offer a "back
 * to answer" return, and carries the customer's stated need as `draft=` so they
 * land with their words already in the form and never retype them.
 *
 * Prefill seeds the form only; it never authors inquiry state (same rule as the
 * claim flow). The draft is sanitized and capped by the shared inquiry prefill
 * contract before it reaches the URL.
 */
export type AnswerInquiryHrefInput = {
  /** The listing's inquiry path, e.g. `/acme-plumbing/inquiry`. */
  inquiryUrl: string
  /** Thread this answer belongs to, if one exists yet. */
  threadId?: string
  /** The customer's stated need, seeded into the form body. */
  draft?: string
}

export function buildAnswerInquiryHref({ inquiryUrl, threadId, draft }: AnswerInquiryHrefInput): string {
  const params: string[] = []

  if (threadId !== undefined && threadId.length > 0) {
    params.push('from=thread', `id=${encodeURIComponent(threadId)}`)
  }

  const cleanDraft = sanitizeInquiryDraft(draft)
  if (cleanDraft !== undefined) {
    params.push(`draft=${encodeURIComponent(cleanDraft)}`)
  }

  if (params.length === 0) {
    return inquiryUrl
  }

  const separator = inquiryUrl.includes('?') ? '&' : '?'
  return `${inquiryUrl}${separator}${params.join('&')}`
}
