import { useEffect, useState } from 'react'
import { Button } from '@/components/arc/button/button'
import { Skeleton } from '@/components/arc/skeleton/skeleton'
import buttonStyles from '@/components/arc/button/button.module.css'
import { recordProductJourney } from '@/lib/observability/product-journey'
import '@/components/ae/website/AuthComposition.css'

const AUTH_DELAY_MS = 15_000

export function AuthLoadingState({ mode, reload = () => window.location.reload() }: Readonly<{
  mode: 'sign_in' | 'sign_up'
  reload?: () => void
}>) {
  const [delayed, setDelayed] = useState(false)
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDelayed(true)
      recordProductJourney({ action: 'auth_wait', phase: 'delayed', surface: mode })
    }, AUTH_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [mode])
  return <div data-slot="ae-site-auth-clerk-fallback" className="arc-market arc-auth-loading">
    <p role="status" aria-live="polite" aria-atomic="true" className="text-sm text-muted-foreground">
      {delayed ? 'The account form is taking longer than expected.' : 'Loading the secure account form…'}
    </p>
    <div aria-hidden="true">
      {[0, 1, 2, 3].map(index => <div key={index} className="arc-auth-loading-field"><Skeleton lines={2} /></div>)}
    </div>
    {delayed ? <div className="space-y-3">
      <p className="text-sm">Reload this page to try again. Your return destination stays in the address.</p>
      <Button type="button" variant="secondary" className="min-h-touch" onClick={() => {
        recordProductJourney({ action: 'auth_retry', phase: 'attempted', surface: mode })
        reload()
      }}>Reload account form</Button>
    </div> : null}
    <div className="mt-3 flex flex-wrap gap-3">
      <a href="/support" className={`${buttonStyles.button} ${buttonStyles.ghost} ${buttonStyles.md} min-h-touch`} onClick={() => recordProductJourney({ action: 'help_opened', phase: 'attempted', surface: mode })}>Get help</a>
      <a href="/status" className={`${buttonStyles.button} ${buttonStyles.ghost} ${buttonStyles.md} min-h-touch`}>System status</a>
    </div>
  </div>
}
