/**
 * The inquiry prefill contract.
 *
 * One place defines the URL query-param names, the draft length cap, the slug
 * shape, and the sanitizers, so every producer (the answer journey, the quiet
 * agent door) and the single consumer (the `/$slug/inquiry` form) agree on
 * exactly what a prefilled inquiry link may carry.
 *
 * Prefill only seeds the form's initial fields. It never authors a duplicate,
 * success, or result record from a URL — the same rule the claim flow follows.
 * A person can always edit or clear a prefilled field, and nothing is sent
 * until they choose to send it.
 *
 * Pure leaf: no imports, no side effects. Safe to pull into a client bundle or
 * a Convex-reachable module graph.
 */

/**
 * A stated need pasted into a URL query param, capped well under the domain
 * body maximum (2000 chars) so a prefilled link stays short and pasteable. The
 * person can still expand it up to the full body maximum inside the form.
 */
export const MAX_INQUIRY_DRAFT_CHARS = 500

/** Slug params are bounded so a hand-crafted link can never carry an oversized path/query segment. */
const MAX_INQUIRY_SLUG_CHARS = 120

/** Business and service slugs are lowercase kebab identifiers. */
const INQUIRY_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Normalize a stated-need string into a safe form-body seed, or drop it.
 *
 * Strips control characters, collapses runs of whitespace, trims, and caps the
 * length. Returns `undefined` for anything that is not a non-empty string once
 * cleaned, so callers can treat "no usable draft" uniformly.
 */
export function sanitizeInquiryDraft(raw: unknown): string | undefined {
  if (typeof raw !== 'string') {
    return undefined
  }

  const cleaned = raw
    .replace(/[\u0000-\u001F\u007F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (cleaned.length === 0) {
    return undefined
  }

  return cleaned.slice(0, MAX_INQUIRY_DRAFT_CHARS).trim()
}

/**
 * Validate a business/service slug carried in a prefill link, or drop it.
 *
 * Slugs must be lowercase kebab and within the length bound. Anything else
 * (uppercase, path traversal, query characters, whitespace) returns
 * `undefined`, so a malformed slug can never reach a path segment or a
 * service-preselect lookup.
 */
export function sanitizeInquirySlug(raw: unknown): string | undefined {
  if (typeof raw !== 'string') {
    return undefined
  }

  const cleaned = raw.trim()
  if (cleaned.length === 0 || cleaned.length > MAX_INQUIRY_SLUG_CHARS) {
    return undefined
  }

  return INQUIRY_SLUG_PATTERN.test(cleaned) ? cleaned : undefined
}

export type PublicInquirySearch = {
  from?: 'thread'
  id?: string
  draft?: string
  service?: string
}

export function validateInquirySearch(search: Record<string, unknown>): PublicInquirySearch {
  const from = search.from === 'thread' ? search.from : undefined
  const id = typeof search.id === 'string' && search.id.trim().length > 0 ? search.id.trim() : undefined
  const draft = sanitizeInquiryDraft(search.draft)
  const service = sanitizeInquirySlug(search.service)
  return {
    ...(from === undefined ? {} : { from }),
    ...(id === undefined ? {} : { id }),
    ...(draft === undefined ? {} : { draft }),
    ...(service === undefined ? {} : { service }),
  }
}

export type InquiryPrefillHrefInput = {
  /** Business slug that owns the inquiry form. */
  slug: string
  /** Stated need to seed the form body. Sanitized and capped; dropped if unusable. */
  draft?: string
  /** Service slug to preselect when the listing publishes more than one inquiry path. */
  service?: string
}

/**
 * Build a link into a listing's inquiry form, carrying only the declared
 * prefill fields. Returns `undefined` when the slug is malformed so callers can
 * safely omit the link rather than emit a broken or injected URL.
 */
export function buildInquiryPrefillHref(input: InquiryPrefillHrefInput): string | undefined {
  const slug = sanitizeInquirySlug(input.slug)
  if (slug === undefined) {
    return undefined
  }

  const params: string[] = []

  const draft = sanitizeInquiryDraft(input.draft)
  if (draft !== undefined) {
    params.push(`draft=${encodeURIComponent(draft)}`)
  }

  const service = sanitizeInquirySlug(input.service)
  if (service !== undefined) {
    params.push(`service=${encodeURIComponent(service)}`)
  }

  const base = `/${slug}/inquiry`
  return params.length > 0 ? `${base}?${params.join('&')}` : base
}
