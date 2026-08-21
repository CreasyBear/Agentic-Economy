import { Link } from '@tanstack/react-router'

import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import {
  neutralizeBidiFormattingControls,
  type AnswerCompareField,
  type AnswerSource,
} from '@/modules/answer/public'

import { listingCountLabel, REVEAL_ENTER } from './AeGenerativeAnswerCopy'

const DEFAULT_COMPARE_FIELDS: readonly AnswerCompareField[] = ['area', 'response', 'availability', 'hours', 'trust', 'freshness', 'nextStep']

export function ProviderCompareTable({
  providers,
  threadId,
  fields = DEFAULT_COMPARE_FIELDS,
}: {
  providers: readonly AnswerSource[]
  threadId: string | undefined
  fields?: readonly AnswerCompareField[]
}) {
  if (providers.length === 0) {
    return null
  }

  return (
    <section
      className={cn(REVEAL_ENTER, 'grid gap-0 overflow-hidden rounded-lg border border-border bg-card')}
      aria-label="Business comparison"
    >
      <header className="flex items-start justify-between gap-3 border-b border-border p-4">
        <div className="grid gap-1">
          <p className="block text-sm font-medium text-muted-foreground">Compare</p>
          <p className="font-heading text-base text-foreground">Published details, side by side</p>
        </div>
        <p className="shrink-0 font-mono text-xs text-muted-foreground">{listingCountLabel(providers.length)}</p>
      </header>
      <Table className="min-w-[44rem] border-collapse">
        <TableCaption className="sr-only">Comparison based on published business details.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead
              scope="col"
              className="sticky left-0 z-10 h-auto w-[13.5rem] border-b border-border bg-card px-4 py-3 font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground"
            >
              Business
            </TableHead>
            {fields.map((field) => (
              <TableHead
                key={field}
                scope="col"
                className="h-auto border-b border-border px-4 py-3 font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground"
              >
                {compareFieldLabel(field)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {providers.map((provider) => (
            <ProviderCompareRow key={provider.slug} provider={provider} fields={fields} threadId={threadId} />
          ))}
        </TableBody>
      </Table>
    </section>
  )
}

function ProviderCompareRow({
  provider,
  fields,
  threadId,
}: {
  provider: AnswerSource
  fields: readonly AnswerCompareField[]
  threadId: string | undefined
}) {
  const detailSearch = threadId === undefined ? {} : { from: 'thread' as const, id: threadId }
  const providerName = neutralizeBidiFormattingControls(provider.name)
  const category = neutralizeBidiFormattingControls(provider.category)

  return (
    <TableRow>
      <TableHead scope="row" className="sticky left-0 z-10 h-auto border-t border-border bg-card px-4 py-3 text-left align-top">
        <span className="grid gap-0.5">
          <Link
            to="/$slug"
            params={{ slug: provider.slug }}
            search={detailSearch}
            className="font-medium text-foreground underline-offset-4 hover:underline"
            dir="auto"
            style={{ unicodeBidi: 'isolate' }}
          >
            {providerName}
          </Link>
          <span dir="auto" style={{ unicodeBidi: 'isolate' }} className="font-mono text-xs text-muted-foreground">{category}</span>
        </span>
      </TableHead>
      {fields.map((field) => (
        <TableCell
          key={`${provider.slug}-${field}`}
          className={cn('border-t border-border px-4 py-3 align-top whitespace-normal tabular-nums text-muted-foreground', field === 'freshness' && 'font-mono text-xs tracking-wide')}
          dir="auto"
          style={{ unicodeBidi: 'isolate' }}
        >
          {neutralizeBidiFormattingControls(compareFieldValue(provider, field))}
        </TableCell>
      ))}
    </TableRow>
  )
}

function compareFieldLabel(field: AnswerCompareField): string {
  switch (field) {
    case 'area':
      return 'Area'
    case 'response':
      return 'Response'
    case 'availability':
      return 'Availability'
    case 'hours':
      return 'Hours'
    case 'trust':
      return 'Published detail'
    case 'freshness':
      return 'Updated'
    case 'nextStep':
      return 'Next step'
    default: {
      const _exhaustive: never = field
      return _exhaustive
    }
  }
}

function compareFieldValue(provider: AnswerSource, field: AnswerCompareField): string {
  switch (field) {
    case 'area':
      return provider.serviceArea
    case 'response':
      return provider.responseTimeLabel
    case 'availability':
      return provider.availabilityLabel
    case 'hours':
      return provider.hoursLabel
    case 'trust':
      return provider.trustCue
    case 'freshness':
      return provider.freshnessLabel ?? ''
    case 'nextStep':
      return provider.nextStepLabel
    default: {
      const _exhaustive: never = field
      return _exhaustive
    }
  }
}
