import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

type AeSiteFaqItem = {
  question: string
  answer: string
}

export function AeSiteFaq({
  labelledBy,
  questions,
}: {
  labelledBy: string
  questions: readonly AeSiteFaqItem[]
}) {
  return (
    <Accordion type="single" collapsible className="w-full md:ml-auto md:w-2/3" aria-labelledby={labelledBy}>
      {questions.map((item) => (
        <AccordionItem
          key={item.question}
          value={item.question}
          className="border-background/40"
        >
          <AccordionTrigger className="min-h-touch py-section text-start text-lg font-medium text-background hover:no-underline hover:text-background [&[data-state=open]]:text-background [&>svg]:text-background/70">
            {item.question}
          </AccordionTrigger>
          <AccordionContent className="text-pretty text-base leading-7 text-background/80 sm:text-lg sm:leading-8">
            {item.answer}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}
