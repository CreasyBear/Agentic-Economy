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
import { RootWorkTreeLoop } from '@/components/ae/home/RootWorkTreeLoop'
import { QUERY_MAX_LENGTH } from '@/lib/query-length'
import {
  readRootWorkTreeServer,
  type RootWorkTreeReadback,
} from '@/modules/work-tree/human-root.functions'

const rootSearchSchema = z.object({
  q: z.string().optional().catch(undefined),
  project: z.string().max(200).optional().catch(undefined),
})

/** Fixed browse chips that map to preset asks the engine already resolves. */
const CATEGORY_CHIPS: readonly { label: string; query: string }[] = [
  { label: 'Finance & crypto', query: 'crypto price' },
  { label: 'Search & research', query: 'search the web' },
  { label: 'Geo & maps', query: 'geocode' },
  { label: 'Reference', query: 'wikipedia' },
]


export type RootSearchParams = {
  q?: string | undefined
  project?: string | undefined
}

export type RootRouteReadback =
  | Readonly<{ kind: 'work-tree'; readback: RootWorkTreeReadback }>

export type RootRouteDeps = Readonly<{
  readWorkTree: (projectId: string) => Promise<RootWorkTreeReadback>
}>

export const defaultRootRouteDeps: RootRouteDeps = {
  readWorkTree: (projectId) => readRootWorkTreeServer({ data: { projectId } }),
}


/** Root route readback: explicit project references read the source-backed tree. */
export async function loadRootRoute(
  search: RootSearchParams,
  deps: RootRouteDeps = defaultRootRouteDeps,
): Promise<RootRouteReadback | undefined> {
  const projectId = search.project?.trim() ?? ''
  if (projectId.length === 0) return undefined
  return { kind: 'work-tree', readback: await deps.readWorkTree(projectId) }
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
  loaderDeps: ({ search }) => ({ project: search.project }),
  beforeLoad: ({ search }) => {
    if (search.project === undefined && search.q !== undefined) {
      throw redirect({ to: '/t/new', search: { q: search.q } })
    }
  },
  loader: ({ deps }) => loadRootRoute(deps),
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
  const { q, project } = Route.useSearch()
  const data = Route.useLoaderData()
  const navigate = useNavigate()
  const hasAnswer = project !== undefined
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
          <h1
            className={hasAnswer
              ? 'max-w-3xl text-4xl leading-tight tracking-tight md:text-5xl'
              : 'max-w-4xl text-4xl leading-tight tracking-tight md:text-6xl'}
          >
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
                  placeholder="e.g. Get a quote for solar installation, or the current price of bitcoin"
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

          {hasAnswer ? null : (
            <nav aria-label="Browse by category" className="flex flex-wrap justify-center gap-2.5">
              {CATEGORY_CHIPS.map((chip) => (
                <Link
                  key={chip.label}
                  to="/t/new"
                  search={{ q: chip.query }}
                  className="inline-flex min-h-11 items-center rounded-full border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
                >
                  {chip.label}
                </Link>
              ))}
            </nav>
          )}

          {hasAnswer ? null : (
            <nav aria-label="Example asks" className="flex flex-wrap justify-center gap-x-5 gap-y-1.5">
              {HOME.exampleAsks.map((ask) => (
                <Link
                  key={ask}
                  to="/t/new"
                  search={{ q: ask }}
                  className="inline-flex min-h-11 items-center px-1 text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                >
                  {ask}
                </Link>
              ))}
            </nav>
          )}

          {hasAnswer ? null : (
            <div className="grid w-full gap-3 text-left sm:grid-cols-2">
              {[AGENT_DOOR, BUSINESS_DOOR].map((door) => (
                <Card key={door.href} className="grid gap-1 border border-border bg-card p-5">
                  <h2 className="block font-semibold text-foreground">{door.heading}</h2>
                  <p className="block text-sm text-muted-foreground">
                    {door.body}
                  </p>
                  {door.href === '/claim?source=supply' ? (
                    <Link to="/claim" search={{ source: 'supply' }} className="inline-flex min-h-11 items-center text-sm font-medium text-foreground underline underline-offset-4 justify-self-start">
                      {door.cta}
                    </Link>
                  ) : (
                    <Link to={door.href} className="inline-flex min-h-11 items-center text-sm font-medium text-foreground underline underline-offset-4 justify-self-start">
                      {door.cta}
                    </Link>
                  )}
                </Card>
              ))}
            </div>
          )}

          {data?.kind === 'work-tree' ? (
            <RootWorkTreeLoop readback={data.readback} />
          ) : null}
        </section>
      </div>
    </AePublicShell>
  )
}

