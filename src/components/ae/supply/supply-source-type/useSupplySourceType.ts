import { useState } from 'react'

import { inspectHttpsUrl } from '../supply-source-native-start-presentation'
import {
  SUPPLY_SOURCE_TYPE_COPY,
  URL_DISCOVER_DIAGNOSTICS,
  httpsDiscoverNextStep,
  type SupplySourceTypeSectionProps,
  type UrlDiscoverDiagnostic,
} from './supply-source-type.contracts'

export function useSupplySourceType(props: Pick<SupplySourceTypeSectionProps, 'resourceUrl' | 'onDiscover'>) {
  const [discoverDiagnostic, setDiscoverDiagnostic] = useState<UrlDiscoverDiagnostic>()

  function handleDiscover() {
    setDiscoverDiagnostic(undefined)
    const preflight = inspectHttpsUrl(props.resourceUrl)
    if (preflight === 'invalid' || preflight === 'insecure') {
      setDiscoverDiagnostic(urlDiagnostic(preflight, SUPPLY_SOURCE_TYPE_COPY.httpsExample.x402))
      return
    }
    props.onDiscover()
  }

  return { discoverDiagnostic, handleDiscover }
}

function urlDiagnostic(preflight: 'invalid' | 'insecure', example: string) {
  const diagnostic = URL_DISCOVER_DIAGNOSTICS[preflight]
  if (preflight === 'insecure') return diagnostic
  return { ...diagnostic, nextStep: httpsDiscoverNextStep(example) }
}
