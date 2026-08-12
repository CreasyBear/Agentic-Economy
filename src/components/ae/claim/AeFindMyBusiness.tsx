import { Link } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import type { BusinessContext } from '@/modules/business/public'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { SearchIcon } from 'lucide-react'
import { claimFormSearchFor } from './AeFindMyBusiness.exports'
export type FoundBusiness = Readonly<{
  slug: string
  name: string
  category: string
  businessContext: BusinessContext
}>

export type FindMyBusinessSearch = (query: string) => Promise<readonly FoundBusiness[]>

export type ClaimEnrichIntent = Readonly<{ businessName: string; suburb?: string }>

export type ClaimFormSearch = Readonly<{
  businessContext: BusinessContext
  businessName: string
  category: string
  requestedSlug: string
  source?: 'supply'
}>

/**
 * The first thing an owner sees on /claim. Typing a business name either finds
 * an existing page to start from, or hands the name to the form so nothing is
 * retyped. Neither path is ever a dead end.
 */
export function AeFindMyBusiness({
  search,
  onBuildFromWeb,
  source,
}: {
  search: FindMyBusinessSearch
  onBuildFromWeb: (businessName: string) => void
  source?: 'supply'
}) {
  const [query, setQuery] = useState('')
  const [pending, setPending] = useState(false)
  const [results, setResults] = useState<readonly FoundBusiness[] | undefined>()
  const [lookupError, setLookupError] = useState<string | undefined>()

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = query.trim()
    if (trimmed.length === 0 || pending) return

    setPending(true)
    setResults(undefined)
    setLookupError(undefined)
    try {
      setResults(await search(trimmed))
    } catch {
      setLookupError('We couldn’t search right now. Try again.')
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
                  onChange={(event) => {
                    setQuery(event.currentTarget.value)
                    setLookupError(undefined)
                  }}
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
        {lookupError === undefined ? null : <p role="alert" className="text-sm text-red-vivid">{lookupError}</p>}

        {searched && results.length > 0 ? (
          <div className="grid gap-3" aria-label="Matching businesses">
            {results.map((business) => (
              <Card key={business.slug} className="p-0">
                <CardContent className="grid gap-2 p-4">
                  <p className="font-semibold text-foreground">{business.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {business.businessContext.kind === 'local_human'
                      ? [business.category, business.businessContext.suburb, business.businessContext.stateTerritory].filter((part) => part.length > 0).join(' · ')
                      : [business.category, business.businessContext.providerIdentifier, business.businessContext.website].filter((part) => part.length > 0).join(' · ')}
                  </p>
                  <div>
                    <Button asChild variant="secondary" className="min-h-11">
                      <Link to="/claim/form" search={claimFormSearchFor(business, source)}>This is my business</Link>
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
            <Link to="/claim/form" search={source === 'supply' ? { source } : {}}>My business is not listed. Start fresh.</Link>
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Anything we gather is unconfirmed until you review it. Nothing publishes until you submit.
        </p>
      </CardContent>
    </Card>
  )
}
