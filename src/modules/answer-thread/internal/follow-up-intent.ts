import type { FollowUpIntent } from '../answer-thread.schema'

const BOOKING_PATTERNS = [
  /\bbook\b/i,
  /\bpay\b/i,
  /\bcharge\b/i,
  /\bdispatch\b/i,
  /\bconfirm\s+(my|the)\s+(booking|appointment)/i,
  /\bdo\s+it\s+for\s+me\b/i,
]

const BOUNDARY_PATTERNS = [
  /\bcan\s+(i|you|ae|agentic)\s+book\b/i,
  /\bwhat\s+can\s+(ae|agentic economy)\s+do(?:\s+(?:here|with\s+this))?\b/i,
  /\bdo\s+you\s+take\s+payment\b/i,
  /\bwill\s+you\s+dispatch\b/i,
]

const INQUIRY_HANDOFF_PATTERNS = [
  /\bsend\s+(?:a\s+)?(?:qualified\s+)?inquir/i,
  /\bsubmit\s+(?:a\s+)?(?:qualified\s+)?inquir/i,
  /\bstart\s+(?:a\s+)?(?:qualified\s+)?inquir/i,
  /\bmessage\s+(?:them|him|her|the\s+(?:first|second|third|top|listed)\s+(?:one|business|provider|listing)|[a-z0-9][\w '&.-]{1,80})\b/i,
  /\bcontact\s+(?:them|him|her|the\s+(?:first|second|third|top|listed)\s+(?:one|business|provider|listing)|[a-z0-9][\w '&.-]{1,80})\b/i,
  /\bemail\s+(?:them|him|her|the\s+(?:first|second|third|top|listed)\s+(?:one|business|provider|listing)|[a-z0-9][\w '&.-]{1,80})\b/i,
]

const COMPARE_PATTERNS = [
  /\bcompare\b/i,
  /\bdifference\s+between\b/i,
  /\bfirst\s+two\b/i,
  /\btop\s+two\b/i,
  /\bvs\.?\b/i,
]

const FILTER_PATTERNS = [
  /\bwhich\b.*\b(inquir|accept|take)\b/i,
  /\bonly\b/i,
  /\bfilter\b/i,
  /\bshow\s+me\s+the\s+ones\b/i,
  /\bthat\s+accept\s+inquir/i,
]

export function classifyFollowUpIntent(query: string, priorQueryCount: number): FollowUpIntent {
  const normalized = query.trim()

  if (BOUNDARY_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return 'explain_boundary'
  }

  if (priorQueryCount === 0) {
    return 'refine_search'
  }

  if (BOOKING_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return 'unsupported'
  }

  if (INQUIRY_HANDOFF_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return 'inquiry_handoff'
  }

  if (COMPARE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return 'compare_known'
  }

  if (FILTER_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return 'filter_known'
  }

  return 'refine_search'
}

export function buildThreadTitle(query: string): string {
  const trimmed = query.trim()
  if (trimmed.length <= 80) {
    return trimmed
  }
  return `${trimmed.slice(0, 77)}…`
}
