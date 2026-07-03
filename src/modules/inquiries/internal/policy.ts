export type InquiryUnsafeActionIntent =
  | 'booking'
  | 'payment'
  | 'dispatch'
  | 'autonomous_fulfillment'
  | 'acceptance'

const unsafeActionIntentPatterns: readonly {
  intent: InquiryUnsafeActionIntent
  pattern: RegExp
}[] = [
  {
    intent: 'booking',
    pattern:
      /\b(?:book|schedule|reserve)\s+(?:it|this|me|us|the\s+(?:job|service|appointment|visit|callout)|an?\s+(?:appointment|visit|callout)|someone)\b/i,
  },
  {
    intent: 'booking',
    pattern: /\b(?:i|we)\s+(?:want|need|would\s+like)\s+to\s+(?:book|schedule|reserve)\b/i,
  },
  {
    intent: 'payment',
    pattern: /\b(?:pay|charge)\s+(?:now|my|our|the|this)\b/i,
  },
  {
    intent: 'payment',
    pattern: /\b(?:take|process)\s+(?:my|our|the)?\s*(?:payment|card|deposit)\b/i,
  },
  {
    intent: 'payment',
    pattern: /\b(?:stripe|wallet|x402|payment\s*intent|checkout)\b/i,
  },
  {
    intent: 'dispatch',
    pattern: /\b(?:dispatch|send)\s+(?:someone|a\s+(?:technician|plumber|contractor)|the\s+(?:technician|plumber|contractor)|them)\b/i,
  },
  {
    intent: 'acceptance',
    pattern: /\b(?:accept|approve|confirm)\s+(?:the\s+)?(?:quote|job|work|booking)\b/i,
  },
  {
    intent: 'autonomous_fulfillment',
    pattern: /\b(?:autonomous|automatically|without\s+a\s+human|auto[-\s]?fulfill|agent\s+(?:can|should|to)\s+(?:book|pay|dispatch|schedule))\b/i,
  },
]

export function findUnsafeInquiryActionIntent(value: string): InquiryUnsafeActionIntent | undefined {
  const normalized = value.trim().replace(/\s+/g, ' ')
  if (normalized.length === 0) {
    return undefined
  }

  return unsafeActionIntentPatterns.find(({ pattern }) => pattern.test(normalized))?.intent
}
