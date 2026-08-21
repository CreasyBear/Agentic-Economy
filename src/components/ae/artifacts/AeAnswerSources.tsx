import { Link } from '@tanstack/react-router'
import { CheckIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item'
import { cn } from '@/lib/utils'
import {
  neutralizeBidiFormattingControls,
  type AnswerSource,
} from '@/modules/answer/public'

import { listingCountLabel, REVEAL_ENTER } from './AeGenerativeAnswerCopy'

export function SelectedSource({ provider, threadId }: { provider: AnswerSource; threadId: string | undefined }) {
  // Protocol-relative `//host` is external; only a rooted path is router-owned.
  const detailIsInternal = provider.detailUrl.startsWith('/') && !provider.detailUrl.startsWith('//')
  const threadSearch = threadId === undefined || threadId.length === 0 ? {} : { from: 'thread' as const, id: threadId }
  const selectionScope = threadId === undefined ? 'in this answer' : 'from this thread'
  const basis = [provider.category.trim(), (provider.serviceArea || provider.suburb).trim()]
    .map(neutralizeBidiFormattingControls)
    .filter((part) => part.length > 0)
    .join(' · ')
  const providerName = neutralizeBidiFormattingControls(provider.name)
  const initial = providerName.trim().charAt(0).toUpperCase() || '?'

  return (
    <section
      className={cn(REVEAL_ENTER, 'grid gap-3 rounded-lg border border-border bg-card p-4')}
      aria-label="Selected business"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted font-mono text-base font-semibold text-muted-foreground"
        >
          {initial}
        </span>
        <div className="grid min-w-0 flex-1 gap-0.5">
          <p className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recommended</p>
          <p className="truncate font-heading text-base font-medium leading-snug text-foreground">
            {detailIsInternal ? (
              <Link
                to="/$slug"
                params={{ slug: provider.slug }}
                search={threadSearch}
                className="underline-offset-4 hover:underline"
                dir="auto"
                style={{ unicodeBidi: 'isolate' }}
              >
                {providerName}
              </Link>
            ) : (
              <a
                href={provider.detailUrl}
                className="underline-offset-4 hover:underline"
                dir="auto"
                style={{ unicodeBidi: 'isolate' }}
              >
                {providerName}
              </a>
            )}
          </p>
          <p dir="auto" style={{ unicodeBidi: 'isolate' }} className="truncate text-sm text-muted-foreground">
            Choice {provider.citationIndex} {selectionScope} {basis.length > 0 ? `· ${basis}` : ''}
          </p>
        </div>
        <span
          className="inline-flex w-fit shrink-0 items-center gap-1 rounded-full border border-border bg-card px-2 py-1 text-xs text-muted-foreground"
          data-tone="review"
        >
          <CheckIcon className="size-3" aria-hidden="true" />
          Review this business first
        </span>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Review the business page and use the published phone number or website it provides.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="default" size="sm">
          {detailIsInternal ? (
            <Link to="/$slug" params={{ slug: provider.slug }} search={threadSearch}>Review business</Link>
          ) : (
            <a href={provider.detailUrl}>Review business</a>
          )}
        </Button>
      </div>
    </section>
  )
}

export function SourcesList({
  providers,
  threadId,
}: {
  providers: readonly AnswerSource[]
  threadId: string | undefined
}) {
  if (providers.length === 0) {
    return null
  }
  return (
    <section className={cn(REVEAL_ENTER, 'grid gap-3')} aria-label="Sources">
      <header className="grid gap-0.5">
        <p className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sources</p>
        <p className="text-sm text-muted-foreground">
          {listingCountLabel(providers.length)} compared on published area, response, and next step.
        </p>
      </header>
      <ul className="grid gap-2 sm:grid-cols-2" aria-label="Sources for this answer">
        {providers.map((source) => (
          <SourceCard key={source.slug} source={source} threadId={threadId} />
        ))}
      </ul>
    </section>
  )
}

function SourceCard({
  source,
  threadId,
}: {
  source: AnswerSource
  threadId: string | undefined
}) {
  const detailIsInternal = source.detailUrl.startsWith('/') && !source.detailUrl.startsWith('//')
  const search = threadId === undefined || threadId.length === 0 ? {} : { from: 'thread' as const, id: threadId }
  const basis = [source.category.trim(), (source.serviceArea || source.suburb).trim()]
    .map(neutralizeBidiFormattingControls)
    .filter((part) => part.length > 0)
    .join(' · ')
  const sourceName = neutralizeBidiFormattingControls(source.name)
  const initial = sourceName.trim().charAt(0).toUpperCase() || '?'
  const content = (
    <>
      <ItemMedia variant="icon" aria-hidden="true" className="font-mono text-sm font-semibold text-muted-foreground">
        {initial}
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle
          dir="auto"
          style={{ unicodeBidi: 'isolate' }}
          className="truncate underline-offset-4"
        >
          {sourceName}
        </ItemTitle>
        <ItemDescription
          dir="auto"
          style={{ unicodeBidi: 'isolate' }}
          className="truncate text-left text-xs"
        >
          {basis}
        </ItemDescription>
      </ItemContent>
      <ItemActions className="hidden shrink-0 sm:flex">
        <Badge variant="outline" className="font-mono text-xs tabular-nums">
          {source.citationIndex}
        </Badge>
      </ItemActions>
    </>
  )

  return (
    <li>
      <Item asChild variant="outline" size="sm" className="bg-card">
        {detailIsInternal ? (
          <Link to="/$slug" params={{ slug: source.slug }} search={search}>
            {content}
          </Link>
        ) : (
          <a href={source.detailUrl}>{content}</a>
        )}
      </Item>
    </li>
  )
}
