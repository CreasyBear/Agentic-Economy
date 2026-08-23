import {
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'

export function AeChatWelcome() {
  return (
    <EmptyHeader className="max-w-md gap-2">
      <EmptyTitle
        id="ae-home-heading"
        role="heading"
        aria-level={1}
        className="text-xl font-semibold tracking-tight"
      >
        Search the operation market
      </EmptyTitle>
      <EmptyDescription className="max-w-md text-sm/relaxed">
        Describe the task. Compare exact Operations by price, readiness, and evidence.
      </EmptyDescription>
    </EmptyHeader>
  )
}
