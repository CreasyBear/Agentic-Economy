import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
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
    <Card className="p-0">
      <CardHeader>
        <CardTitle>Find your business</CardTitle>
        <CardDescription>
          Search by the name customers use. If you already have a page, we prefill it. If not, start with your website or enter the facts yourself.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <form onSubmit={(event) => void handleSearch(event)} noValidate>
          <FieldGroup className="grid md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <Field>
              <FieldLabel htmlFor="claim-business-name">Your business name</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id="claim-business-name"
                  name="claim-business-name"
                  value={query}
                  onChange={(event) => setQuery(event.currentTarget.value)}
                  placeholder="Joondalup Emergency Plumbing"
                  disabled={pending}
                  aria-describedby="claim-business-name-description"
                />
                <InputGroupAddon align="inline-start">
                  <SearchIcon aria-hidden="true" />
                </InputGroupAddon>
              </InputGroup>
              <FieldDescription id="claim-business-name-description">Use the name customers recognise.</FieldDescription>
            </Field>
            <Button type="submit" variant="default" className="min-h-11" disabled={pending || trimmedQuery.length === 0}>
              {pending ? 'Searching' : 'Find my business'}
            </Button>
          </FieldGroup>
        </form>

        {searched && results.length > 0 ? (
          <div className="grid gap-3" aria-label="Matching businesses">
            {results.map((business) => (
              <Card key={business.slug} className="p-0">
                <CardContent className="grid gap-2 p-4">
                  <p className="font-semibold text-foreground">{business.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {[business.category, business.suburb, business.stateTerritory].filter((part) => part.length > 0).join(' · ')}
                  </p>
                  <div>
                    <Button asChild variant="secondary" className="min-h-11">
                      <a href={claimFormHrefFor(business)}>This is my business</a>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : null}

        {searched && results.length === 0 ? (
          <p className="text-muted-foreground">
            We couldn&apos;t find that name. Start with your website or enter the facts yourself.
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" type="button" className="min-h-11" disabled={trimmedQuery.length === 0} onClick={() => onBuildFromWeb(trimmedQuery)}>
            Start with my website
          </Button>
          <Button asChild variant="ghost" className="min-h-11">
            <a href="/claim/form">My business is not listed. Start fresh.</a>
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Anything we gather is unconfirmed until you review it. Nothing publishes until you submit.
        </p>
      </CardContent>
    </Card>
  )
}
