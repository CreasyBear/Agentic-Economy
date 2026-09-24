import { useState } from 'react'
import { ExternalLink } from 'lucide-react'

import { AeSavedPaymentMethodsCard } from '@/components/ae/console/AeSavedPaymentMethodsCard'
import { SettingsPage } from '@/components/ae/settings/settings-shell/components/SettingsSections'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import { useBillingPaymentMethods } from './useBillingSettings'

export function PaymentMethodsPage() {
  const { summary, expiryKind, isLoading, unavailable, refresh, onManage } = useBillingPaymentMethods()
  const [opening, setOpening] = useState(false)
  const [failed, setFailed] = useState(false)

  async function openPortal() {
    if (opening) return
    setOpening(true)
    setFailed(false)
    try {
      const { portalUrl } = await onManage()
      if (!portalUrl) throw new Error('portal_url_missing')
      window.location.assign(portalUrl)
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      setFailed(true)
      setOpening(false)
    }
  }

  return <SettingsPage
    title="Payment methods"
    description="Manage saved cards and your default payment method in Stripe."
    action={<Button type="button" disabled={opening || isLoading} onClick={() => { if (unavailable) void refresh(); else void openPortal() }}>
      {unavailable ? 'Try again' : opening ? 'Opening Stripe…' : summary?.kind === 'ready' && summary.hasPaymentMethod ? 'Manage in Stripe' : 'Add a card'}
      {!unavailable && <ExternalLink aria-hidden="true" />}
    </Button>}
  >
    {failed && <Alert variant="destructive" role="alert"><AlertTitle>Could not open Stripe</AlertTitle><AlertDescription>Nothing was charged. Check your connection and try again.</AlertDescription></Alert>}
    {unavailable ? <Alert variant="destructive" role="alert"><AlertTitle>Payment methods unavailable</AlertTitle><AlertDescription>We could not confirm your saved card. Try again before changing payment settings.</AlertDescription></Alert> : <AeSavedPaymentMethodsCard {...(summary === undefined ? {} : { summary })} expiryKind={expiryKind} isLoading={isLoading} />}
  </SettingsPage>
}
