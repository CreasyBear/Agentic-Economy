'use client'

import { useEffect } from 'react'

import { emitFunnelEventOnce } from '@/lib/observability/funnel-client'

export function AeFunnelAttributionBoot() {
  useEffect(() => {
    emitFunnelEventOnce({ eventType: 'visitor_attributed', stage: 'visitor', correlationPrefix: 'visitor' })
  }, [])

  return null
}
