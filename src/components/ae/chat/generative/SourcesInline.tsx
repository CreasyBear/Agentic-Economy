import { Badge } from '@/components/ui/badge'
import type { SourcesInlineProps } from './generative.contracts'

export function SourcesInline({ view }: SourcesInlineProps) {
  if (view.sources.length === 0) return null
  return (
    <nav aria-label="Answer sources" className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">Sources</span>
      {view.sources.map((source, index) => (
        <Badge key={source.toolRef} variant="outline" render={<a href={source.href} className="min-h-10 max-w-full gap-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" aria-label={`Source ${index + 1}: ${source.title}${source.attribution ? `, ${source.attribution}` : ''}`} />}>
          <span aria-hidden="true">{index + 1}</span>
          <span className="truncate">{source.title}</span>
        </Badge>
      ))}
    </nav>
  )
}
