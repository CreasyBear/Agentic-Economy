'use client'

import { useEffect } from 'react'

import { emitFunnelEventOnce } from '@/lib/observability/funnel-client'

type AeRegistryFunnelBootProps = {
  query: string
}

export function AeRegistryFunnelBoot({ query }: AeRegistryFunnelBootProps) {
  useEffect(() => {
    emitFunnelEventOnce({
      eventType: 'registry_search',
      stage: 'visitor',
      correlationPrefix: 'registry-search',
      payload: { queryLength: query.length },
    })
  }, [query])

  return null
}
