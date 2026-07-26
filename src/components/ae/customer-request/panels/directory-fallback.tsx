import { useEffect, useState } from 'react'
import { Card } from '@astryxdesign/core/Card'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'
import { Button } from '@astryxdesign/core/Button'

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
      <Card padding={5} aria-busy="true">
        <Heading level={3}>Looking for businesses you can contact</Heading>
      </Card>
    )
  }

  return (
    <Card padding={5}>
      <div className="grid gap-4">
        <div className="grid gap-1">
          <Heading level={3}>Businesses you can contact yourself</Heading>
          <Text color="secondary" display="block">
            {state.matchesRequestedArea
              ? 'These are listed on AE and publish a phone number. AE is not arranging anything with them.'
              : 'None of these are in the area you named. They are listed on AE elsewhere in Australia and publish a phone number. AE is not arranging anything with them.'}
          </Text>
        </div>
        <ul className="grid gap-3">
          {state.businesses.map((business) => (
            <li key={business.slug} className="grid gap-2 rounded-md border border-border p-4">
              <div className="grid gap-1">
                <Text weight="semibold" display="block">{business.name}</Text>
                <Text type="supporting" color="secondary" display="block">
                  {[business.offeringName, `${business.suburb}, ${business.stateTerritory}`]
                    .filter((part): part is string => part !== undefined)
                    .join(' · ')}
                </Text>
                {business.availabilitySummary === undefined ? null : (
                  <Text type="supporting" color="secondary" display="block">{business.availabilitySummary}</Text>
                )}
                {business.pricingSummary === undefined ? null : (
                  <Text type="supporting" color="secondary" display="block">{business.pricingSummary}</Text>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <CallAction business={business} />
                <Button label="View business" variant="ghost" size="sm" href={`/${business.slug}`} className="min-h-11" />
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
    <Button
      label={`Call ${business.publishedPhone}`}
      variant="secondary"
      size="sm"
      href={destination}
      className="min-h-11"
    />
  )
}
