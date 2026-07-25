import { useState, type FormEvent } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { SearchIcon } from 'lucide-react'

export type FoundBusiness = Readonly<{
  slug: string
  name: string
  category: string
  suburb: string
  stateTerritory: string
}>

export type FindMyBusinessSearch = (query: string) => Promise<readonly FoundBusiness[]>

export const CLAIM_ENRICH_INTENT_STORAGE_KEY = 'ae.claimEnrichIntent.v1'

export type ClaimEnrichIntent = Readonly<{ businessName: string; suburb?: string }>

export function writeClaimEnrichIntent(intent: ClaimEnrichIntent): void {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(CLAIM_ENRICH_INTENT_STORAGE_KEY, JSON.stringify(intent))
}

export function readClaimEnrichIntent(): ClaimEnrichIntent | undefined {
  if (typeof window === 'undefined') return undefined
  const raw = window.sessionStorage.getItem(CLAIM_ENRICH_INTENT_STORAGE_KEY)
  if (raw === null) return undefined

  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || !('businessName' in parsed)) return undefined
    const businessName = parsed.businessName
    if (typeof businessName !== 'string' || businessName.trim().length === 0) return undefined
    const suburb = 'suburb' in parsed && typeof parsed.suburb === 'string' ? parsed.suburb : undefined
    return { businessName, ...(suburb === undefined || suburb.length === 0 ? {} : { suburb }) }
  } catch {
    return undefined
  }
}

export function clearClaimEnrichIntent(): void {
  if (typeof window === 'undefined') return
  window.sessionStorage.removeItem(CLAIM_ENRICH_INTENT_STORAGE_KEY)
}

export function claimFormHrefFor(business: FoundBusiness): string {
  const params = new URLSearchParams({
    businessName: business.name,
    category: business.category,
    suburb: business.suburb,
    stateTerritory: business.stateTerritory,
    requestedSlug: business.slug,
  })
  return `/claim/form?${params.toString()}`
}

/**
 * The first thing an owner sees on /claim. Typing a business name either finds
 * an existing page to start from, or hands the name to the form so nothing is
 * retyped. Neither path is ever a dead end.
 */
export function AeFindMyBusiness({
  search,
  onBuildFromWeb,
}: {
  search: FindMyBusinessSearch
  onBuildFromWeb: (businessName: string) => void
}) {
  const [query, setQuery] = useState('')
  const [pending, setPending] = useState(false)
  const [results, setResults] = useState<readonly FoundBusiness[] | undefined>()

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = query.trim()
    if (trimmed.length === 0 || pending) return

    setPending(true)
    try {
      setResults(await search(trimmed))
    } finally {
      setPending(false)
    }
  }

  const searched = results !== undefined
  const trimmedQuery = query.trim()

  return (
    <Card padding={5} className="grid gap-4">
      <div className="grid gap-1">
        <Text type="large" weight="semibold" color="primary" display="block">
          Start with your business name
        </Text>
        <Text color="secondary" display="block">
          If your business already has a page, start from it. If not, we can draft one from what is public about you.
        </Text>
      </div>

      <form onSubmit={(event) => void handleSearch(event)} className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <TextInput
          label="Search your business name"
          htmlName="claim-business-name"
          value={query}
          onChange={setQuery}
          placeholder="Joondalup Emergency Plumbing"
          startIcon={<SearchIcon aria-hidden="true" />}
          size="lg"
        />
        <Button
          label={pending ? 'Searching' : 'Find my business'}
          variant="primary"
          type="submit"
          isDisabled={pending || trimmedQuery.length === 0}
        />
      </form>

      {searched && results.length > 0 ? (
        <div className="grid gap-3" aria-label="Matching businesses">
          {results.map((business) => (
            <Card key={business.slug} padding={4} className="grid gap-2">
              <Text weight="semibold" color="primary" display="block">{business.name}</Text>
              <Text type="supporting" color="secondary" display="block">
                {[business.category, business.suburb, business.stateTerritory].filter((part) => part.length > 0).join(' · ')}
              </Text>
              <div>
                <Button label="This is my business" variant="secondary" href={claimFormHrefFor(business)} />
              </div>
            </Card>
          ))}
        </div>
      ) : null}

      {searched && results.length === 0 ? (
        <Text color="secondary" display="block">
          No match. Start fresh and we will build your page.
        </Text>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          label="Build my page from the web"
          variant="secondary"
          type="button"
          isDisabled={trimmedQuery.length === 0}
          onClick={() => onBuildFromWeb(trimmedQuery)}
        />
        <Button label="My business is not listed. Start fresh." variant="ghost" href="/claim/form" />
      </div>
      <Text type="supporting" color="secondary" display="block">
        Anything we gather is unconfirmed until you review it. Nothing publishes until you submit.
      </Text>
    </Card>
  )
}
