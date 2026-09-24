import { CheckIcon, ChevronRightIcon, LoaderCircleIcon } from 'lucide-react'
import type { WorkDisclosureProps } from './generative.contracts'

export function WorkDisclosure({ view }: WorkDisclosureProps) {
  if (view.steps.length === 0) return null
  const working = view.steps.some((step) => step.status === 'working')
  return (
    <details className="group min-w-0 text-xs text-muted-foreground sm:text-[0.8125rem]">
      <summary className="flex min-h-8 cursor-pointer items-center gap-2 rounded-md transition-colors duration-fast hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:min-h-10">
        {working ? <LoaderCircleIcon className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <CheckIcon className="size-3.5" aria-hidden="true" />}
        <span className="min-w-0 truncate">{view.summary}</span>
        <ChevronRightIcon className="size-3.5 transition-transform duration-fast group-open:rotate-90 motion-reduce:transition-none" aria-hidden="true" />
      </summary>
      <ol className="grid gap-2 pb-2 pl-5">
        {view.steps.map((step) => (
          <li key={step.id} className="flex min-w-0 items-start gap-2">
            <span className="min-w-0 flex-1 wrap-break-word">{step.label}</span>
            <span className="shrink-0">{step.status === 'working' ? 'Working' : step.status === 'attention' ? 'Needs attention' : 'Done'}</span>
          </li>
        ))}
      </ol>
    </details>
  )
}
