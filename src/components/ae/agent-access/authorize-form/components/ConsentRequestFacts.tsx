import { AeFactList } from '@/components/ae/data/AeFactList'
import { Button } from '@/components/arc/button/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

import type { ConsentRequestFactsProps } from '../authorize-form.contracts'
import { formatConsentDuration } from '../format-consent-duration'
import './ConsentEvidenceComposition.css'

function returnSiteFact(props: Pick<ConsentRequestFactsProps, 'flow' | 'redirectDisposition' | 'redirectOrigin'>): { label: string; value: string; mono?: boolean } {
  if (props.redirectDisposition === 'origin' && props.redirectOrigin !== undefined) {
    return { label: 'Returns to', value: props.redirectOrigin, mono: true }
  }
  if (props.redirectDisposition === 'unavailable' || (props.flow === 'authorization_code' && props.redirectOrigin === undefined)) {
    return { label: 'Returns to', value: 'Return site unavailable. Decline this request.' }
  }
  return { label: 'Returns to', value: 'This request does not redirect your browser.' }
}

export function ConsentRequestFacts({
  clientName,
  environment,
  toolSelectionSummary,
  accessSummary,
  expiresInSeconds,
  grantRevision,
  grantRef,
  toolRefs,
  flow,
  redirectDisposition,
  redirectOrigin,
}: ConsentRequestFactsProps) {
  return (
    <div className="arc-market arc-consent-request-facts">
      <AeFactList facts={[
        { label: 'Application', value: `${clientName} · ${environment === 'sandbox' ? 'Sandbox' : 'Production'}` },
        returnSiteFact({ flow, ...(redirectDisposition === undefined ? {} : { redirectDisposition }), ...(redirectOrigin === undefined ? {} : { redirectOrigin }) }),
        { label: 'Tools', value: toolSelectionSummary },
        { label: 'Approved limits', value: accessSummary },
        { label: 'Connection', value: `Stays signed in for ${formatConsentDuration(expiresInSeconds)} after approval, unless you disconnect it first.` },
      ]} />
      <Collapsible>
        <CollapsibleTrigger
          render={
            <Button type="button" variant="ghost" size="md" className="arc-consent-technical-trigger">
              Technical details
            </Button>
          }
        />
        <CollapsibleContent className="arc-consent-technical-content">
          <div className="arc-consent-technical-detail-body">
            <AeFactList density="compact" facts={[
              { label: 'Request revision', value: String(grantRevision), mono: true },
              { label: 'Requested environment', value: environment === 'sandbox' ? 'Sandbox' : 'Production' },
              { label: 'Tool references', value: toolRefs.length === 0 ? 'All admitted Tools' : toolRefs.join(', '), mono: true },
              { label: 'Request reference', value: grantRef, mono: true },
            ]} />
          </div>
        </CollapsibleContent>
      </Collapsible>
      <p id="consent-expiry" className="sr-only">Access expires {formatConsentDuration(expiresInSeconds)} after issue. You can revoke it at any time from Agents.</p>
    </div>
  )
}
