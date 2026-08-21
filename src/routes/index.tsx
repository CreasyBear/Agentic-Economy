import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

import { AGENT_DOOR, BUSINESS_DOOR, HOME } from '@/content/brand-copy'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { ServicesError, ServicesLoading } from '@/components/ae/home/HomeRouteStates'
import { QUERY_MAX_LENGTH } from '@/lib/query-length'
import { AE_CATALOG_EXAMPLE_ASKS } from '@/modules/answer/catalog-example-asks'

const rootSearchSchema = z.object({
  q: z.string().optional().catch(undefined),
  project: z.string().max(200).optional().catch(undefined),
})

export type RootSearchParams = {
  q?: string | undefined
  project?: string | undefined
}

/** Home never reads WorkTree. `project` is accepted so old `/?project=` URLs do not 400. */
export async function loadRootRoute(_search: RootSearchParams): Promise<undefined> {
  return undefined
}

export function validateRootSearch(search: Record<string, unknown>): RootSearchParams {
  const parsed = rootSearchSchema.parse(search)
  const query = parsed.q?.trim() ?? ''
  const project = parsed.project?.trim() ?? ''
  return {
    ...(query.length === 0 ? {} : { q: query }),
    ...(project.length === 0 ? {} : { project }),
  }
}

export const Route = createFileRoute('/')({
  validateSearch: validateRootSearch,
  beforeLoad: ({ search }) => {
    if (search.q !== undefined) {
      throw redirect({ to: '/t/new', search: { q: search.q } })
    }
  },
  loader: () => loadRootRoute({}),
  pendingComponent: ServicesLoading,
  errorComponent: ServicesError,
  head: () => ({
    meta: [
      { title: HOME.metaTitle },
      { name: 'description', content: HOME.metaDescription },
    ],
  }),
  component: ServicesRoute,
})


function ServicesRoute() {
  const { q } = Route.useSearch()
  const navigate = useNavigate()
  const [queryValue, setQueryValue] = useState(q ?? '')
  const [queryError, setQueryError] = useState<'required' | 'too-long' | undefined>()
  const queryTooLong = queryValue.length > QUERY_MAX_LENGTH

  function handleAskSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const rawQuery = String(formData.get('q') ?? '')
    setQueryValue(rawQuery)
    if (rawQuery.length > QUERY_MAX_LENGTH) {
      setQueryError('too-long')
      return
    }
    const query = rawQuery.trim()
    if (query.length === 0) {
      setQueryError('required')
      return
    }
    setQueryError(undefined)
    void navigate({ to: '/t/new', search: { q: query } })
  }

  return (
    <AePublicShell>
      <div className="grid w-full gap-10 px-4 py-14 sm:px-6 md:py-20">
        <section className="mx-auto grid w-full max-w-3xl justify-items-center gap-7 text-center">
          <h1 className="max-w-4xl text-4xl leading-tight tracking-tight md:text-6xl">
            {HOME.heroHeading}
          </h1>
          <p className="max-w-2xl text-lg text-muted-foreground">
            {HOME.heroSubhead}
          </p>

          <Card className="w-full border-0 bg-card p-6 shadow-med">
            <form key={q ?? ''} role="search" aria-label="Ask a question or describe what you need done" onSubmit={handleAskSubmit} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <Field className="gap-2 text-left">
                <div className="flex items-center justify-between gap-3">
                  <FieldLabel htmlFor="service-search" className="text-sm font-semibold text-foreground">
                    What do you need done?
                  </FieldLabel>
                  <span
                    id="service-search-count"
                    className="font-mono text-xs tabular-nums text-muted-foreground"
                    aria-live="polite"
                  >
                    {queryValue.length} / {QUERY_MAX_LENGTH} characters
                  </span>
                </div>
                <Input
                  id="service-search"
                  name="q"
                  type="search"
                  value={queryValue}
                  required
                  placeholder={`e.g. ${AE_CATALOG_EXAMPLE_ASKS[0].query}`}
                  autoComplete="off"
                  aria-describedby="service-search-hint service-search-count"
                  aria-invalid={queryError !== undefined || queryTooLong ? 'true' : undefined}
                  onChange={(event) => {
                    setQueryValue(event.currentTarget.value)
                    setQueryError(undefined)
                  }}
                  onInvalid={(event) => {
                    event.preventDefault()
                    setQueryError(event.currentTarget.validity.valueMissing ? 'required' : 'too-long')
                  }}
                  className="h-14 border-border bg-card px-4 py-3 text-base text-foreground max-sm:h-14 md:text-base"
                />
                <p
                  id="service-search-hint"
                  className="text-sm leading-snug text-muted-foreground"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  {queryError === 'required'
                    ? 'Enter what you need done before asking.'
                    : queryError === 'too-long' || queryTooLong
                      ? `Keep your question to ${QUERY_MAX_LENGTH} characters or fewer before asking.`
                      : `Up to ${QUERY_MAX_LENGTH} characters.`}
                </p>
              </Field>
              <Button type="submit" variant="secondary" size="lg" className="min-h-14 w-full sm:w-auto">Ask</Button>
            </form>
          </Card>

          <nav aria-label="Example asks" className="flex flex-wrap justify-center gap-2.5">
            {AE_CATALOG_EXAMPLE_ASKS.map((ask) => (
              <Link
                key={ask.label}
                to="/t/new"
                search={{ q: ask.query }}
                className="inline-flex min-h-11 items-center rounded-full border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
              >
                {ask.label}
              </Link>
            ))}
          </nav>

          <div className="grid w-full gap-3 text-left sm:grid-cols-2">
              {[AGENT_DOOR, BUSINESS_DOOR].map((door) => (
                <Card key={door.href} className="grid gap-1 border border-border bg-card p-5">
                  <h2 className="block font-semibold text-foreground">{door.heading}</h2>
                  <p className="block text-sm text-muted-foreground">
                    {door.body}
                  </p>
                  <Link to={door.href} className="inline-flex min-h-11 items-center text-sm font-medium text-foreground underline underline-offset-4 justify-self-start">
                    {door.cta}
                  </Link>
                </Card>
              ))}
            </div>
        </section>
      </div>
    </AePublicShell>
  )
}
