import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'

import type { TermsPracticeAccordionProps } from '../terms.contracts'

export function TermsPracticeAccordion({ items }: TermsPracticeAccordionProps) {
  return (
    <Accordion
      type="single"
      collapsible
      defaultValue={items[0]?.title ?? ''}
      className="grid gap-intra"
    >
      {items.map(({ id, icon: Icon, title, body }) => (
        <AccordionItem key={id} value={title} className="rounded-card border bg-card">
          <AccordionTrigger
            id={id}
            className="flex min-h-touch w-full items-center gap-related px-gutter py-3 text-start hover:no-underline [&>svg:last-child]:ms-auto"
          >
            <span className="inline-flex shrink-0" aria-hidden="true">
              <Icon className="size-4 text-foreground" />
            </span>
            <span className="flex-1 text-lg font-medium text-foreground">{title}</span>
          </AccordionTrigger>
          <AccordionContent className="pb-0">
            <p className="block px-gutter pb-gutter ps-[calc(var(--spacing-gutter)+var(--spacing-related)+1rem)] text-muted-foreground">{body}</p>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}
