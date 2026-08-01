import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'


import { telUri } from '@/lib/ui/tel-uri'
import { readDirectoryFallbackServer } from '@/modules/registry/directory-fallback.functions'
import type { DirectoryFallbackBusiness } from '@/modules/registry/directory-fallback.functions'

type FallbackState =
  | { kind: 'loading' }
  | { kind: 'ready'; businesses: readonly DirectoryFallbackBusiness[]; matchesRequestedArea: boolean }
  | { kind: 'none' }

/**
 * Shown when AE cannot carry the Request itself. These businesses are listed
 * and contactable, but AE is not arranging anything with them — the copy must
 * not imply otherwise, and no step here is authorized, booked, or sent.
 */
export function DirectoryFallback({ intent }: { intent: string }) {
  const [state, setState] = useState<FallbackState>({ kind: 'loading' })

  useEffect(() => {
    let active = true
    const query = intent.trim()
    if (query.length === 0) {
      setState({ kind: 'none' })
      return
    }
    void readDirectoryFallbackServer({ data: { query } })
      .then((result) => {
        if (!active) return
        setState(result.kind === 'available'
          ? { kind: 'ready', businesses: result.businesses, matchesRequestedArea: result.matchesRequestedArea }
          : { kind: 'none' })
      })
      .catch(() => {
        if (active) setState({ kind: 'none' })
      })
    return () => { active = false }
  }, [intent])

  if (state.kind === 'none') return null
  if (state.kind === 'loading') {
    return (
      <Card className="p-5" aria-busy="true">
        <h3 className="text-xl font-semibold">Looking for businesses you can contact</h3>
      </Card>
    )
  }

  return (
    <Card className="p-5">
      <div className="grid gap-4">
        <div className="grid gap-1">
          <h3 className="text-xl font-semibold">Businesses you can contact yourself</h3>
          <p className="block text-muted-foreground">
            {state.matchesRequestedArea
              ? 'These are listed on AE and publish a phone number. AE is not arranging anything with them.'
              : 'None of these are in the area you named. They are listed on AE elsewhere in Australia and publish a phone number. AE is not arranging anything with them.'}
          </p>
        </div>
        <ul className="grid gap-3">
          {state.businesses.map((business) => (
            <li key={business.slug} className="grid gap-2 rounded-md border border-border p-4">
              <div className="grid gap-1">
                <p className="block font-semibold">{business.name}</p>
                <p className="block text-sm text-muted-foreground">
                  {[business.offeringName, `${business.suburb}, ${business.stateTerritory}`]
                    .filter((part): part is string => part !== undefined)
                    .join(' · ')}
                </p>
                {business.availabilitySummary === undefined ? null : (
                  <p className="block text-sm text-muted-foreground">{business.availabilitySummary}</p>
                )}
                {business.pricingSummary === undefined ? null : (
                  <p className="block text-sm text-muted-foreground">{business.pricingSummary}</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <CallAction business={business} />
                <Button asChild variant="ghost" size="sm" className="min-h-11"><a href={`/${business.slug}`}>View business</a></Button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  )
}

function CallAction({ business }: { business: DirectoryFallbackBusiness }) {
  const destination = business.publishedPhone === undefined ? undefined : telUri(business.publishedPhone)
  if (destination === undefined || business.publishedPhone === undefined) return null
  return (
    <Button asChild variant="secondary" size="sm" className="min-h-11">
      <a href={destination}>Call {business.publishedPhone}</a>
    </Button>
  )
}
