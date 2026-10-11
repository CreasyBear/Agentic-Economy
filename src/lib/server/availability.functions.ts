import { createServerFn } from '@tanstack/react-start'

import type { PaidCallsAvailability } from '@/content/availability-copy'
import { readPublicAvailabilityThroughSource } from '@/modules/money/server'

/** Public availability for page copy; an unreadable source reads as 'soon'. */
export const readAvailabilityServer = createServerFn().handler(async (): Promise<PaidCallsAvailability> => {
  try {
    return (await readPublicAvailabilityThroughSource()).paidCalls
  } catch {
    return 'soon'
  }
})
