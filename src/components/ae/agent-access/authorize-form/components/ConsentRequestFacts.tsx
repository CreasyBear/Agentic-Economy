import { AeFactList } from '@/components/ae/data/AeFactList'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

import type { ConsentRequestFactsProps } from '../authorize-form.contracts'
import { formatConsentDuration } from '../format-consent-duration'

export function ConsentRequestFacts({
  clientName,
  environment,
  toolSelectionSummary,
  accessSummary,
  expiresInSeconds,
  grantRevision,
  grantRef,
  toolRefs,
}: ConsentRequestFactsProps) {
  return (
    <>
      <AeFactList facts={[
        { label: 'Application', value: `${clientName} · ${environment === 'sandbox' ? 'Sandbox' : 'Production'}` },
        { label: 'Tools', value: toolSelectionSummary },
        { label: 'Approved limits', value: accessSummary },
        { label: 'Connection', value: `Stays signed in until ${formatConsentDuration(expiresInSeconds)} after approval, unless you disconnect it first.` },
      ]} />
      <Collapsible>
        <CollapsibleTrigger
          render={
            <Button type="button" variant="ghost" className="w-fit min-h-touch">
              Technical details
            </Button>
          }
        />
        <CollapsibleContent className="pt-2">
          <AeFactList density="compact" facts={[
            { label: 'Request revision', value: String(grantRevision), mono: true },
            { label: 'Requested environment', value: environment === 'sandbox' ? 'Sandbox' : 'Production' },
            { label: 'Tool references', value: toolRefs.length === 0 ? 'All admitted Tools' : toolRefs.join(', '), mono: true },
            { label: 'Request reference', value: grantRef, mono: true },
          ]} />
        </CollapsibleContent>
      </Collapsible>
      <p id="consent-expiry" className="sr-only">Access expires {formatConsentDuration(expiresInSeconds)} after issue. You can revoke it at any time from Agents.</p>
    </>
  )
}
