import { useEffect, useState } from 'react'

import { captureRouteException } from '@/lib/observability/capture-route-exception'
import { parseOwnerToolsCompatibilitySearch } from '@/lib/operator/supply-compatibility'

import { connectionRefFromHash } from './owner-provider-connections-model'

export function useProviderConnectionHashFocus(
  setRebindOfferingRef: (offeringRef: string) => void,
  setRebindConnectionRef: (connectionRef: string | undefined) => void,
) {
  const [programmaticFocusId, setProgrammaticFocusId] = useState<string | undefined>(undefined)
  useEffect(() => {
    const focusHashTarget = () => {
      let targetId: string
      try {
        targetId = decodeURIComponent(window.location.hash.replace(/^#/, ''))
      } catch (cause) {
        captureRouteException(cause, { site: 'focusHashTarget' }, 'warning')
        return
      }
      if (
        targetId !== 'provider-connections'
        && targetId !== 'provider-x402-resource-url'
        && !targetId.startsWith('provider-connection-')
      ) return
      const target = document.getElementById(targetId)
      if (target === null) return
      target.scrollIntoView({ block: 'start' })
      setProgrammaticFocusId(targetId)
    }
    window.addEventListener('hashchange', focusHashTarget)
    focusHashTarget()
    const requestedRebind = parseOwnerToolsCompatibilitySearch(Object.fromEntries(new URLSearchParams(window.location.search))).rebind
    if (requestedRebind !== undefined) {
      setRebindOfferingRef(requestedRebind)
      setRebindConnectionRef(connectionRefFromHash())
    }
    return () => window.removeEventListener('hashchange', focusHashTarget)
  }, [setRebindConnectionRef, setRebindOfferingRef])

  useEffect(() => {
    if (programmaticFocusId === undefined) return
    document.getElementById(programmaticFocusId)?.focus({ preventScroll: true })
  }, [programmaticFocusId])

  return {
    programmaticFocusId,
    clearProgrammaticFocus: () => setProgrammaticFocusId(undefined),
  }
}
