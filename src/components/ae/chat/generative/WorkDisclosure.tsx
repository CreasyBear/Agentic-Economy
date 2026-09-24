import { Badge } from '@/components/ui/badge'
import type { WorkDisclosureProps } from './generative.contracts'

export function WorkDisclosure({ view }: WorkDisclosureProps) {
  if (view.steps.length === 0) return null
  return (
    <details className="group min-w-0 text-sm text-muted-foreground">
      <summary className="flex min-h-10 cursor-pointer items-center gap-2 rounded-card px-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        <span className="text-foreground">How I got this</span>
        <span aria-hidden="true">·</span>
        <span className="min-w-0 truncate">{view.summary}</span>
        <span aria-hidden="true" className="ms-auto transition-transform duration-fast group-open:rotate-90 motion-reduce:transition-none">›</span>
      </summary>
      <ol className="mt-1 grid gap-2 border-s border-border ps-4">
        {view.steps.map((step) => (
          <li key={step.id} className="flex min-w-0 items-start gap-2 py-1">
            <span className="min-w-0 flex-1 wrap-break-word">{step.label}</span>
            <Badge variant={step.status === 'attention' ? 'warning' : 'outline'}>{step.status === 'working' ? 'Working' : step.status === 'attention' ? 'Needs attention' : 'Done'}</Badge>
          </li>
        ))}
      </ol>
    </details>
  )
}
