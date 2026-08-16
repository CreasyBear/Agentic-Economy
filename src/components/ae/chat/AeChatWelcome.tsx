import {
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'

export function AeChatWelcome() {
  return (
    <EmptyHeader className="gap-2">
      <EmptyTitle
        id="ae-home-heading"
        role="heading"
        aria-level={1}
        className="text-lg font-medium tracking-tight"
      >
        What do you need done?
      </EmptyTitle>
      <EmptyDescription className="max-w-sm text-sm/relaxed">
        Ask about a task, a service, or current information.
      </EmptyDescription>
    </EmptyHeader>
  )
}
