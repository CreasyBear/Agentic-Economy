const NONESSENTIAL_PUBLIC_FUNNEL_EVENTS = new Set<string>([
  'inquiry_attempted',
])

export function shouldDropPublicFunnelSourceSync(eventType: string): boolean {
  return eventType.startsWith('answer_') || NONESSENTIAL_PUBLIC_FUNNEL_EVENTS.has(eventType)
}
