import { useMemo } from 'react'

import { SUPPORT_EMAIL, type AeSupportHelpPageProps, type SupportHelpView } from './help.contracts'

function supportEmailHref(callRef: string | undefined): string {
  if (callRef === undefined) return SUPPORT_EMAIL
  return `mailto:support@aecon.ai?subject=Help%20with%20Call%20${encodeURIComponent(callRef)}&body=I%20need%20help%20with%20Call%20reference%3A%20${encodeURIComponent(callRef)}%0A%0AWhat%20happened%3A%0A`
}

export function useSupportHelpPage({ canonicalBaseUrl, callRef }: AeSupportHelpPageProps): SupportHelpView {
  return useMemo(
    () => ({
      supportEmailHref: supportEmailHref(callRef),
      diagnosticCommand: `ae doctor --base-url "${canonicalBaseUrl}"`,
    }),
    [canonicalBaseUrl, callRef]
  )
}
