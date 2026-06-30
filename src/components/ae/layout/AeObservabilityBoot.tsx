import { useEffect } from 'react'
import { useRouter } from '@tanstack/react-router'

import { bootClientObservability } from '@/lib/observability/boot-client-observability'

export function AeObservabilityBoot() {
  const router = useRouter()

  useEffect(() => {
    bootClientObservability(router)
  }, [router])

  return null
}
