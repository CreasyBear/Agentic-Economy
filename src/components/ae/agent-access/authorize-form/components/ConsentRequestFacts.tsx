import { SettingsPageGroup, SettingsPageRow } from '@/components/ae/shared/arc-pro/settings-page/settings-page'
import { Badge } from '@/components/arc/badge/badge'
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
  presentation = 'review',
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
  unverifiedClient,
}: ConsentRequestFactsProps) {
  return (
    <div className="arc-market arc-consent-request-facts">
      <SettingsPageGroup title="Request details" headingLevel={2}>
        {[
          { ...returnSiteFact({ flow, ...(redirectDisposition === undefined ? {} : { redirectDisposition }), ...(redirectOrigin === undefined ? {} : { redirectOrigin }) }), emphasis: true },
          { label: 'Application', value: `${clientName} · ${environment === 'sandbox' ? 'Sandbox' : 'Production'}`, unverified: unverifiedClient === true },
          ...(presentation === 'review' ? [{ label: 'Tools', value: toolSelectionSummary }] : []),
          ...(presentation === 'context' ? [] : [{ label: 'Requested limits', value: accessSummary }]),
          ...(presentation === 'review' ? [{ label: 'Connection', value: `Stays signed in for ${formatConsentDuration(expiresInSeconds)} after approval, unless you disconnect it first.` }] : []),
        ].map(fact => (
          <SettingsPageRow key={fact.label} label={fact.label} headingLevel={3}>
            {'mono' in fact && fact.mono
              ? <code className={`arc-consent-fact-value arc-consent-fact-reference${'emphasis' in fact ? ' font-medium' : ''}`}>{fact.value}</code>
              : <span className="arc-consent-fact-value">{fact.value}</span>}
            {'unverified' in fact && fact.unverified ? <Badge variant="warning" className="ml-2">Unverified application</Badge> : null}
          </SettingsPageRow>
        ))}
      </SettingsPageGroup>
      <Collapsible>
        <CollapsibleTrigger
          render={
            <Button type="button" variant="ghost" size="md" className="arc-consent-technical-trigger">
              Technical details
            </Button>
          }
        />
        <CollapsibleContent className="arc-consent-technical-content">
          <SettingsPageGroup title="Technical request details" headingLevel={2}>
            {[
              { label: 'Request revision', value: String(grantRevision), mono: true },
              { label: 'Requested environment', value: environment === 'sandbox' ? 'Sandbox' : 'Production' },
              { label: 'Tool references', value: toolRefs.length === 0 ? 'All admitted Tools' : toolRefs.join(', '), mono: true },
              { label: 'Request reference', value: grantRef, mono: true },
            ].map(fact => (
              <SettingsPageRow key={fact.label} label={fact.label} headingLevel={3}>
                {'mono' in fact && fact.mono
                  ? <code className="arc-consent-fact-value arc-consent-fact-reference">{fact.value}</code>
                  : <span className="arc-consent-fact-value">{fact.value}</span>}
              </SettingsPageRow>
            ))}
          </SettingsPageGroup>
        </CollapsibleContent>
      </Collapsible>
      <p id="consent-expiry" className="sr-only">Access expires {formatConsentDuration(expiresInSeconds)} after issue. You can revoke it at any time from Agents.</p>
    </div>
  )
}
