import { Badge } from '@/components/ui/badge'
import type { SourcesInlineProps } from './generative.contracts'

export function SourcesInline({ view }: SourcesInlineProps) {
  if (view.sources.length === 0) return null
  return (
    <nav aria-label="Answer sources" className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground sm:text-[0.8125rem]">
      <span>Sources</span>
      {view.sources.map((source, index) => (
        <Badge key={source.toolRef} variant="secondary" render={<a href={source.href} className="min-h-8 max-w-full gap-1.5 rounded-full border-0 bg-muted/50 px-3 text-xs font-medium transition-colors duration-fast hover:bg-muted/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:min-h-10 sm:text-[0.8125rem]" aria-label={`Source ${index + 1}: ${source.title}${source.attribution ? `, ${source.attribution}` : ''}`} />}>
          <span aria-hidden="true">{index + 1}</span>
          <span className="truncate">{source.title}</span>
        </Badge>
      ))}
    </nav>
  )
}
